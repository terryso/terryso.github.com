---
layout: post
title: "BMAD 的 50 种引导方法：从预验尸到思维树"
date: 2026-02-12
categories: [AI, BMAD]
tags: [bmad, elicitation, reasoning, llm]
---

深入分析 `src/core/workflows/advanced-elicitation/methods.csv` - BMAD 内置 50 种结构化推理方法，分为 11 个类别。

## 方法分类统计

| 类别 | 方法数 | 代表方法 |
|------|--------|----------|
| collaboration | 10 | Stakeholder Round Table, Expert Panel, Debate Club |
| advanced | 6 | Tree of Thoughts, Graph of Thoughts, Self-Consistency |
| competitive | 3 | Red Team/Blue Team, Shark Tank Pitch, Code Review Gauntlet |
| technical | 4 | ADR Personas, Algorithm Olympics, Security Audit Personas |
| creative | 6 | SCAMPER, Reverse Engineering, Genre Mashup |
| research | 3 | Literature Review Personas, Thesis Defense Simulation |
| risk | 5 | Pre-mortem, Failure Mode Analysis, Chaos Monkey Scenarios |
| core | 6 | First Principles, 5 Whys, Socratic Questioning |
| learning | 2 | Feynman Technique, Active Recall Testing |
| philosophical | 2 | Occam's Razor, Trolley Problem Variations |
| retrospective | 2 | Hindsight Reflection, Lessons Learned Extraction |

## 输出模式（Output Pattern）是关键

每种方法都定义了明确的转换模式：

```
Pre-mortem: failure scenario → causes → prevention
Tree of Thoughts: paths → evaluation → selection
Feynman: complex → simple → gaps → mastery
Red Team/Blue Team: defense → attack → hardening
Chaos Monkey: break → observe → harden
```

AI 不是简单地"想得更努力"——它应用特定的推理模板。

## 实现细节

工作流（`workflow.xml`）加载 `methods.csv` 后：

1. 建议与上下文相关的 5 种方法
2. 让用户选择其中一种
3. 应用该方法并展示改进结果
4. 提供接受/丢弃选项

## 为什么结构化比"再试一次"有效

当你让 AI "make it better"，得到的是模糊的改进。当你说 "run a pre-mortem analysis"，AI 会：

1. 假设项目已经失败
2. 倒推失败原因
3. 提出预防措施

**结构化迭代击败模糊重试。**

## 源码位置

- 方法定义：`src/core/workflows/advanced-elicitation/methods.csv`
- 工作流配置：`src/core/workflows/advanced-elicitation/workflow.xml`
- 文档：`docs/explanation/advanced-elicitation.md`

---

*Source: [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)*
