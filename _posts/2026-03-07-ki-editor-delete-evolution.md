---
layout: post
title: "Ki Editor 删除操作的六次演进"
date: 2026-03-07 20:43:33 +0800
categories: tech-translation
description: "本文深入解析 Ki Editor 中删除操作（Delete）如何经历六次版本迭代，从最初的选择模式特定行为演进到最终的 Momentary Layer 设计，展现了结构化编辑器在用户体验设计上的深度思考。"
original_url: https://ki-editor.org/
source: Hacker News
---

本文翻译自 [Ki Editor Blog](https://ki-editor.org/blog)，原载于 Hacker News。

## Ki Editor 简介

Ki Editor 是一款**多光标结构化编辑器**（multi-cursor structural editor），它的核心理念是让开发者直接操作语法结构，而不是通过繁琐的鼠标或键盘操作来间接达成目标。

主要特性包括：

- **语法节点交互**：直接操作语法结构，弥合编码意图与操作之间的鸿沟
- **多光标支持**：支持多光标并行操作语法节点，大幅提升批量编辑和重构效率
- **选择模式（Selection Modes）**：标准化跨单词、行、语法节点等不同粒度的移动操作

---

## 删除操作的六次演进

在本文中，作者详细讨论了删除操作（Delete）如何在多次迭代后达到当前的最终形态。这个过程体现了 Ki Editor 团队对用户体验的极致追求。

### 版本 1：选择模式特定行为

在初始版本中，Delete 的行为与 Vim/Kakoune 等模态编辑器有显著不同。

**传统编辑器（Vim/Kakoune）的行为：**

```
foo [bar] spam
→ 删除后
foo [ ]spam
```

**Ki Editor 版本 1 的行为：**

```
foo [bar] spam
→ 删除后
foo [spam]
```

可以看到，Ki Editor 有两个特点：
1. `spam` 被自动选中
2. `bar` 和 `spam` 之间的空格也被删除

这样设计的目的是让用户可以通过重复执行 Delete 来轻松删除下一个单词。

但这个版本存在一个问题：Ki 有两种横向移动方式：
- **Left/Right**：跳过不重要的选择（insignificant selections）
- **Previous/Next**：不跳过不重要的选择

在 Word 选择模式下，标识符如 `snake_case`、`kebab-case`、`camelCase` 是重要的，而符号如 `-`、`::`、`/` 是不重要的。

如果 Delete 使用 Left/Right 移动，会出现意外的删除：

```
spam[foo].bar
→ 执行 Delete 后
spam[bar]  // . 和换行符也被删除了！
```

如果使用 Previous/Next 移动，在语法节点选择模式下又会有问题：

```
fn main([x: X], y: Y, z: Z) {}
→ 使用 Previous/Next 删除后
fn main([,] y: Y, z: Z) {}  // 逗号没被删除，语法可能无效！
```

因此，版本 1 不得不针对不同的选择模式使用不同的横向移动策略——这违背了 Ki 的一致性设计原则。

### 版本 2：解决不一致性

参考提交：[b6747ec](https://github.com/ki-editor/ki-editor/commit/b6747ecb07130aedb8edd53392936d878db55108)

@vishal 发现 Delete 在不同选择模式下的行为不一致，建议统一行为——因为**一致性**是 Ki 的核心设计原则之一。

在这个版本中，Delete 统一使用 Left/Right 移动。同时引入了一个新动作 **Delete 0 Gap**，用于需要使用 Previous/Next 移动的场景。

但问题是，Delete 0 Gap 绑定在 shift 层，使用起来不够便捷。

### 版本 3：删除子模式（Delete Submode）

在 [这个提交](https://github.com/ki-editor/ki-editor/commit/2bc355ba22783abe3541a425462c396ac3fb571b) 中，@vishal 引入了 Swap Cursor 来反转 Delete、Paste、Open 等动作的方向。

这意味着 Delete Backward（原本需要 shift 键）被移除了——只需要先执行 Swap Cursor，再执行 Delete 即可。

但这也带来了新的问题：要向后删除且使用 Previous/Next 移动，需要三个步骤：
1. Swap Cursor
2. 按 shift 执行 Delete 0 Gap
3. 很繁琐

为了解决这个 ergonomics（人体工学）问题，在 [fa09130](https://github.com/ki-editor/ki-editor/commit/fa09130cf93945c60550849ed76a8e590ceaef93) 中，Delete 被改造成了一个**子模式**（submode）。

作为子模式，所有类型的删除操作都需要相同的步骤——最少 3 步：
1. 进入 Delete 子模式
2. 执行移动
3. 退出 Delete 子模式

### 版本 4：所见即所得

虽然让所有删除操作同等便捷解决了一个问题，但也意味着它们**同样繁琐**。

> As currently although Space solves for unergonomic of esc on normal keyboards, the delete submode's Action Motion Motion feels a bit tiring tbh.
> — Vishal

为了解决这个问题，同时保留删除间隙（gap）的能力，这个版本引入了两个新动作：**Expand Forward** 和 **Expand Backward**。

**Expand Forward** 将当前选择向右扩展，直到刚好在 Right 选择之前：

```
foo [bar] spam
→ 执行 Expand Forward 后
foo [bar ]spam
```

有了这个改变，Delete **不再自动删除间隙**。你选什么，就删什么——没有意外，没有惊喜。

这引出了一个问题：删除后，下一个选择还会被自动选中吗？

**会的**，但只有在删除当前选择后，即将到来的选择会占据相同的范围时才会。

这确保了光标位置（选择的起点）在执行 Delete 后不会改变。

例如，在 Word 选择模式下：

```
foo [bar ]spam
→ 执行 Delete 后
foo [spam]  // spam 被选中，因为其首字符位置与光标位置重叠
```

但如果初始状态是：

```
foo [bar] spam
→ 执行 Delete 后
foo [ ]spam  // 只有 bar 后面的空格被选中
```

这个版本将最少步骤从 3 步减少到了 1 步：
- 向前删除（不含间隙）：1 步
- 向前删除（含间隙）：2 步（先 Expand Forward）
- 向后删除（不含间隙）：2 步（先 Swap Cursor）
- 向后删除（含间隙）：3 步（先 Expand Backward，再 Swap Cursor）

但版本 4 有两个问题：
1. 除非先执行 Expand Selection，否则当前选择和相邻选择之间的间隙不会被删除
2. 相邻选择不会被选中，打破了操作流程

### 版本 5：删除即菜单（Delete as Menu）

版本 3（Delete 子模式）在**有效性**（effectiveness）方面已经很好了——用户可以准确执行他们想要的操作。

唯一的缺点是**懒惰**（lethargy）：一个简单的包含间隙的删除需要至少 3 次按键（`v → space`），其中最后一个键用于退出子模式。

为了让 Delete 更轻松，团队决定将 Delete 改为**菜单**而不是子模式。

关键区别：
- **菜单**在选择一个选项后自动关闭
- **子模式**保持激活状态直到显式退出

这意味着一个简单的包含间隙的删除现在只需要 2 次按键：`v →`。

代价是你不能在一次调用中链式执行多次删除。但这可以通过 Extend 动作（`g`）来补偿。

例如，要删除两个选择：
- **使用 Delete 子模式**：进入 Delete 子模式 → Right → Right → 退出 Delete 子模式
- **使用 Extend + Delete 菜单**：Extend → Right → 打开 Delete 菜单 → Right

由于大多数删除只涉及一个选择，菜单方法对于常见情况更高效，同时保留了 Delete 子模式供喜欢链式删除的用户。

### 版本 6：Momentary Layer（瞬时层）

**Momentary Layer（MoL）** 结合了 Delete 菜单和 Delete 子模式两者的优点：
- 对于单次删除，与 Delete 菜单一样高效
- 对于链式操作，与 Delete 子模式一样可重复

**工作原理：**

当 Delete 键（目前是 `v`）被**按住**时，Delete 子模式被激活，允许你重复按移动键（如 Right）来向前删除多个选择。一旦你释放 Delete 键，Delete 子模式自动停用。

当被**轻触**（tapped，按下后立即释放）时，它直接执行 Delete One 动作，使得最常见的情况甚至比 Delete 菜单更高效（后者需要两次按键 `v v`）。

Momentary Layer 消除了显式进入和退出模式的开销，让删除操作感觉更加自然和即时。

---

## 设计思考

Ki Editor 的 Delete 操作演进过程展示了一个优秀的设计迭代过程：

1. **发现问题**：版本 1 的不一致性
2. **追求一致性**：版本 2 统一行为
3. **优化体验**：版本 3-6 不断减少操作步骤
4. **权衡取舍**：在菜单和子模式之间找到平衡
5. **创新突破**：Momentary Layer 的引入

这种**所见即所得**（WYSIWYG）的删除行为，结合 **Momentary Layer** 的交互设计，体现了结构化编辑器在用户体验上的深度思考。

对于习惯了 Vim/Kakoune 的用户来说，Ki Editor 提供了一种不同的编辑范式——更直接、更精确、更少意外。

---

## 关键要点

- Ki Editor 的 Delete 操作经历了 6 个版本迭代，每次都在解决上一个版本的问题
- 核心设计原则是**一致性**和**有效性**，同时追求操作的**便捷性**
- 最终方案 Momentary Layer 结合了菜单的高效性和子模式的可重复性
- "你选什么，就删什么"的设计理念消除了意外行为
- 这种迭代过程展示了如何通过用户反馈和设计思考来优化交互体验

---

如果你想了解更多关于 Ki Editor 的信息，可以访问 [官方网站](https://ki-editor.org/) 或加入他们的 [Zulip 社区](https://ki-editor.org/chat) 讨论。
