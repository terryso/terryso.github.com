---
layout: post
title: "深入 SwiftWork（第 4 篇）：数据层与服务——SwiftData、状态恢复与 Markdown 渲染"
date: 2026-04-30 16:00:00 +0800
categories: tech
description: "详解 SwiftWork 的数据层和服务组件：SwiftData 模型设计、AppStateManager 状态恢复机制、MarkdownRenderer 的 Visitor 模式实现、Splash 代码高亮、Keychain API Key 管理和自动标题生成。"
tags: [AI, Swift, Agent, macOS, SwiftUI, SwiftData, Markdown, 开源]
---

> 本文是「深入 SwiftWork」系列第 4 篇（完结篇）。[系列目录见这里](/blog/swiftwork-macos-agent-workbench)。

前三篇讲了事件怎么从 SDK 流到 UI、时间线怎么渲染、工具卡片怎么可视化。这篇收尾，看 SwiftWork 的基础设施——数据怎么存、状态怎么恢复、Markdown 怎么渲染、代码怎么高亮、API Key 怎么管。

这些组件各自独立，但都是"让应用可用"的必要部分。

## SwiftData 模型层

SwiftWork 用 SwiftData 做持久化，注册了四个模型：

```swift
// SwiftWorkApp.swift
.modelContainer(for: [
    Session.self,
    Event.self,
    AppConfiguration.self,
    PermissionRule.self
])
```

### Session

```swift
@Model
final class Session {
    @Attribute(.unique) var id: UUID
    var title: String
    var createdAt: Date
    var updatedAt: Date
    var workspacePath: String?
    @Relationship(deleteRule: .cascade, inverse: \Event.session)
    var events: [Event]
}
```

`@Relationship(deleteRule: .cascade)` 意味着删除 Session 时自动删除它下面所有 Event。`workspacePath` 是可选的——用户可以给每个会话指定不同的工作目录。

### Event

```swift
@Model
final class Event {
    @Attribute(.unique) var id: UUID
    var sessionID: UUID
    var eventType: String
    var rawData: Data        // JSON 序列化的 AgentEvent
    var timestamp: Date
    var order: Int
    var session: Session?
}
```

第 1 篇讲过这个设计——`rawData` 是整个 `AgentEvent` 序列化后的 JSON blob。不拆成独立字段的原因是 metadata 的结构因事件类型而异，拆字段会导致大量空列和 Schema 频繁变更。

### AppConfiguration

```swift
@Model
final class AppConfiguration {
    @Attribute(.unique) var id: UUID
    var key: String
    var value: Data
    var updatedAt: Date
}
```

通用的 key-value 存储。用 SwiftData 实现而不是 UserDefaults，因为 SwiftData 支持 async 访问、数据迁移和 iCloud 同步（将来可能用到）。存的值包括：

- `hasCompletedOnboarding` — 是否完成首次引导
- `selectedModel` — 用户选择的模型
- `lastActiveSessionID` — 上次活跃的会话 ID
- `windowFrame` — 窗口位置和大小
- `inspectorVisible` — Inspector 面板是否可见

## AppStateManager：应用状态恢复

AppStateManager 负责在 App 重启后恢复用户的工作状态——上次打开的会话、窗口位置、Inspector 面板的开关。

```swift
@MainActor
@Observable
final class AppStateManager {
    var lastActiveSessionID: UUID?
    var windowFrame: NSRect?
    var isInspectorVisible: Bool = false

    func loadAppState() {
        lastActiveSessionID = loadUUID(key: "lastActiveSessionID")
        windowFrame = loadNSRect(key: "windowFrame")
        isInspectorVisible = loadBool(key: "inspectorVisible")
    }

    func saveLastActiveSessionID(_ id: UUID?) { ... }
    func saveWindowFrame(_ frame: NSRect) { ... }
    func saveInspectorVisibility(_ visible: Bool) { ... }
}
```

底层用 `AppConfiguration` 的 key-value 存取：

```swift
private func saveString(_ string: String, forKey key: String) {
    let descriptor = FetchDescriptor<AppConfiguration>(
        predicate: #Predicate { $0.key == key }
    )
    if let existing = try? modelContext.fetch(descriptor).first {
        existing.value = Data(string.utf8)
    } else {
        let config = AppConfiguration(key: key, value: Data(string.utf8))
        modelContext.insert(config)
    }
    try? modelContext.save()
}
```

upsert 逻辑——先查有没有，有就更新，没有就插入。`loadNSRect` 把字符串转回 `NSRect`（用 `NSRectFromString`），`loadBool` 比较字符串 "true"。

### 保存时机

状态保存不是在 App 退出时一次性完成的，而是在各个触发点分散保存：

| 状态 | 保存时机 |
|------|----------|
| `lastActiveSessionID` | 用户切换会话时（`SessionViewModel.selectSession`） |
| `windowFrame` | 窗口移动/缩放时（500ms 节流）+ App 退出时 |
| `inspectorVisible` | Inspector 面板切换时 |

窗口位置的保存做了节流——`didMoveNotification` 和 `didResizeNotification` 触发频率很高，每次都写 SwiftData 不值得。用一个 500ms 的 `Task.sleep` 做防抖，只有最后一次移动/缩放才会真正保存：

```swift
// ContentView.swift
let saveWindowFrameThrottled: (Notification) -> Void = { _ in
    saveTask?.cancel()
    saveTask = Task { @MainActor in
        try? await Task.sleep(for: .milliseconds(500))
        guard !Task.isCancelled else { return }
        if let window = mainWindow {
            appStateManager.saveWindowFrame(window.frame)
        }
    }
}
```

### 恢复流程

App 启动时，`ContentView.task` 触发恢复：

```swift
.task {
    settingsViewModel.configure(modelContext: modelContext)
    hasCompletedOnboarding = settingsViewModel.isAPIKeyConfigured
        && !settingsViewModel.isFirstLaunch

    if hasCompletedOnboarding == true {
        configureAndRestoreState()
    }
}
```

`configureAndRestoreState` 按顺序恢复：

1. 初始化 `AppStateManager`，加载保存的状态
2. 初始化 `SessionViewModel`，获取会话列表
3. 根据 `lastActiveSessionID` 选中对应会话
4. 恢复 `isInspectorVisible`
5. 恢复窗口位置（如果 window 引用已经到达）

窗口位置的恢复有一个时序问题——`WindowAccessor` 的回调是异步的，window 引用可能在 `task` 之后才到达。所以 `onChange(of: mainWindow)` 里也做了恢复：

```swift
.onChange(of: mainWindow) { _, newWindow in
    if let newWindow {
        restoreWindowFrame(in: newWindow)
    }
}
```

## MarkdownRenderer：Visitor 模式渲染 Markdown

Agent 的回复是 Markdown 格式的——标题、列表、代码块、粗体、链接。SwiftWork 用 Apple 的 swift-markdown 库解析 Markdown，然后用 Visitor 模式遍历 AST，生成 SwiftUI 视图。

### 为什么不用现成的 Markdown 渲染组件

macOS 上的 Markdown 渲染组件不多。`AttributedString(markdown:)` 只支持基础格式（粗体、链接），不支持代码块、表格、引用块。WebView 方案（用 Markdown.js 渲染到 HTML）引入了 WebKit 的依赖和内存开销。手写 Visitor 可以精确控制每个元素的渲染方式，而且不引入额外依赖。

### Visitor 实现

```swift
private struct MarkdownToViewsVisitor: @preconcurrency MarkupVisitor {
    private(set) var views: [AnyView] = []

    mutating func visitHeading(_ heading: Heading) -> Result { ... }
    mutating func visitParagraph(_ paragraph: Paragraph) -> Result { ... }
    mutating func visitCodeBlock(_ codeBlock: CodeBlock) -> Result { ... }
    mutating func visitUnorderedList(_ unorderedList: UnorderedList) -> Result { ... }
    mutating func visitOrderedList(_ orderedList: OrderedList) -> Result { ... }
    mutating func visitBlockQuote(_ blockQuote: BlockQuote) -> Result { ... }
    mutating func visitTable(_ table: Table) -> Result { ... }
    mutating func visitThematicBreak(_ thematicBreak: ThematicBreak) -> Result { ... }
}
```

每个 `visit` 方法处理一种 Markdown 节点，把生成的视图追加到 `views` 数组。最终 `MarkdownRenderer.render()` 返回这个数组，`MarkdownContentView` 用 `ForEach` 渲染。

### 内联格式处理

段落、列表项里的内联格式（粗体、斜体、行内代码、链接）通过 `collectAttributedString` 处理。它递归遍历子节点，构建 `AttributedString`：

```swift
private mutating func collectAttributedString(from markup: any Markup) -> AttributedString {
    var result = AttributedString()
    for child in markup.children {
        if let strong = child as? Strong {
            var s = collectAttributedString(from: strong)
            s.font = .body.bold()
            result.append(s)
        } else if let emphasis = child as? Emphasis {
            var e = collectAttributedString(from: emphasis)
            e.font = .body.italic()
            result.append(e)
        } else if let inlineCode = child as? InlineCode {
            var codeAttr = AttributedString(inlineCode.code)
            codeAttr.backgroundColor = Color.primary.opacity(0.06)
            codeAttr.font = .system(.body, design: .monospaced)
            result.append(codeAttr)
        } else if let link = child as? MarkdownLink {
            var linkAttr = AttributedString(collectInlineText(from: link))
            linkAttr.foregroundColor = Color.accentColor
            linkAttr.underlineStyle = .single
            linkAttr.link = URL(string: link.destination)
            result.append(linkAttr)
        }
        // ... SoftBreak, LineBreak, Strikethrough
    }
    return result
}
```

`AttributedString` 是 SwiftUI 原生支持的富文本类型。把它传给 `SwiftUI.Text(attributed)`，SwiftUI 会按设定的 font、color、backgroundColor 渲染。行内代码得到灰色背景的等宽字体，链接得到蓝色下划线。

### 类型名冲突

swift-markdown 和 SwiftUI 有类型名冲突——两者都有 `Text`、`Link` 等类型。解决方案是用 typealias：

```swift
private typealias MarkdownText = Markdown.Text
private typealias MarkdownLink = Markdown.Link
```

在 visitor 内部用 `MarkdownText` 和 `MarkdownLink` 引用 swift-markdown 的类型，`SwiftUI.Text` 引用 SwiftUI 的类型。

## CodeHighlighter：Splash 代码高亮

代码块的高亮用 John Sundell 的 Splash 库。目前只支持 Swift 语法高亮，其他语言 fallback 到等宽纯文本：

```swift
enum CodeHighlighter {
    static func highlight(code: String, language: String?) -> AnyView {
        let trimmedLanguage = language?.lowercased()
        if trimmedLanguage == "swift" {
            return highlightedSwiftView(code: code)
        } else {
            return plainCodeView(code: code)
        }
    }

    private static func highlightedSwiftView(code: String) -> AnyView {
        let theme = Theme.sundellsColors(withFont: Splash.Font(size: 13))
        let format = AttributedStringOutputFormat(theme: theme)
        let highlighter = SyntaxHighlighter(format: format)
        let attributed = try? AttributedString(highlighter.highlight(code), including: \.appKit)
        return AnyView(Text(attributed ?? AttributedString(code)))
    }
}
```

Splash 的管线：源码字符串 → `SyntaxHighlighter` → `AttributedStringOutputFormat` → `NSAttributedString` → `AttributedString` → `SwiftUI.Text`。

为什么只支持 Swift？因为 Splash 只支持 Swift。如果要支持 Python/JavaScript/Bash，需要换一个多语言的高亮库（比如 Highlight.js 的 Swift wrapper），或者用 Tree-sitter。目前 Swift 代码块的高亮频率最高（SwiftWork 本身是 Swift 项目），先支持 Swift 够用。

## KeychainManager：API Key 安全存储

API Key 不能明文存在 SwiftData 或 UserDefaults 里。SwiftWork 用 macOS Keychain 存储：

```swift
struct KeychainManager: KeychainManaging, Sendable {
    func save(key: String, data: Data) throws {
        let query = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key
        ]
        let status = SecItemAdd(query.merging([kSecValueData: data]), nil)
        if status == errSecDuplicateItem {
            SecItemUpdate(query, [kSecValueData: data])
        }
    }

    func load(key: String) throws -> Data? {
        let query = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query, &result)
        if status == errSecItemNotFound { return nil }
        return result as? Data
    }
}
```

`KeychainManaging` 协议抽象了底层实现，方便测试时 mock。协议扩展提供了 `saveAPIKey`/`getAPIKey`/`deleteAPIKey` 的便捷方法。

Keychain 存储有两个好处：数据加密（系统级别的），以及不受 App Sandbox 的文件访问限制。

## TitleGenerator：自动生成会话标题

新建的会话标题是"新会话"。Agent 第一次执行完成后，`TitleGenerator` 用 LLM 根据对话内容生成一个简短的标题：

```swift
enum TitleGenerator {
    static func generate(events: [AgentEvent], apiKey: String, ...) async -> String? {
        guard !apiKey.isEmpty else { return nil }

        let messages = events
            .filter { $0.type == .userMessage || $0.type == .assistant }
            .suffix(10)  // 只取最近 10 条
            .map { ["role": ..., "content": String($0.content.prefix(500))] }

        let body = [
            "model": model,
            "max_tokens": 50,
            "system": "根据以下对话内容，生成一个简短的标题（最多20个字符）。只输出标题。",
            "messages": messages
        ]
        // 调 LLM API，返回标题文本
    }
}
```

触发时机在 `WorkspaceView.setupTitleGeneration` 里——通过 `AgentBridge.onResult` 回调，在 Agent 执行完成且会话标题还是"新会话"时触发：

```swift
agentBridge.onResult = { [weak session] _ in
    guard let session, session.title == "新会话" else { return }
    if let title = await TitleGenerator.generate(events: events, ...) {
        sessionViewModel.updateSessionTitle(session, title: title)
    }
}
```

这是一个轻量的 LLM 调用——只有 50 token 的输出限制，system prompt 很短，取最近的 10 条消息、每条截断到 500 字符。实测延迟在 1-2 秒，不影响用户体验。

## 总结

SwiftWork 的数据层和服务组件各司其职：

| 组件 | 职责 |
|------|------|
| **SwiftData** | Session/Event/AppConfiguration 持久化 |
| **AppStateManager** | 应用状态恢复（会话、窗口、面板） |
| **EventStore** | 事件持久化协议，SwiftData 实现 |
| **MarkdownRenderer** | swift-markdown AST → SwiftUI 视图 |
| **CodeHighlighter** | Splash 语法高亮（Swift） |
| **KeychainManager** | API Key 安全存储 |
| **TitleGenerator** | LLM 自动生成会话标题 |

它们是前几篇讲的核心管线（AgentBridge → EventMapper → TimelineView）之外的"支撑层"。没有它们应用也能跑，但用户体验会差很多——没有持久化意味着每次重启都从零开始，没有 Markdown 渲染意味着 Agent 的回复是一堆原始文本，没有 Keychain 管理意味着 API Key 明文存储。

---

**系列文章**：

- **第 0 篇**：[用 SwiftUI 构建一个 Agent 可视化工作台](/blog/swiftwork-macos-agent-workbench)
- **第 1 篇**：[SDK 集成层——把 AsyncStream 接进 SwiftUI](/blog/swiftwork-sdk-integration)
- **第 2 篇**：[事件时间线——18 种事件的可视化与性能](/blog/swiftwork-event-timeline)
- **第 3 篇**：[Tool Card——可扩展的工具可视化系统](/blog/swiftwork-tool-card)
- **第 4 篇**：数据层与服务——SwiftData、状态恢复与 Markdown 渲染（本文）

**相关链接**：

- **SwiftWork**：[terryso/SwiftWork](https://github.com/terryso/SwiftWork)
- **Open Agent SDK**：[terryso/open-agent-sdk-swift](https://github.com/terryso/open-agent-sdk-swift)
