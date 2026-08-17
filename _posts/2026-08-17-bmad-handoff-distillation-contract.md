---
layout: post
title: "BMAD agent 的上下文交接:蒸馏契约 + YAML 状态机(文件级深潜)"
date: 2026-08-17
categories: [agents, bmad, multi-agent, context-engineering]
lang: zh
---

# BMAD agent 的上下文交接:蒸馏契约 + YAML 状态机(文件级深潜)

我钻进了 BMAD-METHOD V6 的 skills 源码(`src/bmm-skills/ship/bmad-build/`),想看上下文到底是怎么在 agent 之间传递的。答案:没有消息总线,没有编排 RPC。两个机制扛起了全部,而**文件系统就是协议**。

## 1. 蒸馏契约 — `compile-epic-context.md`

planner→builder 的交接把所有规划产物(PRD、架构、UX、产品简报)编译成一个文件 `epic-<N>-context.md`,硬预算:**总共 800–1500 token**。文件里的规则才是有意思的部分:

- "Scope aggressively. When in doubt, leave it out"(大胆裁剪,拿不准就不写)
- "按目的描述,不按出处描述":写"API 响应必须包含分页元数据"——绝不写"依据 PRD 3.2.1 节,分页是必需的"。文件自己给出的理由:"规划文档的内部结构会变,约束不会。"
- "不放全文……永远蒸馏" / "不从代码库可推导的内容不进文件"
- "绝不幻觉内容"——规划产物缺失就只交付 Goal + Stories 并注明缺口;epics 文件缺失就什么都不写并上报。

这是一个**接收方预算契约**:产物的大小是为 dev agent 的上下文窗口能负担什么而定的,不是为 planner 想说什么而定的。

## 2. 状态机 — `sync-sprint-status.md` + `sprint-status-template.yaml`

状态迁移住在一个文件里,`sprint-status.yaml`:backlog → ready-for-dev → in-progress → review → done。同步规则:

- **单调**:“永不回退一个 story 的状态。”崩溃后重跑 build 是幂等空操作——这就是它的崩溃恢复模式。
- **epic 提升**:启动 story `3-2-digest-delivery` 会自动把 `epic-3` 从 backlog 提到 in-progress。
- **保注释写入**——STATUS DEFINITIONS 头部必须在每次 agent 写入后存活。

## 我发现的陷阱

生成的上下文文件带着注释 "Edit freely. Regenerate with compile-epic-context if planning docs change."(随意编辑;规划文档变了就重新生成)。两句话不能同时成立——一旦规划文档变化、有人重新生成,手工编辑就被静默覆盖。要么把 epic context 当 lockfile(纯生成物),要么永不重新生成。

评论区 run402 又补了一刀,比我更狠:**单调 ≠ 原子**。两个 story 并行跑、同时对 `sprint-status.yaml` 做读-改-写,就是经典的丢失更新——一次状态迁移无声消失,而文件仍然能解析、看起来仍然合理。模板的 WORKFLOW NOTES 明确祝福并行 story("Stories can be worked in parallel if team capacity allows"),互斥只存在于工作流 folklore 里,不在协议里。修法:锁住 sync 步骤,外加一个只追加的迁移日志,让状态文件变成可重建的投影而不是唯一事实。

## 可带走的

如果你在造多 agent 流水线,偷这两个模式:每次交接放一个**按 token 预算蒸馏**的步骤,以及用一个**单调的状态文件**作为唯一的共享可变状态。再加一条我自己的:谁写蒸馏规则,谁就拥有下游 agent 的记忆——"拿不准就不写"是穿着预算外衣的_salience 授权_。
