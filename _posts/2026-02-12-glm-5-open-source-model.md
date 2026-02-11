---
layout: post
title: "GLM-5 发布：面向复杂系统工程的下一代开源模型"
date: 2026-02-12 03:00:00 +0800
categories: tech-translation
description: "智谱 AI 发布 GLM-5，参数规模扩展至 744B，在推理、编码和 Agent 任务上达到开源模型最佳水平，显著缩小与前沿闭源模型的差距。"
original_url: https://z.ai/blog/glm-5
source: Z.ai
---

本文翻译自 [GLM-5: Targeting Complex Systems Engineering and Long-Horizon Agentic Tasks](https://z.ai/blog/glm-5)，原载于 Z.ai 官方博客。

## 模型扩展：从 355B 到 744B

**Scaling（扩展规模）** 仍然是提升通用人工智能（AGI）效率的最重要手段之一。与 GLM-4.5 相比，GLM-5 实现了显著提升：

| 指标 | GLM-4.5 | GLM-5 |
|------|---------|-------|
| 总参数 | 355B | 744B |
| 激活参数 | 32B | 40B |
| 预训练数据 | 23T tokens | 28.5T tokens |

GLM-5 还集成了 **DeepSeek Sparse Attention（DSA）**，在保持长上下文能力的同时显著降低部署成本。

## 异步强化学习基础设施：slime

强化学习的目标是缩小预训练模型"胜任"与"卓越"之间的差距。然而，RL 训练的低效性使其难以在 LLM 规模上部署。

为此，团队开发了 **slime** —— 一种新颖的**异步 RL 基础设施**，大幅提升了训练吞吐量和效率，支持更细粒度的后训练迭代。

## 性能表现：缩小与前沿模型的差距

在预训练和后训练的双重进步下，GLM-5 在多个学术基准测试中显著超越 GLM-4.7，在推理、编码和 Agent 任务上达到**全球开源模型最佳水平**。

### 推理能力

| 基准测试 | GLM-5 | GLM-4.7 | DeepSeek-V3.2 | Kimi K2.5 | Claude Opus 4.5 |
|----------|-------|---------|---------------|-----------|-----------------|
| Humanity's Last Exam | 30.5 | 24.8 | 25.1 | 31.5 | 28.4 |
| HLE w/ Tools | **50.4** | 42.8 | 40.8 | 51.8 | 43.4* |
| AIME 2026 I | 92.7 | 92.9 | 92.7 | 92.5 | 93.3 |
| GPQA-Diamond | 86.0 | 85.7 | 82.4 | 87.6 | 87.0 |

### 编程能力

| 基准测试 | GLM-5 | GLM-4.7 | Claude Opus 4.5 | GPT-5.2 |
|----------|-------|---------|-----------------|---------|
| SWE-bench Verified | 77.8 | 73.8 | 80.9 | 80.0 |
| SWE-bench Multilingual | 73.3 | 66.7 | 77.5 | 72.0 |
| Terminal-Bench 2.0 (Terminus-2) | 56.2/60.7† | 41.0 | 59.3 | 54.0 |
| CyberGym | 43.2 | 23.5 | 50.6 | - |

### Agent 能力

| 基准测试 | GLM-5 | GLM-4.7 | DeepSeek-V3.2 | Claude Opus 4.5 |
|----------|-------|---------|---------------|-----------------|
| BrowseComp w/ Context | 75.9 | 67.5 | 67.6 | 67.8 |
| τ²-Bench | 89.7 | 87.4 | 85.3 | 91.6 |
| MCP-Atlas Public Set | 67.8 | 52.0 | 62.2 | 65.2 |
| Tool-Decathlon | 38.0 | 23.8 | 35.2 | 43.5 |

### Vending Bench 2：长期运营能力

在衡量长期运营能力的 Vending Bench 2 上，GLM-5 在开源模型中排名第一：

| 模型 | 最终账户余额 |
|------|-------------|
| Gemini 3.0 Pro | $5,478.16 |
| Claude Opus 4.5 | $4,967.06 |
| **GLM-5** | **$4,432.12** |
| GPT-5.2 | $3,591.33 |
| GLM-4.7 | $2,376.82 |

Vending Bench 2 要求模型经营一年的模拟自动售货机业务。GLM-5 展现了强大的长期规划和资源管理能力。

## 复杂系统工程能力

GLM-5 专为**复杂系统工程**和**长期 Agent 任务**设计。在内部评估套件 CC-Bench-V2 上，GLM-5 在前端、后端和长期任务上显著超越 GLM-4.7，缩小了与 Claude Opus 4.5 的差距。

### Office 生成能力

基础模型正在从"聊天"向"工作"转变。GLM-5 可以将文本或源材料直接转换为：

- .docx 文档（PRD、教案、考试、菜单等）
- .pdf 文件
- .xlsx 表格（电子表格、财务报告、运行表等）

Z.ai 官方应用正在推出 Agent 模式，内置 PDF/Word/Excel 创建技能，支持多轮协作，将输出转化为真正的可交付成果。

## 如何使用 GLM-5

### 1. 与 Claude Code 集成

GLM-5 支持主流编码 Agent：**Claude Code, OpenCode, Kilo Code, Roo Code, Cline, Droid** 等。

对于 GLM Coding Plan 订阅用户：
- **Max 计划用户**：在 `~/.claude/settings.json` 中将模型名称更新为 `"GLM-5"`
- 其他计划层级：将逐步开放支持
- 注意：GLM-5 请求消耗更多配额

### 2. 本地部署

GLM-5 模型权重已在 Hugging Face 和 ModelScope 公开发布（MIT 许可证）。

支持的推理框架：vLLM、SGLang

支持的非 NVIDIA 芯片：华为昇腾、摩尔线程、寒武纪、昆仑芯片、MetaX、燧原、海光等。

### 3. Z.ai 平台

访问 [Z.ai](https://z.ai) 即可免费试用 GLM-5，提供 Chat 和 Agent 两种模式：

- **Chat 模式**：即时响应、交互式对话、轻量级交付
- **Agent 模式**：多工具、多样技能、直接交付结果

## 技术洞察

1. **MoE 架构的持续进化**：744B 总参数/40B 激活参数的设计平衡了性能与推理成本

2. **异步 RL 的突破**：slime 基础设施解决了 RL 在大规模模型上的训练瓶颈

3. **开源与闭源差距缩小**：GLM-5 在多项任务上接近甚至超越 Claude Opus 4.5 和 GPT-5.2

4. **Agent 能力的专项目标**：Vending Bench 2 的优异成绩显示了模型在长期规划和多步骤任务执行上的实力

## 总结

GLM-5 的发布标志着开源模型在推理、编程和 Agent 任务上达到了新的高度。通过扩展参数规模、创新 RL 训练基础设施以及专注复杂系统工程能力，GLM-5 显著缩小了与前沿闭源模型的差距。

对于中文开发者而言，GLM-5 的开源特性（MIT 许可证）和多平台支持为本地部署和二次开发提供了极大便利。
