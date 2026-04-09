---
title: "BMAD高级诱导方法深度解析：50种推理方法完整列表"
description: "深度解析 BMAD Advanced Elicitation 模块的 50 种结构化推理方法，涵盖协作、风险、技术、创意等分类，展示如何通过选择特定推理角度替代笼统重试来提升 AI 输出质量。"
date: 2026-03-15
categories: [BMAD, AI-Agent]
tags: [bmad, elicitation, reasoning, methods]
---

BMAD的Advanced Elicitation是一个结构化的"第二遍"机制——不是简单地说"再试试"或"改进一下"，而是选择特定的推理方法，让AI从那个角度重新审视自己的输出。

## 核心文件位置

```
src/core/workflows/advanced-elicitation/methods.csv
```

这个CSV文件包含了50种不同的推理方法，每种方法都有明确的分类、描述和输出模式。

## 方法分类

### 1. 协作类 (Collaboration) - 10种方法

| 方法名 | 用途 | 输出模式 |
|--------|------|----------|
| Stakeholder Round Table | 多角色提供多元视角 | perspectives → synthesis → alignment |
| Expert Panel Review | 领域专家深度分析 | expert views → consensus → recommendations |
| Debate Club Showdown | 探索争议决策和中间立场 | thesis → antithesis → synthesis |
| User Persona Focus Group | 验证功能和发现未满足需求 | reactions → concerns → priorities |
| Time Traveler Council | 获得长期后果vs短期压力的视角 | past wisdom → present choice → future impact |
| Cross-Functional War Room | 产品+工程+设计师协作 | constraints → trade-offs → balanced solution |
| Mentor and Apprentice | 通过教学暴露隐藏假设 | explanation → questions → deeper understanding |
| Good Cop Bad Cop | 支持和批评视角交替 | encouragement → criticism → balanced view |
| Improv Yes-And | 无阻碍的创意构建 | idea → build → build → surprising result |
| Customer Support Theater | 发现真实用户痛点 | complaint → investigation → resolution → prevention |

### 2. 高级类 (Advanced) - 6种方法

| 方法名 | 用途 | 输出模式 |
|--------|------|----------|
| Tree of Thoughts | 同时探索多条推理路径 | paths → evaluation → selection |
| Graph of Thoughts | 将推理建模为互联的思想网络 | nodes → connections → patterns |
| Thread of Thought | 在长上下文中保持连贯推理 | context → thread → synthesis |
| Self-Consistency Validation | 生成多个独立方法并比较一致性 | approaches → comparison → consensus |
| Meta-Prompting Analysis | 分析方法结构本身 | current → analysis → optimization |
| Reasoning via Planning | 基于世界模型构建推理树 | model → planning → strategy |

### 3. 竞争类 (Competitive) - 3种方法

- **Red Team vs Blue Team**: 对抗性攻防分析，用于安全测试
- **Shark Tank Pitch**: 创业者向怀疑的投资者pitch，压力测试商业可行性
- **Code Review Gauntlet**: 不同哲学的高级开发者review同一段代码

### 4. 技术类 (Technical) - 4种方法

- **Architecture Decision Records**: 多个架构师角色提出和辩论架构选择
- **Rubber Duck Debugging Evolved**: 向逐渐技术化的鸭子解释代码
- **Algorithm Olympics**: 多种实现方案在相同问题上竞争
- **Security Audit Personas**: 黑客+防御者+审计员从不同威胁模型检查系统
- **Performance Profiler Panel**: 数据库专家+前端专家+DevOps工程师诊断性能问题

### 5. 创意类 (Creative) - 5种方法

- **SCAMPER Method**: 七个创意镜头 (Substitute/Combine/Adapt/Modify/Put/Eliminate/Reverse)
- **Reverse Engineering**: 从期望结果倒推实现路径
- **What If Scenarios**: 探索替代现实
- **Random Input Stimulus**: 注入无关概念打破创意阻塞
- **Exquisite Corpse Brainstorm**: 每个角色只看到前一个贡献，生成意外组合
- **Genre Mashup**: 两个不相关领域交叉创新

### 6. 风险类 (Risk) - 5种方法

**强烈推荐**: **Pre-mortem Analysis** (#34)

假设项目已经失败，倒推找出原因。这是BMAD官方推荐的"首选"方法：

```
failure scenario → causes → prevention
```

其他风险方法：
- Failure Mode Analysis: 系统探索每个组件如何失败
- Challenge from Critical Perspective: 扮演魔鬼代言人
- Identify Potential Risks: 跨所有类别头脑风暴可能出错的地方
- Chaos Monkey Scenarios: 故意破坏测试恢复能力

### 7. 核心类 (Core) - 6种方法

- **First Principles Analysis**: 剥离假设，从基本真理重建
- **5 Whys Deep Dive**: 重复问为什么直到根本原因
- **Socratic Questioning**: 通过有针对性的问题揭示隐藏假设
- **Critique and Refine**: 系统性地识别优势和劣势并改进
- **Explain Reasoning**: 逐步展示如何得出结论
- **Expand or Contract for Audience**: 根据目标受众动态调整细节层次

### 8. 学习类 (Learning) - 2种方法

- **Feynman Technique**: 像教孩子一样简单解释复杂概念
- **Active Recall Testing**: 无参考测试理解程度

## 实际使用流程

根据 `docs/explanation/advanced-elicitation.md`:

1. LLM建议5个与你内容相关的方法
2. 你选择一个（或重新洗牌获得不同选项）
3. 应用方法，显示改进
4. 接受或丢弃，重复或继续

## 我的实战建议

在重大发布前，运行 **Pre-mortem Analysis**（#34）。它系统地找出标准review会遗漏的缺口。

对于架构决策，使用 **Architecture Decision Records**（#20）配合 **Red Team vs Blue Team**（#17）——先记录决策，再攻击它。

对于创意阻塞，**Random Input Stimulus**（#28）+ **Genre Mashup**（#30）的组合经常产生意外突破。

---

**文件参考**:
- `src/core/workflows/advanced-elicitation/methods.csv` - 完整50种方法
- `docs/explanation/advanced-elicitation.md` - 使用说明
- `src/core/workflows/advanced-elicitation/workflow.md` - 工作流实现
