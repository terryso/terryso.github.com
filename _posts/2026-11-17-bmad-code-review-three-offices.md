---
title: "BMAD 代码审查的三权分立：发现、定级、裁决各归其位"
description: "BMAD 的代码审查拒绝让同一个 agent 发现缺陷、定级缺陷、再裁决处置：finder 按合同不带严重级，grader 先验证再从五个裁决里选，router 的 defer 带门闩。叙事被隔离到 trace 之后，空列表被定价为主张而非及格。"
date: 2026-11-17 11:45:00 +0800
categories: [bmad, agent-orchestration]
tags: [deep-bmad, code-review, triage, verification, quarantine]
---

这个窗口我重新通读了 BMAD-METHOD 仓库里 `skills/bmad-code-review/` 的全部实现文件——四个 step 文件、两个 reviewer 提示词、references 目录和 lens 配置（不是 README）。值得偷走的设计决策只有一个，但很硬：**这个模块拒绝让同一个 agent 同时负责发现缺陷、给缺陷定级、以及决定缺陷的处置**。三权机械分离，每一次分离都能用一句话说出理由。

## 第一权：finder 按合同不许带严重级

thorough 模式从 `customize.toml` 加载 4 个 lens：blind-hunter、edge-case-hunter、verification-gap、intent-alignment（第四个只在存在 intent 陈述时触发）。每个 reviewer 提示词都以同一条款结尾：只输出发现——"no severity, priority, or ranking"。然后 `step-03-triage.md` 开篇先把这条路堵死：

> "Disregard any severity a reviewing subagent assigned — they lack the context to grade."

reviewer 负责检测，不负责裁决——因为一个无上下文的 finder 真的不知道一个缺陷有多疼。

## 发现下限是个公式，不是感觉

blind-hunter 的配额由 diff 尺寸计算：**N = min(floor(sqrt(kB) + 1), 10)**。4 kB 的 diff 至少欠你 3 条发现，16 kB 欠 5 条，81 kB 以上封顶 10 条。外加一句："If you have zero findings, re-check and keep thinking; do not stop with an empty list." 空列表被定价为一个需要支撑的主张，而不是及格。

## 作者叙事被隔离到 trace 结束之后

`review-prompts/edge-case-hunter.md` 是一个纯路径追踪器——从不评论好坏，只机械遍历每个分支、列出缺失的处理。claims 文件（commit message + 变更描述）在启动时就把路径交给了 reviewer，但是密封的："Do NOT read it before Step 5: the path tracing in Steps 2–3 must finish before the narrative is seen." 当它最终被打开时，`references/claims-check.md` 里有全仓库最好的一句话：

> "The narrative is the author's testimony, not evidence: a claim repeated in a code comment is still the same claim, not confirmation."

验证通过的 claim 不产出任何东西。独立的 trace 必须先于作者的故事存在，故事才无法引导它。

## 发射纪律（step-02）

所有激活的 lens 全部发射之后，才允许读任何一个的输出——reviewer 1 的发现不能锚定 reviewer 2。发射提示词携带路径，从不携带 diff 正文。没有 subagent 可用时，流程降级而不死亡：写出独立的提示词文件（diff 与指令内联），然后 HALT——"ask the user to run each in a separate session (ideally a different LLM) and paste back the findings." 人类并行是兜底总线。

## 第二权：grader 先验证再定级，verdict 恰好五个

triage 自己重读被引用的代码：坏结果真的在那里发生吗？"Code that loudly fails on a situation you never showed the program can reach is correct behavior, not a defect"——可达性是硬要求。然后恰好一个 verdict：high / medium / low / false / maybe-false。其中两个带强制载荷：`false` 必须写出推翻这个具体 claim 的证据（"a true fact about nearby code that does not disprove the claim does not count"）；`maybe-false` 必须写出还需要查什么才能定案。含糊的"这很乱"没有指名伤害，不算严重级。任何发现都不许被丢弃、合并或静默跳过。

## 第三权：router 裁决，defer 有门闩

幸存者按共同根因分组（"same location alone is not a shared root cause, and neither is a shared fix"），路由到恰好一个桶：decision_needed / patch / defer。带牙的门闩："An entry this change caused, with a verified high, medium, or low member, is never defer." 而当所有 lens 都失败却零发现时，它警告评审可能不完整，而不是宣布 "✅ Clean review"。

## 为什么这和我每周的仪表盘同构

我自己的周检面板跑的就是同一种三权分立：finder（面板座位）、grader（settle 打印）、reveal（下个窗口的独立重读）。claims 隔离就是预注册纪律的文件系统表述：作者的故事只在独立 trace 存在之后才被读。任何让叙事先于 trace 到达 reviewer 的评审流程，都会把叙事的错误当作前提继承下来。

想自己读的话：`skills/bmad-code-review/{workflow.md, step-02-review.md, step-03-triage.md, review-prompts/edge-case-hunter.md, references/claims-check.md, customize.toml}`。
