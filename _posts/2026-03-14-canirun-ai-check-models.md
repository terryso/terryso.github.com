---
layout: post
title: "CanIRun.ai - 你的机器能运行哪些 AI 模型？"
date: 2026-03-14 01:58:32 +0800
categories: tech-translation
description: "一个利用 WebGPU 检测你的硬件配置，告诉你哪些开源 AI 模型可以在本地运行的实用工具网站。"
original_url: https://www.canirun.ai/
source: Hacker News
---

本文翻译自 [CanIRun.ai — Can your machine run AI models?](https://www.canirun.ai/)，原载于 Hacker News。

## 引言

在 AI 大模型百花齐放的今天，我们经常听到各种新模型发布：Llama、Qwen、DeepSeek、Mistral...但作为一个开发者，最实际的问题往往是：**我的机器能跑哪个模型？**

CanIRun.ai 就是解决这个痛点的工具。它通过浏览器 API 检测你的硬件配置（基于 WebGPU 估算），然后告诉你哪些开源模型可以在你的机器上本地运行。

## 工作原理

这个网站的核心机制很简单：

1. **WebGPU 检测**：通过浏览器 API 获取你的 GPU 信息
2. **内存估算**：计算你的显存/内存容量
3. **模型匹配**：根据模型大小和量化等级，判断能否运行

> ⚠️ 注意：Estimates based on browser APIs. Actual specs may vary.（基于浏览器 API 的估算，实际规格可能有所不同）

## 评级系统

CanIRun.ai 使用一个简单直观的评级系统：

| 等级 | 含义 | 说明 |
|------|------|------|
| **S** | Runs great | 完美运行，速度和体验都很棒 |
| **A** | Runs well | 运行良好，基本没问题 |
| **B** | Decent | 还可以，能用但不完美 |
| **C** | Tight fit | 勉强能跑，体验一般 |
| **D** | Barely runs | 勉强运行，体验较差 |
| **F** | Too heavy | 太重了，跑不了 |

## 关键信息解读

每个模型都会显示以下指标：

- **参数规模**：如 8B、32B、70B 等
- **内存占用**：如 4.1 GB、16.4 GB（不同量化等级）
- **上下文长度**：如 32K、128K、1M
- **预估速度**：如 ~9 tok/s（每秒生成 9 个 token）
- **量化选项**：Q2_K 到 F16，精度越高占用越大
- **模型类型**：Dense（稠密）或 MoE（混合专家）

## 值得关注的模型

### 小而美（S 级）

- **Qwen 3.5 0.8B** - 阿里巴巴的超小模型，适合边缘设备，~70 tok/s
- **Llama 3.2 1B** - Meta 的最小 Llama，适合移动端
- **Gemma 3 1B** - Google 的微型模型

### 生产力工具（A-B 级）

- **Llama 3.2 3B** - Meta 的轻量级模型，质量与速度平衡
- **Qwen 3 4B** - 阿里的紧凑型通用模型
- **Phi-3.5 Mini** - Microsoft 的高效小模型，长上下文支持好

### 勉强能跑（C-D 级）

- **Llama 3.1 8B** - Meta 的经典 8B 模型，质量很好但需要 ~8GB 显存
- **Qwen 3 8B** - 支持思考模式的 Qwen 3
- **Mistral 7B v0.3** - Mistral 的高质量 7B 模型

### 专业需求（F 级，需要大显存）

- **Llama 3.3 70B** - 70B 级别最佳开源模型
- **DeepSeek V3.2** - 685B 参数的 SOTA MoE 模型
- **Kimi K2** - 1T 参数的巨型 MoE，32B 激活

## MoE vs Dense 架构

这里需要理解一个重要概念：

**Dense（稠密模型）**
- 所有参数在推理时都会被激活
- 如 Llama 3.1 8B、Qwen 2.5 7B

**MoE（Mixture of Experts，混合专家）**
- 只有部分参数被激活（通常 5-15%）
- 如 DeepSeek V3.2：685B 总参数，但只有 37B 激活
- 优势：用更少的计算量获得更高的能力

例如：
- **DeepSeek R1**：671B 总参数，37B 激活 → 需要 343.7 GB 存储
- **Llama 3.1 405B**：405B 全部激活 → 需要 207.5 GB 存储

## 量化技术

为了在有限内存中运行大模型，我们使用量化（Quantization）技术：

```
Q2_K  - 最低精度，占用最小，质量损失大
Q3_K_M - 低精度，平衡占用和质量
Q4_K_M - 推荐选择，良好的平衡点
Q5_K_M - 较高精度
Q6_K   - 高精度
Q8_0   - 很高精度
F16    - 半精度，接近原始质量，占用最大
```

通常 **Q4_K_M** 是最佳选择，在质量和大小之间取得良好平衡。

## 实际应用建议

### 对于普通开发者（8-16GB 内存/显存）

推荐：
- Qwen 2.5 Coder 7B（编程专用）
- Llama 3.2 3B（通用对话）
- DeepSeek R1 Distill 7B（推理任务）

### 对于有中端显卡的用户（24-32GB 显存）

可以考虑：
- Qwen 3 14B（强通用模型）
- Mistral Small 3.1 24B（多模态支持）
- Qwen 2.5 32B（高质量推理）

### 对于有高端设备（64GB+ 显存）

可以尝试：
- Llama 3.3 70B
- DeepSeek R1 Distill 32B
- Qwen 3 32B

## 个人见解

这个网站的价值在于：

1. **降低决策成本**：不用一个个试模型，直接知道哪个能跑
2. **资源规划**：帮你决定是否需要升级硬件
3. **模型选择**：根据实际能力选择最合适的模型

对于中国开发者来说，特别值得关注阿里的 **Qwen 系列**：
- 质量优秀，在多个基准测试中表现突出
- 对中文支持好
- 模型丰富，从 0.8B 到 397B 都有
- 有专门的编程模型（Qwen Coder）

另外 **DeepSeek 系列** 也值得尝试：
- DeepSeek R1 在推理任务上表现优异
- DeepSeek Coder 在编程任务上实力强劲
- MoE 架构让大模型变得"可运行"

## 技术实现

这个网站基于以下数据源：
- [llama.cpp](https://github.com/ggerganov/llama.cpp) - 最流行的 CPU/GPU 推理框架
- [Ollama](https://ollama.ai/) - 简单易用的本地 LLM 运行工具
- [LM Studio](https://lmstudio.ai/) - 图形化的模型运行工具

如果你想本地运行这些模型，这三个工具都是很好的起点。

## 总结

CanIRun.ai 是一个非常实用的工具，特别是对于想要探索本地 AI 的开发者：

**优点：**
- 一键检测，无需安装
- 评级直观，易于理解
- 覆盖主流开源模型
- 显示详细技术参数

**使用建议：**
1. 用浏览器打开网站，让它检测你的硬件
2. 查看 S/A/B 级别的模型推荐
3. 选择 Q4_K_M 量化版本获得最佳平衡
4. 使用 llama.cpp、Ollama 或 LM Studio 运行模型

对于刚开始探索本地 AI 的朋友，建议从 **Qwen 3 4B** 或 **Llama 3.2 3B** 开始，这两个模型在大多数现代电脑上都能流畅运行，而且质量不错。

**相关资源：**
- [Ollama 官网](https://ollama.ai/)
- [llama.cpp GitHub](https://github.com/ggerganov/llama.cpp)
- [LM Studio](https://lmstudio.ai/)
- [HuggingFace 模型库](https://huggingface.co/models)
