---
layout: post
title: "如何选择 Hindley-Milner 和双向类型系统"
date: 2026-02-19 13:03:57 +0800
categories: tech-translation
description: "这篇文章讨论了在设计编程语言时如何选择类型系统，指出真正的问题不是 HM 还是双向类型，而是你的语言是否需要泛型支持"
original_url: https://thunderseethe.dev/posts/how-to-choose-between-hm-and-bidir/
source: Hacker News
---

本文翻译自 [How to Choose Between Hindley-Milner and Bidirectional Typing](https://thunderseethe.dev/posts/how-to-choose-between-hm-and-bidir/)，原载于 Hacker News。

---

这个问题你可能在各种场合听过无数次："我的新编程语言应该用 Hindley-Milner (HM) 类型系统还是双向（Bidir）类型系统？"什么？朋友间闲聊不会突然聊到类型推断？好吧，扎心了。但无所谓，这是我的博客，我们就是要聊这个！既然你点进了一个编程语言博客，就别指望聊别的。

选择类型系统对于想开发编程语言的人来说确实是一道坎。面对编程语言设计中错综复杂的各种选择，他们会感到迷茫和焦虑。选择哪种类型系统只是通向可用原型路上的又一个难题。

可以理解，他们想快速做个决定然后继续前进。但这是一个错误的问题。这个问题假设 HM 和 Bidir 是一个光谱的两端——一端是 HM，有类型变量、unification（合一）等等；另一端是双向类型，靠注解决定类型，几乎不做推断。但这种光谱划分是一个**错误的二分法**。

## 真正应该问的问题

大家真正应该问的是："**我的语言需要泛型吗？**" 这个问题把焦点放在你的语言实际需要什么，而不是在两个各有取舍的算法之间做抽象选择。更重要的是，它决定了你是否需要 unification。

泛型通常需要一个支持 unification 的类型系统。Unification 是分配和求解类型变量的过程。如果你见过 Rust 推断出 `Vec<_>` 这样的类型，那就是 unification 在工作。

> **提示**：如果你想了解 unification 是如何工作的，作者有一篇专门的教程可以参考。

当面对类型系统设计时，知道你是否需要 unification 会帮你做很多决定。Unification 是 Hindley-Milner 的核心。当你选择 HM，你就选择了 unification。

## 双向类型的真实情况

对于双向类型来说，故事更有趣一些。如果你查看文献，你会发现很多双向类型的例子根本不使用 unification。通过在关键位置添加注解，你可以在没有类型变量的情况下检查复杂的程序。双向类型的一个关键洞察是：**你可以做到很多事情而不需要 unification**。说实话，这确实很酷。

但这导致了一个错误的认知：双向类型**不能**或**不应该**使用 unification。事实恰恰相反。双向类型支持 HM 的所有功能，甚至更多，它更像是 HM 的超集。Unification 在双向类型中就像 Vim 用户的 home row 键位一样自然。

## 为什么双向类型是 HM 的超集

想象我们有一个 AST（用 Rust 表示）：

```rust
enum Ast {
    // 一些情况，可能
}
```

还有一个我们想赋给 AST 的 Type：

```rust
enum Type {
    // 另一些情况，可能
}
```

在 HM 系统中，我们提供一个 `infer` 函数：

```rust
fn infer(env: Env, ast: Ast) -> Result<Type, TypeError> {
    // ... 现在不太重要
}
```

哇，就这样我们有了一个真正的 HM 类型系统。（请忽略所有我们略过的细节）

我们可以在 `infer` 中做各种 unification。如果我们想让这个系统变成双向的，只需要添加一个 `check` 函数：

```rust
fn check(env: Env, ast: Ast, ty: Type) -> Result<(), TypeError> {
    // ... 现在比较重要
}
```

技术上讲，`check` 甚至不需要做任何事。一个完全有效的实现是：

```rust
fn check(env: Env, ast: Ast, ty: Type) -> Result<(), TypeError> {
    let infer_ty = infer(env, ast);
    if infer_ty == ty {
        Ok(())
    } else {
        Err(TypeError::TypesNotEqual)
    }
}
```

我们为 AST 推断一个类型，然后检查它是否等于预期类型。这就是双向类型所需的全部。

不过，这里的相等性检查相当严格。第一次我们要检查 `(T, u32)` 和 `(u32, S)` 这样的类型时，整个类型推断就会卡住。

相反，让我们把 unification 放进去。与其要求严格的相等，我们可以放宽 `check`，只要求类型能 unifiy：

```rust
fn check(env: Env, ast: Ast, ty: Type) -> Result<(), TypeError> {
    let infer_ty = infer(env, ast);
    unify(infer_ty, ty)
}
```

有了这个小调整，我们就有了双向类型，而且还在做 unification。现在当然我们可以随时更好地利用 `check`。假设我们知道 AST 有函数：

```rust
enum Ast {
    Fun(String, Box<Ast>),
}

enum Type {
    Fun(Box<Type>, Box<Type>),
}
```

我们回到 check 的实现，发现可以直接处理函数情况：

```rust
fn check(env: Env, ast: Ast, ty: Type) -> Result<(), TypeError> {
    match (ast, ty) {
        (Ast::Fun(var, body), Type::Fun(arg, ret)) => {
            check(env.insert(var, *arg), *body, *ret)
        }
        (ast, ty) => {
            let infer_ty = infer(env, ast);
            unify(infer_ty, ty)
        }
    }
}
```

但关键是：**你不必这样做**。如果你打算选择 Hindley-Milner 类型系统，你不妨加几行代码让它变成双向系统。这几乎是免费的。

## 什么时候需要 Unification？

好吧，你已经接受双向类型了。让我们回到根本问题："我应该支持泛型吗？"

Unification 是一项艰巨的任务。什么时候有意义，什么时候没有？

**Unification 很适合以下情况**：
- 你不想为程序中的每个变量都写明类型
- 像 Java 和 C++ 这样的老牌语言都已经引入了它，因为它太方便了
- 甚至 Go 这个曾经坚决反对泛型的语言，最终也妥协并添加了泛型

任何想制作通用编程语言的人都应该考虑泛型是必须的。

**但不使用 Unification 也合理的情况**：

但不是每种语言的目标都是成为通用编程语言。

1. **学习练习**：很多人制作编程语言是为了学习。在这种情况下，unification 可能带来一堆额外的复杂性，而这些复杂性并不能真正教你想要学的东西。如果你对学习类型系统感兴趣，unification 是必须的。但如果你只是需要一些类型以便后面能生成代码，那正是研究不使用 unification、需要类型注解的双向类型系统的好时机。

2. **领域特定语言 (DSL)**：也许你的语言不是通用的，而是一个完美适配你领域的 DSL。DSL 不必覆盖所有计算，可以根据使用场景放弃泛型来减少语言的概念和表面积。但要警惕：成功的 DSL 会成长为通用编程语言（看看 awk），那时你就会因为缺乏功能而痛苦。

## 总结

无论你的目标是什么，你真正应该问自己的问题是："**我想要泛型吗？**"

无论你的答案是什么，双向类型都能满足你的需求。

如果你需要泛型，双向类型 + unification 给你完整的 HM 能力外加更多。
如果你不需要泛型，双向类型可以完全不用 unification，简化你的实现。

这就是为什么选择 HM 还是 Bidir 是一个错误的问题——双向类型本身就已经涵盖了两种情况。真正的决策点在于你的语言是否需要泛型支持。

---

**核心要点**：
- 不要问"HM 还是双向类型"，问"需要泛型吗"
- 双向类型是 HM 的超集，不是对立面
- 需要泛型 → 双向类型 + unification
- 不需要泛型 → 双向类型，可以不用 unification
- 语言设计决策应该基于实际需求，而非算法选择的二分法
