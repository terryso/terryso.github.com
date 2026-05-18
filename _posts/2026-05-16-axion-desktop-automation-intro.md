---
layout: post
title: "Axion 入门：用自然语言控制你的 Mac"
description: "Axion 是一个用 Swift 构建的 macOS 桌面自动化平台。你只需用自然语言描述任务，它就会自动规划、执行并验证桌面操作。本文介绍 Axion 的核心能力、快速上手流程和一次真实的 Calculator 自动化过程。"
date: 2026-05-16 20:30 +0800
categories: [AI, macOS, 自动化]
tags: [Axion, macOS, MCP, 桌面自动化, Swift, LLM]
---

你有没有想过，直接告诉电脑"打开计算器，算一下 17 乘以 23"，然后它就真的去做了？

不是调 API，不是写脚本，而是像跟一个坐在电脑前的人说话一样——它听到指令，移动鼠标，点击按钮，读取屏幕，然后告诉你结果。

这就是 [Axion](https://github.com/terryso/axion) 在做的事。

## 它解决什么问题？

macOS 上从来不缺自动化工具。AppleScript 存了二十年，Automator 内置了十几年，Shortcuts 也在不断进化。但它们都有一个共同的局限：**你需要精确地告诉电脑每一步怎么做**。

"点击坐标 (500, 300)"、"按 Command+N"、"选择菜单栏第三项"——这些是指令，不是意图。

Axion 换了一个思路。你只需要说**你想要什么**，它来决定**怎么做**。

背后是一套 LLM 驱动的 Plan-Execute-Verify 循环：LLM 负责理解你的意图并生成操作计划，Axion 的 21 个原生 macOS 工具负责执行，每一步执行后还会自动验证结果。如果某步失败了，它会自动重新规划，换一种方式再试。

## 30 秒上手

```bash
# 克隆并构建
git clone https://github.com/terryso/axion.git
cd axion
swift build -c release

# 交互式配置（API Key、LLM Provider）
.build/release/AxionCLI setup

# 检查环境（权限、Helper 等）
.build/release/AxionCLI doctor

# 执行第一个任务
.build/release/AxionCLI run "打开计算器并计算 123 + 456"
```

**环境要求：** macOS 14+、Xcode 16+（Swift 6.1），以及辅助功能（Accessibility）和屏幕录制权限。

Axion 目前支持 Anthropic 和 OpenAI Compatible 两种 LLM Provider。配置完 API Key 之后就可以直接使用了。

## 一次真实的自动化过程

让我展示 Axion 实际运行时发生了什么。这是之前端到端验证时的一个真实场景：

```bash
axion run "打开计算器，计算 17 乘以 23"
```

### 它做了什么

Axion 的 Agent 收到这个任务后，自主执行了以下操作序列：

1. **`launch_app`** — 启动计算器应用
2. **`screenshot`** — 截屏确认计算器已打开
3. **`click`** — 点击数字键 "1"
4. **`click`** — 点击数字键 "7"
5. **`click`** — 点击乘号 "×"
6. **`click`** — 点击数字键 "2"
7. **`click`** — 点击数字键 "3"
8. **`click`** — 点击等号 "="
9. **`screenshot`** — 截屏确认结果

最终结果：计算器显示 **391**。正确。

### 过程中的一个小插曲

过程中有一个有趣的插曲。Agent 第一次尝试点击计算器按钮时失败了——它使用的坐标不准确。但它没有傻傻地重复同样的点击，而是**切换了策略**：重新读取无障碍树（Accessibility Tree）获取准确的按钮位置，然后成功点击。

这种"失败后自动换策略"的能力，是 Axion 和传统自动化脚本的本质区别。脚本失败了就停了；Axion 会想办法继续。

整个过程中，Agent 共产生了 90 个 trace 事件，经历了完整的 Plan → Execute → Verify 循环。

## 不只是计算器

Calculator 只是最简单的 demo。Axion 的 21 个 MCP 工具覆盖了桌面操作的方方面面：

**应用管理** — `launch_app`、`list_apps`、`activate_window`

**窗口管理** — `list_windows`、`resize_window`、`arrange_windows`（支持并排、级联等布局）

**鼠标操作** — `click`、`double_click`、`right_click`、`drag`、`scroll`

**键盘操作** — `type_text`、`press_key`、`hotkey`

**屏幕与无障碍** — `screenshot`、`get_accessibility_tree`、`open_url`

这意味着你可以做更复杂的事：

```bash
# 跨应用协作
axion run "从 Safari 复制网页标题，粘贴到 TextEdit 文档"

# 窗口布局
axion run "把 Safari 和 TextEdit 并排显示，左 Safari 右 TextEdit"

# 系统操作
axion run "打开 Finder，进入下载目录"
axion run "打开 TextEdit，输入 Hello World"
```

端到端测试验证过这些场景都能顺利完成。

## 几个实用的运行模式

Axion 提供了几种不同的运行模式，适应不同场景：

```bash
# 干跑模式 — 只生成计划，不实际执行（适合调试）
axion run --dryrun "打开计算器并计算 123 + 456"

# 快速模式 — 减少 LLM 调用次数，适合简单任务
axion run --fast "打开计算器"

# 限制步数 — 防止 Agent 跑飞
axion run --max-steps 10 "在备忘录中创建一条新笔记"
```

## 如果 Agent 卡住了怎么办？

Axion 在这里加了一个机制——**用户接管（User Takeover）**。

当自动化遇到它无法处理的障碍（比如需要输入密码、出现 CAPTCHA、或者 UI 结构让 Agent 迷惑了），Axion 会暂停执行，提示你来手动处理。你完成后按 Enter，它就接着往下跑。

这个设计背后的理念是：**不完美的自动化好过没有自动化**。与其让 Agent 在一个对话框前反复失败，不如让你花 3 秒钟点一下，然后让 Agent 继续完成剩余的工作。

暂停时有三个选项：
- **Enter** — 手动修复后恢复
- **skip** — 跳过当前步骤
- **abort** — 取消整个任务

## 接下来

这篇是 Axion 系列的第一篇，只覆盖了"它是什么"和"怎么用"。

在后续文章中，我们会深入到更技术性的话题：

- **架构设计** — 四模块分层（CLI/Core/Helper/Bar）和 MCP 进程间通信
- **执行引擎** — Plan-Execute-Verify 状态机的完整工作原理
- **记忆与技能** — Axion 如何从每次任务中学习，以及录制回放技能系统
- **集成生态** — HTTP API、MCP Server 模式、菜单栏应用和 OpenAgentSDK

如果你对桌面自动化或 MCP 协议感兴趣，欢迎关注这个系列。

---

**深入 Axion 桌面自动化平台系列文章**：

- **第 1 篇**：Axion 入门：用自然语言控制你的 Mac（本文）
- **第 2 篇**：[Axion 架构解析：四模块设计与 MCP 协议](/blog/axion-architecture-four-modules)
- **第 3 篇**：[Axion 核心引擎：Plan-Execute-Verify 循环](/blog/axion-plan-execute-verify-engine)
- **第 4 篇**：[Axion 记忆与技能：越用越聪明的桌面助手](/blog/axion-memory-and-skills)
- **第 5 篇**：[Axion 集成生态：从命令行到全平台](/blog/axion-integration-ecosystem)

**GitHub**：[terryso/axion](https://github.com/terryso/axion)
