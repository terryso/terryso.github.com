---
layout: post
title: "好的软件知道何时停止"
date: 2026-03-06 06:48:49 +0800
categories: tech-translation
description: "一篇关于软件设计哲学的文章，探讨为什么好的软件应该专注于核心功能，而不是无止境地添加新特性——尤其是不要把所有东西都 AI 化。"
original_url: https://ogirardot.writizzy.com/p/good-software-knows-when-to-stop
source: Hacker News
---

本文翻译自 [Good Software Knows When to Stop](https://ogirardot.writizzy.com/p/good-software-knows-when-to-stop)，原载于 Hacker News。

---

## 一个令人啼笑皆非的假想场景

早上 9 点，你准备升级你最爱的 Linux 发行版和软件包到最新版本。升级过程很顺利，重启后系统焕然一新。你开始像往常一样工作，当你尝试列出目录内容时，一件奇怪的事情发生了——那个你习以为常、平平无奇的 `ls` 命令给了你一个"惊喜"：

```
$ ls
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│ NOTICE: The legacy utility `ls` has evolved.                         │
│                                                                      │
│                      _ _                                             │
│                     / \   __| | ___                                  │
│                    / _ \ / _` |/ _ \                                 │
│                   / ___ \ (_| |  __/                                 │
│                  /_/   \_\__,_|\___|                                 │
│                                                                      │
│                 AI-Powered Directory Intelligence™                   │
│                                                                      │
│ Hello.                                                               │
│                                                                      │
│ The classic `ls` command has reached the end of its lifecycle.       │
│ For decades it faithfully listed files.                              │
│ But listing is no longer enough.                                     │
│                                                                      │
│ The filesystem deserves to be *understood*.                          │
│                                                                      │
│ Introducing:                                                         │
│                                                                      │
│ █████╗ ██╗   ███████╗                                                │
│ ██╔══██╗██║   ██╔════╝                                               │
│ ███████║██║   ███████╗                                               │
│ ██╔══██║██║   ╚════██║                                               │
│ ██║  ██║███████╗███████║                                             │
│ ╚═╝  ╚═╝╚══════╝╚══════╝                                             │
│                                                                      │
│                Adaptive Listing System                               │
│                                                                      │
│ `als` doesn't just show files.                                       │
│ It predicts which ones you meant.                                    │
│ It ranks them.                                                       │
│ It understands you.                                                  │
│                                                                      │
│ Your current `ls` binary will remain functional for:                 │
│                                                                      │
│                         30 days                                      │
│                                                                      │
│ After this period:                                                   │
│   • `ls` will be deprecated                                          │
│   • updates will cease                                               │
│   • directory awareness will be disabled                             │
│                                                                      │
│ You can begin your transition today:                                 │
│                                                                      │
│ $ als --trial                                                        │
│                                                                      │
│ (30-day free evaluation period)                                      │
│                                                                      │
│ Thank you for participating in the future of file awareness.         │
│                                                                      │
│                    — The `ls` Team (now part of ALS)                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

幸好，这只是个假想场景。

## 核心观点：软件需要边界意识

**好的软件知道自己服务于什么目的，它不会试图包办一切，它知道何时停止，知道该改进什么。**

对于人类这种"极简主义"不太友好的心理来说，最反直觉的一件事就是：认清你的软件在整个生态中的角色和位置，然后判断你接下来想做的事情是否符合所谓的"产品愿景"，还是说这只是另一个项目、另一个工具而已。

## 来自 37Signals 的智慧

对于我们这些"老程序员"来说，这类教训来自 37Signals（Basecamp 的创始团队）。他们写过两本很棒的书：《Rework》和《Getting Real》。我强烈推荐这两本书，尤其是《Getting Real》对产品设计非常有启发。这些经验可以总结为：

### 1. 约束是优势
小团队、紧预算、有限的范围——这些限制会迫使你做出更好的决策。不要羡慕大公司"无限的资源"，那是陷阱。

### 2. 忽略功能请求
不要用户说什么就做什么。相反，去理解他们真正想解决的问题是什么。用户说要"更快的马"，你要给他们汽车。

### 3. 尽早发布，频繁发布
一个真实存在、只完成了一半的产品，胜过一个完美但永远停留在 PPT 里的产品。Shipping 本身就是一种能力。

### 4. 核心优先设计
从最核心的界面和交互开始设计，而不是边缘的东西（导航、页脚等）。先做最重要的 20%。

### 5. 默认说不
每个功能都有隐藏成本：复杂度、维护负担、边缘情况处理。每一个 "yes" 都要付出代价。

### 6. 解决自己的问题
做你自己需要的东西。作为自己的用户，你会做出更好的决策。

## 当下的 AI 狂热

在 Minio 变成 AIStor、甚至 Oracle Database 都改名叫 Oracle AI Database 的今天，我觉得有必要提醒一下：**不是所有东西都必须剧烈改变，成为某个领域的既定标准，比把自己包装成没人预期的新热点更有价值。**

这种"万物皆可 AI 化"的风潮让我想起当年的"互联网+"——一切都要加上互联网，好像加上这个词就能点石成金。现在的 AI 也是一样，`ls` 不需要理解我，它只需要列出文件。数据库不需要 AI，它需要的是稳定、快速、可靠。

## 写在最后

作为开发者，我们很容易陷入"功能叠加"的陷阱。每次产品会议都在讨论"还可以加什么"，但很少讨论"可以删掉什么"或"应该拒绝什么"。

好的软件像好的设计一样，不在于还能加什么，而在于不能再减少什么。知道何时停止，可能比知道如何开始更重要。

---

**关键要点：**

- 软件应该有清晰的边界，专注于做好一件事
- 约束条件往往能激发更好的设计和决策
- 不是所有软件都需要 AI——有时简单就是最好的
- 学会对功能请求说"不"，专注于解决核心问题
- 成为某个领域的标准工具，比追逐热点更有长期价值
