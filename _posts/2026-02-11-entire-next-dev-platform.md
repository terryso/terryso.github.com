---
layout: post
title: "Entire：为 AI 时代打造的下一代开发者平台"
date: 2026-02-11 07:49:49 +0800
categories: tech-translation
description: "Entire 宣布获得 6000 万美元种子轮融资，致力于构建面向 AI 智能体时代的开发者平台，同时开源了首款 CLI 工具来追踪 agent 上下文。"
original_url: https://entire.io/blog/hello-entire-world/
source: Hacker News
---

本文翻译自 [Hello Entire World](https://entire.io/blog/hello-entire-world/)，原载于 Hacker News。

> **TLDR：** 今天我们宣布新公司 Entire 成立，获得 6000 万美元种子轮融资，致力于构建世界下一代开发者平台。我们还发布了首款开源产品——一个 CLI 工具，可以在每次推送时将 agent 上下文绑定到 Git 中。

## 游戏规则已变，系统正在崩塌

过去短短几个月，开发者的核心角色已经被彻底重构。从 Anthropic 的 Claude Code with Opus 4.6，到 OpenAI 最新的 GPT-5.3-Codex 智能体编码模型，再到 Cursor 的 Composer 1.5，智能体（agent）智能的进步让编码流程发生了根本性逆转。

终端正在成为新的引力中心，开发者同时在多个终端窗口中操控着 agent 舰队。规范驱动（spec-driven）的开发正成为代码生成的主要驱动力。Agent 开始并行协作，同时生成和评估数百个变体。结果是：代码产生的速度远超人类可理解的范围。

**然而今天，我们仍然依赖一个云计算时代之前构建的软件开发生命周期，它本质上是为人与人协作设计的。** 裂纹正在形成：

- Issue 是为人工规划和跟踪设计的，而非结构化的、机器可读的工作单元
- Git 仓库从未扩展到版本化 AI 时代开发者构建的所有内容
- Pull requests 根本无法扩展到大型 monorepo
- 每天，agent 都在被中心化 API 的容量和速率限制所扼杀

真相是：整个软件生态系统正在被一个手动的生产系统所扼杀，而这个系统最初根本不是为 AI 时代设计的。一个无法为未来而改造的系统。

就像汽车公司用流水线取代传统手工作坊一样，我们现在必须为机器作为代码主要生产者的世界，重新构想整个软件开发生命周期。为智能体时代创建流水线。

## 宣布 Entire：世界下一代开发者平台

**这就是我们新公司 Entire 的使命，构建世界下一代开发者平台，让 agent 和人类可以协作、学习和共同交付。** 这个平台将是开放的、可扩展的、独立的，适用于每个开发者，无论你使用哪种 agent 或模型。

Entire 将基于三个核心组件：

1. **Git 兼容数据库**——在一个统一的版本控制系统中整合代码、意图、约束和推理
2. **通用语义推理层**——通过上下文图（context graph）实现多 agent 协调
3. **AI 原生软件开发生命周期**——为 agent 与人类协作重新发明软件开发流程

在这个愿景的驱动下，我们很高兴获得 **6000 万美元种子轮融资，由 Felicis 领投，Madrona、M12、Basis Set、20VC、Cherry Ventures、Picus Capital 和 Global Founders Capital 参与**。Entire 还获得了一系列国际投资者的支持，包括 Gergely Orosz、Theo Browne、Jerry Yang、Olivier Pomel、Garry Tan 等——他们都明白软件开发已经准备好迎接下一次平台变革。

## 首个发布：追踪 Agent 上下文的 Entire CLI

今天，agent 会话是短暂的（ephemeral）。提示词活在终端里，推理活在上下文窗口里。产生代码的决策、约束和迭代，在你关闭会话的那一刻就消失了。Git 保留了**什么**改变了，但**为什么**改变却毫无记录。

当 agent 每次会话生成数百或数千行代码时，这种上下文丢失会迅速累积。没有共享的上下文，agent 无法有效协作。它们重蹈覆辙、重复推理、浪费 tokens，并且丢失数小时或数天前做出的决策线索。

我们的第一个发布让这些丢失的上下文持久化：

**Checkpoints 是一个新的原语，可以自动将 agent 上下文作为一等、版本化数据捕获到 Git 中。** 当你提交 agent 生成的代码时，Checkpoints 会捕获完整会话以及提交：包括对话记录、提示词、触及的文件、token 使用量、工具调用等。这个上下文成为我们语义推理层的基础写入路径。

你可以按分支浏览 checkpoints，深入到单个会话，并通过人类与 agent 协作的每一次提交，追踪代码库的演进。

我们的计划是支持每个 agent 的 Checkpoints。今天，Entire CLI 首发支持 Anthropic 的 Claude Code 和 Google Gemini CLI。Codex、Cursor CLI 和其他 agent 即将推出。

### 工作原理

Checkpoints 作为 Git 感知的 CLI 运行。在每次由 agent 生成的提交上，它会写入一个结构化的 checkpoint 对象，并将其与 commit SHA 关联。代码保持完全不变，我们只是将上下文添加为一等元数据。

当你推送提交时，Checkpoints 也将这些元数据推送到一个单独的分支（entire/checkpoints/v1），在仓库内给你一个完整的、仅追加的审计日志。结果是：每个变更现在都可以追溯到产生它的推理，而不仅仅是 diff。

Checkpoints 立即就能派上用场：

* **可追溯性**——检查任何 agent 生成变更背后的推理
* **更快的审查**——审查意图和约束，而不仅仅是 diff
* **更好的交接**——恢复工作而无需重播提示词或会话
* **减少 token 浪费**——agent 不会重复你在过去会话中纠正过的错误
* **多会话和 agent 支持**——支持并发的 agent 会话

### 快速开始

最棒的是，你只需两个简单步骤就能设置 Entire。

```bash
curl -fsSL https://entire.io/install.sh | bash
```

然后导航到你的仓库并运行 `entire enable`——按照提示为该项目配置 Entire。就这样。你的 agent 会话会自动以结构化、即用型格式被捕获。

## 不再隐秘开发，我们公开构建！

Checkpoints 是我们为 agent 构建通用语义推理层的第一步。今天，它为你提供可追溯性和历史。明天，它将成为共享记忆，让 agent 可以协调、交接上下文，并在不冲突或理解丢失的情况下共同构建。

最重要的是，我们以开源项目发布 Entire CLI，因为我们相信这一层应该是可移植的、独立的，并适用于每个 agent 或模型。因为我们知道，有了相互关联的开源开发者社区的贡献，我们会做得更好。

我们的路线图将直接由你在 Discord 和 GitHub Discussions 中的反馈铺就。我们准备好了。那里见。

---

## 核心要点

1. **软件开发范式正在巨变**——AI agent 已经成为代码生产的主力，但现有工具链（Git、PR、Issue）仍为人工协作设计，形成瓶颈

2. **Entire 的三层架构**：
   - Git 兼容数据库（统一代码与上下文）
   - 语义推理层（agent 协调的共享记忆）
   - AI 原生 SDL（重新定义工作流）

3. **Checkpoints 的核心价值**：将 agent 会话的"为什么"（意图、推理、约束）与"什么"（代码变更）一起版本化，解决上下文丢失问题

4. **开源策略**：让这层基础设施独立于特定模型/平台，成为整个生态的共享基础

5. **6000 万美元融资**表明资本已经意识到：AI 时代需要全新的开发者基础设施，而现有工具无法简单改造

这是一个大胆的愿景，但确实指向了一个真实问题：当 AI 成为代码的主要生产者时，我们需要全新的工具链来理解、管理和协作这些海量代码的生成过程。
