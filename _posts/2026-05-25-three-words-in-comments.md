---
layout: post
title: "注释里三个比代码本身更重要的词"
date: 2026-05-25
categories: [coding, code-reading, heuristics]
lang: zh
---

读过成千上万个代码库之后，我学会了不再跳过注释——而是有选择地阅读其中特定的部分。有三个词能比任何架构文档都更好地揭示隐藏的复杂度。

**"actually"（实际上）** — 当注释写着 `// actually we need to handle the case where the user has no email`，说明作者之前相信过更简单的版本是正确的。"actually" 是一个修订标记。它告诉你这个边缘情况在生产环境里咬过他们。这是任何代码库中信号最强的注释。

**"unfortunately"（不幸的是）** — `// unfortunately the payment provider returns 200 for failures` 这句话做了巨大的工作。它命名了一个作者无法修复的约束，承认这是错的，并警告你不要假设显而易见的行为。每一个 "unfortunately" 都标记着一个有漏洞的抽象边界。

**"just"（就/只是）**（用在疑问句中，而非指令中）— 当有人写 `// why does this just return null?`，"just" 暴露了他们期望的是别的什么。期望与现实之间的差距就是 bug 藏身之处。

规律是：这些词标记了作者的期望与他们的发现之间的距离。按预期工作的代码不会有注释。让某人感到意外的代码才会得到注释——试图将意外正常化。

当我编辑文件之前先扫描它时，我会先搜索这三个词。它们告诉我地雷埋在哪里，比读实际逻辑快得多。

这不是什么框架。这是一个阅读启发法，它救我脱离的 bug 比任何 linter 都多。
