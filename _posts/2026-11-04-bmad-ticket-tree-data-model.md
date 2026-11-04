---
title: "BMAD V6 的工单树：id 从不命名文件、状态从不写进工单、漂移是一条查询"
date: 2026-11-04
categories: [BMAD]
tags: [BMAD, 工单树, 数据模型, 验证, 工程法则]
description: "拆解 skills/bmad-ticket 的真实数据模型：上下文相对的稳定 id、内容真相与状态真相分文件存放、tickets.toml 表序即构建序，以及一个把验证交给"没参与起草的读者"的校验层。四条可以偷走的账本纪律。"
---

我原本以为 `skills/bmad-ticket/` 里装的是个故事模板。读完才发现它不是模板——是一个自带敌意读者的小型数据模型，其中三条法则值得任何工单体系直接偷走。

## 模型本体

结构在 `skills/bmad-ticket/SKILL.md` 里定义得很清楚：一个 initiative 文件夹装着 initiative 文件加 `tickets.toml`；每个 epic 是一个文件夹，装自己的文件、自己的 `tickets.toml` 和全部子项。`tickets.toml` 里的一条 entry 就是一个"已规划但无需文件即可存在"的叶子——给它 `id`、`covers`（需求编号）、`after`（前置项），构建时直接读 entry 加 epic 就能开工。`tickets.py pull` 只在有人要评审或发布时才把文件实体化。状态从 `planned` 起步，全集五个值：planned、backlog、in-progress、review、done、dropped。

## 法则一：身份是上下文相对的，且永远不是文件名

id 一次性分配、永不复用，在 epic 内部叫 `3`，从别的 epic 看就叫 `2.3`。任何文件或文件夹名都不携带 id：文件名是标题 slug，所以改标题会改文件名，id 却原封不动。新 id 从 `tickets.py status <folder>` 读 `next_id` 获得——手工分配按定义就是 bug。

## 法则二：内容真相与状态真相是两个文件

叶子文件是"这个工单是什么"的真相；构建持有的旁边那个 `<type>-<slug>-plan.md` 是状态、阻塞和负责人的真相。"不要往叶子文件里写 status"是硬规则，而且 plan 永远不推送 tracker。一个字段类、一个写者、一个位置。

## 法则三：表序即构建序，id 不是

`tickets.toml` 里表格的顺序就是构建顺序；排序靠位置加 `after`，永远不靠 id 大小。

## 敌意读者

`tickets.py status` 返回的不是列表，而是一组漂移类别：`problems`、`drift`、`unpinned_after`、`undeclared_after`、`order_conflict`。你的树是否自洽不靠记忆——问一次，答案是带类型的。

而我最想先搬走的部分：校验层（`references/validate.md`）由"**不在本对话中的子代理**"执行。起草上下文被刻意排除——新鲜读者走五个范围（Ticket、Set、Tree、Dependencies、Closure），因为 `tickets.py` 只校验写下来的前置项；恰好是"漏写的前置项"要靠外部代理去发现。发现被分成三类：fix（机械修复）/ suggest（带理由的准则）/ ask（交还用户），被拒绝的建议一旦记成 `Decision:` 行就不再重提，除非新证据动摇其根基。"这一步永远运行；没有任何路径、模式或设置能跳过它。"

## 剥掉名字之后

这是一套账本纪律：身份与命名分离、状态与内容分离、一致性靠计算而非记忆、验证交给写作时不在场的读者。最后一条最稀缺——多数团队都在让作者自己校对自己的树。
