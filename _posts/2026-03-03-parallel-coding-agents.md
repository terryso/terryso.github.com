---
layout: post
title: "用 tmux 和 Markdown 规范并行运行 4-8 个编程 Agent"
date: 2026-03-03 01:34:29 +0800
categories: tech-translation
description: "作者分享了如何使用 tmux、Markdown 文件和自定义斜杠命令，同时运行 4-8 个编程 Agent 进行并行开发工作的实践经验"
original_url: https://schipper.ai/posts/parallel-coding-agents/
source: Hacker News
---

本文翻译自 [How I run 4–8 parallel coding agents with tmux and Markdown specs](https://schipper.ai/posts/parallel-coding-agents/)，原载于 Hacker News。

---

几个月来，我一直在使用一套轻量级方案来并行运行编程 Agent：tmux、Markdown 文件、bash 别名，以及六个斜杠命令。这些都是"原生"Agent——没有子代理配置文件或编排器，但我确实在每个 tmux 窗口中使用了角色命名约定：

- **Planner（规划者）**：为新功能或修复构建 Markdown 规范
- **Worker（执行者）**：根据完成的规范进行实现
- **PM（项目经理）**：待办事项管理和想法记录

大部分实际代码编写都基于我称之为 **Feature Designs（FDs）** 的完成规范。FD 就是一个 md 文件，包含：

- 我们要解决的问题
- 所有被考虑的方案及其优缺点
- 最终选定的方案和实现计划，包括需要修改的文件
- 验证步骤

采用这套方案后，我可以同时与 4 到 8 个 Agent 协作。超过 8 个 Agent 后就难以跟上节奏，决策质量也会下降。

我在一个项目中手工构建了这套系统，完成了 300 多个这样的规范。当开始新项目时，我想把同一套系统移植过去，于是创建了一个斜杠命令 `/fd-init`，可以将完整配置引导到任何代码仓库中。

## Feature Design 追踪

每个 FD 都有一个编号的规范文件（FD-001、FD-002……），在所有 FD 的索引中进行追踪，并通过斜杠命令管理完整的生命周期。文件存放在 `docs/features/` 目录下，经历 8 个阶段：

| 阶段 | 含义 |
| --- | --- |
| **Planned** | 已识别，尚未设计 |
| **Design** | 正在积极设计方案 |
| **Open** | 已设计完成，等待实现 |
| **In Progress** | 正在实现中 |
| **Pending Verification** | 代码完成，等待运行时验证 |
| **Complete** | 验证通过，准备归档 |
| **Deferred** | 无限期推迟 |
| **Closed** | 不做 |

六个斜杠命令处理完整生命周期：

| 命令 | 功能 |
| --- | --- |
| `/fd-new` | 从想法创建新 FD |
| `/fd-status` | 显示索引：哪些活跃、待验证、已完成 |
| `/fd-explore` | 启动会话：加载架构文档、开发指南、FD 索引 |
| `/fd-deep` | 启动 4 个并行 Opus Agent 探索复杂设计问题 |
| `/fd-verify` | 校对代码、提出验证计划、提交 |
| `/fd-close` | 归档 FD、更新索引、更新变更日志 |

每次提交都会关联到对应的 FD：`FD-049: Implement incremental index rebuild`。变更日志会随着 FD 完成自动累积。

一个典型的 FD 文件长这样：

```
FD-051: Multi-label document classification
Status: Open Priority: Medium
Effort: Medium Impact: Better recall for downstream filtering

## Problem
Incoming documents get a single category label, but many span
multiple topics. Downstream filters miss relevant docs because
the classifier forces a single best-fit.

## Solution
Replace single-label classification with multi-label:
1. Use an LLM to assign confidence scores per category.
2. Accept all labels above 0.90 confidence.
3. For ambiguous scores (0.50-0.90), run a second LLM pass
   with few-shot examples to confirm.
4. Store all labels with scores so downstream queries can
   threshold flexibly.

## Files to Modify
- src/classify/multi_label.py (new: LLM-based multi-label logic)
- src/classify/prompts.py (new: few-shot templates for ambiguous cases)
- sql/01_schema.sql (add document_labels table with scores)
- sql/06_classify_job.sql (new: scheduled classification after ingestion)

## Verification
1. Run classifier on staging document table
2. Verify no errors in operation log, run health checks
3. Spot-check: docs with known multi-topic content have expected labels
4. Run tests, confirm downstream filters respect confidence threshold
```

`FEATURE_INDEX.md` 追踪所有 FD 的状态：

```
## Active Features
| FD     | Title                              | Status              | Effort | Priority |
|--------|------------------------------------|---------------------|--------|----------|
| FD-051 | Multi-label document classification| Open                | Medium | Medium   |
| FD-052 | Streaming classification pipeline  | In Progress         | Large  | High     |
| FD-050 | Confidence-based routing           | Pending Verification| Medium | High     |

## Completed
| FD     | Title                       | Completed  | Notes            |
|--------|-----------------------------|------------|------------------|
| FD-049 | Incremental index rebuild   | 2026-02-20 | 45 min → 2 min   |
| FD-048 | LLM response caching        | 2026-02-18 |                  |
```

在任何代码仓库中运行 `/fd-init`，它会：

1. 从 CLAUDE.md、package 配置和 git log 推断项目上下文
2. 创建目录结构（`docs/features/`、`docs/features/archive/`）
3. 生成针对项目定制的 `FEATURE_INDEX.md`
4. 创建 FD 模板
5. 安装斜杠命令（`/fd-new`、`/fd-status`、`/fd-explore`、`/fd-deep`、`/fd-verify`、`/fd-close`）
6. 将 FD 生命周期规范追加到项目的 CLAUDE.md

```
* FD System Initialized
Files Created
- docs/features/FEATURE_INDEX.md — Feature index
- docs/features/TEMPLATE.md — FD file template
- docs/features/archive/ — Archive directory
- CHANGELOG.md — Changelog (Keep a Changelog format)
- CLAUDE.md — Project conventions with FD management section
- .claude/commands/fd-new.md — Create new FD
- .claude/commands/fd-explore.md — Project exploration
- .claude/commands/fd-deep.md — Deep parallel analysis
- .claude/commands/fd-status.md — Status and grooming
- .claude/commands/fd-verify.md — Verification workflow
- .claude/commands/fd-close.md — Close and archive FD with changelog update

Next Steps
1. Run /fd-new to create your first feature design
2. Run /fd-status to check the current state
```

## 开发循环

### 规划阶段

我大部分时间都在与 Planner 协作。每个 Planner 都以 `/fd-explore` 开始，加载代码库上下文和过往工作，这样 Agent 就不会从零开始。对于 FDs 诞生的原始项目，这个斜杠命令是有机成长的，现在包含了架构文档、开发指南、README 和核心代码文件。对于我的新项目，我创建了通用版本（也就是本文分享的版本），计划在新项目中定制它。

一旦 `/fd-explore` 完成，我通常会把 Planner 指向一个现有的 FD 文件，来回讨论直到我对规范满意：

> on fd14 - can we move the batch job to event-driven? what does the retry logic look like if the queue backs up?

Boris Tane 在 [How I Use Claude Code](https://www.linkedin.com/pulse/how-i-use-claude-code-boris-tane-jcjgc/) 中描述了他如何使用内联注释给 Claude 反馈。我把这个模式适配到复杂的 FD 中，因为对话式的来回可能不够精确。我直接在 Cursor 中编辑 FD 文件，添加前缀为 `%%` 的内联注释：

```
## Solution
Replace cron-based batch processing with an event-driven pipeline.
Consumer pulls from the queue, processes in micro-batches of 50.
%% what's the max queue depth before we start dropping? need backpressure math
Run both in parallel for 48h, compare outputs, then kill the cron job.
Failures go to the dead-letter queue.
%% what happens to in-flight items during cutover? need to confirm drain behavior
```

然后在 Claude Code 中：

> fd14 - check %% notes.

有时一个功能相当复杂，问题没有明显的解决方案，或者我对正在使用的技术不够熟悉。在这种情况下，我可能会做两件事：

1. 在 Cursor 中用 gpt-5.3-codex xhigh（或其他最新的 SOTA 模型）交叉检查 FD 计划
2. 使用特殊技能：`/fd-deep`，它启动 4 个 Opus Agent 并行（灵感来自 GPT Pro 的并行测试时计算）从不同角度探索：

> if we switch to async processing, what happens to the retry queue when the consumer crashes mid-batch? use `/fd-deep`.

`/fd-deep` 让每个 Agent 在 Explore 模式下运行，调查特定角度（算法、结构、增量、环境，或任何适合问题的角度）。编排器然后验证每个输出并推荐下一步。

复杂的规划会话可能跨越多个上下文窗口。我经常让 Claude 对计划做检查点，因为压缩（compaction）不能很好地在新会话中保留相关上下文。

### Worker 执行

当 FD 准备好后，我会在单独的 tmux 窗口中启动一个全新的 Agent。我指向 FD 并开启"plan mode"，让 Claude 构建行级实现计划，然后开启"accept edits"让它运行。当 FD 影响范围大时，我会指示 Worker 创建一个 worktree，Claude Code 原生支持这个功能。

压缩对 Worker 来说效果更好，可能是因为 FD 有详细的计划细节，新生 Worker 可以关注。

### 验证

每个 FD 都有验证计划，但是当被提示仔细检查自己的工作时，Claude 往往会发现代码中的 bug，所以我总是重复输入同样的内容：

> proofread your code end to end, must be airtight
> check for edge cases again
> commit now, then create a verification plan on live test deployment.

所以我构建了 `/fd-verify`——它提交当前状态，进行校对并通过验证计划。

在原始项目中，我还创建了专门的测试斜杠命令如 `/test-cli`，对实时数据进行完整验证。Agent 执行实时查询和命令，推理结果是否正确，并写入包含表格、时间戳和诊断说明的 Markdown 文件。这很棒的地方是 Agent 可以当场调查问题，所以最后返回的结果是经过诊断的。

```
PM window:
1. /fd-status ← What's active and pending
2. Pick an FD (or /fd-new) ← Groom the backlog or dump a new idea

Planner window (new agent session):
3. /fd-explore ← Load project context
4. Design the FD ← if stuck /fd-deep and cross-check in Cursor
5. FD status → Open ← Design is ready for implementation

Worker window (fresh agent session):
6. /fd-explore ← Fresh context load
7. "implement fd-14" (plan mode) ← Claude builds a line-level implementation plan
8. Implement with atomic commits ← FD-XXX: description
9. /fd-verify ← Proofread and verification
10. Test on real deployment ← Verification skills or manual
11. /fd-close ← Archive, update index, changelog
```

### FD 文件作为决策追踪

在我的原始项目中，现在有 300+ 个 FD 文件，每个都有问题陈述、考虑过的方案和实现了什么。这个系统的一个涌现属性是，Agent 经常通过 `/fd-explore`、`/fd-deep` 或在 plan mode 下启动 Explore Agent 时自己发现过去的 FDs。之前考虑过的额外上下文帮助 Agent 更好地规划，也提醒我可能忘记的相关工作（在标签页之间频繁切换和工作速度加快后，我更难记住做过什么）。

### 开发指南

编程 Agent 在某些任务上非常聪明，但在其他方面缺乏品味和良好判断。它们对错误极度恐惧，经常重复代码，留下死代码，或未能复用现有的有效模式。我最初解决这个问题的方法是一个不断增长的 `CLAUDE.md`，最终变得不切实际地长，而且很多条目并不总是普遍适用，感觉像浪费宝贵的上下文窗口。所以我创建了开发指南（`docs/dev_guide/`）。Agent 在会话开始时阅读摘要，并在被提示时可以深入了解任何特定条目。在我的原始项目中，开发指南是有机成长的，我计划将同样的概念扩展到新项目。以下是 `dev_guide` 可能包含的示例：

| 条目 | 覆盖内容 |
| --- | --- |
| No silent fallback values | 配置错误应该大声失败，而不是隐藏在默认值后面 |
| DRY: extract helpers and utilities | 不要重写相同的解析器或验证逻辑两次 |
| No backwards compatibility | 所有部署都是测试环境，不需要迁移代码 |
| Structured logging conventions | 所有功能的统一日志格式 |
| Embedding handling | 始终在摄入时规范化嵌入，永远不要信任数据库驱动的原始格式 |
| Deployment safety | 破坏性操作必须在部署前等待运行中的任务完成 |
| LLM JSON parsing | 始终用宽松模式和正则回退解析，永远不要用原始 `json.loads()` |

我的 `CLAUDE.md` 保持精简，包含提交风格、Python 和 SQL 规范、FD 生命周期规则等内容。

## 上下文切换导航

```
┌────────────────────────┬────────────────────────┬────────────────────────┐
│                        │                        │                        │
│   Cursor (IDE)         │   Ghostty Terminal 1   │   Ghostty Terminal 2   │
│                        │   tmux                 │   tmux                 │
│                        │                        │                        │
│   Visual browsing      │   Window 1: PM         │   Window 1: Worker     │
│   Hand edits           │   Window 2: Planner    │   Window 2: Worker     │
│   Cross-model checks   │   Window 3: Planner    │   Window 3: Worker     │
│                        │   Window 4: Planner    │   Window 4: bash       │
│                        │                        │                        │
└────────────────────────┴────────────────────────┴────────────────────────┘
```

在家工作时，我在超宽显示器上有三个面板：

- **Cursor**（左侧）用于代码浏览、编辑和与其他模型交叉检查计划
- **两个 Ghostty 终端**（中间和右侧）各运行一个 tmux 会话

跨终端的两个编程 Agent：

- **Claude Code** 是我日常用于通用编程的主力
- **Cortex Code** 是 Snowflake 的编程 Agent——类似 Claude Code 但有更深的 Snowflake 集成

我主要使用**原生 tmux** 导航：`Ctrl-b n/p` 循环窗口，`Ctrl-b ,` 重命名（`planner`、`worker-fd038`、`PM`），`Ctrl-b c` 启动新 Agent，`Ctrl-b s` 浏览会话。一些自定义添加：`Shift-Left/Right` 重排窗口，`m` 在会话间移动窗口，`renumber-windows on` 这样关闭标签不会留下空隙。

我厌倦了输入完整路径，所以创建了 `g*` 别名（"go to"）用于即时导航：

| 别名 | 项目 |
| --- | --- |
| `gapi` | ~/workspace/services/api-service |
| `gpipeline` | ~/workspace/services/data-pipeline |
| `gdatakit` | ~/workspace/tooling/datakit |
| `gclaude` | ~/.claude |

Claude 也会读取它们。我告诉 Claude：

> run the eval in gpipeline

它会将别名解析为实际路径。

当运行 3+ 个 Agent 时，我需要一种方法知道每个窗口何时需要我的输入。我设置了 tmux 窗口在 Agent 空闲时改变颜色：

| 层 | 文件 | 功能 |
| --- | --- | --- |
| Claude Code | `~/.claude/settings.json` | `Notification` 钩子（匹配器：`idle_prompt`）向终端发送响铃（`\a`） |
| tmux | `~/.tmux.conf` | `monitor-bell on`、`bell-action any`、`window-status-bell-style reverse` |

tmux 标签显示活跃的 Agent 会话：PM、Planner 和一个 fd-init 运行。标签在 Agent 空闲时改变颜色。

## 困难之处

运行 6+ 个 Agent 时，总有东西在等着我，比如有设计问题的 Planner 或准备验证的 Worker。管理这些是系统开始紧张的地方。

**认知负荷。** 大约 8 个 Agent 是我的实际极限。超过这个数量，我会失去对每个 Agent 正在做什么的追踪，设计决策会受损。当我必须提示 Agent"总结它的工作"时，我知道需要收敛一下。

**并非所有事情都能并行化。** 有些功能有顺序依赖。虽然我可以通过 worktree 强制某些功能的并行性然后尝试合并，但这会创建合并冲突，可能导致混乱，从而导致更多工作和糟糕的合并。我更愿意保持事物原子化和增量式，避免在几乎不认识的代码库中花太多时间解决合并冲突。

**上下文窗口限制。** 我喜欢全面地处理问题，所以我经常让 Planner 探索多个角度、考虑边缘情况、针对代码检查计划，并向我解释直到我理解。所以我很快消耗上下文窗口。我注意到压缩可能会丢失好的上下文甚至规划期间做出的决策，所以现在我经常对 FD 进度做检查点。这增加了规划周期的时间，但产生更紧凑的计划。

**拒绝列表焦虑。** Claude Code 的权限系统有评估顺序问题，其中 blanket Bash 允许会覆盖 ask 列表。这个不幸的 bug 导致我放弃 ask 列表，改用 deny 列表。我拒绝破坏性命令（`rm`、`git reset --hard`、`DROP`），但 Agent 总是找到创造性的方法覆盖它们：`unlink`、`python -c "import os; os.remove()"`、`find ... -delete`。我最近在 `CLAUDE.md` 中添加了一条指令不要这样做，目前还好，但我不完全信任它。

**将业务上下文翻译成 FD 仍然是手动的。** 由于这是个人设置，我不通过 FD 与他人协作。相反，我们使用工单追踪系统、消息平台、产品决策文档和会议记录等。我是所有这些和 FD 之间的桥梁。最终我想用带 MCPs 的专用子代理配置文件进行实验。

---

> 如果你也尝试这套方案，请分享你的想法或反馈。你可以通过 manuels93@gmail.com 联系作者。

---

## 核心要点总结

1. **Feature Design (FD) 规范是核心**：用结构化的 Markdown 文件记录问题、方案、实现计划和验证步骤，让 Agent 有明确的执行蓝图
2. **角色分离**：Planner 负责设计，Worker 负责实现，PM 负责管理，各司其职
3. **斜杠命令自动化**：将重复性工作封装成 `/fd-*` 命令，提高效率
4. **`/fd-deep` 并行探索**：复杂问题时启动多个 Agent 从不同角度分析，类似 GPT Pro 的并行测试时计算
5. **内联注释反馈**：用 `%%` 前缀在 FD 文件中添加问题，比对话更精确
6. **开发指南**：用 `docs/dev_guide/` 存放项目特有的编码规范和模式，保持 CLAUDE.md 精简
7. **上下文管理**：8 个 Agent 是实践上限，超过后认知负荷过重
8. **tmux + 别名**：简单高效的窗口管理和快速导航方案
