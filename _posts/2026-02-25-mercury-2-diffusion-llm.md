---
layout: post
title: "Mercury 2：基于扩散模型的世界最快推理大语言模型"
date: 2026-02-25 16:00:58 +0800
categories: tech-translation
description: "Inception Labs 发布 Mercury 2，采用扩散模型架构实现每秒 1009 tokens 的生成速度，比传统自回归模型快 5 倍以上，为生产环境 AI 带来实时推理体验。"
original_url: https://www.inceptionlabs.ai/blog/introducing-mercury-2
source: Hacker News
---

本文翻译自 [Introducing Mercury 2](https://www.inceptionlabs.ai/blog/introducing-mercury-2)，原载于 Hacker News。

---

今天，Inception Labs 正式发布 **Mercury 2** —— 全球最快的推理语言模型（reasoning LLM），专为让生产环境 AI 实现即时响应而打造。

## 为什么速度现在如此重要？

生产环境的 AI 应用早已不是"一次提示、一次回答"那么简单了。现在的 AI 系统是各种循环的组合：智能体（Agents）、检索流水线（Retrieval Pipelines）、后台批量提取任务——这些都在大规模并发运行。

在这些循环中，延迟不仅仅出现一次，而是会在每一步、每一个用户、每一次重试中不断累积放大。

然而，当前的大语言模型仍然共享同一个瓶颈：**自回归（autoregressive）的顺序解码**。一个 token 接一个 token，从左到右依次生成。

## 新的基石：用于实时推理的扩散模型

Mercury 2 打破了顺序解码的限制。它通过**并行优化（parallel refinement）**来生成响应——同时产生多个 token，在少量步骤内逐步收敛。

打个比方：传统模型像打字机逐字输出，而 Mercury 2 更像编辑同时修改整篇草稿。

**结果：生成速度提升 5 倍以上，拥有根本不同的速度曲线。**

这种速度优势也改变了推理的权衡。今天，更高的智能意味着更多的测试时计算（test-time compute）——更长的推理链、更多的采样、更多的重试——这些都直接牺牲了延迟和成本。

而基于扩散模型的推理，让你在实时延迟预算内获得推理级别的质量。

## Mercury 2 概览

Mercury 2 重塑了生产部署的质量-速度曲线：

- **速度**：在 NVIDIA Blackwell GPU 上达到 1,009 tokens/秒
- **价格**：输入 $0.25/100万 tokens，输出 $0.75/100万 tokens
- **质量**：与主流速度优化模型具有竞争力
- **特性**：可调推理深度 · 128K 上下文 · 原生工具调用 · Schema 对齐的 JSON 输出

我们优化的目标是用户真正能感受到的速度：用户交互时的响应性——高并发下的 p95 延迟、稳定的回合间表现、系统繁忙时的稳定吞吐量。

> "Inception 的 Mercury 2 展示了当新模型架构遇上 NVIDIA AI 基础设施时可能实现的目标。在 NVIDIA GPU 上突破每秒 1,000 tokens，凸显了我们平台在支持全谱系 AI 工作负载方面的性能、可扩展性和多功能性。"
>
> — Shruti Koparkar，NVIDIA 加速计算集团高级产品经理

## Mercury 2 在生产环境中的应用场景

Mercury 2 在延迟敏感、用户体验不可妥协的应用场景中表现出色。

### 1. 编码和编辑

自动补全、下一次编辑建议、代码重构、交互式代码助手——这些场景中开发者在循环中，任何停顿都会打断心流。

> "建议的到来速度足够快，感觉就像你自己思考的一部分，而不是需要等待的东西。"
>
> — Max Brunsfeld，Zed 联合创始人

### 2. 智能体循环（Agentic Loops）

智能体工作流每个任务需要串联数十次推理调用。减少每次调用的延迟不仅能节省时间，还能改变你能负担得起运行多少步骤，以及最终输出有多好。

> "我们正在利用最新的 Mercury 模型来智能优化大规模营销活动执行。通过实时提供洞察并动态增强交付，我们正在推动更强的性能、更高的效率，以及更有韧性、AI 驱动的广告生态系统。"
>
> — Adrian Witas，Viant 高级副总裁、首席架构师

> "我们一直在评估 Mercury 2，因为它无与伦比的延迟和质量组合，对于实时转录清理和交互式人机交互应用特别有价值。没有其他模型能接近 Mercury 提供的速度！"
>
> — Sahaj Garg，Wispr Flow CTO & 联合创始人

> "Mercury 2 至少比 GPT-5.2 快两倍，这对我们来说是游戏规则改变者。"
>
> — Suchintan Singh，Skyvern CTO & 联合创始人

### 3. 实时语音和交互

语音接口有 AI 中最紧张的延迟预算。Mercury 2 让推理级别的质量在自然语音节奏内成为可能。

> "我们构建逼真的 AI 视频化身，与真人进行实时对话，所以低延迟不是锦上添花，而是一切。Mercury 2 在我们的语音技术栈中是一个重大突破：快速、一致的文本生成，让整个体验感觉自然和人性化。"
>
> — Max Sapo，Happyverse AI CEO & 联合创始人

> "Mercury 2 的质量非常出色，模型的低延迟使语音助手更具响应性。"
>
> — Oliver Silverstein，OpenCall CEO & 联合创始人

### 4. 搜索和 RAG 流水线

多跳检索（multi-hop retrieval）、重排序（reranking）和摘要的延迟会快速堆积。Mercury 2 让你可以在搜索循环中添加推理，而不会超出延迟预算。

> "我们与 Inception 的合作使我们的搜索产品的实时 AI 变得实用。每一个 SearchBlox 客户——无论是客户支持、合规、风险、分析还是电子商务——都能从所有数据的亚秒级智能中受益。"
>
> — Timo Selvaraj，SearchBlox 首席产品官

## 开始使用

Mercury 2 现已上线。

Mercury 2 兼容 OpenAI API。直接接入你现有的技术栈——无需重写代码。

如果你正在进行企业评估，我们将与你合作进行工作负载适配、评估设计，以及在你预期服务约束下的性能验证。

**Mercury 2 已上线。欢迎进入扩散时代。**

---

## 要点总结

1. **架构创新**：Mercury 2 采用扩散模型（Diffusion）而非传统的自回归解码，可并行生成多个 token
2. **速度突破**：达到 1,009 tokens/秒，比传统模型快 5 倍以上
3. **成本优势**：输入 $0.25/1M tokens，输出 $0.75/1M tokens，价格极具竞争力
4. **应用场景**：特别适合代码补全、智能体工作流、实时语音、RAG 流水线等延迟敏感场景
5. **无缝迁移**：兼容 OpenAI API，可直接替换现有方案

扩散模型在图像生成领域已证明其优势，现在这一架构正被引入语言模型领域。对于追求极致响应速度的生产环境来说，Mercury 2 提供了一个值得关注的新选择。
