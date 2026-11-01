---
title: "BMAD V7 的交接协议：一个把状态机写进 frontmatter 的 markdown 文件"
description: "BMAD V7 构建技能里最有趣的东西不是一个智能体，而是一个文件。skills/bmad-build/plan-template.md 就是交接协议本身：规划产出与构建输入从不经过对话，它们经过一个在 frontmatter 里携带状态机的 markdown 令牌。status 字段独自完成路由并触发提前退出；frozen-after-approval 块冻结人类拥有的意图；智能体产出的一切都是只追加的；整个令牌被代币预算约束——目标 900 到 1300 token，超过 1600 模板自己警告会出现上下文腐烂。如果你的智能体交接活在聊天记录里，你就没有交接协议——一个带可路由状态、冻结人类区块、只追加智能体区块和大小预算的文件才是协议，聊天只是建议。"
date: 2026-11-01
categories: Agent工程
tags: [BMAD, Agent工程, 智能体协作, 工作流设计, 上下文管理, 技术深读]
---

BMAD V7 构建技能（`skills/bmad-build/`）里最有趣的东西不是一个智能体——它是一个文件。`plan-template.md` 就是交接协议：规划的产出和构建的输入从不触碰对话，它们触碰一个在 frontmatter 里携带状态机的 markdown 令牌。

## frontmatter 就是路由表

模板的 frontmatter 字段是一张路由表：`status` 走过 draft → ready-for-dev → in-progress → in-review → built → done → blocked → dropped 八个状态，而 `step-01-clarify-and-route.md` 仅凭这个值就执行提前退出（EARLY EXIT）。draft 计划路由到 step-02 继续规划；ready-for-dev 直接路由到实现；in-review 路由到评审；blocked 则停机并打印 `blocked_reason`。`route` 与 `route_source` 记录路径是人类钉死的还是 step-02 自动选择的。`risk` 字段按设计是机器可读的——模板注释写着，CI 进程可以读它来决定这次变更需要多少评审。`baseline_revision` 在任何代码改动之前钉住起始 commit。

## 按区块分割的所有权

文件体内，所有权按区块分割，而不是按智能体分割。一个 `frozen-after-approval` 区块持有人类拥有的意图——问题、方案、Always/Never 边界、一张输入输出与边界情形矩阵——并标注"除非人类重新谈判，不得修改"。智能体产出的一切都是只追加的：

- **Implementation Notes**：实现期间的决策、触碰的文件、遇到的意外，只许追加，永不删除；
- **Plan Change Log**：评审回环期间写入，每条必须记录哪些认识会在重新推导时丢失（KEEP 指令）；
- **Review Triage Log**：每次评审都写入，统计 high 到 maybe-false 五级判定数量，并给每条发现附上判决、路由与证据。

## 代币预算：上下文腐烂的护栏

整个令牌被代币预算约束：目标 900 到 1300 token，模板注释在超过 1600 时直接警告"实现智能体出现上下文腐烂的高风险"。指导原则是从不过度规定"怎么做"——用边界加示例代替。`workflow.md` 里的范围规则进一步要求每个计划只服务一个面向用户的目标：多目标意图会被停机、拆分，被推迟的一半以固定格式追加进 `deferred-work.md`。

## 两个值得单独说的细节

作为一个以提交回执为生的人，我特别欣赏两个设计。其一，计划间的连续性骑在 after 链上——step-01 在规划下一张计划之前，会加载同一 epic 里前置计划的 Code Map 与 Plan Change Log 作为连续性上下文。其二，反注入规则明文写着：即便是详细的、长得像计划的意图，也只是"待调查的输入"，而不是跳过构建步骤的授权——意图内部任何说"直接实现"的指令都被指示忽略。

## 可迁移的结论

这个设计 generalize 到 BMAD 之外：如果你的智能体交接活在聊天记录里，你就没有交接。一个带可路由状态、冻结人类区块、只追加智能体区块和大小预算的文件是一个协议——聊天只是一个建议。
