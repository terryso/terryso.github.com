---
title: "当人类离开房间时 BMAD 到底改了什么：build 与 build-auto 逐文件对照"
date: 2026-11-13 18:30 +0800
categories: [BMAD, AI工程]
tags: [bmad, code-review, 自动化, agent-workflow]
---

今天把 BMAD-METHOD 里的 `skills/bmad-build/` 和 `skills/bmad-build-auto/` 从头到尾读了一遍。这两个技能几乎是双胞胎——同样的流水线形态（clarify-and-route → plan → implement → review）、同样的路由选项（oneshot/full/auto）、几乎相同的 "Ready for Development" 标准。它们之间的差异本身就是一份无人值守工作设计文档。四处改动，每一处都承重：

## 1️⃣ 检查点变成持久化写入

`bmad-build/workflow.md` 写的是 "ALWAYS halt at checkpoints and wait for human input"（永远在检查点停下等待人类输入）。而 `bmad-build-auto/workflow.md` 用一套 HALT 协议取代了"等待"——在停止**之前**先把状态写下来：

- 来自 ticket 树的任务：`uv run _bmad/method/scripts/tickets.py mark <ticket> blocked --blocked <condition>` 会把 `status`、`blocked_at`、`blocked_reason` 写进计划文件（不存在就创建）；
- 其他情况：创建 `bmad-build-auto-result-<slug>.md`，带 status frontmatter。

阻塞条件变成了后续运行可以恢复的数据，而不是随会话蒸发的一场对话。

## 2️⃣ 并发变成屏障同步，理由写得很明白

整个文件里最有力量的一段话：

> "Launch all the subagents a step calls for in one message — several blocking calls awaited together in the same turn — then wait for all their results… Never run a subagent in the background / detached / async (e.g. run_in_background: true), and never end your turn to 'await a completion notification.' This workflow runs unattended: there is no event loop to resume a yielded turn, so a backgrounded subagent never hands control back and the run stalls."

译：把一步所需的全部子代理放在**同一条消息里**启动——若干阻塞调用在同一轮一起等待——然后等齐所有结果再继续。绝不要在后台/分离/异步运行子代理，绝不要结束当前轮去"等完成通知"。这个工作流无人值守运行：没有事件循环来恢复一个让出控制的轮次，后台化的子代理永远交不回控制权，整个运行就卡死了。

而且如果子代理根本不可用，它不会一瘸一拐地继续——而是 HALT blocked，阻塞条件写 `no subagents`。做不对就带张字条停进车位，而不是静默降级。

## 3️⃣ 人类原本随身携带的审计轨迹变成必填字段

build-auto 的 oneshot RFD 标准多了一条："its route choice and reason are recorded"（路由选择及理由被记录）。full-plan 标准多了一整条新判据——**Surface-anchored**（表锚定）："ACs observe the outermost surface the intent references — never a more internal proxy for it"（验收标准观察的是意图所指的最外层表面，永远不是更内部的代理物）。

在有人值守的技能里，你的眼睛就是"验收标准测的是被要求的东西"这道检查。无人值守时，这道检查必须以成文规则存在。

## 4️⃣ 恢复变成以计划状态为键的状态机

`step-01-clarify-and-route.md` 纯按计划文件的 status frontmatter 路由：

| status | 去向 |
|---|---|
| `draft` | → plan |
| `ready-for-dev` / `in-progress` | → implement |
| `in-review` | → review |
| `blocked` / `dropped` | → HALT，状态原样保留（这类 halt "writes nothing, so the plan keeps its first reason"） |
| `built` / `done` | → 以 `followup_pass=true` 开一轮全新 review |

git 树脏或分支不匹配 → HALT blocked。status 字段**就是**恢复日志；被打断的运行只损失墙上时钟。

另有一个终端钩子——`{{ workflow.on_complete }}`——退出前执行的可选最终指令，无人值守运行可以借此链到下一件事。

## 结论

没有一处改动是"把人类步骤删掉"。每一个人类接触点都被替换成：一次持久化写入、一道同步屏障、或一条被记录的决策。**在场是一个特性；去掉它并不会删掉成本，只会把成本转换成协议。**

📄 涉及文件：`skills/bmad-build/workflow.md` · `skills/bmad-build-auto/workflow.md` · `skills/bmad-build-auto/step-01-clarify-and-route.md`
