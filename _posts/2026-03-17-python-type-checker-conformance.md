---
layout: post
title: "Python 类型检查器横向对比：谁最符合 Typing 规范？"
date: 2026-03-17 00:26:35 +0800
categories: tech-translation
description: "深入分析各主流 Python 类型检查器对 typing 规范的遵循程度，了解 Pyright、Pyrefly、mypy 等工具在合规性测试中的表现，以及这些数字背后的实际意义。"
original_url: https://pyrefly.org/blog/typing-conformance-comparison/
source: Hacker News
---

本文翻译自 [Python Type Checker Comparison: Typing Spec Conformance](https://pyrefly.org/blog/typing-conformance-comparison/)，原载于 Hacker News。

---

当你为 Python 代码添加类型注解时，你期望类型检查器能够准确地遵循语言规范。但现实中，各大类型检查器对 Python typing 规范的遵循程度究竟如何呢？

在这篇文章中，我们将探讨什么是 typing 规范一致性（conformance），比较不同类型检查器的表现，以及这些一致性数据所不能告诉你的那些事。

## Python Typing 规范简史

Python 的类型系统始于 PEP 484。彼时，类型系统的语义主要由参考实现 mypy 来定义。实际上，mypy 实现了什么，什么就成了事实上的规范。

随着时间推移，更多类型检查器相继问世：微软的 Pyright、谷歌的 Pytype、Meta 的 Pyre 等等。与此同时，类型系统本身也在不断演进，产生了众多 PEP。

这就带来了一个问题：类型系统的语义分散在众多文档中，不同的类型检查器对规范的解读也略有差异。为了解决这个问题，typing 社区开始将规则整合到一份统一的参考文档中——**Python typing specification**。这份规范描述了各种 typing 特性的语义，并包含了一套一致性测试套件，供类型检查器衡量自身对规范的遵循程度。

## Typing 一致性测试套件

typing 规范包含一套一致性测试套件，约有上百个测试文件。每个文件都编码了类型检查器应该和不应该在哪些位置报错的预期。测试套件覆盖了广泛的 typing 特性，从泛型（generics）到重载（overloads）再到类型别名（type aliases）。

在每项测试中，代码行被标注为预期出错的位置。当类型检查器对某个文件运行时，可能出现两种不匹配情况：

- **假阳性（False positives）**：类型检查器在测试中未标记为错误的行上报错了。这意味着检查器拒绝了规范认为有效的代码。

  举个例子，给定这段有效代码：

  ```python
  class Movie(TypedDict, extra_items=bool):
      name: str

  m: Movie = {"name": "Blade Runner", "novel_adaptation": True}  # OK
  ```

  如果类型检查器不支持 `extra_items`，它会将 `"novel_adaptation"` 标记为未知键，即使 `extra_items=bool` 已经明确允许额外的布尔值键。

- **假阴性（False negatives）**：测试期望报错，但类型检查器没有报告。这意味着检查器未能执行规范中定义的规则。继续用上面的 `Movie` TypedDict 为例：

  ```python
  b: Movie = {"name": "Blade Runner", "year": 1984}  # E: 'int' is not assignable to 'bool'
  ```

  这里出现假阴性意味着类型检查器静默接受了 `"year": 1982`，尽管 `extra_items=bool` 要求额外值必须是 `bool` 类型，而非 `int`。

## 各类型检查器表现一览

公开的一致性仪表板汇总了各类型检查器的测试结果。下表展示了 2026 年 3 月初的数据（commit `62491d5c9cc1dd052c385882e72ed8666bb7fa41`）：

| 类型检查器 | 完全通过 | 通过率 | 假阳性 | 假阴性 |
|-----------|---------|--------|--------|--------|
| pyright   | 136/139 | 97.8%  | 15     | 4      |
| zuban     | 134/139 | 96.4%  | 10     | 0      |
| pyrefly   | 122/139 | 87.8%  | 52     | 21     |
| mypy      | 81/139  | 58.3%  | 231    | 76     |
| ty        | 74/139  | 53.2%  | 159    | 211    |

**值得注意的是**：这些数据很可能很快就会过时（甚至可能不到一周），毕竟 Pyrefly、ty 和 Zuban 目前都处于 beta 阶段，正在积极开发中。建议读者参考[最新测试结果](https://typing.readthedocs.io/en/latest/results/index.html)。

Pyrefly 已经支持所有主要的类型系统特性，预计在未来几个月内会填补剩余的差距。

## 为什么一致性很重要？

一致性在实际开发中重要吗？毕竟 mypy（作为参考实现和 Python 类型检查的行业标杆）的完全通过率也只有 58%。

实际上，类型检查器一致性越低，你就越需要重构代码来绕过它的局限性或不一致行为。比如，你可能按照规范推荐的模式编写代码，阅读了说明某个 typing 构造应该能工作的文档，然后据此添加了注解——结果发现你的类型检查器并没有正确实现规范的这部分内容。

即使你自己的代码没有使用高级 typing 特性，当你尝试从使用了这些特性的库中导入内容时，也可能遇到问题。届时，你可能不得不添加多余的 `cast`，抑制一个虚假的错误，或者重构本来正常工作的代码——这一切都是因为一致性差距。

## 一致性测试的局限性

虽然一致性是衡量类型检查器功能完整性的重要基准，但它也存在局限性。首先，并非所有一致性不匹配都具有同等意义——有些测试检查的是常规代码中常见的模式，而另一些则检查实际项目中罕见的边缘情况。

此外，尽管 Python 类型系统正变得越来越规范化，但类型检查的许多重要方面根本没有被标准化，因此也不在一致性测试的覆盖范围内。例如：

### 类型推断（Type Inference）

typing 规范主要关注**有类型注解**的 Python 代码的语义。当注解缺失时，类型检查器在如何推断类型以及如何严格检查未注解代码方面拥有更大的自由度。

一个常见的例子是空容器推断，不同类型检查器对此有截然不同的行为。

### 类型收窄（Type Narrowing）

基于运行时检查来约束变量类型的过程，其行为也只是部分被规范化。规范定义了 `cast`、`match`、`TypeIs` 和 `TypeGuard` 等机制，但大多数实际场景中的收窄是隐式的，依赖于动态 Python 代码中产生的模式。这些行为是在尽力而为的基础上实现的，各工具之间的支持程度差异很大。

### 实验性类型系统特性

包括交集类型（intersection types）、否定类型（negation types）、匿名类型化字典、张量形状类型（tensor shape types）等等。这些特性在不同工具中的支持程度差异很大。

## 写在最后

如果你正在选择适合自己的类型检查器，一致性是一个有用的指标：它告诉你类型检查器对正式 typing 规则的遵循程度。但开发体验还取决于许多其他因素，你也应该考虑：

- **推断质量**：当注解缺失时，类型推断做得怎么样？
- **性能**：在大型代码库上运行速度如何？
- **IDE 集成**：是否完全支持语言服务器协议（LSP）？
- **错误信息**：错误是否清晰可操作，还是晦涩难懂？
- **第三方包支持**：是否支持 Django、Pydantic 等需要特殊处理、无法仅用类型注解表达的包？

在后续文章中，我们将深入探讨这些维度，比较不同类型检查器的处理方式。

---

**关键要点**：

1. **Pyright 目前领先**：以 97.8% 的通过率位居榜首，是当前对 typing 规范支持最完善的工具
2. **新兴工具崛起**：Pyrefly、Zuban 等新工具虽然还在 beta 阶段，但已经展现出强劲势头
3. **mypy 并非完美**：作为"参考实现"，mypy 的一致性并不高（58.3%），这可能出乎很多人的意料
4. **一致性 ≠ 一切**：选择类型检查器时，还需要综合考虑性能、IDE 集成、错误信息质量等因素
5. **规范仍在演进**：typing 规范还在不断发展，各工具也在积极追赶

如果你对 Python 类型系统感兴趣，不妨试试 [Pyrefly](https://pyrefly.org/)，或者加入 [Discord](https://discord.gg/pyrefly) 和 [GitHub](https://github.com/facebook/pyrefly) 上的讨论。
