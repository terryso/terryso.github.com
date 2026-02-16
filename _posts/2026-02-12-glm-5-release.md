---
layout: post
title: "GLM-5 发布：开源模型的推理与智能体新标杆"
date: 2026-02-12 10:57:24 +0800
categories: tech-translation
description: "智谱 AI 发布 GLM-5 大模型，参数规模扩展至 744B，在推理、编程和智能体任务上达到开源模型最佳性能，支持复杂系统工程和长期规划任务。"
original_url: https://z.ai/blog/glm-5
source: Hacker News
---

本文翻译自 [GLM-5: Scaling, Reasoning, and Agentic Capabilities](https://z.ai/blog/glm-5)，原载于 Hacker News。

---

## 核心升级：从 355B 到 744B 参数

智谱 AI 正式发布 GLM-5，这次更新的核心目标是针对**复杂系统工程**和**长期智能体任务**。

在规模化（Scaling）仍然是提升 AGI 智能效率最重要手段之一的背景下，GLM-5 相比 GLM-4.5 实现了显著跨越：

| 维度 | GLM-4.5 | GLM-5 |
|------|---------|-------|
| 总参数量 | 355B | 744B |
| 激活参数 | 32B | 40B |
| 预训练数据 | 23T tokens | 28.5T tokens |

此外，GLM-5 集成了 **DeepSeek Sparse Attention (DSA)** 技术，在保持长上下文能力的同时大幅降低部署成本。

## slime：异步 RL 基础设施

强化学习的目标是在预训练模型的基础上，从"有能力"跃升到"卓越"。但在 LLM 场景下大规模部署 RL 一直是个挑战——训练效率太低。

为此，团队开发了 **slime**，一套全新的**异步 RL 基础设施**，显著提升了训练吞吐量和效率，使得更细粒度的后训练迭代成为可能。

这正是 GLM-5 能在推理、编程和智能体任务上取得突破的关键。

## 性能表现：开源模型中的佼佼者

GLM-5 在广泛的学术基准测试中相比 GLM-4.7 有显著提升，在以下三个领域达到了开源模型的全球最佳水平：

### 推理能力

| Benchmark | GLM-5 | GLM-4.7 | DeepSeek-V3.2 | Claude Opus 4.5 |
|-----------|-------|---------|---------------|-----------------|
| Humanity's Last Exam | 30.5 | 24.8 | 25.1 | 28.4 |
| Humanity's Last Exam w/ Tools | **50.4** | 42.8 | 40.8 | 43.4* |
| AIME 2026 I | 92.7 | 92.9 | 92.7 | 93.3 |
| HMMT Nov. 2025 | **96.9** | 93.5 | 90.2 | 91.7 |
| GPQA-Diamond | 86.0 | 85.7 | 82.4 | 87.0 |

> AIME 和 HMMT 都是高难度数学竞赛，GLM-5 在这些测试中表现接近甚至超越了一些闭源前沿模型。

### 编程能力

| Benchmark | GLM-5 | GLM-4.7 | DeepSeek-V3.2 | Claude Opus 4.5 |
|-----------|-------|---------|---------------|-----------------|
| SWE-bench Verified | 77.8 | 73.8 | 73.1 | **80.9** |
| SWE-bench Multilingual | **73.3** | 66.7 | 70.2 | 77.5 |
| Terminal-Bench 2.0 Terminus-2 | **56.2** | 41.0 | 39.3 | 59.3 |
| CyberGym | 43.2 | 23.5 | 17.3 | 50.6 |

在 Terminal-Bench 和 CyberGym 这种更接近实际开发场景的测试中，GLM-5 展现出了明显优势。

### 智能体（Agent）能力

| Benchmark | GLM-5 | GLM-4.7 | DeepSeek-V3.2 | Claude Opus 4.5 |
|-----------|-------|---------|---------------|-----------------|
| BrowseComp | **62.0** | 52.0 | 51.4 | 37.0 |
| BrowseComp w/ Context Manage | **75.9** | 67.5 | 67.6 | 67.8 |
| τ²-Bench | 89.7 | 87.4 | 85.3 | **91.6** |
| MCP-Atlas Public Set | 67.8 | 52.0 | 62.2 | 65.2 |

值得一提的是 **Vending Bench 2**——这个基准测试要求模型在一年时间跨度内运营一台自动售货机。GLM-5 最终账户余额达到 **$4,432**，在开源模型中排名第一，接近 Claude Opus 4.5 的 $4,967。

这证明了 GLM-5 在**长期规划和资源管理**方面的强大能力。

## Office 能力：从"聊天"到"工作"

基础模型正在从"聊天"转向"工作"——就像知识工作者的 Office 工具，工程师的编程工具一样。

GLM-5 可以直接将文本或源材料转换为 `.docx`、`.pdf`、`.xlsx` 文件：

- PRD 文档
- 课程教案
- 考试试卷
- 电子表格
- 财务报表
- 排班表
- 菜单设计

官方应用 Z.ai 正在推出 **Agent 模式**，内置 PDF/Word/Excel 创建技能，支持多轮协作，将输出转化为真正可交付的文档。

## 如何使用 GLM-5

### 编程场景

GLM-5 已集成到主流编程智能体中：**Claude Code、OpenCode、Kilo Code、Roo Code、Cline、Droid** 等。

```bash
# Claude Code 配置示例
# ~/.claude/settings.json
{
  "model": "GLM-5"
}
```

> 注意：GLM Coding Plan 订阅用户正在逐步开放中。Max 计划用户可立即启用，其他计划将逐步支持。GLM-5 消耗的配额比 GLM-4.7 更多。

如果你喜欢 GUI，可以试试 **Z Code**——一个可以控制多个智能体协作完成复杂任务的智能开发环境。

### OpenClaw 框架

除了编程智能体，GLM-5 还支持 **OpenClaw**——一个将 GLM-5 变成**跨应用、跨设备操作**的个人助理框架。

不只是聊天，而是真正帮你干活。

### 本地部署

GLM-5 的模型权重已在 HuggingFace 和 ModelScope 开源，采用 **MIT 许可证**。

支持的主流推理框架：
- vLLM
- SGLang

值得一提的是，GLM-5 还支持非 NVIDIA 芯片部署：
- 华为昇腾（Ascend）
- 摩尔线程（Moore Threads）
- 寒武纪（Cambricon）
- 昆仑芯片（Kunlun Chip）
- MetaX、Enflame、海光（Hygon）

通过算子优化和模型量化，GLM-5 在这些芯片上也能达到合理的吞吐量。

## 个人感想

GLM-5 这次更新有几个值得关注的点：

1. **异步 RL 基础设施 slime**——这可能是工程上的一个重要突破。RL 训练效率一直是瓶颈，异步架构如果能显著提升吞吐量，对整个行业都有借鉴意义。

2. **Vending Bench 2 的表现**——长期规划能力是 Agent 走向实用的关键。能在一年时间跨度上做出合理决策，说明模型具备了某种程度的"前瞻性"。

3. **国产芯片支持**——支持华为昇腾、寒武纪等国产芯片，这对国内企业来说是个利好。降低对 NVIDIA 的依赖，在当前环境下尤为重要。

4. **MIT 开源许可**——这比很多"开源但限制商业使用"的模型要大方得多，有利于生态发展。

GLM-5 的发布，标志着国产大模型在推理和智能体能力上又迈出了一大步。差距仍在，但正在快速缩小。

---

**关键要点：**
- GLM-5 参数规模从 355B 扩展到 744B（激活 40B），预训练数据 28.5T tokens
- 引入异步 RL 基础设施 slime，提升后训练效率
- 在推理、编程、智能体任务上达到开源模型最佳水平
- Vending Bench 2 测试中展现出色的长期规划能力（账户余额 $4,432，开源第一）
- 支持 Office 文档直接生成（.docx/.pdf/.xlsx）
- MIT 开源许可，支持国产芯片部署
