---
layout: post
title: "LLM 架构画廊：2024-2026 开源大模型架构全景解析"
date: 2026-03-16 07:40:55 +0800
categories: tech-translation
description: "Sebastian Raschka 创建的 LLM 架构画廊，全面对比了从 Llama 到 DeepSeek、Qwen、GPT-OSS 等主流开源大模型的架构设计选择，涵盖 Dense、MoE、MLA 和混合注意力机制等多种技术路线。"
original_url: https://sebastianraschka.com/llm-architecture-gallery/
source: Hacker News
---

本文翻译自 [LLM Architecture Gallery](https://sebastianraschka.com/llm-architecture-gallery/)，原载于 Hacker News。

---

## 引言

在大语言模型（LLM）快速发展的今天，各种架构设计层出不穷。从传统的 Dense（稠密）模型到 MoE（Mixture of Experts，混合专家），从标准的 Multi-Head Attention 到 MLA（Multi-Head Latent Attention），各家厂商都在探索最优的架构组合。

Sebastian Raschka 创建的这个 LLM 架构画廊，为我们提供了一个全景式的视角，让我们能够清晰地比较各主流开源模型的架构选择。本文将对这些架构进行系统性的梳理和分析。

## Dense 模型：经典架构的持续演进

### Llama 系列：Pre-Norm 基线

作为开源 LLM 的标杆，Llama 系列一直保持着相对经典的架构设计：

- **规模**：8B 参数
- **解码器类型**：Dense
- **注意力机制**：GQA（Grouped Query Attention）+ RoPE（Rotary Position Embedding）
- **关键特性**：采用 Pre-Norm 基线设计

Llama 的成功证明了在合适的规模下，经典架构配合精心调优的训练配方依然能够取得出色效果。

### OLMo 系列：Post-Norm 的坚守者

Allen AI 的 OLMo 系列走出了一条不同的路：

**OLMo 2（2024-11-25）**
- **规模**：7B 参数
- **注意力机制**：MHA（Multi-Head Attention）+ QK-Norm
- **关键特性**：使用 inside-residual post-norm 而非常见的 pre-norm

**OLMo 3（2025-11-20）**
- 7B 版本：保持 MHA + QK-Norm + 3:1 滑动窗口/全局注意力比例
- 32B 版本：升级为 GQA，保持 post-norm，仅在全注意力层应用 YaRN

> **技术解读**：Post-Norm vs Pre-Norm 的选择涉及训练稳定性和最终性能的权衡。OLMo 团队选择 Post-Norm 是一个有趣的反主流选择。

### Gemma 3：局部注意力的激进派

Google 的 Gemma 3 27B（2025-03-11）在注意力机制上做出了大胆尝试：
- **5:1 滑动窗口/全局注意力比例**
- 更大的多语言词汇表
- 在 27B 规模上找到性能与效率的平衡点

### Qwen3 Dense 系列：QK-Norm 的标杆

Qwen3 的 Dense 模型系列（4B/8B/32B）展示了 QK-Norm 的标准实现：
- 所有模型都采用 GQA + QK-Norm
- 8 个 KV heads
- 151k 词汇表（4B 版本）

### Mistral Small 3.1：聚焦延迟的设计

24B 参数的 Mistral Small 3.1（2025-03-18）完全放弃了旧版 Mistral 的滑动窗口设计：
- 标准 GQA
- 更小的 KV cache
- 更少的层数（相比 Gemma 3 27B）

这是一个明显的"延迟优先"设计选择。

### BCOO 3B：无位置编码的实验

这是一个有趣的实验性模型（2025-06-19）：
- **每四层省略 RoPE**，测试 NoPE（No Position Encoding）风格的节奏
- 探索减少位置编码依赖对模型能力的影响

### Tiny Aya：并行 Transformer Block

Cohere 的 3.35B 多语言模型采用了罕见的设计：
- **并行 Transformer Block**：Attention 和 MLP 并行执行
- RoPE 与 NoPE 混合
- 3:1 滑动窗口/全局注意力比例

### Llama 3.3 on-device：小而精的端侧模型

3B 参数的端侧模型（2026-02-10）：
- 类 Llama 架构
- 但没有将 input embeddings 与 output layer 绑定

## MoE 模型：稀疏激活的大规模探索

### DeepSeek V3：开创性的 MoE 模板

DeepSeek V3（2024-12-26）定义了现代大规模 MoE 的设计范式：
- **总参数**：671B
- **激活参数**：37B
- **注意力机制**：MLA（Multi-Head Latent Attention）
- **关键特性**：Dense prefix + shared expert，保持大规模模型在推理时的实用性

### DeepSeek V4：效率优先的进化

V4（2025-12-01）在 V3 基础上增加稀疏注意力：
- 保持 V3 模板
- 添加 DeepSeek Sparse Attention 以降低长上下文成本
- 这是一个聚焦效率的渐进式更新

### DeepSeek R1：推理能力的注入

基于 V3 架构的推理优化版本（2025-01-20）：
- 架构完全匹配 DeepSeek V3
- 主要变化在于面向推理的训练配方

### Llama 4 MoE：Meta 的 MoE 之路

Meta 的 400B MoE（2025-04-05）：
- 总参数 400B，激活 17B
- 标准 GQA（非 MLA）
- Dense 和 MoE blocks 交替
- 比 DeepSeek V3 使用更少但更大的 experts

### Qwen3 MoE 系列

**Qwen3-235B-A22B（2025-04-28）**
- 贴近 DeepSeek V3 但移除了 shared expert
- 高容量 MoE 设计，优化服务效率

**Qwen4（2026-02-16）**
- 将 Next 风格的混合注意力带入主系列
- 512 个 experts，17B 激活参数

### GPT-OSS 系列：OpenAI 的开源 MoE

**GPT-OSS 20B（2025-08-04）**
- 总参数 20B，激活 3.6B
- 更宽更浅的设计
- GQA + 交替滑动窗口/全局注意力层
- 注意力 bias 和 sink 机制

**GPT-OSS 120B（2025-08-04）**
- 保持相同的注意力配方
- 规模扩大

### GLM 系列：智谱的 MoE 演进

**GLM-4.5（2025-12-22）**
- 355B 总参数，32B 激活
- GQA + QK-Norm
- 作为 pre-MLA 基线

**GLM-4.8（2026-02-11）**
- 744B 总参数，40B 激活
- MLA + DeepSeek Sparse Attention
- 比 GLM-4.7 更多 experts，更少层数

### Mistral Large 2：拥抱 DeepSeek 架构

Mistral 的新旗舰（2025-12-02）：
- 673B 总参数，41B 激活
- MLA 注意力
- 近乎 DeepSeek V3 的克隆，但 experts 更大、routed experts 更少
- 支持多模态

### MiniMax-01：回归全注意力

230B 总参数的 MiniMax（2025-10-23）：
- 标准 GQA + QK-Norm + 部分 RoPE
- 比 Qwen3 更稀疏的 MoE routing
- 看起来像更精简的 Qwen3 稀疏变体

### Moonshot Kimi K2：万亿参数的 Scaling

1T 总参数（2025-07-10）：
- 本质上将 DeepSeek V3 配方向上扩展
- 更多 experts，更少 MLA heads

### Qwen3 Coder：经典架构的坚守

230B 的代码模型（2026-02-12）：
- 故意避免滑动窗口或线性注意力混合
- 保持 10B 激活路径
- 证明经典架构在代码任务上依然有效

### EXAONE 4：SwiGLU 作为 Shared Expert

270B 参数（2025-08-22）：
- 罕见的"老派" MoE 风格
- 更少、更大的 experts
- 添加常驻 SwiGLU 路径，实际上像 shared expert

### Ling-Plus：滑动窗口的极致

309B 总参数（2025-12-16）：
- 5:1 滑动窗口/全局注意力
- 异常小的 128-token 局部窗口
- Multi-token prediction

### Arcee-Nova：效率技巧大融合

400B 总参数，13B 激活（2026-01-27）：
- QK-Norm + RoPE+NoPE + Sandwich Norm
- Coarse-grained MoE
- 融合了多种效率优化技巧

### Ling-Mini：吞吐量优先

196B 总参数，11B 激活（2026-02-01）：
- 3:1 滑动窗口注意力
- MTP-3 用于训练和推理
- 追求高吞吐量

### Sarvam-Lux：印度语言的 MoE

**30B 版本（2026-03-03）**
- GQA + QK-Norm
- 大词汇表，强印度语言支持
- 面向推理的 sparse MoE

**105B 版本（2026-03-03）**
- 升级为 MLA
- KV LayerNorm + NoPE + RoPE

## 混合架构：Attention 与 SSM 的融合

### NVIDIA Nemotron Nano：最激进的 Hybrid

30B 总参数，3B 激活（2025-12-04）：
- **Decoder 类型**：Hybrid MoE
- **注意力**：主要是 Mamba-2，少量 GQA layers
- **关键**：Mamba-2 和 MoE blocks 交错，极少使用 attention

### Nemotron Nano Super：规模化的 Hybrid

120B 总参数，12B 激活（2026-03-11）：
- 添加 latent-space MoE
- Shared-weight MTP 用于快速推理

### Qwen3-Next：DeltaNet Attention 的先驱

80B 总参数，3B 激活（2025-09-09）：
- **3:1 Gated DeltaNet / Gated Attention**
- 更多 experts + shared expert
- 原生 262k 上下文

### Kimi K3：Lightning Attention 混合

1T 总参数，63B 激活（2026-02-15）：
- Lightning Attention + MLA
- 7:1 线性注意力/MLA 比例
- 63B 激活参数（比其他模型大很多）

### Agentica：Agent 导向的 Hybrid

355B 总参数，32B 激活（2025-07-28）：
- 借用 DeepSeek 的 dense-prefix MoE 布局
- 前三层是 dense，然后才开始 MoE routing
- 保持 shared expert

## 关键技术趋势分析

### 1. MoE 成为主流

从 DeepSeek V3 开始，大规模开源模型几乎都采用 MoE 架构。核心优势：
- 在保持总参数巨大的同时，激活参数可控
- 更好的推理效率
- 更灵活的 scaling

### 2. MLA 的普及

DeepSeek 的 MLA（Multi-Head Latent Attention）正在被广泛采用：
- 显著降低 KV cache 大小
- 更好的长上下文支持
- Mistral、GLM、Sarvam 等都已转向 MLA

### 3. 滑动窗口注意力的分化

- Gemma 系列：激进的 5:1 比例
- Ling 系列：极端的 128-token 窗口
- Qwen3 Coder：故意避免

### 4. Hybrid 架构的崛起

NVIDIA Nemotron 和 Qwen3-Next 代表了新方向：
- Transformer + SSM（如 Mamba-2）
- DeltaNet / Lightning Attention 混合
- 追求更好的效率/性能平衡

### 5. QK-Norm 成为标配

几乎所有新模型都采用 QK-Norm 来稳定训练：
- 防止注意力分数的数值问题
- 支持更大的模型训练

## 架构对比速查表

| 模型 | 总参数 | 激活参数 | 注意力类型 | 特色 |
|------|--------|----------|-----------|------|
| DeepSeek V3 | 671B | 37B | MLA | Dense prefix + shared expert |
| Llama 4 MoE | 400B | 17B | GQA | Dense/MoE 交替 |
| Qwen4 | 397B | 17B | DeltaNet/Gated | 512 experts |
| GLM-4.8 | 744B | 40B | MLA + Sparse | 更多 experts |
| Mistral Large 2 | 673B | 41B | MLA | 多模态支持 |
| Nemotron Nano | 30B | 3B | Mamba-2 + GQA | 最激进 hybrid |
| Kimi K2 | 1T | 32B | MLA | 万亿参数 scaling |
| Kimi K3 | 1T | 63B | Lightning + MLA | 超大激活路径 |

## 总结

通过这个架构画廊，我们可以清晰地看到 LLM 架构演进的几条主线：

1. **规模化路径**：从 7B Dense 到万亿参数 MoE
2. **效率优化**：MLA、稀疏注意力、滑动窗口
3. **架构创新**：Hybrid 模型（Transformer + SSM）
4. **专业化设计**：端侧模型、代码模型、多语言模型

2024-2026 年是开源 LLM 架构快速迭代期。DeepSeek V3 的模板被广泛采用，同时各家也在探索差异化路线。未来的竞争将不仅是规模，更是架构效率和创新能力的竞争。

---

## 延伸阅读

- [The Big LLM Architecture Comparison](https://sebastianraschka.com/blog/2025/the-big-llm-architecture-comparison.html) - 详细架构对比文章
- [A Dream of Spring for Open-Weight LLMs](https://sebastianraschka.com/blog/2026/dream-of-spring-open-weights.html) - 2026 年早期架构更新

## 核心收获

1. **DeepSeek V3 定义了现代大规模 MoE 的设计范式** - Dense prefix + shared expert + MLA 的组合成为行业标准
2. **MLA 正在成为长上下文模型的标准配置** - 显著降低 KV cache，支持更长上下文
3. **Hybrid 架构（Transformer + SSM）代表了下一代效率优化的方向** - Nemotron 和 Qwen3-Next 是先锋
4. **Post-Norm vs Pre-Norm 的选择仍有争议** - OLMo 系列坚守 Post-Norm，并取得不错效果
5. **滑动窗口注意力的使用程度在不同模型间差异巨大** - 从 3:1 到 7:1，甚至极端的 128-token 窗口
