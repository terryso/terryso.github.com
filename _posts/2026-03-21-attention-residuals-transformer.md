---
layout: post
title: "Attention Residuals：用注意力机制重塑 Transformer 的残差连接"
date: 2026-03-21 06:03:19 +0800
categories: tech-translation
description: "Moonshot AI 团队提出了一种创新的 Transformer 残差连接方案 AttnRes，通过可学习的注意力权重替代传统的固定权重累加，显著提升了模型在推理和代码任务上的表现。"
original_url: https://github.com/MoonshotAI/Attention-Residuals
source: Hacker News
---

本文翻译自 [Attention Residuals](https://github.com/MoonshotAI/Attention-Residuals)，原载于 Hacker News。

## 背景：传统残差连接的困境

自从 ResNet 引入残差连接（Residual Connection）以来，这一技术已经成为深度学习模型的标配。在 Transformer 架构中，残差连接采用简单的加法操作：

```
h_l = h_{l-1} + f(h_{l-1})
```

这种设计虽然简单有效，但随着模型深度的增加，问题也逐渐显现：

1. **均匀稀释问题**：所有层的输出都以固定权重 1 进行累加，随着深度增加，每一层的贡献被均匀稀释
2. **数值膨胀问题**：在 PreNorm 架构中，hidden-state 的幅度会无界增长，这是业界已知的一个痛点

Moonshot AI 团队提出的 **Attention Residuals（AttnRes）** 正是为了解决这些问题。

## 核心创新：用注意力替代固定累加

AttnRes 的核心思想非常优雅：用可学习的注意力权重替代固定的单位权重。具体来说：

$$\mathbf{h}_l = \sum_{i=0}^{l-1} \alpha_{i \to l} \cdot \mathbf{v}_i$$

其中权重 $\alpha_{i \to l}$ 通过每个层学习一个伪查询向量 $\mathbf{w}_l \in \mathbb{R}^d$ 来计算。这样，每一层都可以根据输入内容**选择性**地聚合之前所有层的表示。

![Overview](https://github.com/MoonshotAI/Attention-Residuals/raw/master/assets/overview.png)

*（a）标准残差：均匀加法累加
（b）完整 AttnRes：每层对之前所有输出进行注意力聚合
（c）分块 AttnRes：将层分组为块，减少内存开销*

## Block AttnRes：工程友好的变体

完整的 AttnRes 虽然直观，但在大规模应用时需要 O(Ld) 的内存。为了解决这个问题，作者提出了 **Block AttnRes**：

- 将层划分为 N 个块
- 在每个块内部使用标准残差连接
- 只在块级别应用注意力机制

实验表明，使用约 8 个块时，Block AttnRes 能够恢复完整 AttnRes 大部分性能提升，同时保持极小的额外开销。

### PyTorch 风格伪代码

```python
def block_attn_res(blocks: list[Tensor], partial_block: Tensor, proj: Linear, norm: RMSNorm) -> Tensor:
    """
    Inter-block attention: attend over block reps + partial sum.
    blocks:
        N tensors of shape [B, T, D]: completed block representations for each previous block
    partial_block:
        [B, T, D]:    intra-block partial sum (b_n^i)
    """
    V = torch.stack(blocks + [partial_block])  # [N+1, B, T, D]
    K = norm(V)
    logits = torch.einsum('d, n b t d -> n b t', proj.weight.squeeze(), K)
    h = torch.einsum('n b t, n b t d -> b t d', logits.softmax(0), V)
    return h

def forward(self, blocks: list[Tensor], hidden_states: Tensor) -> tuple[list[Tensor], Tensor]:
    partial_block = hidden_states
    # apply block attnres before attn
    # blocks already include token embedding
    h = block_attn_res(blocks, partial_block, self.attn_res_proj, self.attn_res_norm)

    # if reaches block boundary, start new block
    # block_size counts ATTN + MLP; each transformer layer has 2
    if self.layer_number % (self.block_size // 2) == 0:
        blocks.append(partial_block)
        partial_block = None

    # self-attention layer
    attn_out = self.attn(self.attn_norm(h))
    partial_block = partial_block + attn_out if partial_block is not None else attn_out

    # apply block attnres before MLP
    h = block_attn_res(blocks, partial_block, self.mlp_res_proj, self.mlp_res_norm)

    # MLP layer
    mlp_out = self.mlp(self.mlp_norm(h))
    partial_block = partial_block + mlp_out

    return blocks, partial_block
```

## 实验结果：全面领先

### Scaling Laws 实验

AttnRes 在所有计算预算下都稳定超越基线。值得注意的是，**Block AttnRes 的损失值与使用 1.25 倍计算量训练的基线相当**——这相当于免费获得了 25% 的计算效率提升！

![Scaling Law](https://github.com/MoonshotAI/Attention-Residuals/raw/master/assets/scaling_law.png)

### 下游任务表现（Kimi Linear 48B / 3B 激活，1.4T tokens）

| 类别 | 基准测试 | Baseline | AttnRes |
| --- | --- | --- | --- |
| 通用 | MMLU | 73.5 | **74.6** |
|  | GPQA-Diamond | 36.9 | **44.4** |
|  | BBH | 76.3 | **78.0** |
|  | TriviaQA | 69.9 | **71.8** |
| 数学与代码 | Math | 53.5 | **57.1** |
|  | HumanEval | 59.1 | **62.2** |
|  | MBPP | 72.0 | **73.9** |
| 中文 | CMMLU | 82.0 | **82.9** |
|  | C-Eval | 79.6 | **82.5** |

最亮眼的提升出现在：
- **多步推理**：GPQA-Diamond 提升了 **+7.5** 分
- **代码生成**：HumanEval 提升了 **+3.1** 分

### 训练动力学分析

AttnRes 有效缓解了 PreNorm 的稀释问题：输出幅度在深度方向保持有界，梯度范数在各层之间分布更加均匀。

![Training Dynamics](https://github.com/MoonshotAI/Attention-Residuals/raw/master/assets/training_dynamics.png)

## 个人思考

AttnRes 的设计让我联想到几个有趣的方向：

1. **与 DenseNet 的联系**：DenseNet 通过密集连接让每层都能访问之前所有层的特征，AttnRes 可以看作是一种"软性"的 DenseNet，通过注意力机制学习哪些层的特征更重要。

2. **计算效率的权衡**：虽然 Block AttnRes 降低了内存开销，但引入了额外的注意力计算。在大规模训练中，这个权衡是否值得需要根据具体场景评估。

3. **与 MoE 的协同**：Kimi 的模型采用了 MoE（Mixture of Experts）架构，AttnRes 是否与 MoE 有特殊的协同效应？论文中没有详细讨论，但这可能是一个值得探索的方向。

4. **即插即用的特性**：AttnRes 最大的优势在于它是一个"drop-in replacement"，可以直接替换现有模型中的残差连接，无需重新设计架构。这使得它非常容易被社区采纳。

## 总结

Attention Residuals 是一个简单但 powerful 的创新：

- **核心思想**：用可学习的注意力权重替代固定的残差累加
- **实用设计**：Block AttnRes 降低了内存开销，保持工程可行性
- **显著效果**：多步推理 +7.5 分，代码生成 +3.1 分
- **易于采用**：可直接替换现有 Transformer 中的残差连接

这项工作展示了在深度学习基础组件上持续创新的价值。有时候，改变一个看似简单的"加法"操作，也能带来意想不到的收益。

---

**相关链接**：
- [GitHub 仓库](https://github.com/MoonshotAI/Attention-Residuals)
- [arXiv 论文](https://arxiv.org/abs/2603.15031)
