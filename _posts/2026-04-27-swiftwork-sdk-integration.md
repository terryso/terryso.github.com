---
layout: post
title: "深入 SwiftWork（第 1 篇）：SDK 集成层——把 AsyncStream 接进 SwiftUI"
date: 2026-04-27 16:00:00 +0800
categories: tech
description: "详解 SwiftWork 的 SDK 集成层设计：AgentBridge 如何消费 AsyncStream、EventMapper 如何做类型映射、ToolContent 如何配对工具事件，以及事件持久化和内存管理策略。"
tags: [AI, Swift, Agent, macOS, SwiftUI, SDK, 开源]
---

> 本文是「深入 SwiftWork」系列第 1 篇。[系列目录见这里](/blog/swiftwork-macos-agent-workbench)。

第 0 篇画了全景图——`AsyncStream<SDKMessage> → AgentBridge → EventMapper → SwiftUI`。这篇拆开中间两层：AgentBridge 和 EventMapper，看它们怎么把 SDK 的消息流变成 SwiftUI 可以直接消费的事件列表。

先说结论：AgentBridge 是整个应用里最复杂的单个文件。它同时做了五件事——消费 Stream、映射事件、配对工具内容、持久化数据、管理内存。每一件都不难，但五件叠在一起要处理不少状态。这篇文章逐个讲清楚。

## 从 SDK 到 AgentBridge：接口在哪

回顾一下 SDK 提供的核心接口（第 1 篇讲过的）：

```swift
// SDK 的 Agent.stream() 返回 AsyncStream<SDKMessage>
let agent = createAgent(options: ...)
for await message in agent.stream("hello") {
    switch message {
    case .assistant(let data): ...
    case .toolUse(let data): ...
    case .toolResult(let data): ...
    // 18 种类型
    }
}
```

SDK 给你一个 `AsyncStream<SDKMessage>`——一个异步事件流。SwiftUI 需要一个 `[AgentEvent]`——一个可以在主线程渲染的数组。AgentBridge 就是这两者之间的桥。

它的核心状态只有几个：

```swift
@MainActor
@Observable
final class AgentBridge {
    var events: [AgentEvent] = []         // SwiftUI 消费的事件数组
    var isRunning = false                  // Agent 是否在执行
    var streamingText: String = ""         // 流式文本的累积缓冲区
    var toolContentMap: [String: ToolContent] = [:]  // 工具内容配对
    var errorMessage: String?              // 错误信息

    @ObservationIgnored private var agent: Agent?
    @ObservationIgnored private var currentTask: Task<Void, Never>?
    // ...
}
```

`@MainActor` 保证所有状态都在主线程访问。`@Observable` 让 SwiftUI 自动追踪变化。`@ObservationIgnored` 标记的 `agent` 和 `currentTask` 不需要触发 UI 更新——它们是实现细节，不是 UI 状态。

## sendMessage：一条消息的完整生命周期

用户在输入框打字，按回车。`InputBarView` 调用 `agentBridge.sendMessage(text)`。接下来发生的事情：

```swift
func sendMessage(_ text: String) {
    guard let agent, !text.isEmpty else { return }

    if isRunning { cancelExecution() }  // 如果正在跑，先停掉

    // 1. 用户消息立即追加到事件列表
    let userEvent = AgentEvent(type: .userMessage, content: text, timestamp: .now)
    appendAndPersist(userEvent)

    errorMessage = nil
    isRunning = true

    // 2. 递增 generation 计数器（用于检测过期的 cancel）
    activeTaskGeneration &+= 1
    let myGeneration = activeTaskGeneration

    // 3. 在后台 Task 中消费 stream
    currentTask = Task { [weak self] in
        guard let self else { return }
        var receivedResult = false
        let stream = agent.stream(text)
        for await message in stream {
            guard !Task.isCancelled else { break }
            if case .userMessage = message { continue }

            let event = EventMapper.map(message)

            // 流式文本走单独的缓冲区，不进 events 数组
            if event.type == .partialMessage {
                self.streamingText += event.content
                continue
            }
            if event.type == .assistant {
                self.streamingText = ""
            }
            if event.type == .result {
                receivedResult = true
                self.onResult?(event.content)
            }
            self.appendAndPersist(event)
        }
        // 流结束但没收到 result → 异常终止
        if !Task.isCancelled && !receivedResult {
            self.appendAndPersist(AgentEvent(
                type: .system,
                content: "Agent 流异常结束，未收到完整响应。",
                metadata: ["isError": true],
                timestamp: .now
            ))
        }
        self.finalizeToolContentMap()
        if self.activeTaskGeneration == myGeneration {
            self.currentTask = nil
        }
        self.isRunning = false
    }
}
```

几个值得注意的设计决策：

**用户消息不等 Stream。** 用户消息直接追加到 `events`，不等 SDK 的 `AsyncStream` 返回 `.userMessage`。这样 UI 可以立即显示用户输入，不用等网络往返。Stream 里收到的 `.userMessage` 被 `continue` 跳过。

**流式文本有单独的缓冲区。** `partialMessage` 不进 `events` 数组，而是累积到 `streamingText`。当收到完整的 `.assistant` 事件时，清空 `streamingText`。这样 SwiftUI 的 `TimelineView` 可以用一个单独的 `StreamingTextView` 渲染正在输入的文本，而 `ForEach(events)` 不需要频繁插入再删除。

**Generation 计数器防止 cancel 竞态。** `activeTaskGeneration` 是一个递增的计数器。每次 `sendMessage` 都递增它，记录自己的 generation。Stream 结束后检查 `if self.activeTaskGeneration == myGeneration`，只有当前 generation 匹配时才清空 `currentTask`。这防止了用户快速连续发消息时的 cancel 竞态——前一个 Stream 的 cancel 回调不会把新一个 Task 的引用清掉。

## EventMapper：18 种消息的纯函数映射

`EventMapper` 做的事情很纯粹：`SDKMessage → AgentEvent`。没有副作用，没有状态。

```swift
struct EventMapper {
    static func map(_ message: SDKMessage) -> AgentEvent {
        switch message {
        case .partialMessage(let data):
            return AgentEvent(type: .partialMessage, content: data.text, timestamp: .now)

        case .assistant(let data):
            return AgentEvent(type: .assistant, content: data.text,
                metadata: ["model": data.model, "stopReason": data.stopReason],
                timestamp: .now)

        case .toolUse(let data):
            return AgentEvent(type: .toolUse, content: data.toolName,
                metadata: ["toolName": data.toolName, "toolUseId": data.toolUseId,
                           "input": data.input],
                timestamp: .now)

        case .toolResult(let data):
            return AgentEvent(type: .toolResult, content: data.content,
                metadata: ["toolUseId": data.toolUseId, "isError": data.isError],
                timestamp: .now)

        case .toolProgress(let data):
            return AgentEvent(type: .toolProgress, content: data.toolName,
                metadata: ["toolUseId": data.toolUseId, "toolName": data.toolName,
                           "elapsedTimeSeconds": data.elapsedTimeSeconds ?? 0],
                timestamp: .now)

        case .result(let data):
            return AgentEvent(type: .result, content: data.text,
                metadata: ["subtype": data.subtype.rawValue, "numTurns": data.numTurns,
                           "durationMs": data.durationMs, "totalCostUsd": data.totalCostUsd],
                timestamp: .now)

        case .system(let data):
            return AgentEvent(type: .system, content: data.message,
                metadata: ["subtype": data.subtype.rawValue], timestamp: .now)

        // hook、task、auth 等消息全部映射为 system 类型
        case .hookStarted, .hookProgress, .hookResponse,
             .taskStarted, .taskProgress,
             .authStatus, .filesPersisted,
             .localCommandOutput, .promptSuggestion, .toolUseSummary:
            return AgentEvent(type: .system, content: extractContent(from: message),
                metadata: extractMetadata(from: message), timestamp: .now)

        case .userMessage(let data):
            return AgentEvent(type: .userMessage, content: data.message, timestamp: .now)
        }
    }
}
```

映射策略：

- **一对一映射**：`assistant`、`toolUse`、`toolResult`、`toolProgress`、`result`、`userMessage` 各自对应一个 `AgentEventType`
- **合并映射**：`hookStarted`/`hookProgress`/`hookResponse`、`taskStarted`/`taskProgress`、`authStatus`、`filesPersisted` 等 10 种 SDK 消息全部映射成 `.system` 类型，通过 `metadata` 区分具体子类型
- **数据提取**：SDK 消息里的数据字段按需提取到 `metadata` 字典里，UI 视图按 key 取用

为什么要用 `metadata: [String: any Sendable]` 而不是给每种事件类型定义单独的 struct？因为 `metadata` 是一个灵活的字典——新增事件类型时只需要在 `EventMapper` 里加一个 case，不需要定义新的模型类型。代价是类型安全性降低，取值时需要 as? 转换。对于 UI 层来说，这个取舍是合理的——事件数据只在渲染时读取，不需要编译期类型检查。

## ToolContent 配对：把三个事件合成一个卡片

SDK 的工具调用经历三个阶段：`toolUse`（开始）→ `toolProgress`（进度更新）→ `toolResult`（完成）。它们是三个独立的 `SDKMessage`，但 UI 需要展示为一个完整的工具卡片——包含工具名称、输入参数、执行进度、输出结果。

这就是 `toolContentMap` 的用途。它用 `toolUseId` 做键，把三个阶段的事件合并成一个 `ToolContent`：

```swift
// AgentBridge+ToolContentMap.swift
func processToolContentMap(for event: AgentEvent) {
    switch event.type {
    case .toolUse:
        let content = ToolContent.fromToolUseEvent(event)
        toolContentMap[content.toolUseId] = content

    case .toolProgress:
        let toolUseId = event.metadata["toolUseId"] as? String ?? ""
        if let existing = toolContentMap[toolUseId] {
            toolContentMap[toolUseId] = existing.applyingProgress(event)
        }

    case .toolResult:
        let resultContent = ToolContent.fromToolResultEvent(event)
        let toolUseId = resultContent.toolUseId
        if let existing = toolContentMap[toolUseId] {
            toolContentMap[toolUseId] = ToolContent(
                toolName: existing.toolName,
                toolUseId: existing.toolUseId,
                input: existing.input,
                output: resultContent.output,
                isError: resultContent.isError,
                status: resultContent.status,
                elapsedTimeSeconds: existing.elapsedTimeSeconds
            )
        }

    default:
        break
    }
}
```

配对过程：

1. 收到 `toolUse` → 创建 `ToolContent`，状态 `.pending`
2. 收到 `toolProgress` → 更新已有条目，状态改为 `.running`，记录耗时
3. 收到 `toolResult` → 合并输出和错误状态，状态改为 `.completed` 或 `.failed`

`ToolContent` 是一个 struct，每次更新都创建新副本。`AgentBridge` 的 `toolContentMap` 是 `@Observable` 追踪的属性，所以每次赋值都会触发 SwiftUI 更新。这意味着工具卡片可以实时显示进度变化。

还有一个 `finalizeToolContentMap` 方法——在 Stream 结束时调用，把所有还在 `.pending` 或 `.running` 状态的工具标记为 `.completed`。防止 Stream 异常终止时，UI 上永远停着一个转圈的进度条。

## 事件持久化：EventStore 协议

每条事件都经过 `appendAndPersist`，同时更新内存数组和数据库：

```swift
private func appendAndPersist(_ event: AgentEvent) {
    events.append(event)
    processToolContentMap(for: event)

    guard event.type != .partialMessage,
          let eventStore, let currentSession else { return }

    totalPersistedEvents += 1
    try eventStore.persist(event, session: currentSession, order: eventOrder)
    eventOrder += 1

    trimOldEvents()
}
```

持久化通过 `EventStoring` 协议抽象：

```swift
@MainActor
protocol EventStoring {
    func persist(_ event: AgentEvent, session: Session, order: Int) throws
    func fetchEvents(for sessionID: UUID) throws -> [AgentEvent]
    func fetchEvents(for sessionID: UUID, offset: Int, limit: Int) throws -> [AgentEvent]
    func totalEventCount(for sessionID: UUID) throws -> Int
}
```

目前只有一个实现 `SwiftDataEventStore`，用 SwiftData 的 `ModelContext` 做存储。序列化是手写的 JSON——`EventSerializer` 把 `AgentEvent` 转成 `[String: Any]` 的字典再压成 `Data`：

```swift
// SwiftData 的 Event 模型
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

为什么把 `metadata` 塞进 `rawData` 而不是拆成独立的 SwiftData 字段？因为 `metadata` 的内容因事件类型而异——`toolUse` 有 `toolName`/`toolUseId`/`input`，`result` 有 `numTurns`/`durationMs`/`totalCostUsd`。拆成独立字段会导致大量空列，而且每次新增事件类型都要改 Schema。用一个 JSON blob 存储，读取时再反序列化，更灵活。

持久化的写入时机是每条事件一次。对于 Agent 的一次典型执行（可能产生 50-100 条事件），这意味着 50-100 次 SwiftData 写入。实测没有性能问题——SwiftData 在内存中缓存，批量刷盘。如果将来事件量更大，可以改成批量写入。

## 内存管理：滑动窗口 + 分页

Agent 的一次复杂执行可能产生上千条事件。全部留在内存里不现实。AgentBridge 用了两层策略：

### 内存内滑动窗口

```swift
private let maxInMemory = 500

func trimOldEvents() {
    guard events.count > maxInMemory else { return }
    let removeCount = events.count - maxInMemory
    let removed = Array(events.prefix(removeCount))
    events.removeFirst(removeCount)
    trimmedEventCount += removeCount

    for event in removed {
        if event.type == .toolUse {
            let toolUseId = event.metadata["toolUseId"] as? String ?? ""
            toolContentMap.removeValue(forKey: toolUseId)
        }
    }
}
```

内存数组最多保留 500 条事件。超出部分从头部删除，同时清理 `toolContentMap` 里对应的条目。`trimmedEventCount` 记录已经删除了多少条，用于分页查询时的偏移计算。

### 加载时的分页

切换会话时，`loadEvents` 按总量决定加载策略：

```swift
func loadEvents(for session: Session) {
    clearEvents()
    currentSession = session
    guard let eventStore else { return }

    let total = try eventStore.totalEventCount(for: session.id)
    totalPersistedEvents = total

    if total > 1000 {
        // 大会话：只加载第一页
        let firstPage = try eventStore.fetchEvents(for: session.id, offset: 0, limit: 50)
        events = firstPage
        eventOrder = total
    } else {
        // 小会话：全部加载
        let persisted = try eventStore.fetchEvents(for: session.id)
        events = persisted
        eventOrder = persisted.count
    }
    rebuildToolContentMap()
}
```

用户向上滚动时，`loadMoreEvents` 按页追加：

```swift
func loadMoreEvents() {
    guard let eventStore, let currentSession else { return }
    let offset = trimmedEventCount + events.count
    guard offset < totalPersistedEvents else { return }

    let remaining = totalPersistedEvents - offset
    let limit = min(pageSize, remaining)
    let nextPage = try eventStore.fetchEvents(for: currentSession.id, offset: offset, limit: limit)
    events.append(contentsOf: nextPage)
    rebuildToolContentMap()
}
```

`hasMoreEvents` 是一个计算属性，SwiftUI 可以用它显示"加载更多"按钮：

```swift
var hasMoreEvents: Bool {
    totalPersistedEvents > trimmedEventCount + events.count
}
```

## 权限系统：Agent 调工具前的用户审批

SDK 的 `permissionMode: .default` 会在工具执行前询问用户是否允许。AgentBridge 通过 `setCanUseTool` 回调接入这个机制：

```swift
private func setupPermissionCallback() {
    agent?.setCanUseTool { [weak self] tool, input, _ in
        guard let self else { return .allow() }
        return await self.handlePermission(tool: tool, input: input)
    }
}
```

`PermissionHandler` 先检查已有的权限规则（用户之前选过"始终允许"的工具）。如果规则匹配，直接放行。如果没有匹配的规则，弹出一个原生的 SwiftUI sheet 让用户审批：

```swift
var pendingPermissionRequest: PendingPermissionRequest?
```

`PendingPermissionRequest` 内部用一个 `CheckedContinuation` 挂起异步执行，等用户点击"允许一次"/"始终允许"/"拒绝"后恢复：

```swift
private func presentPermissionDialog(...) async -> CanUseToolResult {
    let request = PendingPermissionRequest(...)
    self.pendingPermissionRequest = request
    let dialogResult = await request.waitForResult()  // 挂起，等 UI 操作
    self.pendingPermissionRequest = nil

    switch dialogResult {
    case .allowOnce:   // 本次允许
    case .alwaysAllow:  // 写入持久规则
    case .deny:         // 拒绝
    }
}
```

这个设计把 SDK 的同步权限检查（`canUseTool` 回调）和 SwiftUI 的异步 UI 交互（用户点击按钮）桥接在一起，靠 Swift 的 `async/await` + `CheckedContinuation` 实现。

## 配置与生命周期

AgentBridge 的配置入口是 `configure`：

```swift
func configure(apiKey: String, baseURL: String?, model: String, workspacePath: String?) {
    let options = AgentOptions(
        apiKey: apiKey,
        model: model,
        baseURL: baseURL,
        maxTurns: 10,
        permissionMode: .default,
        cwd: workspacePath,
        tools: getAllBaseTools(tier: .core)
    )
    self.agent = createAgent(options: options)
    setupPermissionCallback()
}
```

每次用户切换会话，`WorkspaceView` 会重新调用 `configure`（因为不同会话可能有不同的 workspace path）：

```swift
// WorkspaceView.swift
.onChange(of: session.id) { _, _ in
    agentBridge.clearEvents()
    configureAgent()        // 重新创建 Agent
    loadPersistedEvents()   // 加载该会话的历史事件
    setupTitleGeneration()  // 设置自动标题
}
```

`clearEvents` 做完整的重置——清空事件数组、取消正在执行的 Task、重置分页状态：

```swift
func clearEvents() {
    events = []
    streamingText = ""
    errorMessage = nil
    isRunning = false
    toolContentMap = [:]
    currentTask?.cancel()
    currentTask = nil
    eventOrder = 0
    totalPersistedEvents = 0
    trimmedEventCount = 0
}
```

## 总结

AgentBridge 承担了五个职责：

| 职责 | 实现方式 |
|------|----------|
| 消费 Stream | `Task` 里 `for await` 循环，cancel 时 `Task.cancel()` |
| 映射事件 | `EventMapper.map()` 纯函数 |
| 配对工具内容 | `toolContentMap: [String: ToolContent]` |
| 持久化 | `EventStoring` 协议 + SwiftData 实现 |
| 内存管理 | 500 条滑动窗口 + 按需分页加载 |

整条管线在 `@MainActor` 上运行，SwiftUI 通过 `@Observable` 自动响应变化。视图层不需要知道 Stream 的存在，不需要知道 SDK 的类型，只需要处理 `AgentEvent` 和 `ToolContent`。

下一篇看事件时间线——TimelineView 怎么渲染 18 种事件、怎么做虚拟化、怎么处理流式文本和滚动行为。

---

**系列文章**：

- **第 0 篇**：[用 SwiftUI 构建一个 Agent 可视化工作台](/blog/swiftwork-macos-agent-workbench)
- **第 1 篇**：SDK 集成层——把 AsyncStream 接进 SwiftUI（本文）
- **第 2 篇**：[事件时间线——18 种事件的可视化与性能](/blog/swiftwork-event-timeline)
- **第 3 篇**：[Tool Card——可扩展的工具可视化系统](/blog/swiftwork-tool-card)
- **第 4 篇**：[数据层与服务——SwiftData、状态恢复与 Markdown 渲染](/blog/swiftwork-data-services)

**相关链接**：

- **SwiftWork**：[terryso/SwiftWork](https://github.com/terryso/SwiftWork)
- **Open Agent SDK**：[terryso/open-agent-sdk-swift](https://github.com/terryso/open-agent-sdk-swift)
