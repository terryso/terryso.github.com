---
layout: post
title: "text-wrap: pretty 的排版问题"
date: 2026-02-25 11:46:53 +0800
categories: tech-translation
description: "Safari 率先实现了 CSS 的 text-wrap: pretty 属性，但当它与 text-align: justify 配合使用时，会出现空白间距过大的问题。"
original_url: https://matklad.github.io/2026/02/14/justifying-text-wrap-pretty.html
source: Hacker News
---

本文翻译自 [Justifying text-wrap: pretty](https://matklad.github.io/2026/02/14/justifying-text-wrap-pretty.html)，原载于 Hacker News。

---

2025 年，软件开发界发生了一件真正具有里程碑意义的事件：Safari 发布了一个相当靠谱的 `text-wrap: pretty` 实现。详见 [WebKit 官方博客](https://webkit.org/blog/16547/better-typography-with-text-wrap-pretty/)。我们正在逐步接近 15 世纪的前沿技术——漂亮的段落排版！

不过，还没完全到位，所以有了这篇 bug 报告。

## 背景知识：换行算法

把文本断成一行行、组成指定宽度的段落，最朴素的方法是**贪心算法**：如果下一个单词能放进当前行就放，放不下就换行。结果通常不太美观——有时候为了整体平衡，应该尝试把多一个单词挤进当前行。

约翰内斯·古腾堡（Johannes Gutenberg）当年就是手工做这种调整，才能产出如此精美的印刷品。1981 年，Knuth 和 Plass 发明了一种方法，用**动态规划**让计算机也能智能换行，这就是 TeX 排版系统的基础。

令人费解的是，直到 2025 年，浏览器们还在用那个朴素的贪心算法，让几代网页用户忍受丑陋的排版。公平地说，浏览器面临的问题确实比古腾堡、Plass 和 Knuth 解决的更难。在印刷中，页面大小是固定的，可以离线计算最优换行。而在 Web 环境下，窗口宽度是任意的，甚至动态变化，所以换行必须是"在线"计算。

另一方面，21 世纪的浏览器算力可比 1980 年甚至 1450 年强多了！

## text-wrap: pretty 与 text-align: justify 的组合问题

让每行字符数大致相等，只是迈向漂亮段落的一半。无论怎么努力，行长都不会完全一致。所以，如果你想让左右两边都对齐，还需要微调单词之间的空格。

在 CSS 中：
- `text-wrap: pretty` 让浏览器智能选择断行点，使各行大致等长
- `text-align: justify` 调整空白，让各行精确等长

虽然 Safari 是第一个发布非玩具级别 `text-wrap` 实现的浏览器，但它与 `text-align` 的组合效果很糟糕。空白被撑得不成比例。来看同一个两端对齐段落的对比：

- 贪心算法换行时，段落看起来还行
- "智能"算法决定给段落多加一整行，这就需要按比例撑大所有空白

单独使用以下任一代码都没问题：

```css
p {
  text-wrap: pretty;
  text-align: justify;
}
```

问题出在两者组合时。

## 问题原因分析

这个行为是实现的自然结果。我的理解是：动态规划的评分函数目标是让每行接近目标宽度，偏离会被惩罚。关键在于，段落的最大宽度是固定的：一行可以任意短，但不能超长，否则会溢出。

因此，动态规划把目标宽度设得比段落宽度略窄一点。这样既可能低于目标，也可能高于目标，整体平衡更好。原文说：

> 浏览器目标是比文本框最大限制更早换行。它在范围内换行，一定在洋红色线之后，一定在红色线之前。

但如果你随后把所有内容都对齐到红色线（最大宽度），系统性的"留白"就会表现为单词间距过大！

## 结语

WebKit 开发者们，你们能率先发布这个功能太棒了，请修复这个小问题，让我能把博客排版成我一直想要的样子 ;-)

---

**关键要点：**

1. `text-wrap: pretty` 使用类似 TeX 的动态规划算法优化换行，比传统贪心算法效果好
2. Safari 2025 年率先实现了这一 CSS 特性
3. 当前实现的 bug：与 `text-align: justify` 配合时，由于目标宽度设置略窄，导致单词间距被过度拉伸
4. 解决方案需要浏览器调整算法，让 `text-wrap: pretty` 能感知后续的 `text-align: justify` 设置
