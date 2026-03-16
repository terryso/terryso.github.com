---
layout: post
title: "LLM 架构图鉴：2024-2026 开源大模型架构全景解析"
date: 2026-03-16 17:53:09 +0800
categories: tech-translation
description: "Sebastian Raschka 整理的 LLM 架构图鉴，系统对比了从 Llama、DeepSeek 到 Qwen、GLM 等主流开源大模型的架构设计，涵盖 Dense、MoE、MLA 和混合注意力等多种技术路线，帮助开发者理解当代 LLM 的技术演进脉络。"
original_url: https://sebastianraschka.com/llm-architecture-gallery/
source: Hacker News
---

本文翻译自 [LLM Architecture Gallery](https://sebastianraschka.com/llm-architecture-gallery/)，原载于 Hacker News。

---

## 引言

如果你正在研究大语言模型（LLM）的架构设计，这篇文章绝对值得收藏。Sebastian Raschka 整理了一份详尽的 LLM 架构图鉴，收录了从 2024 年到 2026 年间发布的 30 多个主流开源模型。每个模型都配有架构图和关键参数表，让你一目了然地看到技术演进的趋势。

在 LLM 领域，架构设计的变化速度极快。从最初的 Dense 模型，到 MoE（Mixture of Experts，混合专家模型）的兴起，再到 MLA（Multi-head Latent Attention，多头潜注意力）、线性注意力混合架构等新范式的出现，每一代架构都在解决上一代的瓶颈。

这份图鉴的价值在于它提供了一个**横向对比视角**——你可以清楚地看到不同厂商在设计选择上的异同，理解为什么 DeepSeek V3 的架构被众多后来者效仿，以及 Qwen、GLM、MiniMax 等模型在哪些方面做出了差异化。

## Dense 模型：经典但仍有生命力

Dense 模型是最传统的 Transformer 架构，每个 token 都会激活所有参数。虽然 MoE 更流行，但 Dense 模型在中小规模场景下仍然有独特优势。

### Llama 3.1 8B：Pre-Norm 基线

作为开源 LLM 的标杆，Llama 系列一直保持着相对经典的架构设计：

- **规模**：8B 参数
- **发布日期**：2024-04-18
- **解码器类型**：Dense
- **注意力机制**：GQA（Grouped-Query Attention）+ RoPE（Rotary Position Embedding）
- **关键特性**：采用 Pre-Norm 基线设计，比同规模的 OLMo 2 更宽

Llama 的成功证明了在合适的规模下，经典架构配合精心调优的训练配方依然能够取得出色效果。

### OLMo 系列：Post-Norm 的坚守者

Allen AI 的 OLMo 系列走出了一条不同的路，是**坚持使用 Post-Norm 的典范**：

**OLMo 2（2024-11-25）**
- **规模**：7B 参数
- **注意力机制**：MHA（Multi-Head Attention）+ QK-Norm
- **关键特性**：使用 inside-residual post-norm 而非常见的 pre-norm 布局

**OLMo 3（2025-11-20）**
- 7B 版本：保持 MHA + QK-Norm + 3:1 滑动窗口/全局注意力比例
- 32B 版本：升级为 GQA，保持 post-norm，仅在全注意力层应用 YaRN

> **技术解读**：Post-Norm vs Pre-Norm 的选择涉及训练稳定性和最终性能的权衡。OLMo 团队证明 Post-Norm 在训练稳定性上可以有更好的表现，这是一个有趣的反主流选择。

### Gemma 3 27B：局部注意力的激进派

Google 的 Gemma 3 27B（2025-03-11）在注意力机制上做出了大胆尝试：

- **规模**：27B 参数
- **注意力机制**：GQA + QK-Norm + **5:1 滑动窗口/全局注意力比例**
- **关键特性**：更大的多语言词汇表，在 27B 规模上找到性能与效率的平衡点

个人观察：**Gemma 系列对局部注意力的使用非常激进**，5:1 的滑动窗口比例在长文本处理上提供了效率优势，但可能对需要全局依赖的任务有一定影响。

### Qwen3 Dense 系列：QK-Norm 的标杆

阿里巴巴的 Qwen3 Dense 模型系列（4B/8B/32B）展示了 QK-Norm 的标准实现：

| 模型 | 参数量 | 发布日期 | 关键特性 |
|------|--------|----------|----------|
| Qwen3 4B | 4B | 2025-04-28 | QK-Norm + 151k 词汇表 |
| Qwen3 8B | 8B | 2025-04-28 | QK-Norm + 8 KV heads |
| Qwen3 32B | 32B | 2025-04-28 | QK-Norm + 8 KV heads |

这些模型是对比 OLMo 3 32B 的理想基准，展示了 QK-Norm 在不同规模下的稳定表现。

### Mistral Small 3.1 24B：聚焦延迟的设计

24B 参数的 Mistral Small 3.1（2025-03-18）完全放弃了旧版 Mistral 的滑动窗口设计：

- **注意力机制**：标准 GQA
- **关键特性**：更小的 KV cache，更少的层数（相比 Gemma 3 27B）

这是一个明显的"延迟优先"设计选择，追求更快的推理响应。

### BCOO 3B：无位置编码的实验

这是一个有趣的实验性模型（2025-06-19）：

- **规模**：3B 参数
- **注意力机制**：GQA + 周期性 NoPE 层
- **关键特性**：每四层省略 RoPE，测试 NoPE（No Position Encoding）风格的节奏

这种设计探索减少位置编码依赖对模型能力的影响。

### Tiny Aya 3.35B：并行 Transformer Block

Cohere 的 3.35B 多语言模型采用了罕见的设计：

- **并行 Transformer Block**：Attention 和 MLP 并行执行
- RoPE 与 NoPE 混合
- 3:1 滑动窗口/全局注意力比例
- 大词汇表，强多语言支持

### Llama 3.3 on-device 3B：小而精的端侧模型

3B 参数的端侧模型（2026-02-10）：

- 类 Llama 架构
- **没有将 input embeddings 与 output layer 绑定**——这是一个有趣的细节差异

## Sparse MoE：大模型的主流范式

MoE（Mixture of Experts）架构通过稀疏激活大幅降低推理成本，是当前大模型的主流选择。DeepSeek V3 的发布可以说是 2024 年底最重要的里程碑之一。

### DeepSeek V3：开创性的 MoE 模板

DeepSeek V3（2024-12-26）定义了现代大规模 MoE 的设计范式：

- **总参数**：671B
- **激活参数**：37B
- **解码器类型**：Sparse MoE
- **注意力机制**：MLA（Multi-Head Latent Attention）
- **关键特性**：Dense prefix + shared expert，保持大规模模型在推理时的实用性

**DeepSeek V3 的设计理念非常值得细品**：它在 MoE 层之前保留了几个 Dense 层（Dense Prefix），并使用一个始终激活的 Shared Expert。这种设计让超大模型在实际推理中保持实用性，同时也成为了后续很多模型效仿的模板。

### DeepSeek R1：推理能力的注入

基于 V3 架构的推理优化版本（2025-01-20）：

- 架构完全匹配 DeepSeek V3
- 主要变化在于**面向推理的训练配方**（reasoning-oriented training recipe）

这表明架构创新之外，训练方法同样重要。

### DeepSeek V4：效率优先的进化

V4（2025-12-01）在 V3 基础上增加稀疏注意力：

- 保持 V3 模板
- 添加 DeepSeek Sparse Attention 以降低长上下文成本
- 这是一个聚焦效率的渐进式更新，而非全新的基础设计

### Meta Llama 4 MoE 400B：Meta 的 MoE 之路

Meta 的 400B MoE（2025-04-05）：

- **总参数**：400B，**激活参数**：17B
- **注意力机制**：标准 GQA（非 MLA）
- **关键特性**：Dense 和 MoE blocks 交替，比 DeepSeek V3 使用更少但更大的 experts

### Qwen3-235B MoE：无 Shared Expert 的设计

Qwen3 的大规模 MoE 版本（2025-04-28）：

- **总参数**：235B，**激活参数**：22B
- **注意力机制**：GQA + QK-Norm
- **关键特性**：贴近 DeepSeek V3 但**移除了 shared expert**，高容量 MoE 设计，优化服务效率

### OpenAI gpt-oss 系列：开源 MoE 的标杆

**GPT-OSS 20B（2025-08-04）**
- **总参数**：20B，**激活参数**：3.6B
- 更宽更浅的设计
- GQA + 交替滑动窗口/全局注意力层
- 注意力 bias 和 sink 机制

**GPT-OSS 120B（2025-08-04）**
- 保持相同的注意力配方
- 规模扩大为 OpenAI 的旗舰开源发布

### GLM 系列：智谱的 MoE 演进

**GLM-4.5（2025-12-22）**
- **总参数**：355B，**激活参数**：32B
- GQA + QK-Norm
- 作为 pre-MLA、pre-sparse-attention 的基线

**GLM-4.8（2026-02-11）**
- **总参数**：744B，**激活参数**：40B
- MLA + DeepSeek Sparse Attention
- 比 GLM-4.7 更多 experts，更少层数

智谱的架构演进清晰地展示了从 GQA 到 MLA 的技术升级路径。

### Mistral Large 2：拥抱 DeepSeek 架构

Mistral 的新旗舰（2025-12-02）：

- **总参数**：673B，**激活参数**：41B
- **注意力机制**：MLA
- **关键特性**：近乎 DeepSeek V3 的克隆，但 experts 更大、routed experts 更少，支持多模态

有趣的是，Mistral Large 2 几乎完全采用了 DeepSeek V3 的架构——这侧面说明了 DeepSeek 架构的优越性。

### Moonshot Kimi K2：万亿参数的 Scaling

1T 总参数的超大模型（2025-07-10）：

- 本质上将 DeepSeek V3 配方向上扩展
- 更多 experts，更少 MLA heads
- 代表了 MoE 规模化的前沿探索

### EXAONE 4 270B：老派 MoE 的坚守

270B 参数（2025-08-22）：

- 罕见的"老派" MoE 风格——更少、更大的 experts
- 添加常驻 SwiGLU 路径，实际上像 shared expert

这证明了不同的 MoE 设计路线都有其存在价值。

### Ling-Plus 309B：滑动窗口的极致

309B 总参数（2025-12-16）：

- **5:1 滑动窗口/全局注意力**
- **异常小的 128-token 局部窗口**
- Multi-token prediction

这是对滑动窗口注意力最激进的探索之一。

### Qwen3 Coder 230B：经典架构的坚守

230B 的代码模型（2026-02-12）：

- **故意避免滑动窗口或线性注意力混合**
- 保持 10B 激活路径
- 证明经典架构在代码任务上依然有效

这是一个重要的信号：**并不是所有任务都需要最新的架构创新**。

### Arcee-Nova 400B：效率技巧大融合

400B 总参数，13B 激活（2026-01-27）：

- QK-Norm + RoPE+NoPE + Sandwich Norm
- Gated attention + 3:1 滑动窗口/全局注意力
- Coarse-grained MoE
- 融合了多种效率优化技巧

### Ling-Mini 196B：吞吐量优先

196B 总参数，11B 激活（2026-02-01）：

- 3:1 滑动窗口注意力
- **MTP-3 用于训练和推理**——这是一个独特的优化
- 追求高吞吐量，与更大的 DeepSeek 风格系统保持竞争力

### Sarvam-Lux：印度语言的 MoE

**30B 版本（2026-03-03）**
- GQA + QK-Norm
- 大词汇表，强印度语言支持
- 面向推理的 sparse MoE

**105B 版本（2026-03-03）**
- 升级为 MLA
- KV LayerNorm + NoPE + RoPE
- 保持大词汇表和印度语言支持

## 混合注意力架构：线性注意力的崛起

传统的 Full Attention 计算复杂度是 O(n²)，在超长上下文场景下成本极高。混合注意力架构通过引入线性注意力机制来解决这个问题。

### NVIDIA Nemotron Nano 30B：最激进的 Hybrid

30B 总参数，3B 激活（2025-12-04）：

- **Decoder 类型**：Hybrid MoE
- **注意力**：主要是 Mamba-2，少量 GQA layers
- **关键**：Mamba-2 和 MoE blocks 交错，**极少使用 attention**

这是当前最激进的 Transformer-SSM 混合架构之一。

### Nemotron Nano Super 120B：规模化的 Hybrid

120B 总参数，12B 激活（2026-03-11）：

- 添加 latent-space MoE
- Shared-weight MTP 用于快速推理
- 将 Nano 的设计理念规模化

### Qwen3-Next 80B：DeltaNet Attention 的先驱

80B 总参数，3B 激活（2025-09-09）：

- **3:1 Gated DeltaNet / Gated Attention**
- 更多 experts + shared expert
- **原生 262k 上下文**——这是一个显著的优势

### Qwen4 397B：混合注意力成为主流

397B 总参数，17B 激活（2026-02-16）：

- **3:1 Gated DeltaNet 和 Gated Attention**
- 将 Next 风格的混合注意力带入主系列
- 512 个 experts，17B 激活参数

这标志着混合注意力架构从实验性分支变成了旗舰产品的核心设计。

### MiniMax-01 48B：Kimi Delta Attention 混合

48B 总参数，3B 激活（2025-10-30）：

- **3:1 Kimi Delta Attention 和 MLA**
- 在 MLA 层使用 NoPE
- 通道门控用于长上下文效率

### Kimi K3 1T：Lightning Attention 混合

1T 总参数，63B 激活（2026-02-15）：

- Lightning Attention + MLA
- **7:1 线性注意力/MLA 比例**——极端的线性注意力优先
- 63B 激活参数（比其他模型大很多）

### Agentica 355B：Agent 导向的 Hybrid

355B 总参数，32B 激活（2025-07-28）：

- 借用 DeepSeek 的 dense-prefix MoE 布局
- 前三层是 dense，然后才开始 MoE routing
- 保持 shared expert
- 指令/推理混合，Agent 导向设计

### Sarvam-2 105B：升级到 MLA

105B 总参数（2026-03-03）：

- MLA + KV LayerNorm
- NoPE + RoPE 混合
- 大词汇表和强印度语言支持

## 关键技术趋势总结

### 1. MoE 成为大模型的标准范式

从 DeepSeek V3 开始，大规模开源模型几乎都采用 MoE 架构。核心优势：
- 在保持总参数巨大的同时，激活参数可控
- 更好的推理效率
- 更灵活的 scaling

### 2. MLA 正在成为新的注意力标准

DeepSeek 的 MLA（Multi-Head Latent Attention）正在被广泛采用：
- 显著降低 KV cache 大小
- 更好的长上下文支持
- Mistral、GLM、MiniMax、Sarvam 等都已转向 MLA

### 3. 线性注意力混合架构是长上下文的解决方案

NVIDIA Nemotron 和 Qwen3-Next 代表了新方向：
- Transformer + SSM（如 Mamba-2）
- DeltaNet / Lightning Attention 混合
- 追求更好的效率/性能平衡

### 4. QK-Norm 成为标配

几乎所有 2025 年之后的新模型都采用 QK-Norm：
- 解决训练过程中注意力分数的数值稳定性问题
- 支持更大的模型训练

### 5. 滑动窗口注意力的使用分化

- Gemma 系列：激进的 5:1 比例
- Ling 系列：极端的 128-token 窗口
- Qwen3 Coder：故意避免

不同的任务需要不同的注意力设计。

### 6. Post-Norm vs Pre-Norm 的争议仍在继续

OLMo 系列坚守 Post-Norm，并取得不错效果。这提醒我们，"主流"不一定等于"最优"。

## 架构对比速查表

| 模型 | 总参数 | 激活参数 | 注意力类型 | 发布日期 | 特色 |
|------|--------|----------|-----------|----------|------|
| DeepSeek V3 | 671B | 37B | MLA | 2024-12-26 | Dense prefix + shared expert |
| DeepSeek V4 | 671B | 37B | MLA + Sparse | 2025-12-01 | 效率进化版 |
| Llama 4 MoE | 400B | 17B | GQA | 2025-04-05 | Dense/MoE 交替 |
| Qwen4 | 397B | 17B | DeltaNet/Gated | 2026-02-16 | 512 experts |
| GLM-4.8 | 744B | 40B | MLA + Sparse | 2026-02-11 | 更多 experts |
| Mistral Large 2 | 673B | 41B | MLA | 2025-12-02 | 多模态支持 |
| Nemotron Nano | 30B | 3B | Mamba-2 + GQA | 2025-12-04 | 最激进 hybrid |
| Kimi K2 | 1T | 32B | MLA | 2025-07-10 | 万亿参数 scaling |
| Kimi K3 | 1T | 63B | Lightning + MLA | 2026-02-15 | 超大激活路径 |
| Qwen3-Next | 80B | 3B | DeltaNet/Gated | 2025-09-09 | 原生 262k 上下文 |

## 核心收获

1. **DeepSeek V3 定义了现代大规模 MoE 的设计范式** — Dense prefix + shared expert + MLA 的组合成为行业标准，被 Mistral、GLM 等效仿

2. **MLA 正在成为长上下文模型的标准配置** — 显著降低 KV cache，支持更长上下文，是推理效率的关键优化

3. **混合线性注意力架构代表了下一代效率优化的方向** — Nemotron 和 Qwen3-Next 是先锋，预计会有更多模型跟进

4. **Post-Norm vs Pre-Norm 的选择仍有争议** — OLMo 系列坚守 Post-Norm，并证明其有效性

5. **滑动窗口注意力的使用程度在不同模型间差异巨大** — 从 3:1 到 5:1，甚至极端的 128-token 窗口

6. **不同任务需要不同的架构选择** — Qwen3 Coder 故意避免滑动窗口，证明经典架构在特定领域仍有价值

---

## 延伸阅读

- [The Big LLM Architecture Comparison](https://sebastianraschka.com/blog/2025/the-big-llm-architecture-comparison.html) - 详细架构对比文章
- [A Dream of Spring for Open-Weight LLMs](https://sebastianraschka.com/blog/2026/dream-of-spring-open-weights.html) - 2026 年早期架构更新

## 实用资源

作者提供了高清版架构图（14570 x 12490 像素，182MP），可以在 Zazzle 购买印刷版海报。如果你在办公室或实验室，挂一张这样的架构演进图在墙上，绝对是极客范儿十足。

如果你发现架构图中的任何错误，可以在 [Architecture Gallery issue tracker](https://github.com/rasbt/llm-architecture-gallery) 提交 issue。

---

*本文基于 Sebastian Raschka 的 LLM Architecture Gallery 进行翻译和改编，增加了个人解读和中文开发者的视角。完整内容请参考原文。*
