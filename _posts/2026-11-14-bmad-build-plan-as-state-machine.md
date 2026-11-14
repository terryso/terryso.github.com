---
title: "计划文件就是状态机：通读 BMAD 的 bmad-build"
date: 2026-11-14 17:55 +0800
categories: [Agent工程, BMAD]
tags: [bmad-method, agent-orchestration, state-machine, code-review, llm-agents, workflow-design, developer-experience]
---

今晚 fresh read 了 bmad-code-org/BMAD-METHOD —— 这次读的是 skills/bmad-build，v6 的执行核心。大多数 agent 框架把工作流状态放在编排者的脑子里（也就是说：它的上下文窗口里）。bmad-build 把状态持久化在计划文件的 frontmatter 里，于是每个入口点都变成对这台状态机的一次路由。

## 计划文件就是状态机

skills/bmad-build/plan-template.md 携带 `status: draft|ready-for-dev|in-progress|in-review|built|done|blocked|dropped`，外加 `baseline_revision`、带 `route_source: pinned|auto` 的 `route`、`risk: low|medium|high`（文档原话："a CI process can read it to decide how much review the change gets"）、`lenses_ran: []`、`review_loop_iteration: 0`。step-01-clarify-and-route.md 读取 status 然后提前退出到匹配的步骤；`blocked` 打印它的 `blocked_reason` 并停机。恢复是一次查表，不是一次历史重放。

## 范围用 token 定价，不用故事数

每个计划目标 900–1300 token；"above 1600 = high risk of context rot"；低于 900 则有歧义风险。路由选择是数值化的（customize.toml）：估算变更行数 —— ≤100 行 → oneshot，否则 full；超过五个文件且并非简单或机械 → 考虑升级为 full。两个限制都不是闸门；都是风险等级。

## 实现者是上下文无关的

交接（handoff）启动一个没有先前对话的子 agent，它的完整提示只有一句话：读计划文件，它是唯一事实来源，开始前加载其 frontmatter `context:` 里列出的每个文件。编排者被明确告知**不要**把目标或验收标准复述进派发提示里 —— 复述正是漂移进入的地方。

## diff 是文件，永远不是粘贴

评审透镜收到的是 {diff_file}、{claims_file}、{plan_file} 的绝对路径；唯一的内联载荷是冻结的 Intent 段，而且只给 intent-alignment 透镜。thorough 评审跑四个透镜 —— blind-hunter、edge-case-hunter、verification-gap、intent-alignment —— 全部在读任何输出之前先启动。blind-hunter 带发现下限：N = min(floor(sqrt(kB) + 1), 10)，kB 是 diff 的千字节数 —— 零发现意味着回去再查、继续想。还有反污染排序：edge-case-hunter 拿到 claims 文件但在自己的路径追踪完成之前禁止读它 —— "the claims cannot steer it retroactively; claims are testimony, not evidence"（主张是证词，不是证据）。

## 评审者不许打分

发现只返回位置 + 问题，没有严重度；分诊（triage）被指示无视评审者给的任何严重度 —— "they lack the context to grade"（他们缺少打分所需的上下文）。五个裁决：high / medium / low / false（写下什么驳倒了它）/ maybe-false（写下什么能定案）。然后四条路由：intent_gap（根因在冻结的 intent 之内 → 回滚、与人重新协商）、bad_plan（在冻结线之外 → 提取 KEEP 指令、回滚、附 Plan Change Log 修订）、patch（按名字或 id 重新唤起**同一个**实现子 agent —— "a fresh launch is not re-engagement"）、defer（只增不改的 deferred-work.md）。review_loop_iteration 超过 5 → 停机并上报。恢复的评审里，已分诊的发现标记为 `carried` —— 同位置、同主张、代码未变，永不重补。

## 文档自己标注的锐利边缘

Matrix Test Audit 把"存在但没有跑过"的覆盖测试 —— 未注册、被过滤、被跳过、被禁用 —— 算作缺失，并禁止编辑期望值去迁就代码；没有子 agent 的环境把每个引用文件内联进每个透镜的提示文件然后停机，让人来跑，"ideally in a different LLM"（最好换个 LLM）。透镜指令不可读意味着报告失败 —— "never report a clean review for content you could not read"（永远不要为你读不到的内容报告一次干净评审）。

## 不 adoption 框架也能拿走的东西

把你的工作产物变成一个 frontmatter 就是工作流状态的 markdown 文件；每次入口对它路由；给实现者一个路径而不是一份简报；diff 按引用评审、绝不粘贴；禁止评审者给严重度、把定级集中在分诊；给循环设上限。诀窍不在 harness —— 而在于"状态进文件"让每一次恢复、每一次评审、每一次循环回跳，都能被任何会读文件的东西审计。
