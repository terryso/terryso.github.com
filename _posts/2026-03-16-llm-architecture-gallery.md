---
layout: post
title: "LLM 架构图鉴：主流开源大模型架构全解析"
date: 2026-03-16 04:36:45 +0800
categories: tech-translation
description: "Sebastian Raschka 整理的开源大模型架构图鉴，涵盖从 Llama 到 DeepSeek、Qwen 等主流模型的架构设计细节，帮助开发者快速理解各模型的 Attention、MoE、Normalization 等关键技术选型。"
original_url: https://sebastianraschka.com/llm-architecture-gallery/
source: Hacker News
---

本文翻译自 [LLM Architecture Gallery](https://sebastianraschka.com/llm-architecture-gallery/)，原载于 Hacker News。

---

## 引言

在开源大语言模型（LLM）领域，各种模型架构层出不穷。从经典的 Dense Decoder 到稀疏 MoE（Mixture of Experts），再到最新的线性注意力混合架构，每种设计都在性能和效率之间做出不同的权衡。Sebastian Raschka 维护的这个「LLM 架构图鉴」项目，为我们提供了一份清晰的参考指南，帮助开发者快速理解各主流模型的技术选型。

本文将带你浏览这个架构图鉴中的关键模型，分析它们的设计特点和背后的技术考量。

## 架构分类概览

图鉴中的模型大致可以分为以下几类：

1. **Dense 模型** - 传统的全参数密集模型
2. **Sparse MoE** - 稀疏专家混合模型
3. **Sparse Hybrid** - 结合线性注意力的稀疏混合模型
4. **Hybrid MoE** - 结合状态空间模型的 MoE 架构

## 代表性模型解析

### DeepSeek 系列：MoE 架构的引领者

DeepSeek V3 可以说是开启了大规模开源 MoE 模型浪潮的标杆：

| 属性 | 规格 |
|------|------|
| 规模 | 671B 总参数, 37B 激活 |
| 解码器类型 | Sparse MoE |
| 注意力机制 | MLA (Multi-Head Latent Attention) |
| 发布日期 | 2024-12-26 |

**核心设计**：使用 dense prefix 加上 shared expert，使得超大模型在实际推理中保持实用性。

后续的 DeepSeek R1 基于相同的 V3 架构，主要变化在于面向推理（reasoning）的训练策略调整。最新的 DeepSeek V4 则在 V3 模板基础上增加了稀疏注意力（DeepSeek Sparse Attention）来降低长上下文的成本。

### Qwen 系列：从 Dense 到 Hybrid 的演进

Qwen 家族展示了从传统 Dense 模型到混合架构的完整演进路径：

**Qwen3 32B** - 经典 Dense 基准：
- 32B 参数，GQA + QK-Norm
- 作为 OLMo 3 32B 的直接对比基准

**Qwen3 Next** - 混合注意力先锋：
- 80B 总参数, 3B 激活
- 采用 3:1 的 Gated DeltaNet 和 Gated Attention 混合
- 更多的专家、shared expert、原生 262k 上下文

**Qwen4** - 主线产品的混合化：
- 397B 总参数, 17B 激活
- 将 Next 系列的混合注意力设计引入主线
- 512 个专家，17B 激活参数

### Gemma 3：局部注意力的激进探索

Google 的 Gemma 3 27B 在注意力设计上颇具特色：

| 属性 | 规格 |
|------|------|
| 规模 | 27B 参数 |
| 注意力 | GQA + QK-Norm + 5:1 滑动窗口/全局注意力 |
| 词汇表 | 大型多语言词汇表 |

**核心设计**：在 27B 的「甜点」规模上，更激进地使用局部注意力（local attention），平衡了性能和效率。

### OpenAI gpt-oss：开源重量级选手

OpenAI 开源的两个 gpt-oss 模型展示了不同的设计思路：

**gpt-oss 20B**（小杯）：
- 20B 总参数, 3.6B 激活
- 交替使用滑动窗口和全局注意力层
- 比 Qwen3 更宽更浅，带有注意力偏置和 sink 机制

**gpt-oss 120B**（大杯）：
- 120B 参数
- 保持相同的交替注意力设计
- OpenAI 旗舰开源权重的规模化版本

### NVIDIA Llama Nemotron Nano：极限混合架构

NVIDIA 的 Nano 模型是图鉴中最激进的 Transformer-SSM（状态空间模型）混合架构：

| 属性 | 规格 |
|------|------|
| 规模 | 30B 总参数, 3B 激活 |
| 解码器类型 | Hybrid MoE |
| 注意力 | 以 Mamba-2 为主，少量 GQA 层 |

**核心设计**：交错使用 Mamba-2 和 MoE 块，注意力层用得非常克制。Super 变体进一步增加了 latent experts 和原生投机解码支持。

### Mistral Large 2：拥抱 DeepSeek 路线

Mistral 的新旗舰实际上采用了 DeepSeek 架构并重新调整了专家规模：

- 673B 总参数, 41B 激活
- 使用 MLA 注意力
- 近乎 DeepSeek V3 的克隆，但专家更大、路由专家更少
- 支持多模态

### OLMo 系列：透明度的坚持

Allen AI 的 OLMo 系列始终坚持透明和开放：

**OLMo 3 7B**：
- 保持 post-norm，使用 MHA + QK-Norm
- 3:1 滑动窗口/全局注意力
- 只在全局层应用 YaRN

**OLMo 3 32B**：
- 放大到 32B，改用 GQA
- 保持相同的 block 设计

## 关键技术概念速查

### 注意力机制

- **MHA (Multi-Head Attention)** - 经典多头注意力
- **GQA (Grouped Query Attention)** - 分组查询注意力，平衡性能和效率
- **MLA (Multi-Head Latent Attention)** - DeepSeek 提出的潜在注意力，大幅降低 KV cache
- **Sliding Window Attention** - 滑动窗口注意力，限制注意力范围
- **QK-Norm** - Query-Key 归一化，提升训练稳定性

### 归一化策略

- **Pre-norm** - 在子层之前进行归一化（Llama 风格）
- **Post-norm** - 在子层之后进行归一化（OLMo 风格）
- **Inside-residual post-norm** - 残差内部的 post-norm

### 架构类型

- **Dense** - 全参数密集模型
- **Sparse MoE** - 稀疏专家混合，每个 token 只激活部分专家
- **Hybrid** - 混合架构，如 Transformer + SSM 或 Attention + Linear Attention

## 架构演进趋势

从这个图鉴中，我们可以观察到几个明显的趋势：

1. **MoE 成为主流** - DeepSeek V3 的成功让大规模 MoE 成为开源模型的标准选择
2. **MLA 快速普及** - DeepSeek 的 MLA 被多个模型采纳，成为降低推理成本的有效手段
3. **混合注意力兴起** - 结合线性注意力（如 DeltaNet、Lightning Attention）和传统注意力的混合架构越来越受欢迎
4. **SSM 融合探索** - NVIDIA 等公司在探索 Mamba-2 与 Transformer 的深度融合

## 扩展阅读

Sebastian Raschka 还提供了两篇配套文章：

1. **[The Big LLM Architecture Comparison](https://sebastianraschka.com/blog/2025/the-big-llm-architecture-comparison.html)** - 详细解释各种架构设计的上下文和关键决策

2. **[A Dream of Spring for Open-Weight LLMs](https://sebastianraschka.com/blog/2026/dream-of-spring-open-weights.html)** - 覆盖 2026 年早期的开源架构发布，包括 MiniMax、Qwen、Ling 和 Sarvam 等新家族

## 总结

这个 LLM 架构图鉴为开发者提供了一份宝贵的参考资源。无论你是想了解某个特定模型的架构细节，还是比较不同模型的技术选型，都可以在这里找到答案。

**关键收获**：

- 开源 LLM 架构已经从简单的 Dense 模型演进到复杂的 MoE 和混合架构
- DeepSeek 的设计（MoE + MLA）对开源社区产生了深远影响
- 注意力机制的设计（GQA、滑动窗口、线性注意力混合）成为差异化竞争的关键点
- 透明度（如 OLMo）和效率（如稀疏注意力）之间的权衡仍在持续演进

建议开发者收藏这个图鉴，在选型或研究时作为快速参考。如果你对某个模型的细节感兴趣，可以直接访问原网站查看完整的架构图。
