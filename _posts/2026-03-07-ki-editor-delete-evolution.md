---
layout: post
title: "Ki Editor 删除操作的六次迭代演进"
date: 2026-03-07 23:49:59 +0800
categories: tech-translation
description: "Ki Editor 是一款多光标结构化编辑器，其删除操作经历了六次重大迭代，从最初的选择模式特定行为演变为最终的「瞬时图层」设计，体现了对用户体验和一致性的极致追求。"
original_url: https://ki-editor.org/
source: Hacker News
---

本文翻译自 [Ki Editor Blog](https://ki-editor.org/blog/)，原载于 Hacker News。

## Ki Editor 简介

Ki Editor 是一款革命性的**多光标结构化编辑器**（Multi-cursor Structural Editor）。它的核心理念是：

- **语法节点优先交互**：直接操作语法结构，避免鼠标或键盘的繁琐操作
- **多光标支持**：并行操作多个语法节点，大幅提升批量编辑和重构效率
- **重新定义模态编辑**：选择模式（Selection Modes）统一了单词、行、语法节点等不同粒度的移动操作

今天我们要讨论的是 Ki Editor 中看似简单但设计极其精妙的**删除操作（Delete）**——它经历了六个版本的迭代，最终达到了优雅与高效的平衡。

---

## Version 1：选择模式特定行为

在最初的版本中，Delete 的行为就已经与 Vim/Kakoune 等传统模态编辑器不同。

**传统编辑器的行为**（以 `[` 和 `]` 表示选区边界）：

```
foo [bar] spam
```

执行 Delete 后：

```
foo [ ]spam
```

**Ki Editor Version 1 的行为**：

```
foo [spam]
```

注意到区别了吗？

1. `spam` 被自动选中了
2. `bar` 和 `spam` 之间的空白也被删除了

这样设计的好处是：用户可以连续执行 Delete 来删除下一个词。

但问题来了：为什么删除 `bar` 后选中 `spam` 而不是 `foo`？

因为删除当前选区后的默认方向是**向前（向右）**。当然，当时还有一个 Delete Backward 操作来处理反向删除。

### Version 1 的问题

Ki Editor 有两种横向移动方式：

1. **Left/Right**：跳过「不重要的选区」（如符号 `-`、`::`、`/` 等）
2. **Previous/Next**：不跳过任何选区

这带来了一个两难选择：Delete 应该使用哪种移动方式来确定删除哪些间隙？

**冲突场景**：

在 Word 选择模式下，如果使用 Left/Right：

```
初始：spam[foo].bar
删除后：spam[bar]  // 意外删除了 . 和换行符
```

这可能令人惊讶。所以选择了使用 Previous/Next：

```
初始：spam[foo].bar
删除后：spam[.].bar  // 只删除了 foo
```

但在语法节点（Syntax Node）模式下，这又不理想：

```
初始：fn main([x: X], y: Y, z: Z) {}
删除后：fn main([,] y: Y, z: Z) {}  // 逗号没被删除
```

我们期望的是：

```
fn main([y: Y], z: Z) {}  // 逗号一起删除，保持语法正确
```

**结论**：不同选择模式需要不同的横向移动策略，导致行为不一致。

---

## Version 2：解决一致性问题

[@vishal](https://github.com/vishal) 发现 Delete 在不同选择模式下行为不一致，这违背了 Ki 的设计原则之一——**一致性**。

这个版本决定：**Delete 统一使用 Left/Right 移动方式**。

那如果需要 Previous/Next 行为怎么办？引入了新操作 **Delete 0 Gap**（名字有点误导，它确实删除间隙）。

但问题是 Delete 0 Gap 绑定在 shift 层，使用起来不够顺手。

---

## Version 3：删除子模式

在继续之前，需要提到一个重要改变：[@vishal](https://github.com/vishal) 引入了 **Swap Cursor** 来反转 Delete、Paste、Open 等操作的方向。

这个改变后，Delete Backward 被移除了——要向后删除，先执行 Swap Cursor 即可。

但这也带来了新问题：要向后删除并使用 Previous/Next 移动，需要先 Swap Cursor，再按 shift 执行 Delete 0 Gap，**太繁琐了**。

解决方案：将 Delete 变成**子模式（Submode）**。

作为子模式，所有删除操作都只需要 3 步：

1. 进入 Delete 子模式
2. 执行一个移动操作
3. 退出 Delete 子模式

---

## Version 4：所见即所得

Version 3 解决了一致性问题，但带来了新问题：**所有删除操作都同样累人**。

> "虽然 Space 解决了普通键盘上 esc 的人体工学问题，但 Delete 子模式的 '动作-移动-移动' 感觉还是有点累。" —— @vishal

这个版本引入了 **Expand Forward** 和 **Expand Backward** 两个新操作：

```
初始：foo [bar] spam
执行 Expand Forward：foo [bar ]spam
```

**核心改变**：Delete 不再自动删除间隙。**你选什么就删什么**——没有意外，没有惊喜。

如果间隙没被删除，那是因为你一开始就没选中它。

### 新的行为逻辑

后续选区是否被自动选中？**只有当它删除后会占据相同位置时才会**。

```
foo [bar ]spam
执行 Delete：foo [spam]  // spam 被选中，因为它的起始位置没变

foo [bar] spam
执行 Delete：foo [ ]spam  // 只有空白被选中
```

### 步骤优化

- 向前删除（不含间隙）：1 步
- 向前删除（含间隙）：2 步（先 Expand Forward）
- 向后删除（不含间隙）：2 步（先 Swap Cursor）
- 向后删除（含间隙）：3 步（先 Expand Backward，再 Swap Cursor）

---

## Version 5：删除菜单

Version 4 的问题是：
1. 不执行 Expand Selection 就不会删除间隙
2. 相邻选区不会被选中，打断操作流

Version 3 的 Delete 子模式已经很有效，唯一缺点是**累赘**：简单的含间隙删除至少需要 3 次按键（`v space`）。

解决方案：将 Delete 变成**菜单（Menu）**而非子模式。

- **菜单**：选择一个选项后自动关闭
- **子模式**：需要显式退出

现在简单删除只需 2 次按键：`v `。

代价是不能在一次调用中链式删除多个选区。但这可以通过 Extend 操作（`g`）弥补。

---

## Version 6：瞬时图层（Momentary Layer）

**这是最终版本**，结合了 Delete 菜单和 Delete 子模式的优点。

### 工作原理

**长按 Delete 键**（当时是 `v`）：
- Delete 子模式激活
- 可以重复按移动键（如 Right）向前删除多个选区
- 松开 Delete 键，子模式自动退出

**轻触 Delete 键**（快速按下释放）：
- 直接执行 Delete One 操作
- 比菜单更高效（菜单需要 2 次按键 `v v`）

```
轻触 v：删除当前选区（1 步）
长按 v + Right + Right + 松开：向前删除 3 个选区（无需退出操作）
```

**瞬时图层消除了显式进入和退出模式的开销，让删除操作感觉更自然、更即时。**

---

## 设计思考

Ki Editor 的 Delete 操作迭代过程体现了几个重要的设计原则：

1. **一致性优先**：不同选择模式下的行为应该统一
2. **所见即所得**：用户选什么就删什么，没有意外行为
3. **效率与灵活性的平衡**：常见操作要高效（1 步），复杂操作要支持
4. **人体工学**：减少不必要的按键，利用长按/轻触的区分

最终的「瞬时图层」设计是一个优雅的解决方案：
- 轻触处理最常见的单次删除（最快）
- 长持处理连续删除（保持链式操作能力）
- 无需显式退出模式

---

## 总结

Ki Editor 的 Delete 操作从最初的「选择模式特定行为」经历了六次重大迭代：

| 版本 | 核心特点 | 问题 |
|------|----------|------|
| V1 | 自动删除间隙、自动选中下一项 | 不同选择模式行为不一致 |
| V2 | 统一使用 Left/Right | Delete 0 Gap 不够人体工学 |
| V3 | Delete 子模式 | 所有操作都同样累人 |
| V4 | 所见即所得 | 不自动删除间隙打断操作流 |
| V5 | Delete 菜单 | 无法链式删除 |
| V6 | 瞬时图层 | **当前方案，兼顾效率与灵活性** |

这个迭代过程展示了**好的 UX 设计需要多少思考和实验**——即使是一个看似简单的「删除」操作，也需要在一致性、效率、灵活性之间不断权衡。

如果你对结构化编辑感兴趣，强烈建议去 [Ki Editor 官网](https://ki-editor.org/) 体验一下。
