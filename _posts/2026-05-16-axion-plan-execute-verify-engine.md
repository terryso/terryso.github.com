---
layout: post
title: "Axion 核心引擎：Plan-Execute-Verify 循环"
description: "深入解析 Axion 的执行引擎。从 RunEngine 状态机的完整状态流转，到 LLM Planner 如何通过 System Prompt 引导生成操作计划，再到失败恢复和用户接管机制。一次看懂 Agent 如何从自然语言到桌面操作。"
date: 2026-05-16 21:30 +0800
categories: [AI, macOS, 架构]
tags: [Axion, macOS, Agent, LLM, 状态机, Plan-Execute-Verify]
---

上一篇讲了 Axion 的四模块架构。这次我们钻进最重要的部分——执行引擎。

Axion 的核心是一个 **Plan-Execute-Verify 循环**。它不是一个简单的"接收指令→执行"管道，而是一个有状态、能自纠错、能重试的循环系统。

## 状态机全貌

Axion 的执行过程可以用 9 个状态描述：

```
                    ┌──────────┐
                    │ planning │ ← 初始状态 / 重新规划
                    └────┬─────┘
                         │ Plan 生成成功
                         ▼
                    ┌──────────┐
              ┌─────│executing │
              │     └────┬─────┘
              │          │ 执行完成
              │          ▼
              │     ┌──────────┐
              │     │verifying │
              │     └────┬─────┘
              │          │
              │    ┌─────┴──────────┐
              │    │                │
              │    ▼ (通过)         ▼ (受阻/失败)
              │  ┌──────┐    ┌────────────┐
              │  │ done │    │ replanning │──┐
              │  └──────┘    └──────┬─────┘  │
              │                      │        │
              │                      └────────┘
              │                       重试 ≤ maxRetries
              │
              ▼ (步骤失败)
        ┌────────────┐
        │ replanning │
        └────────────┘

其他终止状态：
  - cancelled        用户取消
  - failed           超过重试/步数上限
  - needsClarification  需要人工确认
  - blocked          任务受阻（已达重试上限）
```

RunEngine 是一个纯 struct（不是 Actor），因为 `run()` 是一次性的 async 调用，内部状态只在单次调用中变化，并发安全由内部 Actor 保证。

## 第一步：Planning

当用户输入 `axion run "打开计算器，计算 17 乘以 23"` 时，第一个状态是 `planning`。

### System Prompt 的角色

Axion 不用传统的 JSON 输出解析式规划。它把任务直接交给 LLM Agent，通过 System Prompt 引导 Agent **直接调用 MCP 工具**。

Prompt 文件在 `Prompts/planner-system.md`，它是 Axion 的"大脑"。这个 Prompt 定义了：

**工具使用规则：**
- 一次只调用一个工具
- 每次调用后观察结果再决定下一步
- 最多调用 `max_steps` 次

**元素发现策略：**
- 先用 `get_accessibility_tree` 获取 AX 树
- 优先使用 `__selector`（按标题/角色匹配元素）
- 兜底用坐标，但坐标必须从 AX 树的 `bounds` 字段推导
- 绝不猜测坐标

**键盘规则：**
- `type_text` 只在可编辑元素上有效
- `hotkey` 格式是 `modifier+base_key`（如 `shift+8` 输入 `*`）
- `press_key` 传键名（如 `return`、`tab`），不是字符

**失败恢复策略：**
- 换工具、换元素、换顺序
- 不重复同样的失败操作
- 试了 2-3 次还不行就调用 `pause_for_human`

**多窗口工作流：**
- 跨应用数据传输用剪贴板（`command+c` → `command+v`）
- 窗口切换后必须重新获取 AX 树
- `arrange_windows` 后坐标全部失效，必须刷新

这套 Prompt 让 LLM 不只是"想"，而是按照一套严格的操作规范来"做"。

### 上下文注入

PromptBuilder 在加载 Prompt 模板时会注入变量：

```
可用工具列表：{{tools}}      → SDK 自动发现的 Helper 工具
最大步数：{{max_steps}}      → 来自配置
```

如果跨任务记忆启用，还会注入该应用的历史操作经验。

## 第二步：Executing

Planning 完成后（Agent 生成了计划并开始调用工具），状态转为 `executing`。

这一步的核心是 StepExecutor。它做三件事：

**安全检查。** 每次 Agent 调用工具前，SDK 的 `HookRegistry` 会触发 `preToolUse` Hook。Axion 在这个 Hook 中注册了安全检查逻辑——比如检查某些操作是否需要用户确认。

**占位符解析。** Step 中的参数可能包含占位符（如 `{{prev_result.window_id}}`），PlaceholderResolver 负责用前面步骤的实际结果来替换这些占位符。

**步数预算控制。** 有两个预算维度：
- `maxSteps`（默认 20）— 单次运行的最大工具调用次数
- `maxBatches`（默认 6）— 最大 plan-execute-verify 循环次数

任何预算用尽，立即终止并标记为 `failed`。

## 第三步：Verifying

每批步骤执行完毕后，进入 `verifying` 状态。

TaskVerifier 通过 LLM 判断执行结果是否符合预期。它有三条路径：

**通过（→ done）：** 所有步骤执行成功，验证确认任务完成。

**需要澄清（→ needsClarification）：** 任务描述有歧义，需要用户提供更多信息。Agent 会暂停并询问。

**受阻（→ replanning）：** 验证发现任务没有完成，但有明确的失败原因。转入重新规划。

验证器还使用 StopConditionEvaluator 来评估 Plan 中定义的停止条件（`stopWhen`）。这些条件可以是"屏幕上出现某个文字"、"某个窗口存在"等语义化条件。

## 失败恢复：自动 Replanning

当执行或验证失败时，Axion 不会直接放弃——而是自动重新规划。

```swift
// RunEngine 的 replan 逻辑
replanCount += 1
if replanCount > config.maxReplanRetries {
    context.currentState = .failed
    output.displayError(.maxRetriesExceeded(retries: config.maxReplanRetries))
    return context
}
```

重新规划时，Planner 会收到：
- 原始计划（失败的 Plan）
- 已执行的步骤及结果
- 失败原因

这让 LLM 能够基于失败信息调整策略。回到 Calculator 的例子——Agent 第一次点击失败后，它在下一轮规划中切换了策略，重新读取 AX 树，找到了正确的按钮位置。

**重试上限**（默认 3 次）防止无限循环。超过上限，任务标记为 `failed`。

## 用户接管：不完美但实用

当 Agent 遇到它无法自主解决的障碍时，可以调用 `pause_for_human` 工具主动暂停。

这是 OpenAgentSDK 提供的内置工具。Agent 调用它时，SDK 会暂停 Agent Loop，把控制权还给应用层。AxionCLI 收到暂停信号后，在终端显示提示：

```
⚠ Agent 需要你的帮助：认证对话框出现了，请手动登录后按 Enter 继续。
  [Enter] 恢复  [skip] 跳过  [abort] 取消
```

用户手动完成操作后按 Enter，Agent 恢复执行，带着新的屏幕状态继续任务。

什么情况下 Agent 会主动暂停：
- 认证/登录对话框
- CAPTCHA 验证
- 权限授予弹窗
- 找不到 UI 元素（尝试 2-3 次后）
- 任何需要物理介入的场景

## Trace：完整的执行审计

每次运行，TraceRecorder 都会把所有事件记录为 JSONL 格式：

```jsonl
{"event": "run_start", "run_id": "20260510-z6880l", "task": "打开计算器，计算 17 乘以 23", "mode": "standard"}
{"event": "state_change", "from": "planning", "to": "executing"}
{"event": "plan_created", "step_count": 10, "stop_when_count": 1}
{"event": "tool_call", "tool": "launch_app", "step": 1}
{"event": "tool_result", "tool": "launch_app", "success": true}
...
{"event": "run_done", "total_steps": 12, "replan_count": 1}
```

这些 trace 文件保存在 `~/.axion/traces/` 目录下，对于调试复杂任务非常有用。它们也服务于跨任务记忆——Memory 系统会从 trace 中提取操作模式。

## Dryrun 模式

在正式执行前，你可以用 `--dryrun` 查看计划：

```bash
axion run --dryrun "打开计算器并计算 123 + 456"
```

Dryrun 模式在 Planning 阶段后直接跳到 `done`，不执行任何实际操作。这让你可以在不触碰桌面的情况下，检查 LLM 生成的计划是否合理。

## 下一步

到这里，我们已经理解了 Axion 如何执行单次任务。但如果你每天都做同样的操作——比如每天早上打开邮件、查看日历、启动 Slack——每次都让 LLM 重新规划太浪费了。

下一篇我们看 Axion 的记忆与技能系统：它如何从每次任务中学习，以及如何把重复操作变成一键回放的"技能"。

---

**深入 Axion 桌面自动化平台系列文章**：

- **第 1 篇**：[Axion 入门：用自然语言控制你的 Mac](/blog/axion-desktop-automation-intro)
- **第 2 篇**：[Axion 架构解析：四模块设计与 MCP 协议](/blog/axion-architecture-four-modules)
- **第 3 篇**：Axion 核心引擎：Plan-Execute-Verify 循环（本文）
- **第 4 篇**：[Axion 记忆与技能：越用越聪明的桌面助手](/blog/axion-memory-and-skills)
- **第 5 篇**：[Axion 集成生态：从命令行到全平台](/blog/axion-integration-ecosystem)

**GitHub**：[terryso/axion](https://github.com/terryso/axion)
