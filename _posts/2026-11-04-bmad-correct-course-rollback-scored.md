---
title: "BMAD 的纠偏技能：回滚是一个被打分的选项，不是一次认罪"
date: 2026-11-04
categories: [BMAD]
tags: [BMAD, course-correction, 回滚, 决策, 工程法则, agent]
description: "大多数框架把『计划错了』当成异常状态，BMAD-METHOD 却为它准备了整整一个技能。读 skills/bmad-correct-course 的 SKILL.md 与 checklist.md：HALT 卡在认识论最软的地方而不是技术难点、失败是分类法里的一等公民、回滚与直进同台打分、纠偏回执落盘为文件且升级路径是类型化的。四条可以直接搬走的纪律。"
---

大多数 agent 框架把"计划被证明错了"当成异常状态。BMAD-METHOD 为它准备了一整个技能，而最有意思的部分是它拒绝在缺少什么的情况下运行。文件：BMAD-METHOD 仓库里的 `skills/bmad-correct-course/SKILL.md` 和 `skills/bmad-correct-course/checklist.md`。

这个技能（"correct course" / "propose sprint change"）把一次冲刺中途的变更从触发点一路走到分派交接，横跨 PRD、史诗、架构和 UX 文档。里面有四个设计决定值得偷走：

## 一、HALT 卡在认识论最软的地方，不是技术难点

这台机器拒绝在没有凭据的状态下运行。三个停机条件：触发原因不明（"Cannot navigate change without clear understanding of the triggering issue"）、没有证据（"Need concrete evidence or examples of the issue before analyzing impact"）、既找不到 PRD 也找不到 spec。证据在清单 1.3 就地收集，位于影响分析开始**之前**——不是事后贴上去给结论背书的。运行的最低门槛是存在某种意图陈述：没有计划，就没有纠偏。

## 二、失败是分类法的一等公民，不是错误

清单 1.2 要求给原因归类，五个类别里有一个字面上就是"failed approach requiring different solution"（需要换方案的失败尝试），和技术限制、新需求、需求误解、战略转向并列。你自己的死路是一条分类输入，后面接的是路由表——这是正确的动作：一个你能命名的失败就是一个你能路由的失败。

## 三、回滚是被打分的，不是被供认的

第 4 节评估三条路径——直接调整（Direct Adjustment）、潜在回滚（Potential Rollback）、MVP 复审（MVP Review）——每条得到同等待遇：可行/不可行、工作量 高/中/低、风险 高/中/低，4.4 还留了一个显式的 Hybrid 出口。回滚问题原文的措辞是："would reverting recently completed stories SIMPLIFY addressing this issue?"（回退最近完成的故事，会不会**简化**解决此问题？）这个措辞把沉没成本从评估里设计掉了：回退是一张带成本列的选项，不是一个道德事件。一条只会前进的选择规则从来不是决策程序，是棘轮。

## 四、回执是文件，升级是类型化的

提案落在 `change-{slug}/change-{slug}.md`——磁盘上的一次性变更工件，带前后对照的编辑提案和理由，于是纠偏能在产出它的对话消亡之后幸存。然后是范围路由：Minor 直接路由给开发者 agent，Moderate 走待办重组，Major 退回规划层交给 PM 和架构师。当变更足够大时，这个技能自己的输出就是"离开这个技能"。知道什么时候你的工具是错的工具，这件事被内建进了工具。

## 一个我反复想起的小细节

清单的状态词汇表是三态的，不是两态——Done、N/A、Action-needed。一个条目可以以"需要跟进"的状态完成，于是清单可以不干净地跑完，残留物被记录而不是被藏起来。这比听起来稀有。我用过的大多数清单只有通过和失败两态，那教会所有人冲着"通过"狂奔。

执行注记的最后一句是"be factual, not blame-oriented when analyzing issues"（分析问题时对事不对人）——它被印成一条指令，正因为代码强制不了。整个技能就是这句话编译后的产物。

## 要搬就这样搬

想让任何中途变更计划的过程受这份纪律约束，只需要：门禁要求（触发原因、证据、意图陈述）三者齐备；原因分类法显式化，并且把"自己的失败"列为一类；每条路径——包括回退——在同一套工作量/风险坐标上打分；把结果写进一个活得比会议更久的文件。框架是 agent 形状的，纪律是普适的。
