---
layout: post
title: "LLM 架构画廊：开源大模型架构全景对比"
date: 2026-03-16 20:10:00 +0800
categories: tech-translation
description: "Sebastian Raschka 的 LLM 架构对比画廊，汇集了从 Llama、DeepSeek 到 Qwen 等主流开源大模型的架构设计，涵盖 Dense、MoE、Hybrid 等多种解码器类型的详细对比。"
original_url: https://sebastianraschka.com/llm-architecture-gallery/
source: Hacker News
---

本文翻译自 [LLM Architecture Gallery](https://sebastianraschka.com/llm-architecture-gallery/)，原载于 Hacker News。

---

## 引言

如果你曾困惑于各种开源大语言模型（LLM）之间的架构差异，Sebastian Raschka 整理的这个 **LLM Architecture Gallery** 绝对是一份宝藏资源。这个页面收集了来自《The Big LLM Architecture Comparison》和《A Dream of Spring for Open-Weight LLMs》两篇文章的架构图和技术规格表，让我们能够一目了然地比较各种模型的架构选择。

更棒的是，你还可以通过 Zazzle 购买实体海报——上传版本基于 14570 x 12490 像素的高分辨率导出（56 MB PNG 文件，1.82 亿像素）。

## 架构分类概览

从这份画廊中，我们可以看到当前开源 LLM 的三大主要架构流派：

### 1. Dense Decoder（稠密解码器）

这是最传统的架构，代表模型包括：

| 模型 | 参数规模 | 关键特性 |
|------|---------|---------|
| **Llama（参考栈）** | 8B | GQA + RoPE，经典的 pre-norm 布局 |
| **OLMo 2** | 7B | MHA + QK-Norm，使用 inside-residual post-norm |
| **Gemma 3** | 27B | GQA + QK-Norm，5:1 滑动窗口/全局注意力 |
| **Mistral Small 3.1** | 24B | 标准 GQA，延迟优化设计 |
| **Qwen3 32B** | 32B | GQA + QK-Norm，作为 OLMo 3 的对比基准 |

> 💡 **值得注意的是**：OLMo 2 采用了一种不太常见的 **post-norm** 布局（inside-residual），而不是主流的 pre-norm。这种设计旨在提升训练稳定性。

### 2. Sparse MoE（稀疏混合专家）

MoE 架构已成为超大模型的主流选择，代表模型包括：

| 模型 | 总参数 | 激活参数 | 关键特性 |
|------|--------|---------|---------|
| **DeepSeek V3** | 671B | 37B | MLA 注意力，dense prefix + 共享专家 |
| **DeepSeek R1** | 671B | 37B | 架构同 V3，专注于推理训练 |
| **Meta Llama 4** | 400B | 17B | GQA，交替 dense 和 MoE block |
| **Qwen3-MoE** | 235B | 22B | GQA + QK-Norm，无共享专家 |
| **Mistral Large 2** | 673B | 41B | MLA，几乎复刻 DeepSeek V3 |
| **gpt-oss-20B** | 20B | 3.6B | GQA + 交替滑动窗口/全局层 |
| **gpt-oss-120B** | 120B | - | 与 20B 相同的注意力设计 |

**DeepSeek V3 的架构创新**值得一提：它采用 **dense prefix（稠密前缀）** 加上 **shared expert（共享专家）** 的设计，让超大规模模型在实际推理中保持可用性。这一设计后来被 Mistral Large 2 等模型广泛借鉴。

### 3. Hybrid Attention（混合注意力）

这是最新的架构趋势，将线性注意力与传统注意力结合：

| 模型 | 总参数 | 激活参数 | 混合比例 |
|------|--------|---------|---------|
| **Qwen4** | 397B | 17B | 3:1 Gated DeltaNet / Gated Attention |
| **Qwen3-Next** | 80B | 3B | 3:1 Gated DeltaNet / Gated Attention |
| **Moonshot Kimi K2** | 1T | 63B | Lightning Attention + MLA（7:1） |
| **NVIDIA Nano** | 30B | 3B | 主要 Mamba-2，少量 GQA |
| **NVIDIA Super** | 120B | 12B | Mamba-2 + 潜在空间 MoE |

> 🔥 **趋势观察**：混合架构正在成为新的主流。Qwen4 将原本 Qwen3-Next 的实验性设计变成了旗舰系列的核心架构，这标志着 DeltaNet 等线性注意力机制已经从实验走向生产。

## 关键技术点解析

### 注意力机制演进

从画廊中可以看出注意力机制的几个关键趋势：

1. **GQA (Grouped-Query Attention)** 已成为标准配置，在 KV Cache 效率和模型质量之间取得了良好平衡

2. **MLA (Multi-Latent Attention)** 被 DeepSeek 系列和后续模仿者（Mistral Large 2、GLM-4.8 等）采用，进一步压缩 KV Cache

3. **QK-Norm** 越来越普遍，用于稳定训练

4. **滑动窗口注意力** 在 Gemma 3、OLMo 3 等模型中被广泛应用，降低长序列的计算成本

5. **NoPE（无位置编码）** 开始在一些层中实验性使用，如 SmolLM3 每四层省略一次 RoPE

### Normalization 布局之争

主流模型大多采用 **pre-norm**，但 Allen AI 的 OLMo 系列坚持使用 **post-norm**（inside-residual）。这提醒我们：架构选择并非只有一种正确答案，训练稳定性和最终性能可以通过不同的设计路径实现。

### MoE 路由策略

- **DeepSeek V3 派系**：dense prefix + 共享专家 + 稀疏专家
- **Qwen3-MoE**：纯稀疏路由，无共享专家
- **GLM-4.7**：采用 SwiGLU 路径作为"永久共享专家"

## 2026 年新趋势

从最新的模型发布可以看出几个有趣的趋势：

1. **DeepSeek Sparse Attention**：DeepSeek V4 和 GLM-4.8 都采用了这一技术，专门针对长上下文场景优化

2. **线性注意力的崛起**：DeltaNet、Lightning Attention 等线性复杂度注意力开始进入主流

3. **Mamba-2 + MoE**：NVIDIA 的 Nano/Super 系列展示了 state-space model 与 MoE 的结合潜力

4. **多 token 预测（MTP）**：在 xAI 的 Grok 3 Mini 和部分 Qwen 模型中用于提升推理吞吐量

## 实用建议

如果你在选择开源模型进行部署，这份画廊提供了很好的参考：

| 场景 | 推荐模型 | 原因 |
|------|---------|------|
| 资源受限的推理 | Mistral Small 3.1 (24B) | 延迟优化，较少的 KV Cache |
| 通用大模型 | DeepSeek V3 / Qwen4 | 成熟的 MoE 设计，生态支持好 |
| 印地语等低资源语言 | Sarvam 系列 | 专门的词汇表和训练数据 |
| 编程任务 | Qwen3-Coder (230B) | 经典稳定架构，10B 激活参数 |

## 总结

Sebastian Raschka 的这份 LLM 架构画廊为我们提供了一个独特的视角：开源 LLM 生态正在快速收敛到几种主流架构模式，同时也在边缘不断实验新的可能性。

**关键要点**：

1. **MoE 已成超大模型标配**：671B+ 的模型几乎全部采用 MoE，激活参数控制在 20-40B 左右
2. **MLA 正在扩散**：从 DeepSeek 到 Mistral、GLM，MLA 正在取代传统 GQA
3. **混合注意力是未来**：线性注意力 + 传统注意力的混合比例（如 3:1）正在成为新常态
4. **架构趋同但不乏创新**：大多数模型遵循 DeepSeek V3 的模板，但在专家大小、注意力类型等细节上各有创新

如果你对某个特定架构有更深入的兴趣，建议阅读 Sebastian 的原文，里面有每个模型的详细架构图和设计选择解释。

---

**参考资料**：
- [The Big LLM Architecture Comparison](https://sebastianraschka.com/blog/2025/the-big-llm-architecture-comparison.html)
- [A Dream of Spring for Open-Weight LLMs](https://sebastianraschka.com/blog/2026/dream-of-spring-open-weight-llms.html)
