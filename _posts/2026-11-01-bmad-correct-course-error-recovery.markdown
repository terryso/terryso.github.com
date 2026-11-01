---
title: "BMAD 的错误恢复路径拒绝直接修复：correct-course 把冲刺中途的意外变成一份被路由的提案"
description: "读了 BMAD-METHOD 仓库里的 skills/bmad-correct-course/SKILL.md 和 checklist.md——这是 BMAD 对'agent 在冲刺中途发现计划错了'这个问题的回答，而它中心的设计选择是：工作流被禁止直接把它修掉。激活时通过 _bmad/scripts/resolve_customization.py 解析 workflow 块，合并三层 TOML（base → team → user：标量覆盖、表深度合并、按 code/id 键控的表数组替换匹配项并追加其余）。六步流程：触发 → 清单 → 编辑提案 → 冲刺变更提案 → 路由 → 完成。三个值得偷走的细节：其一，没有证据就 HALT——清单第一节要求触发故事 ID、按五模式分类法（技术限制/新需求/需求误解/战略转向/方案失败）归类的问题陈述、以及具体例证；其二，每个清单项带三态状态（[x] 完成 / [N/A] 跳过 / [!] 需行动），第四节给三条路径（直接调整、回滚、MVP 复审）各打高/中/低的工时与风险分，理由明确包含团队势能；其三，出口是一张路由表而非一个动作——范围被分类为 Minor→Developer agent、Moderate→PO/DEV 待办重组、Major→PM/架构师重规划，每类交付物不同，输出落在 {output_folder}/{active_initiative}/change-{slug}/change-{slug}.md，紧挨着它所修订的计划。执行注记直说了：'实事求是，不指向 blame'。对比朴素 agent 的恢复方式——改代码、让 PRD/架构/工单悄悄失同步、计划文档永远错下去——这里失同步本身就是交付物：一份逐工件的 before/after 编辑提案。"
date: 2026-11-01
categories: Agent运维
tags: [BMAD, Agent运维, 工作流设计, 错误恢复, 变更管理]
---

读了 BMAD-METHOD 仓库里的 `skills/bmad-correct-course/SKILL.md` 和 `checklist.md`——这是 BMAD 对"**agent 在冲刺中途发现计划错了**"这个问题的回答，而它中心的设计选择是：工作流被禁止直接把它修掉。

## 机制

激活时通过 `_bmad/scripts/resolve_customization.py` 解析 workflow 块，按 **base → team → user** 三层合并 TOML：

- 标量覆盖
- 表深度合并
- 按 `code`/`id` 键控的表数组：替换匹配项、追加其余
- 其余数组一律追加

一份精确到可以直接引用的合并规范。然后是六步：触发 → 清单 → 编辑提案 → 冲刺变更提案 → 路由 → 完成。

## 三个值得偷走的细节

**一、没有证据就 HALT。** 清单第一节要求：触发故事 ID、按五模式分类法（技术限制 / 新需求 / 需求误解 / 战略转向 / 方案失败）归类的问题陈述、以及具体例证——"在分析影响之前需要问题的具体证据"。没有凭感觉转向这回事。

**二、三态状态 + 打分。** 每个清单项带 `[x] Done / [N/A] / [!] Action-needed` 三态；第四节给三条路径——直接调整、回滚、MVP 复审——各打高/中/低工时与风险分之后才推荐一条，且理由里明确写了**团队势能**，不只是时间线。

**三、出口是路由表，不是动作。** 范围被分类：

| 范围 | 路由到 | 交付物 |
|------|--------|--------|
| Minor | Developer agent | 最终编辑提案 + 实施任务 |
| Moderate | PO / DEV | 变更提案 + 待办重组计划 |
| Major | PM / 架构师 | 完整变更提案 + 升级通知 |

输出落在 `{output_folder}/{active_initiative}/change-{slug}/change-{slug}.md`，紧挨着它所修订的计划文档。

## 为什么这有意思

执行注记把话说白了："be factual, not blame-oriented"——实事求是，不指向 blame。对比一下朴素 agent 的恢复方式：改代码、让 PRD、架构文档和工单悄悄失同步、计划文档永远错下去。而在这里，**失同步本身就是交付物**：一份逐工件的 before/after 编辑提案，每条变更带理由。

对任何跑多 agent 计划的人，一个真诚的问题：你对"计划被证明是错的"有任何书面流程吗——还是你的 agent 只是即兴发挥修复？
