---
layout: post
title: "Leanstral：Mistral 开源的首个 Lean 4 代码智能体"
date: 2026-03-17 08:45:49 +0800
categories: tech-translation
description: "Mistral 发布 Leanstral，一个专门为 Lean 4 定理证明设计的开源代码智能体，在证明工程任务中展现出极高的效率和性价比。"
original_url: https://mistral.ai/news/leanstral
source: Hacker News
---

本文翻译自 [Leanstral](https://mistral.ai/news/leanstral)，原载于 Hacker News。

## AI 编码的下一个瓶颈：人工审核

AI 智能体在代码生成领域已经证明了其强大的能力。然而，当我们试图将这些模型推向更高风险的应用场景——从前沿数学研究到关键任务软件——时，我们遇到了一个扩展瓶颈：**人工审核**。手动验证所需的时间和专业知识成为了工程速度的主要障碍。

Mistral 的愿景是打造新一代编码智能体，不仅能执行任务，还能针对严格的规范**形式化证明**其实现。人类只需定义需求，而不必调试机器生成的逻辑。今天，他们朝这个愿景迈出了重要一步。

## Introducing Leanstral

Mistral 发布了 **Leanstral**——首个专为 Lean 4 设计的开源代码智能体。

Lean 4 是一个功能强大的证明助手（proof assistant），能够表达复杂的数学对象（如 [perfectoid spaces](https://xenaproject.wordpress.com/2020/12/05/liquid-tensor-experiment/)）和软件规范（如 [Rust 代码片段的属性验证](https://github.com/AeneasVerif/aeneas)）。

与现有的证明系统不同——那些系统大多只是对大型通用模型的封装，或者专注于单一数学问题——Leanstral 的设计目标是在**真实的形式化代码库**中高效运作：

- **开放且易用**：Leanstral 的权重以 Apache 2.0 许可证发布，可通过 Mistral Vibe 的智能体模式使用，也提供免费 API 端点。Mistral 还将发布一份详细介绍训练方法的技术报告，以及一个新的评估套件 **FLTEval**，将评估重心从竞赛数学扩展到更实际的场景。
- **高效且强大**：Leanstral 采用高度稀疏的架构（6B 激活参数），专门针对证明工程任务进行优化。借助 Lean 作为完美验证器的并行推理能力，Leanstral 在性能和成本效益上都表现出色。
- **通过 MCP 可扩展**：Leanstral 支持通过 Vibe 接入任意 MCP（Model Context Protocol），并专门针对常用的 `lean-lsp-mcp` 进行了训练以达到最佳性能。

## 评估结果

为了反映在真实证明工程场景中的实用性，Mistral 使用 FLTEval 对 Leanstral 进行了基准测试。不同于孤立的数学问题，这个测试要求智能体完成 FLT（费马大定理）项目中的所有形式化证明，并正确定义每个 PR 中的新数学概念。

### Leanstral vs. 开源模型

Leanstral-120B-A6B 展示了相比更大规模开源同行的显著效率优势：

| 模型 | 成本 ($) | 得分 |
| --- | --- | --- |
| GLM5-744B-A40B | - | ~16.6 |
| Kimi-K2.5-1T-32B | - | ~20.1 |
| Qwen3.5-397B-A17B (pass@4) | - | 25.4 |
| **Leanstral (pass@2)** | 36 | **26.3** |
| **Leanstral (pass@4)** | 72 | **29.3** |

即使是最强的开源竞争对手 Qwen3.5-397B-A17B，也需要 4 次尝试才能达到 25.4 分。而 Leanstral 仅用一半的投入（pass@2）就达到了 26.3 分，并在相同成本水平下线性扩展到 29.3 分。

### Leanstral vs. Claude 家族

Leanstral 作为 Claude 系列的高性价比替代方案，以极低的价格提供有竞争力的性能：

| 模型 | 成本 ($) | 得分 |
| --- | --- | --- |
| Haiku | 184 | 23.0 |
| Sonnet | 549 | 23.7 |
| Opus | 1,650 | 39.6 |
| Leanstral | 18 | 21.9 |
| Leanstral pass@2 | 36 | 26.3 |
| Leanstral pass@4 | 72 | 29.3 |
| Leanstral pass@8 | 145 | 31.0 |
| Leanstral pass@16 | 290 | 31.9 |

**关键发现**：
- Leanstral pass@2 以仅 $36 的成本达到 26.3 分，比 Sonnet 高出 2.6 分，而成本仅为 Sonnet（$549）的 6.5%
- 在 pass@16 下，Leanstral 达到 31.9 分，比 Sonnet 高出 8 分
- 虽然 Claude Opus 4.6 在质量上仍领先，但其成本高达 $1,650，是 Leanstral 的 **92 倍**

> 个人观点：这种成本效率的差异对于学术研究团队和初创公司来说意义重大。形式化验证不再是大公司的专利。

## 案例研究

### 1. 回答 StackExchange 上关于 Lean 新版本的问题

当新版本的 Lean 引入破坏性变更时，迁移代码可能是一场噩梦。Mistral 给 Leanstral 喂了一个来自 [Proof Assistants Stack Exchange](https://proofassistants.stackexchange.com/questions/6471/a-strange-issue-with-a-type-alias-in-lean4) 的真实问题——一段在 Lean 4.29.0-rc6 中神秘编译失败的脚本（由于时间太近，这个版本不在训练数据中）。

问题出在一个 `rw`（重写）策略突然无法匹配涉及简单类型别名的模式。最初的类型定义是：

```lean
def T2 := List Bool
```

Leanstral 没有盲目猜测，而是：
1. 成功构建测试代码来复现失败环境
2. 诊断出根本问题：**定义相等性（definitional equality）**
3. 正确识别出 `def` 创建的是刚性定义，需要显式展开，这会阻止 `rw` 策略看到它需要匹配的底层结构

**它提出的修复方案**非常简单：只需把 `def` 换成 `abbrev`。

```lean
abbrev T2 := List Bool  -- 透明别名，立即可见
```

因为 `abbrev` 创建的是透明别名，与原始类型立即定义相等，`rw` 策略就能再次完美匹配模式 `(L2 n).length`。Leanstral 不仅完成了任务，还完美地向用户解释了背后的原理。

### 2. 程序推理

研究团队将 [Princeton 的 Coq 教程](https://www.cs.princeton.edu/courses/archive/fall10/cos441/sf/Imp.html)中的 Rocq 定义复制过来，要求 Leanstral 转换为 Lean。它成功完成了转换，甚至实现了自定义符号表示。

更令人印象深刻的是，当只给出 Rocq 的定理陈述（不带证明）时，它能够：
1. 翻译到 Lean
2. 然后证明这个语言中程序的一些性质

## 开始使用 Leanstral

Leanstral 今天就可以使用了：

- **Mistral Vibe 中零配置**：Leanstral 已直接集成到 Mistral Vibe 中，可立即进行零配置的编码和证明。使用 `/leanstall` 命令启动。
- **Labs API**：通过免费/近乎免费的 API 端点 `labs-leanstral-2603` 访问模型。Mistral 将在有限时间内保持这个端点高度可访问，以收集真实反馈和可观测性数据。
- **自托管**：下载 Apache 2.0 许可的模型权重，在自己的硬件上运行。

相关链接：[文档](https://docs.mistral.ai/models/leanstral-26-03) | [注册 Mistral Vibe](https://console.mistral.ai/codestral/cli)

---

## 总结

Leanstral 的发布标志着 AI 辅助形式化验证领域的一个重要里程碑：

1. **专业化胜过通用化**：针对 Lean 4 专门优化的 6B 激活参数模型，在证明工程任务上超越了通用大模型
2. **成本效率的革命**：以 Claude Opus 1/92 的成本提供有竞争力的性能
3. **开源生态的贡献**：Apache 2.0 许可证让学术界和工业界都能自由使用和改进
4. **实际可用性**：不是实验室里的玩具，而是能在真实代码库中解决实际问题的工具

对于对形式化验证、定理证明或高可信软件感兴趣的开发者来说，Leanstral 值得一试。
