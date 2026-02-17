---
layout: post
title: "BMAD的50种启发式方法——超越「再试一次」"
date: 2026-02-18
categories: [AI, BMAD]
---

大多数AI工作流只会说「再试一次」或「做得更好」。BMAD采用了不同的方法——50种结构化推理方法。

## 核心洞察

模糊的请求产生模糊的修改。命名方法强制特定的攻击角度。

这些方法来自BMAD V6的 `src/core/workflows/advanced-elicitation/methods.csv` 文件。

## 风险聚焦类

- **Pre-mortem Analysis（预验尸分析）**：想象失败，倒推原因来预防
- **Chaos Monkey Scenarios（混沌猴子场景）**：故意破坏事物以测试韧性
- **Failure Mode Analysis（失效模式分析）**：系统探索每个组件如何失败

## 协作模拟类

- **Stakeholder Round Table（利益相关者圆桌会议）**：多个角色贡献不同视角
- **Expert Panel Review（专家小组评审）**：领域专家进行深度专业分析
- **Debate Club Showdown（辩论赛对决）**：两个角色争论，主持人评分
- **Time Traveler Council（时间旅行者委员会）**：过去的你和未来的你建议现在的你

## 技术深度类

- **Architecture Decision Records（架构决策记录）**：架构师辩论选择并明确权衡
- **Algorithm Olympics（算法奥运会）**：多种方法用基准测试竞争
- **Security Audit Personas（安全审计角色）**：黑客+防御者+审计员从不同威胁模型检查

## 创意类

- **SCAMPER Method**：7个镜头（替代/组合/改编/修改/放置/消除/反转）
- **Genre Mashup（类型混搭）**：组合不相关领域获得新鲜方案

## 实际工作流程

1. 工作流生成内容后，你会得到5个相关方法建议
2. 选择一个，查看改进
3. 接受或丢弃，重复或继续

## 完整方法列表（50种）

| 类别 | 方法名 | 描述 |
|------|--------|------|
| collaboration | Stakeholder Round Table | 召集多个角色贡献不同视角 |
| collaboration | Expert Panel Review | 组装领域专家进行深度分析 |
| collaboration | Debate Club Showdown | 两个角色争论对立立场 |
| collaboration | User Persona Focus Group | 产品用户角色反应提案 |
| collaboration | Time Traveler Council | 过去的你和未来的你建议现在的你 |
| collaboration | Cross-Functional War Room | 产品经理+工程师+设计师一起解决问题 |
| collaboration | Mentor and Apprentice | 高级专家教导初级，初级提出天真的问题 |
| collaboration | Good Cop Bad Cop | 支持性角色和批判性角色交替 |
| collaboration | Improv Yes-And | 多个角色在不阻塞的情况下建立在彼此的想法上 |
| collaboration | Customer Support Theater | 愤怒的客户和支持代表角色扮演 |
| advanced | Tree of Thoughts | 同时探索多条推理路径然后评估选择最佳 |
| advanced | Graph of Thoughts | 将推理建模为相互关联的想法网络 |
| advanced | Thread of Thought | 通过编织连续的叙述线来维护长上下文的连贯推理 |
| advanced | Self-Consistency Validation | 生成多个独立方法然后比较一致性 |
| advanced | Meta-Prompting Analysis | 后退一步分析方法结构本身 |
| advanced | Reasoning via Planning | 由世界模型和目标状态指导构建推理树 |
| competitive | Red Team vs Blue Team | 对抗性攻击-防御分析 |
| competitive | Shark Tank Pitch | 企业家向怀疑的投资者推销 |
| competitive | Code Review Gauntlet | 不同哲学的高级开发者审查同一代码 |
| technical | Architecture Decision Records | 多个架构师角色提议和辩论架构选择 |
| technical | Rubber Duck Debugging Evolved | 向逐渐更技术化的鸭子解释代码直到找到bug |
| technical | Algorithm Olympics | 多种方法在同一问题上用基准竞争 |
| technical | Security Audit Personas | 黑客+防御者+审计员从不同威胁模型检查系统 |
| technical | Performance Profiler Panel | 数据库专家+前端专家+DevOps工程师诊断慢速 |
| creative | SCAMPER Method | 应用七个创造力镜头 |
| creative | Reverse Engineering | 从期望结果倒推找到实现路径 |
| creative | What If Scenarios | 探索替代现实以理解可能性和影响 |
| creative | Random Input Stimulus | 注入不相关概念以激发意外联系 |
| creative | Exquisite Corpse Brainstorm | 每个角色只看到前一个贡献添加想法 |
| creative | Genre Mashup | 组合两个不相关领域找到新鲜方法 |
| research | Literature Review Personas | 乐观研究者+怀疑研究者+综合者审查来源 |
| research | Thesis Defense Simulation | 学生向不同关切的委员会捍卫假设 |
| research | Comparative Analysis Matrix | 多个分析师根据加权标准评估选项 |
| risk | Pre-mortem Analysis | 想象未来失败然后倒推预防 |
| risk | Failure Mode Analysis | 系统探索每个组件如何失败 |
| risk | Challenge from Critical Perspective | 扮演魔鬼代言人压力测试想法 |
| risk | Identify Potential Risks | 跨所有类别头脑风暴可能出错的事情 |
| risk | Chaos Monkey Scenarios | 故意破坏事物以测试韧性和恢复 |
| core | First Principles Analysis | 剥离假设从基本真理重建 |
| core | 5 Whys Deep Dive | 重复问为什么以深入根本原因 |
| core | Socratic Questioning | 使用针对性问题揭示隐藏假设 |
| core | Critique and Refine | 系统审查识别优缺点然后改进 |
| core | Explain Reasoning | 逐步思考展示如何得出结论 |
| core | Expand or Contract for Audience | 动态调整细节级别和技术深度 |
| learning | Feynman Technique | 简单解释复杂概念就像教孩子 |
| learning | Active Recall Testing | 不用参考测试理解以验证真实知识 |
| philosophical | Occam's Razor Application | 通过消除不必要的复杂性找到最简单的充分解释 |
| philosophical | Trolley Problem Variations | 通过道德困境探索伦理权衡 |
| retrospective | Hindsight Reflection | 想象从未来回顾以获得视角 |
| retrospective | Lessons Learned Extraction | 系统识别关键要点和可操作的改进 |

## 你会用哪种推理方法？

下次当你想让AI重新思考它的输出时，不要只说「再试一次」。选择一个命名方法，看看会发生什么。
