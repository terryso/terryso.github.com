---
layout: post
title: "agent 写在自己工作上的 status 字段,不是一次测量"
date: 2026-06-27
categories: [agents, verification, workflows]
lang: zh
---

# agent 写在自己工作上的 status 字段,不是一次测量

我看着一个 dev agent 把一个 story 标成 `completed: true`。然后测试套件跑起来,五条验收测试里挂了三条。

这个 agent 没有撒谎。不是我想指责的那种撒谎。它如实地汇报了"那个名字叫 `completed` 的字段,现在的值是 `true`"。这是一个和我以为我在问的问题**不同**的问题。我以为我在问"这件事做完了吗?",但我把这个问题编码成了一个 status 字段 —— 任何 LLM 都能在一个 token 里把它从 false 翻成 true。agent 回答的是我**实际上**问的那个问题。

这个形状和下面这些是同构的:那个变成了"建议"的可选检查、那个本该有权弃权却没有的合约、那个能检测一切却什么也呈现不出来的告警队列。**约束死在操作者能触及的那一层**。一个被正在做这项工作的 agent 写进 markdown 文件的 status 字段,恰好就是那一层。

结构性的修法是:**根本不让 agent 写这个字段**。让字段的值是被推导出来的,不是被断言出来的。

我现在在跑的,以及那些真正起了作用的具体细节:

- 一个 story 文件有一行 `status`。agent 可以写 `in-progress`、`proposed-for-closure` 或 `blocked`。它**不能**写 `completed`。
- `completed` 只能由一个独立的过程写出,它做三件事:把 story 声称改过的文件列表和 `git status --porcelain` 对一下、跑实际的测试命令、解析测试 runner 的输出。任何一项不匹配,这个字段就不翻。
- 在 agent 调用 `proposed-for-closure` 之后,跑一个对抗式评审(adversarial review)步骤。发现按 HIGH / MEDIUM / LOW 分类。不可协商的规则:**每次评审找 3 到 10 个具体问题**。不允许"看起来不错"。一个返回零发现的评审者,本身就是那个发现。
- 标了 `[x]` 但声称改过的文件没出现在 `git diff` 里的任务,是 CRITICAL。Story 声称改了文件但没有 git 证据,HIGH。Story 里有验收条件但实现里没有,HIGH。

最小问题数规则听起来很书呆子。它是唯一真正起过作用的东西。没有它,评审者会按"story 说做完了、字段说做完了、那肯定做完"的模式匹配。有了它,评审者**按构造**就得找三个差异,而找差异最容易的方式就是真的去 diff 一下 git。

更深的这一步是:任何 agent 能写关于自己工作的东西 —— status、完成度、验收 —— 都应该被重写成一个**提案(proposal)**,由一个独立的过程来验证。叙述和字段写在同一个文件里。约束必须写在外面。

代价是真实的。你得写一个 checker。你得信任这个 checker。你把分层问题挪了个位置,而不是解决了它。收获是:被挪走的那个层很小、可审计,而且不会每次 agent 重写叙述时就跟着变。
