---
layout: post
title: "BMAD 的 50 种引导式思考方法：如何让 AI 重新审视自己的输出"
date: 2026-02-17
categories: [AI, BMAD]
tags: [bmad, elicitation, reasoning, prompt-engineering]
---

大多数 agent（和人类）会满足于第一个好点子。但 BMAD 有一个高级引导模块，包含 50 种结构化推理方法，强制你重新审视自己的输出。

## 核心思路

模糊的请求产生模糊的修订。"让它更好"是模糊的。"使用 Pre-mortem Analysis"是具体的。

命名方法会产生特定的洞察。这就是模式。

## 方法分类

### 风险检测 (Risk Detection)

| 方法 | 描述 | 输出模式 |
|------|------|----------|
| **Pre-mortem Analysis** | 想象项目已经失败，反向推导原因 | 失败场景 → 原因 → 预防 |
| **Failure Mode Analysis** | 系统探索每个组件可能的失败方式 | 组件 → 失败 → 预防 |
| **Chaos Monkey Scenarios** | 故意破坏东西来测试恢复能力 | 破坏 → 观察 → 加固 |

**Pre-mortem Analysis** 是任何规格或计划的好起点。它能持续发现标准审查遗漏的漏洞。

### 协作推理 (Collaborative Reasoning)

| 方法 | 描述 | 输出模式 |
|------|------|----------|
| **Time Traveler Council** | 过去的你和未来的你给现在的你建议 | 过去智慧 → 现在选择 → 未来影响 |
| **Cross-Functional War Room** | 产品经理 + 工程师 + 设计师一起解决问题 | 约束 → 权衡 → 平衡方案 |
| **Stakeholder Round Table** | 召集多个角色贡献不同视角 | 视角 → 综合 → 对齐 |
| **Expert Panel Review** | 组装领域专家进行深度专业分析 | 专家观点 → 共识 → 建议 |

### 创意突破 (Creative Fracture)

| 方法 | 描述 | 输出模式 |
|------|------|----------|
| **SCAMPER** | 七个创意镜头：替代/组合/调整/修改/放置/消除/反转 | S→C→A→M→P→E→R |
| **Random Input Stimulus** | 注入无关概念来强制横向思维 | 随机词 → 联想 → 新颖想法 |
| **Genre Mashup** | 结合两个无关领域找到新方法 | 领域A + 领域B → 混合洞察 |
| **What If Scenarios** | 探索替代现实以理解可能性 | 场景 → 影响 → 洞察 |

### 技术深度 (Technical Depth)

| 方法 | 描述 | 输出模式 |
|------|------|----------|
| **Architecture Decision Records** | 多个架构师辩论架构选择，明确权衡 | 选项 → 权衡 → 决定 → 理由 |
| **Security Audit Personas** | 黑客 + 防御者 + 审计员从不同威胁模型审查 | 漏洞 → 防御 → 合规 |
| **Code Review Gauntlet** | 不同哲学的资深开发者审查同一段代码 | 审查 → 辩论 → 标准 |
| **Algorithm Olympics** | 多种方法在同一问题上竞争基准测试 | 实现 → 基准 → 胜者 |

### 核心方法 (Core)

| 方法 | 描述 | 输出模式 |
|------|------|----------|
| **First Principles Analysis** | 剥离假设，从基本真理重建 | 假设 → 真理 → 新方法 |
| **5 Whys Deep Dive** | 反复问为什么以钻到根因 | 为什么链 → 根因 → 解决方案 |
| **Socratic Questioning** | 用针对性问题揭示隐藏假设 | 问题 → 启示 → 理解 |
| **Feynman Technique** | 像教孩子一样简单解释复杂概念 | 复杂 → 简单 → 差距 → 精通 |

## 实际应用

BMAD 工作流在决策点提供高级引导——当 LLM 生成内容后，你可以选择是否运行：

1. LLM 建议 5 个与你内容相关的方法
2. 你选择一个（或重新洗牌获取不同选项）
3. 应用方法，显示改进
4. 接受或丢弃，重复或继续

## 文件来源

```
src/core/workflows/advanced-elicitation/methods.csv
```

该 CSV 包含 50 种方法，分为 11 个类别：collaboration, advanced, competitive, technical, creative, research, risk, core, learning, philosophical, retrospective。

## 关键洞察

命名的推理方法比通用的"再试一次"更有效。每种方法都提供了一个特定的视角来攻击问题：

- **Pre-mortem** 强迫你看到失败
- **Inversion** 强迫你看到如何保证失败然后避免它
- **First Principles** 强迫你剥离假设
- **Red Team** 强迫你攻击自己的工作

这不是关于更好的 AI。这是关于更好的思考过程。

---

*参考：[BMAD-METHOD GitHub Repository](https://github.com/bmad-code-org/BMAD-METHOD)*
