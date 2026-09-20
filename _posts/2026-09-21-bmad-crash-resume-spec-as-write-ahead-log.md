---
title: "BMAD 的崩溃恢复语义：spec 文件就是一本预写日志"
date: 2026-09-21
categories: AI代理
tags: [BMAD, AI代理, 崩溃恢复, 写前日志, Agent Skills, 软件工程]
---

BMAD 的 `bmad-build` 必须解决一个大多数 agent 工作流直接跳过的问题：一次运行执行到一半死掉了，重启时对中断毫无记忆，会发生什么？答案藏在 `src/bmm-skills/ship/bmad-build/step-03-implement.md` 里——spec 文件兼任预写日志（write-ahead log），而它的规则读起来就像数据库恢复，因为它本质上就是。

## 四条规则

**1. 第一次改动之前先写基线。** Step 3 在做任何改动*之前*，把 `baseline_commit`（当前 HEAD，或 `NO_VCS`）写进 spec 的 frontmatter。如果这次运行在实现到 40% 时死掉，恢复的运行永远不需要猜"改动之前"是哪个状态——它在一切发生之前就已经落账了。

**2. 恢复时保留、绝不覆写。** 文件里写得明明白白："If the frontmatter already contains `baseline_commit` (resumed run), preserve the existing value — never overwrite it."（若 frontmatter 已含 baseline_commit——即这是一次恢复运行——保留原值，绝不覆写。）这就是幂等规则。恢复的运行如果重新执行基线捕获，会把基线挪到被中断的中间态上，此后算出的每一个 diff 都会悄悄漏掉那批孤儿半成品。**最危险的恢复 bug，是重新计算锚点的那一个。**

**3. 状态先于动作翻转。** 状态在实现开始*之前*就翻成 `in-progress` 写进 frontmatter，同一拍里 `sync-sprint-status.md` 同步 sprint 状态。工作的记录先于工作本身——运行若中途死掉，日志已经写明死在哪，不需要事后推断。

**4. 冻结合约，不冻结进度。** spec 中 `<frozen-after-approval>` 块内的内容对实现 agent 是只读的。恢复可以重写一切关于"怎么做"的内容，但一个字都不能动"约定了什么"——恢复的运行重新谈判的是执行，不是范围。

## 边缘处同样失败的关闭

失败关闭（fail-closed）分支把同一套哲学带到了边界上。spec 文件缺失 → HALT 并询问人类，绝不即兴发挥。矩阵测试审计（Matrix Test Audit）：一个覆盖测试"存在但没有运行——未注册、被过滤、被跳过或被禁用——视为缺失"。测试与 I/O 矩阵相矛盾 → "never edit the expectation to match the code: fix the code"（绝不修改期望去迁就代码：修代码），矩阵行本身有歧义就 HALT。姊妹文件 `compile-epic-context.md` 对输入做同样处理：epics 文件缺失 → 什么都不写、报告问题；规划产物缺失 → 产出部分结果并标注缺口——"Never hallucinate content to fill missing sections"（绝不编造内容来填充缺失的小节）。

## 底层的模式

恢复正确性不是打检查点。它是把每一个恢复时可见的事实分类为三选一：**动作前已落账（journaled-before-action）、单调（追加或保留、绝不重算）、或已冻结**。任何需要恢复的 agent 对自己的历史重新计算的东西，都是它给自己洗脑（gaslight）的邀请函。
