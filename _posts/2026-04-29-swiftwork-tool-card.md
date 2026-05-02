---
layout: post
title: "深入 SwiftWork（第 3 篇）：Tool Card——可扩展的工具可视化系统"
date: 2026-04-29 16:00:00 +0800
categories: tech
description: "详解 SwiftWork 的 Tool Card 系统：ToolRenderable 协议如何定义工具渲染契约、ToolRendererRegistry 如何做注册查找、5 个内置渲染器的差异，以及 ToolResultContentView 的 diff 检测。"
tags: [AI, Swift, Agent, macOS, SwiftUI, 工具, 可视化, 开源]
---

> 本文是「深入 SwiftWork」系列第 3 篇。[系列目录见这里](/blog/swiftwork-macos-agent-workbench)。

前两篇讲了事件怎么从 SDK 流到 UI。这篇聚焦其中一类事件——工具调用的可视化。

Agent 调工具是 Agent 应用里最频繁的操作。一次典型任务可能调用二三十次工具——读文件、写文件、执行命令、搜索代码。如果每次工具调用都显示成一样的灰色方块，用户很难快速区分"Bash 在跑什么命令"、"Edit 在改哪个文件"。

SwiftWork 的解决方案是一套可扩展的工具渲染系统：每种工具注册一个渲染器，ToolCardView 根据工具名称查找对应的渲染器来显示。新增工具类型时，只需要写一个实现 `ToolRenderable` 协议的 struct，注册到 `ToolRendererRegistry`，不用改 TimelineView 的任何代码。

## 从问题出发：为什么不用统一的工具视图

最简单的做法是给所有工具调用用同一个视图——显示工具名称、输入参数、输出结果。第 2 篇里的 `ToolCallView` 就是这个角色：

```swift
struct ToolCallView: View {
    let event: AgentEvent
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "wrench.and.screwdriver")
                Text(event.content)  // 工具名称
            }
            Text(input)  // 原始 JSON
        }
    }
}
```

这个视图对所有工具一视同仁——同样的扳手图标，同样的 JSON 输出。它作为 fallback 够用，但有几个问题：

- Bash 调用时，用户想看到的是命令本身（`git status`），不是 `{"command": "git status"}`
- Read 调用时，用户想看到的是文件路径（`src/main.swift`），不是完整的 JSON
- 搜索工具的结果可能是多行匹配，需要和单行输出区分开

每个工具都有不同的"最有用的信息"。Tool Card 系统就是让每个工具自己决定怎么展示。

## ToolRenderable 协议

协议定义了工具渲染器的契约：

```swift
protocol ToolRenderable: Sendable {
    /// 此渲染器处理的工具名称（与 SDK ToolUseData.toolName 匹配）
    static var toolName: String { get }

    /// 工具类型主题色（左边条、图标着色）
    static var accentColor: Color { get }

    /// 工具类型 SF Symbol 图标名
    static var icon: String { get }

    /// 根据工具内容生成 SwiftUI 视图
    @ViewBuilder @MainActor
    func body(content: ToolContent) -> any View

    /// 生成摘要标题（折叠状态显示）
    func summaryTitle(content: ToolContent) -> String

    /// 生成副标题（如文件路径、命令摘要）
    func subtitle(content: ToolContent) -> String?
}
```

协议扩展提供了默认值：

```swift
extension ToolRenderable {
    static var accentColor: Color { .gray }
    static var icon: String { "wrench.and.screwdriver" }

    func summaryTitle(content: ToolContent) -> String {
        content.toolName
    }

    func subtitle(content: ToolContent) -> String? {
        nil
    }
}
```

六个成员，三个有默认值。实现者只需要提供 `toolName`（静态路由键）和 `body`（渲染内容）。`summaryTitle` 和 `subtitle` 可以覆盖来提供更有意义的摘要，`accentColor` 和 `icon` 可以覆盖来做视觉区分。

## ToolRendererRegistry

注册表是一个 `[String: ToolRenderable]` 字典，用 `toolName` 做键：

```swift
@MainActor
@Observable
final class ToolRendererRegistry {
    private var renderers: [String: any ToolRenderable] = [:]

    init() {
        register(BashToolRenderer())
        register(FileEditToolRenderer())
        register(SearchToolRenderer())
        register(ReadToolRenderer())
        register(WriteToolRenderer())
    }

    func register(_ renderer: any ToolRenderable) {
        renderers[type(of: renderer).toolName] = renderer
    }

    func renderer(for toolName: String) -> (any ToolRenderable)? {
        renderers[toolName]
    }
}
```

`init` 时预注册 5 个内置渲染器。查找是 O(1) 的字典访问。`@Observable` 标记让 SwiftUI 在注册新渲染器时自动刷新——虽然目前的用法里渲染器在 `init` 时就注册完了，动态注册是留给插件系统准备的。

## 5 个内置渲染器

### BashToolRenderer——终端命令

```swift
struct BashToolRenderer: ToolRenderable {
    static let toolName = "Bash"
    static let accentColor: Color = .green
    static let icon: String = "terminal"

    func summaryTitle(content: ToolContent) -> String {
        // 从 input JSON 提取 command 字段
        // {"command": "git status"} → "git status"
        guard let json = parseInput(content),
              let command = json["command"] as? String
        else { return content.toolName }
        return command
    }
}
```

绿色主题 + 终端图标。`summaryTitle` 从 input JSON 提取 `command` 字段——折叠状态下用户直接看到正在跑什么命令。

### ReadToolRenderer——文件读取

```swift
struct ReadToolRenderer: ToolRenderable {
    static let toolName = "Read"
    static let accentColor: Color = .blue
    static let icon: String = "doc.text"

    func summaryTitle(content: ToolContent) -> String {
        // {"file_path": "src/main.swift"} → "src/main.swift"
        guard let json = parseInput(content),
              let filePath = json["file_path"] as? String
        else { return content.toolName }
        return filePath
    }
}
```

蓝色主题 + 文档图标。`summaryTitle` 提取文件路径。

### WriteToolRenderer——文件写入

```swift
struct WriteToolRenderer: ToolRenderable {
    static let toolName = "Write"
    static let accentColor: Color = .orange
    static let icon: String = "pencil.and.outline"

    func summaryTitle(content: ToolContent) -> String {
        // 提取 file_path
    }

    func subtitle(content: ToolContent) -> String? {
        // 提取 content 字段，截取前 80 字符
        // {"content": "import Foundation\n..."} → "import Foundation..."
        guard let json = parseInput(content),
              let contentStr = json["content"] as? String, !contentStr.isEmpty
        else { return nil }
        return "\(contentStr.prefix(80))..."
    }
}
```

橙色主题 + 铅笔图标。比 Read 多一个 `subtitle`——显示写入内容的前 80 个字符。因为写入的内容通常很长，`subtitle` 给用户一个快速预览。

### FileEditToolRenderer——文件编辑

```swift
struct FileEditToolRenderer: ToolRenderable {
    static let toolName = "Edit"
    static let accentColor: Color = .orange
    static let icon: String = "pencil.line"

    func summaryTitle(content: ToolContent) -> String {
        // 提取 file_path
    }

    func subtitle(content: ToolContent) -> String? {
        // 提取 old_string，截取前 50 字符
        // {"old_string": "func hello() {"} → "Editing: func hello() {"
        guard let json = parseInput(content),
              let oldString = json["old_string"] as? String, !oldString.isEmpty
        else { return nil }
        return "Editing: \(oldString.prefix(50))"
    }
}
```

橙色主题 + 编辑图标。`subtitle` 显示被替换的旧文本片段——让用户知道 Edit 在改哪一行。

### SearchToolRenderer——代码搜索

```swift
struct SearchToolRenderer: ToolRenderable {
    static let toolName = "Grep"
    static let accentColor: Color = .purple
    static let icon: String = "text.magnifyingglass"

    func summaryTitle(content: ToolContent) -> String {
        // 提取 pattern
    }

    func subtitle(content: ToolContent) -> String? {
        // 提取 path
    }
}
```

紫色主题 + 放大镜图标。`summaryTitle` 显示搜索 pattern，`subtitle` 显示搜索路径。

### 视觉区分一览

| 工具 | 颜色 | 图标 | summaryTitle | subtitle |
|------|------|------|-------------|----------|
| Bash | 绿色 | terminal | 命令 | - |
| Read | 蓝色 | doc.text | 文件路径 | - |
| Write | 橙色 | pencil.and.outline | 文件路径 | 内容前 80 字符 |
| Edit | 橙色 | pencil.line | 文件路径 | 被替换文本前 50 字符 |
| Grep | 紫色 | text.magnifyingglass | 搜索 pattern | 搜索路径 |

五种工具在折叠状态下就能一眼区分：颜色不同、图标不同、摘要文本不同。

## ToolCardView：容器视图

`ToolCardView` 是工具卡片的容器。它不做具体的渲染，而是委托给注册表里查到的渲染器：

```swift
struct ToolCardView: View {
    let content: ToolContent
    let registry: ToolRendererRegistry
    let isSelected: Bool
    let onSelect: () -> Void

    @State private var isExpanded = false

    var body: some View {
        HStack(spacing: 0) {
            // 左边条（3px，渲染器的主题色）
            RoundedRectangle(cornerRadius: 2)
                .fill(toolAccentColor)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 0) {
                titleRow       // 始终可见
                    .onTapGesture {
                        onSelect()
                        withAnimation { isExpanded.toggle() }
                    }

                if isExpanded {
                    expandedContent  // 展开后可见
                }
            }
        }
    }
}
```

卡片分两层：`titleRow`（始终可见）和 `expandedContent`（点击展开）。

### titleRow

```swift
private var titleRow: some View {
    HStack(alignment: .top, spacing: 6) {
        Image(systemName: toolIcon)          // 渲染器的图标
            .foregroundStyle(toolIconColor)

        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Text(resolvedSummaryTitle)    // 渲染器的 summaryTitle
                    .fontWeight(.medium)
                Spacer()
                if content.status == .running {
                    ProgressView().controlSize(.mini)  // 运行中转圈
                }
                Text(statusLabel)             // pending / running / completed / failed
                    .font(.system(size: 9))
                    .background(statusColor.opacity(0.15))
            }
            Text(content.toolName)            // 工具名称（小字）
            if let subtitle = resolvedSubtitle {  // 渲染器的 subtitle
                Text(subtitle)
            }
        }
    }
}
```

标题行从渲染器获取图标、颜色、摘要标题和副标题。状态标签（`pending`/`running`/`completed`/`failed`）由 `ToolContent.status` 决定，不在渲染器的控制范围内——它是通用的执行状态，跟工具类型无关。

### expandedContent

```swift
private var expandedContent: some View {
    VStack(alignment: .leading, spacing: 8) {
        Divider()

        // 工具特定的 body（从渲染器获取）
        if let renderer = registry.renderer(for: content.toolName) {
            AnyView(renderer.body(content: content))
        } else {
            genericToolBody  // fallback
        }

        // 通用 INPUT 区域
        if !content.input.isEmpty {
            HStack {
                Text("INPUT")
                Spacer()
                CopyButton(text: content.input)
            }
            Text(content.input)
                .font(.system(.caption, design: .monospaced))
        }

        // 通用 OUTPUT 区域
        if let output = content.output, !output.isEmpty {
            ToolResultContentView(output: output, isError: content.isError)
        }
    }
}
```

展开内容分三块：

1. **渲染器的 `body`**：工具特定的自定义内容。目前的 5 个内置渲染器都在 `body` 里显示了一个带图标的摘要块——和 `titleRow` 里的信息类似但更详细。将来可以为复杂工具（比如显示代码 diff 预览）提供更丰富的 `body`。
2. **INPUT 区域**：通用的原始输入 JSON 展示，带复制按钮。
3. **OUTPUT 区域**：`ToolResultContentView`，下一节讲。

`genericToolBody` 是没有注册渲染器时的 fallback——只显示工具名和原始输入。

## ToolResultContentView：输出渲染 + Diff 检测

`ToolResultContentView` 有一个智能功能：自动检测输出内容是不是 diff 格式，如果是就用颜色标注。

```swift
private var isDiffContent: Bool {
    let lines = output.components(separatedBy: "\n")
    let diffLines = lines.filter { $0.hasPrefix("+") || $0.hasPrefix("-") || $0.hasPrefix("@@") }
    return diffLines.count >= 2
}
```

检测逻辑：如果输出里至少有两行以 `+`、`-`、`@@` 开头，就认为是 diff 内容。简单但够用——SDK 的 Edit 工具输出 diff 格式的结果。

Diff 渲染给每行加背景色：

```swift
private func diffLineView(_ line: String) -> some View {
    Text(line)
        .font(.system(.caption, design: .monospaced))
        .padding(.horizontal, 4)
        .background(diffLineBackground(line))
}

private func diffLineBackground(_ line: String) -> Color {
    if line.hasPrefix("+") { return .green.opacity(0.15) }  // 新增行
    if line.hasPrefix("-") { return .red.opacity(0.15) }    // 删除行
    if line.hasPrefix("@@") { return .blue.opacity(0.1) }   // 位置标记
    return .clear
}
```

非 diff 内容按普通文本渲染，有截断逻辑——超过 5 行或 200 字符时折叠，带展开按钮。

## 怎么新增一个工具渲染器

假设 SDK 新增了一个 `WebFetch` 工具，你想在 SwiftWork 里给它一个专属的卡片样式。只需要两个步骤：

**第一步：写渲染器**

```swift
struct WebFetchToolRenderer: ToolRenderable {
    static let toolName = "WebFetch"
    static let accentColor: Color = .cyan
    static let icon: String = "globe"

    @MainActor
    func body(content: ToolContent) -> any View {
        // 自定义视图...
    }

    func summaryTitle(content: ToolContent) -> String {
        // 从 input 提取 URL
        guard let json = parseInput(content),
              let url = json["url"] as? String
        else { return content.toolName }
        return url
    }
}
```

**第二步：注册**

```swift
// ToolRendererRegistry.init()
register(WebFetchToolRenderer())
```

不需要改 TimelineView、ToolCardView 或任何其他文件。ToolCardView 在渲染时通过 `registry.renderer(for:)` 查找渲染器，查到了就用，查不到就用 fallback。

## 总结

Tool Card 系统的设计思路是协议 + 注册表：

| 组件 | 职责 |
|------|------|
| `ToolRenderable` | 定义渲染契约——工具名、颜色、图标、摘要、自定义视图 |
| `ToolRendererRegistry` | 字典查找，`toolName → ToolRenderable` |
| `ToolCardView` | 容器视图，委托给渲染器，处理通用逻辑（展开/折叠、状态标签、INPUT/OUTPUT 区域） |
| `ToolResultContentView` | 输出渲染，自动 diff 检测 |

这个模式的好处是开放扩展、关闭修改。TimelineView 的分派逻辑（第 2 篇的 `toolCardView(for:)`）不需要知道有多少种工具——它只查注册表。新增工具类型时，改动的范围限定在渲染器文件和注册表的 `init` 方法。

下一篇是最后一篇，看数据层——SwiftData 的会话/事件持久化、App 状态恢复、Markdown 渲染和代码高亮。

---

**系列文章**：

- **第 0 篇**：[用 SwiftUI 构建一个 Agent 可视化工作台](/blog/swiftwork-macos-agent-workbench)
- **第 1 篇**：[SDK 集成层——把 AsyncStream 接进 SwiftUI](/blog/swiftwork-sdk-integration)
- **第 2 篇**：[事件时间线——18 种事件的可视化与性能](/blog/swiftwork-event-timeline)
- **第 3 篇**：Tool Card——可扩展的工具可视化系统（本文）
- **第 4 篇**：[数据层与服务——SwiftData、状态恢复与 Markdown 渲染](/blog/swiftwork-data-services)

**相关链接**：

- **SwiftWork**：[terryso/SwiftWork](https://github.com/terryso/SwiftWork)
- **Open Agent SDK**：[terryso/open-agent-sdk-swift](https://github.com/terryso/open-agent-sdk-swift)
