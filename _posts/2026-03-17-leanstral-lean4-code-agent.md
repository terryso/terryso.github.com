---
layout: post
title: "Leanstral：首个开源 Lean 4 证明助手代码智能体"
date: 2026-03-17 10:49:31 +0800
categories: tech-translation
description: "Mistral 发布 Leanstral，首个专为 Lean 4 证明助手设计的开源代码智能体，在形式化验证领域展现出优异的性价比，成本仅为 Claude Opus 的 1/92。"
original_url: https://mistral.ai/news/leanstral
source: Hacker News
---

本文翻译自 [Introducing Leanstral](https://mistral.ai/news/leanstral)，原载于 Hacker News。

## 引言：AI 编程的下一站——形式化验证

AI 智能体在代码生成领域已经展现出强大的能力。然而，当我们把这些模型推向高风险领域——从前沿数学研究到关键任务软件——我们会遇到一个**扩展瓶颈**：人工审查。验证机器生成代码所需的时间和专业知识，已成为工程效率的主要障碍。

Mistral 团队设想了一个更有价值的编程智能体时代：既能执行任务，又能针对严格的规范**形式化证明**其实现。与其调试机器生成的逻辑，人类只需声明自己想要什么。今天，他们朝着这个愿景迈出了重要一步。

## Leanstral 登场

Mistral 发布了 **Leanstral**，这是首个专为 **Lean 4** 设计的开源代码智能体。

> **什么是 Lean 4？** 它是一个证明助手（Proof Assistant），能够表达复杂的数学对象（如 [perfectoid spaces](https://xenaproject.wordpress.com/2020/12/05/liquid-tensor-experiment/)）和软件规范（如 [Rust 代码片段的属性验证](https://github.com/AeneasVerif/aeneas)）。

与现有的证明系统不同——那些系统只是在大模型外面包一层包装，或者专注于单个数学问题——Leanstral 的设计目标是：

### 三大核心特性

1. **开源且易获取**
   - Apache 2.0 许可证发布权重
   - 集成到 Mistral Vibe 智能体模式
   - 提供免费 API 端点
   - 即将发布技术报告和新的评估套件 FLTEval

2. **高效且强大**
   - 采用高度稀疏架构，仅 6B 活跃参数
   - 针对证明工程任务优化
   - 利用 Lean 作为完美验证器实现并行推理
   - 相比闭源竞争对手，既高性能又低成本

3. **通过 MCP 可扩展**
   - 支持 Mistral Vibe 中的任意 MCP（Model Context Protocol）
   - 专门针对常用 `lean-lsp-mcp` 训练以达到最佳性能

## 评估：真实场景下的表现

为了反映真实证明工程场景中的实用性，Leanstral 的测试基准是：**完成 FLT 项目的每个 PR 中的所有形式化证明，并正确定义新的数学概念**——而不是孤立的数学问题。

### 与开源模型对比

Leanstral-120B-A6B 展现出显著效率优势：

| 模型 | FLTEval 分数 |
|------|-------------|
| GLM5-744B-A40B | ~16.6 |
| Kimi-K2.5-1T-A32B | ~20.1 |
| Qwen3.5-397B-A17B (pass@4) | 25.4 |
| **Leanstral (pass@1)** | 21.9 |
| **Leanstral (pass@2)** | **26.3** |
| **Leanstral (pass@4)** | **29.3** |

即使是最强的开源竞争对手 Qwen3.5-397B-A17B，也需要 4 次 pass 才能达到 25.4 分。而 Leanstral 仅用 2 次 pass 就达到了更优的 26.3 分，并持续线性扩展。

### 与 Claude 家族对比：性价比之王

这里的数据非常惊人：

| 模型 | 成本 ($) | 分数 |
|------|---------|------|
| Haiku | 184 | 23.0 |
| Sonnet | 549 | 23.7 |
| Opus | 1,650 | 39.6 |
| **Leanstral** | 18 | 21.9 |
| **Leanstral pass@2** | 36 | 26.3 |
| **Leanstral pass@4** | 72 | 29.3 |
| **Leanstral pass@8** | 145 | 31.0 |
| **Leanstral pass@16** | 290 | 31.9 |

**关键发现：**
- Leanstral pass@2 得分 26.3，超越 Sonnet 2.6 分，但成本仅 $36 vs Sonnet 的 $549
- Leanstral pass@16 得分 31.9，比 Sonnet 高出 8 分
- Claude Opus 4.6 成本高达 $1,650，是 Leanstral 的 **92 倍**！

> 💡 **个人观点**：这个成本对比非常震撼。虽然 Opus 在质量上仍领先，但对于大多数实际应用场景，Leanstral 提供了一个极具吸引力的替代方案。尤其对于需要大规模验证的团队，这个成本差异可能意味着项目可行与否的区别。

## 案例研究

### 案例 1：回答 Lean 版本变更相关的 StackExchange 问题

当新 Lean 版本引入破坏性变更时，迁移代码可能是个噩梦。Mistral 团队给 Leanstral 喂了一个来自 [Proof Assistants Stack Exchange 的真实问题](https://proofassistants.stackexchange.com/questions/6471/a-strange-issue-with-a-type-alias-in-lean4)：

> 一个脚本在 Lean 4.29.0-rc6 中突然编译失败（这个版本因为太新，不在训练数据中）。罪魁祸首是 `rw` 重写策略突然无法匹配涉及简单类型别名的模式，该别名定义为 `def T2 := List Bool`。

Leanstral 没有盲目猜测，而是：
1. ✅ 成功构建测试代码复现失败环境
2. ✅ 诊断出底层问题：定义等价性（definitional equality）
3. ✅ 正确识别出 `def` 创建的是刚性定义，需要显式展开，这阻止了 `rw` 策略看到底层的结构

**解决方案**：将 `def` 换成 `abbrev`。因为 `abbrev` 创建的是透明别名，与原始类型立定义等价，`rw` 策略就能完美匹配模式。

### 案例 2：程序推理与跨语言转换

Mistral 从普林斯顿大学的 [Software Foundations 课程](https://www.cs.princeton.edu/courses/archive/fall10/cos441/sf/Imp.html)复制了 Rocq（原 Coq）定义，要求 Leanstral 转换为 Lean。

Leanstral 不仅成功转换，还实现了自定义符号表示。更厉害的是，当只给 Rocq 的陈述（不含证明）时，它能：
1. 翻译到 Lean
2. 证明该语言中程序的一些属性

这展示了 Leanstral 在跨语言形式化推理方面的强大能力。

## 立即体验 Leanstral

Leanstral 今天就可以使用：

### 1. Mistral Vibe 中零配置
直接集成到 Mistral Vibe，立即可用。输入 `/leanstall` 开始。

### 2. Labs API
通过免费/接近免费的 API 端点 `labs-leanstral-2603` 访问。Mistral 会在有限时间内保持这个端点的高度可访问性，以收集真实反馈。

### 3. 自行部署
下载 Apache 2.0 许可的模型权重，在自己的硬件上运行。

**相关链接**：
- [文档](https://docs.mistral.ai/models/leanstral-26-03)
- [注册 Mistral Vibe](https://console.mistral.ai/codestral/cli)

---

## 总结

Leanstral 的发布是形式化验证领域的一个重要里程碑：

1. **民主化证明工程**：通过开源和免费 API，降低了形式化验证的门槛
2. **极致性价比**：成本仅为 Claude Opus 的 1/92，同时保持竞争力
3. **专业领域优化**：专门为 Lean 4 和真实仓库场景训练
4. **MCP 生态支持**：通过 MCP 协议实现可扩展性

对于对形式化验证、数学证明或高可靠性软件感兴趣的开发者，Leanstral 值得一试。它可能是让"让 AI 写代码并证明代码正确"这一愿景走向现实的重要一步。

---

*注：本文基于 Mistral 官方博客翻译整理，部分内容根据中文读者习惯做了适应性调整。*
