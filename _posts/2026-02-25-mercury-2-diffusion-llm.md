---
layout: post
title: "Mercury 2：基于扩散模型的最快推理 LLM"
date: 2026-02-25 12:49:21 +0800
categories: tech-translation
description: "Inception Labs 推出 Mercury 2，这是全球最快的推理语言模型，采用扩散模型架构实现并行生成，速度达到每秒 1009 个 token。"
original_url: https://www.inceptionlabs.ai/blog/introducing-mercury-2
source: Hacker News
---

本文翻译自 [Introducing Mercury 2](https://www.inceptionlabs.ai/blog/introducing-mercury-2)，原载于 Hacker News。

---

## 为什么速度比以往更重要？

生产环境中的 AI 已经不再是简单的一次问答。它变成了循环：Agent（智能体）、检索管道（Retrieval Pipelines）、后台批量提取任务。在这些循环中，延迟不会只出现一次——它会在每一步、每个用户、每次重试中累积叠加。

然而，当前的 LLM 仍然共享同一个瓶颈：**自回归（autoregressive）的顺序解码**。一次一个 token，从左到右依次生成。

## 新的基础：用于实时推理的扩散模型

Mercury 2 不采用顺序解码。它通过**并行细化（parallel refinement）**生成响应，同时产出多个 token，在少量步骤内收敛。

打个比方：传统的 LLM 像是打字机一个字一个字敲出来，而 Mercury 2 更像是编辑在同时修订整篇草稿。

**结果：生成速度提升 5 倍以上，拥有完全不同的速度曲线。**

这种速度优势也改变了推理的权衡。今天，更高的智能意味着更多的测试时计算（test-time compute）——更长的思维链、更多的采样、更多的重试——这些都需要牺牲延迟和成本。而基于扩散的推理让你能在实时延迟预算内获得推理级别的质量。

## Mercury 2 概览

Mercury 2 为生产部署重新定义了质量-速度曲线：

| 指标 | 数值 |
|------|------|
| **速度** | 在 NVIDIA Blackwell GPU 上达到 1,009 tokens/sec |
| **价格** | 输入 $0.25/1M tokens · 输出 $0.75/1M tokens |
| **质量** | 与主流速度优化模型相当 |
| **特性** | 可调推理 · 128K 上下文 · 原生工具调用 · Schema 对齐的 JSON 输出 |

我们优化的是用户真正能感受到的速度：高并发下的 p95 延迟、一致的轮次行为、系统繁忙时的稳定吞吐量。

> "Inception 的 Mercury 2 展示了当新模型架构遇上 NVIDIA AI 基础设施时可能实现的突破。在 NVIDIA GPU 上突破每秒 1000 个 token，凸显了我们平台在为全谱系 AI 工作负载提供性能、可扩展性和多功能性方面的实力。"
> — Shruti Koparkar，NVIDIA 加速计算组产品高级经理

## Mercury 2 在生产场景中的价值

Mercury 2 在延迟敏感、用户体验不可妥协的应用场景中表现出色。

### 1. 代码编写与编辑

自动补全、下一步编辑建议、重构、交互式代码 Agent——这些工作流中开发者在循环中，任何停顿都会打断心流。

> "建议的到来速度足够快，感觉就像是你自己思考的一部分，而不是你需要等待的东西。"
> — Max Brunsfeld，Zed 联合创始人

### 2. Agent 循环

Agent 工作流每个任务会串联数十次推理调用。减少每次调用的延迟不仅节省时间，还改变了你能负担运行多少步骤，以及最终输出能有多好。

> "我们正在使用最新的 Mercury 模型来智能地优化大规模活动执行。通过实时洞察和动态增强投放，我们正在推动更强的性能、更高的效率，以及更有韧性的 AI 驱动广告生态系统。"
> — Adrian Witas，Viant 高级副总裁、首席架构师

> "我们一直在评估 Mercury 2，因为它无与伦比的延迟和质量，这对于实时转录清理和交互式 HCI 应用特别有价值。没有其他模型能接近 Mercury 提供的速度！"
> — Sahaj Garg，Wispr Flow CTO & 联合创始人

> "Mercury 2 至少比 GPT-5.2 快两倍，这对我们来说是颠覆性的。"
> — Suchintan Singh，Skyvern CTO & 联合创始人

### 3. 实时语音交互

语音界面有 AI 中最苛刻的延迟预算。Mercury 2 让推理级别的质量在自然语音节奏内成为可能。

> "我们构建逼真的 AI 视频化身，与真人进行实时对话，所以低延迟不是锦上添花，而是一切。Mercury 2 在我们的语音技术栈中是一个重大突破：快速、一致的文本生成，让整个体验感觉自然和人性化。"
> — Max Sapo，Happyverse AI CEO & 联合创始人

> "Mercury 2 质量出色，模型的低延迟让语音 Agent 更加响应迅速。"
> — Oliver Silverstein，OpenCall CEO & 联合创始人

### 4. 搜索和 RAG 管道

多跳检索（multi-hop retrieval）、重排序（reranking）和摘要的延迟会快速叠加。Mercury 2 让你在搜索循环中加入推理，而不会突破延迟预算。

> "我们与 Inception 的合作让我们搜索产品的实时 AI 变得实用。每个 SearchBlox 客户——跨越客户支持、合规、风险、分析和电商——都能从所有数据的亚秒级智能中受益。"
> — Timo Selvaraj，SearchBlox 首席产品官

## 如何开始

Mercury 2 现已上线，**完全兼容 OpenAI API**，可以直接接入现有技术栈——无需重写代码。

如果你正在进行企业评估，我们会与你合作进行工作负载适配、评估设计和预期服务约束下的性能验证。

---

## 总结

Mercury 2 的核心创新在于抛弃了传统 LLM 的自回归顺序生成方式，转而采用扩散模型的并行细化机制。这种架构转变带来了：

1. **数量级的速度提升**：1000+ tokens/sec 的生成速度
2. **新的质量-延迟权衡**：在实时延迟内获得推理级别质量
3. **生产友好的特性**：OpenAI API 兼容、可调推理、128K 上下文

对于中国开发者来说，如果你正在构建 Agent、实时语音应用或需要低延迟的生产系统，Mercury 2 值得关注。扩散模型能否成为 LLM 的新范式？让我们拭目以待。

Mercury 2 已上线。欢迎来到扩散时代。
