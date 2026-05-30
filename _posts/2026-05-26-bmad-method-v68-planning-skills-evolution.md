---
layout: post
title: "BMad Method v6.8：规划技能的新一代进化"
description: "从 v6.3 到 v6.8，BMad Method 完成了从工具到平台的跃迁。新一代规划技能——bmad-spec、bmad-ux 重写、bmad-prd 统一——定义了 AI 驱动开发的下一步。"
date: 2026-05-26 10:00 +0800
categories: [AI, Agent, 开源]
tags: [BMad, AI开发, 规划技能, SPEC, PRD, UX设计]
---

BMad Method 在过去七个版本里做了一件事：**把规划技能从"帮你写文档"升级为"帮你锁定意图"**。

这不是一个比喻。看 v6.8 新增的 bmad-spec，它做的是把你脑子里模糊的想法、已有的 PRD、一段对话记录——任何输入——提炼成一个五字段的 SPEC 内核。下游的架构、故事、开发技能消费这个内核，不需要重新阅读所有上游文档。

这条线串起了 v6.3 到 v6.8 的每一次更新。下面拆几个关键变化。

## bmad-spec：意图的规范合约

这是 v6.8 最重要的新增技能。

以前，你有一个产品想法，需要走完整个 PRD → 架构 → 故事流程才能开始开发。bmad-spec 改变了这个前提：**先把"做什么"锁死，再让下游技能决定"怎么做"。**

它的工作方式很直接：

1. 接收任意输入——脑暴记录、PRD、对话文本、UX 文件夹、混合多源材料
2. 提炼成一个五字段内核：**Why（为什么做）、Capabilities（做什么）、Constraints（限制条件）、Non-goals（明确不做的事）、Success Signal（成功的具体信号）**
3. 装不下的内容路由到伴生文件
4. 自校验两遍——先检查一致性，再检查是否保留了原始材料中每一个关键声明

输出是一个 `SPEC.md`，加上伴生文件和一个 `.decision-log.md`。这个文件有一个重要的契约：**只有 bmad-spec 可以写 SPEC.md**。其他技能产出各自的原生文档，需要表达意图时通过 headless 模式调用 bmad-spec。

这解决了一个真实问题：LLM 上下文窗口有限，你不可能每次开发都把完整的 PRD 塞进去。SPEC 内核就是下游技能需要的最小信息集。

## bmad-ux 全面重写：两条脊柱

v6.8 对 UX 工作流做了一个不向后兼容的重写，用 `bmad-ux` 替换了旧的 `bmad-create-ux-design`。

新的输出是两个文件组成的"脊柱对"：

- **DESIGN.md**（视觉脊柱）—— 基于 Google Labs 的设计规范格式，描述界面长什么样
- **EXPERIENCE.md**（行为脊柱）—— 描述用户怎么和界面交互，用有名字的主角（named protagonist）走完完整旅程

这个拆分很讲究。视觉规范和行为规范面对的读者不同、变更频率不同、消费方式不同。一个开发 Agent 读 DESIGN.md 知道按钮放在哪，读 EXPERIENCE.md 知道点击后应该发生什么。

新 UX 工作流还加入了几个实用特性：

- **Stitch handoff**——输出可以直接交给 Stitch（vibe coding 工具）做快速原型
- **Opt-in reviewer gate**——在关键决策点可以暂停，让真人审核后再继续
- **决策日志**——每次设计选择都记录在 `.decision-log.md` 里

## bmad-prd 和 bmad-brief：统一为一个技能

v6.7 重写了 bmad-prd，把创建、更新、验证合并成一个技能的三个意图（intent）。

调用时声明意图：

```
bmad-prd  # 技能会问你想要哪个意图
bmad-prd create   # 从零开始，通过引导式发现创建 PRD
bmad-prd update   # 接收变更信号，与现有 PRD 对齐，先暴露冲突再应用
bmad-prd validate # 对照可配置的质量检查清单，产出结构化的 HTML 发现报告
```

这比之前分开的 `bmad-create-prd`、`bmad-edit-prd`、`bmad-validate-prd` 更干净。旧的技能名会被路由到新技能，不会直接报错。

## bmad-investigate：取证的纪律

v6.7 新增的 bmad-investigate 解决了一个特定问题：**调试和调查需要不同的思维模式，但大多数人把两者混在一起。**

它把调查变成一门有纪律的实践：

- **证据分级**——每个发现分为 Confirmed（有引用的事实）、Deduced（从事实推导的结论）、Hypothesized（待验证的假设）。不是分类标签，是让案卷可读的手段
- **据点先行**——不从理论开始，从一条确认的证据开始向外扩展。避免确认偏差
- **假设不删除**——假设被证伪时不删除，只更新状态和解决说明。六个月后另一个工程师可以读案卷，知道哪些路已经走过
- **质疑前提**——用户描述的问题本身是假设，不是事实。技能会独立验证技术声明

输出是一个结构化的调查文件，不是聊天记录。另一个没参与过的工程师可以接手，知道发生了什么、确认了什么、还有什么不确定。

## 69 种启发式技术

v6.8 的启发式技术库从 50 种扩展到 69 种，新增了 19 种和一个新的"框架"类别。

几个值得关注的：

- **Six Thinking Hats**——从六个角度（数据、情感、风险、乐观、创造、流程）重新审视输出
- **Delphi Method**——多轮匿名评估收敛到共识
- **Steelmanning**——先把你反对的论点构造到最强版本，再反驳
- **Abstraction Laddering**——在抽象和具体之间上下移动，找到合适的思考层次
- **Pre-mortem Analysis**——假设项目已经失败，反向推理找出原因

这些技术通过 `bmad-advanced-elicitation` 技能调用。LLM 会根据内容类型推荐最相关的 5 种方法，你选一个应用，看完结果可以接受或重来。

## TOML 定制化：不 fork 就能改一切

v6.4 引入的定制化系统可能是对团队最有价值的更新。

每个可定制的技能自带一个 `customize.toml` 定义默认值。你不在原文件上改——而是在 `_bmad/custom/` 下创建稀疏的覆写文件，只包含你想改的字段。

三层覆盖模型：

```
优先级 1（最终赢家）：_bmad/custom/{skill-name}.user.toml  （个人，gitignore）
优先级 2：           _bmad/custom/{skill-name}.toml         （团队，提交到 git）
优先级 3（兜底）：   技能自带的 customize.toml               （默认值）
```

合并规则按值的形状决定：标量覆盖，表深度合并，带标识符字段的表数组按键替换，其他数组追加。

这解决了以前每个团队都 fork 整个 BMad 仓库来改 Agent 人设的问题。现在写一个几行的 TOML 文件就行，升级 BMad 时你的定制化不受影响。

还有一个 `bmad-customize` 技能，像向导一样带你走完覆写过程：扫描可定制项、帮你选对层级、写文件、验证合并结果。

## 其他值得注意的变化

**发布通道（v6.4）。** 每个模块可以独立选择 stable、next（预发布）或 pinned（锁定版本）。可以混用——核心模块跑 stable，实验模块跑 next。通过 CLI flag 或交互式安装器切换。

**非交互式安装器（v6.6）。** `--set` 和 `--list-options` flag 让 BMad 可以集成到 CI 流水线和 Dockerfile 中。不再需要人坐在终端前回答安装问题。

**18 个新 Agent 平台（v6.5）。** 支持总数达到 42 个，新增了 Sourcegraph Amp、IBM Bob、Warp、OpenHands、Replit Agent 等。

**决策日志（v6.7）。** `.decision-log.md` 模式在工作流中追踪决策，让跨会话的续接和审计变得干净。

**激活护栏（v6.8）。** 23 个技能的激活流程加固，关闭了 LLM 静默跳过 append 步骤和 on_complete 钩子这个 bug 类。

## 一条主线

从 v6.3 到 v6.8，贯穿所有更新的主线是：**让 AI 开发的瓶颈从"写代码"转移到"锁定意图"。**

bmad-spec 把模糊想法提炼成规范合约。bmad-ux 把设计分成视觉和行为两条独立脊柱。bmad-prd 把创建、更新、验证统一成一个技能的三个意图。bmad-investigate 把调查变成有纪律的取证过程。TOML 定制化让团队不改源码就能适配流程。

代码生成已经不是最难的环节。难的是让 AI 准确理解你想要什么，并且在你改变主意时能干净地更新。BMad v6.8 在这个方向上走了一步。
