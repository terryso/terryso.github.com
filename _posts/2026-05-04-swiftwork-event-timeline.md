---
layout: post
title: "深入 SwiftWork（第 2 篇）：事件时间线——18 种事件的可视化与性能"
date: 2026-05-04 16:00:00 +0800
categories: tech
description: "详解 SwiftWork 的事件时间线实现：TimelineView 如何分派 18 种事件到不同视图、ScrollModeManager 如何处理自动滚屏和手动浏览的切换、虚拟化如何在 1000+ 事件下保持流畅。"
tags: [AI, Swift, Agent, macOS, SwiftUI, 可视化, 性能, 开源]
---

> 本文是「深入 SwiftWork」系列第 2 篇。[系列目录见这里](/blog/swiftwork-macos-agent-workbench)。

第 1 篇讲了 AgentBridge 怎么把 SDK 的 `AsyncStream<SDKMessage>` 变成 `[AgentEvent]`。这篇看 `[AgentEvent]` 变成什么——TimelineView 怎么渲染 18 种事件、怎么处理滚屏行为、怎么在事件量很大时保持流畅。

## TimelineView 的结构

TimelineView 是工作区的主体，占满了侧边栏和输入框之间的所有空间。它的视图层级很浅：

```
TimelineView
  ├── ScrollView
  │   ├── topPlaceholder (虚拟化占位)
  │   ├── LazyVStack
  │   │   └── ForEach(virtualizedEvents) → eventView(for:)
  │   ├── bottomPlaceholder (虚拟化占位)
  │   ├── StreamingTextView (流式文本)
  │   └── bottom-anchor (滚动锚点)
  └── returnToBottomButton (回到底部)
```

没有事件时显示空状态："发送消息开始与 Agent 对话"。有事件时进入 `ScrollViewReader` + `LazyVStack` 的结构。

## 事件分派：18 种类型到 8 种视图

`eventView(for:)` 是事件分派的核心。18 种 `AgentEventType` 映射到 8 种视图：

```swift
@ViewBuilder
private func eventView(for event: AgentEvent) -> some View {
    switch event.type {
    case .userMessage:       UserMessageView(event: event)
    case .partialMessage:    EmptyView()
    case .assistant:         AssistantMessageView(event: event)
    case .toolUse:           toolCardView(for: event)
    case .toolResult,
         .toolProgress:      pairedToolEventView(for: event)
    case .result:            ResultView(event: event)
    case .system:            systemOrThinking(event: event)
    case .hookStarted, .hookProgress, .hookResponse,
         .taskStarted, .taskProgress, .authStatus,
         .filesPersisted, .localCommandOutput,
         .promptSuggestion, .toolUseSummary:
                             SystemEventView(event: event)
    case .unknown:           UnknownEventView(event: event)
    }
}
```

几个值得说的分派逻辑：

**`partialMessage` 渲染为 `EmptyView`。** 流式文本不走 `ForEach(events)`，而是在 `LazyVStack` 下方用单独的 `StreamingTextView` 渲染。原因在第 1 篇讲过——`partialMessage` 只累积在 `streamingText` 里，不进 `events` 数组。这样避免了 `ForEach` 频繁插入/删除带来的闪烁和性能开销。

**`toolUse` 走 `toolCardView`，`toolResult`/`toolProgress` 走 `pairedToolEventView`。** 如果 `toolContentMap` 里有对应的条目（说明已经收到了配对的 toolUse），`toolUse` 渲染为 `ToolCardView`，配对的 `toolResult`/`toolProgress` 渲染为 `EmptyView`——因为它们的内容已经合并在卡片里了。如果 `toolContentMap` 里没有（比如历史事件加载不完整），就 fallback 到简单的 `ToolCallView`/`ToolResultView`。

**`system` 类型需要区分"思考中"和普通系统事件。** `systemOrThinking` 方法检查 metadata 里的 `subtype`：

```swift
private func systemOrThinking(event: AgentEvent) -> some View {
    let subtype = event.metadata["subtype"] as? String ?? ""
    let isLastEvent = agentBridge.events.last?.id == event.id
    if (subtype == "init" || subtype == "status") && isLastEvent {
        ThinkingView()              // 旋转齿轮 + "思考中..."
    } else if subtype == "init" || subtype == "status" {
        ThinkingView(isActive: false) // 对勾 + "Agent 已响应"
    } else if let isError = event.metadata["isError"] as? Bool, isError {
        SystemEventView(event: event, isError: true)  // 红色错误条
    } else {
        SystemEventView(event: event)  // 普通系统消息
    }
}
```

只有最后一条 `init`/`status` 事件才显示旋转动画。历史事件显示静态的"Agent 已响应"。这避免了所有历史思考状态都在转圈的问题。

## 各事件视图的设计

### UserMessageView——右对齐蓝色气泡

```swift
struct UserMessageView: View {
    let event: AgentEvent
    var body: some View {
        HStack {
            Spacer()
            Text(event.content)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.blue.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}
```

用户消息右对齐，蓝色半透明背景，圆角矩形。跟 ChatGPT 的消息布局一致。

### AssistantMessageView——左侧竖线 + Markdown

```swift
struct AssistantMessageView: View {
    let event: AgentEvent
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            RoundedRectangle(cornerRadius: 1)
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 2)
                .padding(.trailing, 8)
            MarkdownContentView(markdown: event.content)
            Spacer()
        }
    }
}
```

左边一条灰色竖线做视觉分隔，内容用 `MarkdownContentView` 渲染。这个组件处理 Markdown 解析、代码高亮和长文本折叠，第 4 篇会详细讲。

### ThinkingView——旋转齿轮动画

```swift
struct ThinkingView: View {
    var isActive: Bool = true
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 8) {
            if isActive {
                Image(systemName: "gearshape")
                    .rotationEffect(.degrees(isAnimating ? 360 : 0))
                    .animation(.linear(duration: 1).repeatForever(autoreverses: false),
                               value: isAnimating)
                Text("思考中...")
            } else {
                Image(systemName: "checkmark.circle")
                Text("Agent 已响应")
            }
            Spacer()
        }
        .onAppear { if isActive { isAnimating = true } }
    }
}
```

`isActive` 控制两种状态：旋转齿轮表示正在思考，绿色对勾表示思考完成。`onAppear` 触发动画，视图滚出屏幕再滚回来时不会重新触发。

### ResultView——执行结果 + 统计数据

```swift
struct ResultView: View {
    let event: AgentEvent
    // 从 metadata 提取 durationMs、totalCostUsd、numTurns
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: statusIcon)  // checkmark.circle / pause.circle / xmark.circle
                .foregroundStyle(statusColor)
            Text(subtype)  // success / cancelled / error
        }
        // 下方显示：耗时 | 轮数 | 费用
        HStack(spacing: 12) {
            Label("\(duration)ms", systemImage: "clock")
            Label("\(turns) 轮", systemImage: "arrow.triangle.2.circlepath")
            Label(String(format: "$%.4f", cost), systemImage: "dollarsign.circle")
        }
    }
}
```

Result 事件显示执行结果的概要统计——耗时多少毫秒、经过多少轮对话、花费多少美元。错误时红底高亮。

### SystemEventView——系统消息和错误提示

```swift
struct SystemEventView: View {
    let event: AgentEvent
    let isError: Bool

    var body: some View {
        HStack(spacing: 4) {
            if isError {
                RoundedRectangle(cornerRadius: 1).fill(Color.red).frame(width: 3)
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
            } else {
                Image(systemName: "info.circle").foregroundStyle(.secondary)
            }
            Text(event.content)
        }
        .background(isError ? Color.red.opacity(0.08) : Color.clear)
    }
}
```

普通系统消息一行灰色文字 + info 图标。错误消息加红色左边条 + 红色背景 + 警告图标。

## 滚屏行为：Follow Latest vs Manual Browse

Agent 在执行时会持续产出事件。用户通常想看到最新的事件（自动滚到底部），但有时候想往上翻看历史。这两个需求是冲突的。

SwiftWork 用 `ScrollModeManager` 管理两种模式的切换：

```swift
enum ScrollMode {
    case followLatest    // 自动跟随最新事件
    case manualBrowse    // 用户手动浏览历史
}

@MainActor
@Observable
final class ScrollModeManager {
    var scrollMode: ScrollMode = .followLatest

    var showReturnToBottomButton: Bool {
        scrollMode == .manualBrowse
    }

    private let nearBottomThreshold: CGFloat = 96
    private let scrollUpThreshold: CGFloat = 16
    private var cumulativeUpwardDelta: CGFloat = 0
}
```

**自动跟随的条件：** 当用户距底部不超过 96pt 时，自动切回 `followLatest`。每次新事件到来，TimelineView 自动滚到底部。

**切到手动浏览的条件：** 用户向上滚动超过 16pt 时，切到 `manualBrowse`。此时新事件不再触发自动滚动，右下角显示"回到底部"按钮。

```swift
// TimelineView.swift
.onChange(of: agentBridge.events.count) { _, newCount in
    updateVisibleRangeForCount(newCount)
    if scrollModeManager.scrollMode == .followLatest {
        scrollToLast(proxy: proxy)
    }
}
.onChange(of: agentBridge.streamingText) { _, _ in
    if scrollModeManager.scrollMode == .followLatest {
        scrollToLast(proxy: proxy)
    }
}
```

两个 `onChange` 监听事件数量变化和流式文本变化。只有在 `followLatest` 模式下才自动滚动。

**回到底部按钮：** 点击后切回 `followLatest`，更新 `visibleRange` 到最新 50 条事件，动画滚到底部：

```swift
Button {
    scrollModeManager.returnToBottom()
    let total = agentBridge.events.count
    let lower = max(0, total - 50)
    visibleRange = lower..<total
    withAnimation {
        proxy.scrollTo("bottom-anchor", anchor: .bottom)
    }
}
```

## 虚拟化：只渲染可见范围

当事件数量超过几百条时，全部渲染会导致 `LazyVStack` 创建大量视图，滚动掉帧。SwiftWork 用 `visibleRange` + `renderBuffer` 做虚拟化——只渲染可见区域附近的 ±20 条事件。

```swift
@MainActor
final class TimelineVirtualizationManager {
    let renderBuffer = 20

    func eventsToRender(visibleRange: Range<Int>, allEvents: [AgentEvent]) -> [AgentEvent] {
        guard !allEvents.isEmpty else { return [] }
        let lower = max(0, visibleRange.lowerBound - renderBuffer)
        let upper = min(allEvents.count, visibleRange.upperBound + renderBuffer)
        guard lower < upper else { return [] }
        return Array(allEvents[lower..<upper])
    }
}
```

传入 `ForEach` 的不是 `agentBridge.events`，而是 `virtualizedEvents`——经过虚拟化裁剪后的子集：

```swift
private var virtualizedEvents: [AgentEvent] {
    let allEvents = agentBridge.events
    if allEvents.isEmpty { return [] }
    if visibleRange.isEmpty {
        let upper = allEvents.count
        let lower = max(0, upper - 50)
        return virtualizationManager.eventsToRender(visibleRange: lower..<upper, allEvents: allEvents)
    }
    return virtualizationManager.eventsToRender(visibleRange: visibleRange, allEvents: allEvents)
}
```

被裁掉的区域用占位符撑高度，保持滚动条的位置准确：

```swift
private var topPlaceholder: some View {
    let upper = max(0, visibleRange.lowerBound - virtualizationManager.renderBuffer)
    return Group {
        if upper > 0 && !visibleRange.isEmpty {
            Spacer().frame(height: CGFloat(upper) * estimatedRowHeight)
        }
    }
}
```

`estimatedRowHeight` 取 80pt——一个经验值，大部分事件视图的高度在这个范围附近。不需要精确，只需要让滚动条的大致位置正确。

### visibleRange 的更新时机

`visibleRange` 在几个关键时刻更新：

1. **初始加载**（`.task(id: agentBridge.events.first?.id)`）：设为最后 50 条事件
2. **新事件到来**（`.onChange(of: events.count)`）：如果在 `followLatest` 模式，滑动窗口保持最新 50 条
3. **回到底部**：重置为最新 50 条

目前没有实现滚动过程中的 `visibleRange` 动态更新——用户向上滚动浏览大量历史事件时，`visibleRange` 不会跟着滚动位置变化。这是一个已知的限制，将来可以通过 `onAppear`/`onDisappear` 回调或 `ScrollView` 的 offset 监听来实现。

## 初始滚动：解决首次加载的闪烁

首次加载事件列表时，SwiftUI 的 `ScrollView` 默认从顶部开始渲染。如果会话有几百条事件，用户会先看到顶部的事件，然后闪一下跳到底部。这个闪烁在每次切换会话时都会出现。

SwiftWork 的解决方案：延迟 150ms 后再滚动到底部，等 `LazyVStack` 完成首屏渲染：

```swift
.task(id: agentBridge.events.first?.id) {
    hasCompletedInitialScroll = false
    guard !agentBridge.events.isEmpty else { return }
    scrollModeManager.scrollMode = .followLatest
    visibleRange = 0..<0
    try? await Task.sleep(for: .milliseconds(150))
    guard !Task.isCancelled else { return }
    let total = agentBridge.events.count
    let lower = max(0, total - 50)
    visibleRange = lower..<total
    withAnimation {
        proxy.scrollTo("bottom-anchor", anchor: .bottom)
    }
    hasCompletedInitialScroll = true
}
```

`hasCompletedInitialScroll` 标记位控制后续的滚动模式切换——在初始滚动完成之前，`onChange(of: scrollPositionId)` 不会触发模式切换，避免干扰。

## 总结

TimelineView 的设计可以概括为三个子系统：

| 子系统 | 解决的问题 | 实现 |
|--------|-----------|------|
| 事件分派 | 18 种类型到 8 种视图 | `eventView(for:)` + ViewBuilder |
| 滚屏控制 | 自动跟随 vs 手动浏览 | `ScrollModeManager` + `scrollPosition` |
| 虚拟化 | 大量事件时的渲染性能 | `visibleRange` + `renderBuffer` + 占位符 |

事件分派是纯粹的视图逻辑——根据 `event.type` 选择对应的视图组件。滚屏控制和虚拟化是 TimelineView 独有的性能问题，跟 SDK 集成层无关。

下一篇看 Tool Card 系统——`ToolRenderable` 协议怎么让每种工具有自己的渲染器，以及 `ToolRendererRegistry` 怎么做到不改动时间线代码就能新增工具类型。

---

**系列文章**：

- **第 0 篇**：[用 SwiftUI 构建一个 Agent 可视化工作台](/blog/swiftwork-macos-agent-workbench)
- **第 1 篇**：[SDK 集成层——把 AsyncStream 接进 SwiftUI](/blog/swiftwork-sdk-integration)
- **第 2 篇**：事件时间线——18 种事件的可视化与性能（本文）
- **第 3 篇**：[Tool Card——可扩展的工具可视化系统](/blog/swiftwork-tool-card)
- **第 4 篇**：[数据层与服务——SwiftData、状态恢复与 Markdown 渲染](/blog/swiftwork-data-services)

**相关链接**：

- **SwiftWork**：[terryso/SwiftWork](https://github.com/terryso/SwiftWork)
- **Open Agent SDK**：[terryso/open-agent-sdk-swift](https://github.com/terryso/open-agent-sdk-swift)
