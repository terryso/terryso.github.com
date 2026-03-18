---
layout: post
title: "Rob Pike 的编程五原则"
date: 2026-03-18 19:32:59 +0800
categories: tech-translation
description: "Rob Pike 总结的五条编程黄金法则，涵盖性能优化、算法选择和数据结构设计，是每一位程序员都应该掌握的智慧结晶。"
original_url: https://www.cs.unc.edu/~stotts/COMP590-059-f24/robsrules.html
source: Hacker News
---

本文翻译自 [Rob Pike's 5 Rules of Programming](https://www.cs.unc.edu/~stotts/COMP590-059-f24/robsrules.html)，原载于 Hacker News。

---

Rob Pike 是编程界的传奇人物。他是 Unix 团队的早期成员、Plan 9 操作系统的核心开发者，也是 Go 语言的联合创始人。他在贝尔实验室和 Google 积累了数十年的编程经验，总结出了这五条简洁却深刻的编程原则。

这些原则看似简单，却蕴含着深刻的工程智慧。让我逐一解读。

## 原则一：你无法预判程序的瓶颈在哪里

> **Rule 1.** You can't tell where a program is going to spend its time. Bottlenecks occur in surprising places, so don't try to second guess and put in a speed hack until you've proven that's where the bottleneck is.

这是很多程序员——尤其是新手——最容易犯的错误。我们往往凭着"直觉"去优化代码，结果却发现真正的性能瓶颈完全在另一个地方。

举个例子：你可能花了一整天优化一个排序算法，结果发现程序 90% 的时间都花在了数据库查询上。

**实践建议：** 在动手优化之前，先用 profiler（性能分析工具）跑一遍，找到真正的热点。Go 语言内置的 `pprof` 就是一个很好的工具。

## 原则二：先测量，再优化

> **Rule 2.** Measure. Don't tune for speed until you've measured, and even then don't unless one part of the code overwhelms the rest.

这条原则是对第一条的补充。没有数据支撑的优化，就是盲人摸象。

在实际工作中，我见过太多"感觉这里会慢"然后就随手优化的情况。更糟糕的是，有些"优化"反而让代码变慢了——比如用复杂的数据结构替代简单的数组，结果在小数据量下反而更慢。

**实践建议：**
- 建立基准测试（benchmark）
- 使用性能分析工具
- 只有当某个代码段明显拖慢整体性能时，才值得优化

## 原则三：花哨的算法在小数据量下反而更慢

> **Rule 3.** Fancy algorithms are slow when n is small, and n is usually small. Fancy algorithms have big constants. Until you know that n is frequently going to be big, don't get fancy. (Even if n does get big, use Rule 2 first.)

这条原则特别扎心。我们在算法课上学了快速排序、红黑树、B+ 树，总想在项目中大展身手。但现实是：大多数情况下，n 都很小。

一个时间复杂度 O(n log n) 的"高效"算法，可能因为常数因子大，在 n < 100 时反而比 O(n²) 的"低效"算法更慢。

**Ken Thompson 的名言：** "When in doubt, use brute force."（拿不准的时候，就用暴力解法。）

**实践建议：**
- 先用最简单直接的实现
- 如果性能真的不够，再考虑换算法
- 这也符合 KISS 原则

## 原则四：复杂的算法更容易出 bug

> **Rule 4.** Fancy algorithms are buggier than simple ones, and they're much harder to implement. Use simple algorithms as well as simple data structures.

这条原则非常实在。复杂的算法意味着更多的边界情况、更难理解的逻辑、更难调试的问题。

我曾经见过一个开发者用各种设计模式和一个复杂的状态机来实现一个简单的业务逻辑。结果是：代码没人看得懂，出了 bug 没人敢改，最后只能重写。

**实践建议：**
- 优先使用标准库提供的数据结构和算法
- 能用数组就别用链表，能用 map 就别自己实现哈希表
- 代码是写给人看的，其次才是给机器执行的

## 原则五：数据结构为王

> **Rule 5.** Data dominates. If you've chosen the right data structures and organized things well, the algorithms will almost always be self-evident. Data structures, not algorithms, are central to programming.

这是我最喜欢的一条原则。Fred Brooks 在《人月神话》中也说过类似的话："Show me your flowcharts and conceal your tables, and I shall continue to be mystified. Show me your tables, and I won't usually need your flowcharts; it'll be obvious."

选对了数据结构，算法往往就自然而然地显现出来了。比如：
- 需要快速查找？用哈希表
- 需要保持有序？用平衡树或跳表
- 需要区间查询？用线段树或树状数组

**一句口诀：** "Write stupid code that uses smart objects."（写笨代码，用聪明对象。）

## 总结

Rob Pike 的这五条原则，本质上都在说一件事：**保持简单**。

| 原则 | 核心思想 |
|------|----------|
| 原则一 | 不要猜测瓶颈 |
| 原则二 | 测量后再优化 |
| 原则三 | 小数据用简单算法 |
| 原则四 | 简单就是好 |
| 原则五 | 数据结构是核心 |

原则一和二重申了 Tony Hoare 的名言："Premature optimization is the root of all evil."（过早优化是万恶之源。）

原则三和四则是 KISS 原则的具体体现。

原则五告诉我们：好的设计从好的数据结构开始。

在追求技术深度的路上，别忘了这些朴实无华却历久弥新的智慧。有时候，最简单的方案就是最好的方案。
