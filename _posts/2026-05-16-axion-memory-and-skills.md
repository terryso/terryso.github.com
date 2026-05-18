---
layout: post
title: "Axion 记忆与技能：越用越聪明的桌面助手"
description: "Axion 能从每次任务执行中学习操作模式，积累跨任务记忆。更厉害的是，你可以录制一次操作流程，编译成可回放的技能——之后无需 LLM 即可瞬间执行。本文解析记忆提取、技能录制编译和参数化回放的完整管道。"
date: 2026-05-16 22:00 +0800
categories: [AI, macOS, 自动化]
tags: [Axion, macOS, 记忆系统, 技能, 录制回放, Agent]
---

前几篇我们看了 Axion 怎么执行单次任务。但自动化有一个朴素的目标：**做过的事不想再做第二遍**。

Axion 用两种机制来实现这个目标——**跨任务记忆**和**录制回放技能**。前者让 Agent 越用越聪明，后者让重复操作完全不需要 LLM。

## 跨任务记忆：Agent 的经验积累

### 问题

假设你第一次让 Axion 打开 Finder 进入下载目录，Agent 可能会：
1. 用 Spotlight 搜索 Finder
2. 打开 Finder
3. 尝试侧边栏点击"下载"
4. 失败，改用 Cmd+Shift+G
5. 输入路径，确认

下一次你再让它做同样的事，Agent 理想情况下应该直接走第 4-5 步的捷径，而不是重新试错。但这需要它**记住上次的经验**。

### 记忆的提取

每次任务完成后，AppMemoryExtractor 会从 trace 中提取操作模式：

- **常用菜单路径** — "在 Finder 中，前往文件夹用 Cmd+Shift+G"
- **控件位置** — "计算器的乘号按钮在第二行第三列"
- **操作序列** — "打开 TextEdit 新文档：先 launch_app，再 hotkey cmd+n"
- **失败教训** — "点击计算器按钮用坐标不可靠，应该用 AX 选择器"

这些经验被 AppProfileAnalyzer 按应用归类，形成每个 App 的"操作档案"。

### 记忆的注入

下一次运行涉及同一 App 时，MemoryContextProvider 会把对应的操作档案注入到 System Prompt 中。Agent 在规划时就能看到：

> **Finder 操作经验：**
> - 导航到特定目录：使用 Cmd+Shift+G 打开"前往文件夹"对话框，输入路径，按 Return
> - 侧边栏项目点击成功率低，建议使用键盘快捷方式

这比让 Agent 重新探索高效得多。

### 记忆管理

```bash
# 查看已积累的记忆
axion memory list

# 清除特定 App 的记忆（比如 App 更新后操作方式变了）
axion memory clear --app com.apple.calculator

# 单次运行禁用记忆（测试或调试时有用）
axion run --no-memory "打开计算器"
```

记忆存储使用 OpenAgentSDK 的 `MemoryStoreProtocol`，底层是 `FileBasedMemoryStore`——基于文件系统的持久化，存在 `~/.axion/memory/` 目录下。

这里有个分层："存什么"和"怎么用"由 Axion 应用层决定，"怎么存"和"怎么取"由 SDK 的 MemoryStore 负责。应用层决定语义，SDK 提供基础设施。

### FamiliarityTracker

Axion 还有一个熟悉度追踪器（FamiliarityTracker）。它记录 Agent 对每个 App 的操作次数和成功率。使用次数越多，Agent 对该 App 的"熟悉度"越高，规划时可以更大胆地使用快捷方式而非保守探索。

## 录制回放技能：从学习到精通

记忆系统让 Agent 更聪明，但它仍然需要 LLM 来规划和执行。对于每天都做的固定操作，这太浪费了。

Axion 的技能系统解决这个问题：**录制一次，回放无数次，无需 LLM**。

### 第一步：录制

```bash
# 开始录制
axion record "open_calculator"

# ... 此时你可以正常使用电脑，Axion 在后台捕获你的操作 ...
# 完成后按 Ctrl-C 停止录制
```

录制引擎使用 macOS 的 CGEvent Tap 监听键盘和鼠标事件。它捕获五类操作：

```swift
public enum EventType: String, Codable {
    case click           // 鼠标点击
    case typeText        // 文本输入
    case hotkey          // 快捷键
    case appSwitch       // 应用切换
    case scroll          // 滚动
}
```

每个事件都带有时间戳和窗口上下文：

```swift
public struct RecordedEvent: Codable {
    public let type: EventType
    public let timestamp: TimeInterval
    public let parameters: [String: JSONValue]
    public let windowContext: WindowContext?  // 哪个 App、哪个窗口
}
```

`WindowContext` 记录事件发生时的前台应用名、进程 ID、窗口 ID 和窗口标题。编译时需要这些信息来判断操作发生在哪个窗口。

录制还会定期捕获窗口快照（`WindowSnapshot`），记录窗口的位置和大小，作为编译时的参考信息。

### 第二步：编译

录制完成后，原始事件流是"人操作"视角的——坐标是绝对的、时序是连续的。要变成可回放的技能，需要经过编译：

```bash
axion skill compile open_calculator
```

编译过程（`RecordingCompiler`）把原始事件转换为 MCP 工具调用序列：

**录制的事件：**
```
click at (500, 320)     →    click { x: 500, y: 320 }
wait 200ms
click at (420, 400)     →    click { x: 420, y: 400 }
type "Hello"            →    type_text { text: "Hello" }
```

**编译后的 SkillStep：**
```swift
public struct SkillStep: Codable {
    public let tool: String              // MCP 工具名
    public let arguments: [String: String]  // 工具参数
    public let waitAfterSeconds: Double  // 步骤间等待时间
}
```

编译器会：
- 识别连续的键盘输入合并为 `type_text`
- 把坐标点击转换为 `click` 调用
- 保留步骤间的时间间隔（避免操作太快导致应用来不及响应）
- 尝试匹配 AX 选择器（如果录制时有窗口快照）

### 第三步：回放

```bash
# 回放技能——不需要 LLM，不需要 API 调用
axion skill run open_calculator

# 带参数回放
axion skill run open_calculator --param expression="42+58"
```

回放由 `SkillExecutor` 驱动。它通过 MCP 调用 AxionHelper 执行每个 SkillStep，和正常任务使用完全相同的工具通道——只是没有 LLM 介入。

这意味着技能回放是**确定性的**——同样的输入总是产生同样的操作序列。不依赖 LLM 的判断，不受 token 波动影响。

### 技能管理

```bash
# 列出所有技能
axion skill list

# 删除技能
axion skill delete open_calculator
```

技能以 JSON 文件存储在 `~/.axion/skills/`：

```json
{
  "name": "open_calculator",
  "description": "打开计算器并输入表达式",
  "version": 1,
  "created_at": "2026-05-16T14:30:00Z",
  "source_recording": "open_calculator",
  "parameters": [
    {
      "name": "expression",
      "default_value": "1+1",
      "description": "要计算的表达式"
    }
  ],
  "steps": [
    { "tool": "launch_app", "arguments": { "app_name": "Calculator" }, "wait_after_seconds": 1.0 },
    { "tool": "hotkey", "arguments": { "keys": "command+a" }, "wait_after_seconds": 0.2 },
    { "tool": "type_text", "arguments": { "text": "{{expression}}" }, "wait_after_seconds": 0.3 }
  ],
  "execution_count": 5,
  "last_used_at": "2026-05-16T15:00:00Z"
}
```

注意 `steps[2].arguments.text` 的值是 `{{expression}}`——这是参数占位符，回放时由实际的 `--param` 值替换。

## 记忆 vs 技能：什么时候用哪个？

这是两种不同层次的自动化：

| 维度 | 记忆 | 技能 |
|------|------|------|
| 触发方式 | 自动（每次运行） | 手动（`axion skill run`） |
| 需要 LLM | 是（但规划更快） | 否（确定性回放） |
| 灵活性 | 高（Agent 可以调整策略） | 低（固定操作序列） |
| 适用场景 | 偶尔做但希望越来越快 | 每天都做的固定流程 |
| 成本 | 有（LLM 调用） | 无（纯本地执行） |

一个实际的组合用法：

1. **第一次做**：`axion run "在 Slack 中设置状态为离线"` — Agent 探索式执行，可能需要多步尝试
2. **记忆生效**：第二次做同样的事，Agent 直接走捷径，因为记忆中有操作路径
3. **变成技能**：如果发现每天下班都要做这个操作，`axion record "slack_offline"` 录制一次，以后一键回放

**从探索到熟练到自动化**——这是 Axion 的学习曲线。

## 下一步

到目前为止我们看到的都是 Axion 作为独立工具的用法。但它的野心不止于此——它可以作为 HTTP 服务嵌入 CI/CD，可以作为 MCP Server 被其他 Agent 调用，还有原生菜单栏应用。

最后一篇，我们看 Axion 的集成生态。

---

**深入 Axion 桌面自动化平台系列文章**：

- **第 1 篇**：[Axion 入门：用自然语言控制你的 Mac](/blog/axion-desktop-automation-intro)
- **第 2 篇**：[Axion 架构解析：四模块设计与 MCP 协议](/blog/axion-architecture-four-modules)
- **第 3 篇**：[Axion 核心引擎：Plan-Execute-Verify 循环](/blog/axion-plan-execute-verify-engine)
- **第 4 篇**：Axion 记忆与技能：越用越聪明的桌面助手（本文）
- **第 5 篇**：[Axion 集成生态：从命令行到全平台](/blog/axion-integration-ecosystem)

**GitHub**：[terryso/axion](https://github.com/terryso/axion)
