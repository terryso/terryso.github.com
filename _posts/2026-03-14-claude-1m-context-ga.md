---
layout: post
title: "Claude Opus 4.6 和 Sonnet 4.6 正式开放 1M 上下文窗口"
date: 2026-03-14 20:29:00 +0800
categories: tech-translation
description: "Anthropic 宣布 Claude Opus 4.6 和 Sonnet 4.6 的 100 万 token 上下文窗口正式上线，标准定价无需额外费用，媒体限制扩展至 600 张图片或 PDF 页面。"
original_url: https://claude.com/blog/1m-context-ga
source: Hacker News
---

本文翻译自 [1M context is now generally available for Opus 4.6 and Sonnet 4.6](https://claude.com/blog/1m-context-ga)，原载于 Hacker News。

---

Claude Opus 4.6 和 Sonnet 4.6 现已在 Claude 平台上正式提供完整的 100 万 token 上下文窗口，并采用标准定价。这意味着你可以以与短文本相同的价格使用超长上下文——Opus 4.6 为每百万 token 输入/输出 $5/$25，Sonnet 4.6 为 $3/$15。**没有额外的长上下文附加费**：一个 90 万 token 的请求与一个 9 千 token 的请求按相同的单价计费。

## 正式版有哪些更新？

- **统一价格，完整上下文窗口**：不再有长上下文溢价，无论你使用多少 token，单价保持一致。
- **所有上下文长度均可获得完整速率限制**：你的标准账户吞吐量适用于整个上下文窗口。
- **单次请求数据量提升 6 倍**：最多支持 600 张图片或 PDF 页面（之前为 100 张）。即日起在 Claude 平台原生版、Microsoft Azure Foundry 和 Google Cloud Vertex AI 上可用。
- **无需 Beta 请求头**：超过 20 万 token 的请求现在可以自动工作。如果你之前已经发送了 beta 请求头，它会被忽略，因此无需修改任何代码。

此外，**Claude Code 的 Max、Team 和 Enterprise 用户在使用 Opus 4.6 时已自动包含 1M 上下文**。Opus 4.6 会话可以自动使用完整的 100 万 token 上下文窗口，这意味着更少的上下文压缩（compaction）和更完整的对话保持。

## 真正可靠的长上下文

100 万 token 的上下文只有在模型能够正确回忆细节并在海量信息中进行推理时才有意义。Opus 4.6 在 MRCR v2 基准测试中得分 78.3%，在相同上下文长度的前沿模型中位居榜首。

![MRCR Benchmark](https://cdn.prod.website-files.com/68a44d4040f98a4adf2207b6/69b49c06e1c573f3ce50276b_image%20(3).png)

Claude Opus 4.6 和 Sonnet 4.6 在整个 100 万 token 窗口内保持准确。长上下文检索能力随着每一代模型的发布而不断提升。

这意味着你可以直接加载：
- **整个代码库**
- **数千页的合同文档**
- **长时间运行 Agent 的完整轨迹**——包括工具调用、观察结果和中间推理过程

以前处理长上下文所需的工程工作、有损摘要和上下文清除操作，现在都不再需要了。完整的对话可以保持完整。

## 业界反馈

### Ramp

> "Claude Code 在搜索 Datadog、Braintrust、数据库和源代码时可能会消耗 10 万+ token。然后上下文压缩就会启动，细节就会丢失，你在原地打转调试。有了 100 万上下文，我可以在一个窗口中搜索、再搜索、汇总边缘情况并提出修复方案。"
>
> — **Anton Biryukov，软件工程师**

### Cognition（Devin 团队）

> "在 Opus 4.6 的 100 万上下文窗口之前，一旦用户加载大型 PDF、数据集或图片，我们就必须立即压缩上下文——恰恰丢失了最重要的内容的精确度。我们看到压缩事件减少了 15%。现在我们的 Agent 可以保持所有内容，运行数小时而不会忘记开头读到的内容。"
>
> — **Cognition 团队**

> "带有 100 万上下文窗口的 Opus 4.6 让我们的 Devin Review Agent 效果显著提升。大型 diff 无法放入 20 万上下文窗口，所以 Agent 必须分块处理上下文，导致更多轮次和跨文件依赖关系的丢失。有了 100 万上下文，我们直接输入完整的 diff，从更简单、更节省 token 的流程中获得更高质量的代码审查。"
>
> — **Adhyyan Sekhsaria，创始工程师**

### Eve（法律 AI）

> "Eve 默认使用 100 万上下文，因为原告律师最难的问题需要这种能力。无论是交叉引用 400 页的证词记录，还是在整个案件卷宗中发现关键联系，扩展的上下文窗口让我们能够提供比以前质量显著更高的答案。"
>
> — **Mauricio Wulfovich，ML 工程师**

### Physical Superintelligence

> "科学发现需要同时跨研究文献、数学框架、数据库和模拟代码进行推理。Claude Opus 4.6 的 100 万上下文和扩展的媒体限制让我们的 Agent 系统能够一次性综合数百篇论文、证明和代码库，帮助我们显著加速基础和应用物理研究。"
>
> — **Dr. Alex Wissner-Gross，联合创始人**

### GC AI

> "有了 Claude 的 100 万上下文，内部律师可以在一个会话中引入一份 100 页合作协议的五轮谈判，最终看到谈判的完整脉络。不再需要在版本之间切换或忘记三轮前改了什么。"
>
> — **Bardia Pourvakil，联合创始人兼 CTO**

### Resolve

> "大规模生产系统有无尽的上下文，生产事故可能变得非常复杂。有了 Claude 的 100 万上下文窗口，我们能够从第一个告警到修复都保持每个实体、信号和工作理论在视野中，无需反复压缩或妥协这些系统的细微差别。"
>
> — **Mayank Agarwal，创始人兼 CTO**

### Hex

> "我们将 Opus 上下文窗口从 20 万提升到 50 万，Agent 运行效率更高了——实际上总体使用的 token 更少了。开销更少，更专注于手头的目标。"
>
> — **Izzy Miller，AI 研究负责人**

### Endex

> "现实世界的电子表格任务需要深入的研究和复杂的多步骤计划。Claude 的 100 万上下文窗口让我们能够保持任务遵从性和对细节的关注。"

## 如何开始使用

1M 上下文即日起在以下平台可用：
- **Claude 平台原生版**
- **Amazon Bedrock**
- **Google Cloud Vertex AI**
- **Microsoft Foundry**

Claude Code Max、Team 和 Enterprise 用户在使用 Opus 4.6 时将自动默认使用 100 万上下文。

详细信息请参阅官方文档和定价页面。

---

## 核心要点总结

1. **价格革命**：100 万 token 上下文窗口现在按标准定价收费，没有额外溢价，这对需要处理大量文本的应用来说是重大利好。

2. **技术突破**：Opus 4.6 在 MRCR v2 基准测试中达到 78.3%，证明其不仅能接收大量上下文，还能有效检索和推理。

3. **开发者体验提升**：无需 beta 请求头、自动在 Claude Code 中启用、更少的上下文压缩，都让开发和使用变得更加简单。

4. **媒体处理能力增强**：600 张图片或 PDF 页面的限制，使得处理大型文档、代码库审查等场景变得更加实用。

5. **Agent 场景的福音**：对于长时间运行的 AI Agent，保持完整上下文意味着更好的任务连贯性和更高质量的输出。

对于中国开发者而言，这一更新意味着你可以更经济地构建需要处理大量上下文的应用，比如代码审查工具、文档分析系统、智能客服等。建议关注各云服务商（Amazon Bedrock、Google Vertex AI、Microsoft Azure）的接入方式，选择最适合你业务场景的平台。
