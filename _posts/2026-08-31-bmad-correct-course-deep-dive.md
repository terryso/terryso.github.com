---
layout: post
title: "BMAD Correct Course 深读:强迫你为不会采用的回滚方案标价"
date: 2026-08-31
categories: [agents, bmad, workflow]
lang: zh
---

# BMAD Correct Course 深读:强迫你为不会采用的回滚方案标价

今天读了 BMAD 冲刺变更工作流的源码——main 分支上的 `src/bmm-skills/ship/bmad-correct-course/`:SKILL.md(6 个步骤)+ checklist.md(6 个小节、26 个检查项)。有意思的设计决策不在清单本身,而在第 4 节:它强制并行评估三条路径——选项 1 直接调整(Direct Adjustment)、选项 2 回滚(Rollback)、选项 3 PRD/MVP 复审——每条都用 工作量[高/中/低] × 风险[高/中/低] × 可行/不可行 标价,**然后**才允许在检查项 4.4 里做选择。哪怕房间里所有人都已经知道你不会回滚,你也必须写下"撤销最近完成的几个 story 要付出什么代价"。那个被标了价却未被选中的选项,正是防止"顺手加个 story 继续干"成为默认路径的东西。最终选择甚至可以是混合(Hybrid)。

## 三个即使不用 BMAD 也值得偷走的机制

**1. 三态清单状态。** 每一项记录 Done / N/A / Action-needed——不是打勾框。"N/A" 是一等公民式的已记录决策:变更提案自带一份"这次变更明确**不**触碰什么"的书面轨迹。这正是你日后审计爆炸半径的方式——"部署脚本在这次变更里被标了 N/A……当时标对了吗?"

**2. 作为 HALT 条件的证据门。** 第 1 节在"缺少具体证据或示例"时直接 HALT。步骤 1 同样在触发原因不明、或 PRD/Epics 缺失时 HALT。这个工作流拒绝基于感觉做影响分析——没有报错信息、没有干系人原话、没有失败方案的证据,就不会生成任何提案。

**3. 作为路由表的范围分类。** 步骤 5:Minor → Developer agent 直接实现;Moderate → PO/DEV 附带 backlog 重组计划;Major → PM/Architect 重新规划 + 升级通知。变更管理是分发(dispatch),不是开会。提案落在 `{planning_artifacts}/sprint-change-proposal-{date}.md`——一个带日期的序列,项目因此积累出每次航向修正及其代价的审计轨迹。

## 两个我喜欢的小细节

- 每条编辑提案都写成 OLD → NEW,带 story ID 和理由;在 Incremental 模式下逐条设门(Approve/Edit/Skip),Batch 模式则打包评审。
- 工作流字面上的最后一个动作,是运行 `uv run resolve_customization.py --skill {skill-root} --key workflow.on_complete`——一个按仓库自定义的钩子,定义"任何航向修正之后必须发生什么"(重新生成文档、通知某人、重跑检查)。

## 它对抗的反模式

冲刺中段的现实与计划分叉,有人悄悄把 story 打了补丁,然后 PRD 和架构文档安静地腐烂成虚构作品。Correct Course 的答案是摩擦——让便宜的路(静默补丁)变贵,让昂贵的路(完整影响盘点)变成例行公事。

*(路径已对照今日的 BMAD-METHOD 仓库树核实——该仓库近期重构过;包括我自己的旧博文在内的早期资料引用的路径已失效。)*
