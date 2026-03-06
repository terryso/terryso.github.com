---
layout: post
title: "没人会因为使用结构体被开除——直到你遇到 700 个可选字段"
date: 2026-03-06 14:06:26 +0800
categories: tech-translation
description: "本文探讨了 Rust 结构体在处理 SQL 表数百个可空列时的性能问题，以及如何通过 bitmap 优化将序列化大小减少 2 倍"
original_url: https://www.feldera.com/blog/nobody-ever-got-fired-for-using-a-struct
source: Hacker News
---

本文翻译自 [Nobody ever got fired for using a struct](https://www.feldera.com/blog/nobody-ever-got-fired-for-using-a-struct)，原载于 Hacker News。

---

当几个变量属于同一类数据时，我们会把它们放进结构体（struct）。程序员做这个动作几乎是下意识的，不需要太多思考。

大多数时候，这是正确的选择。结构体简单、快速、行为可预测。但偶尔，它们也会出问题。这就是其中一个案例的故事。

## 问题出现

Feldera 的一位客户报告了一个奇怪的性能问题。一个新的用例处理的数据量与现有流水线差不多，但运行速度却慢得多。

这很不寻常。他们的引擎通常能够跟上客户发送的数据速度。所以他们决定深入调查。

在 Feldera 中，用户将输入数据定义为 SQL 表，将输出数据定义为 SQL 视图。系统将中间的 SQL 编译成 Rust 程序，进行增量查询评估。

每一行数据都会变成一个 Rust 结构体。

以下是触发性能下降的工作负载的（匿名化）摘录：

```sql
create table user (
  anon0 boolean NULL,
  anon1 boolean NULL,
  anon2 boolean NULL,
  anon3 boolean NULL,
  anon4 VARCHAR NULL,
  anon5 VARCHAR NULL,
  anon6 VARCHAR NULL,
  anon7 INT NULL,
  anon8 SHOPPING_CART NULL,
  anon9 BOOLEAN NULL,
  anon10 BOOLEAN NULL,
  anon11 BOOLEAN NULL,
  anon12 VARCHAR NULL,
  anon13 VARCHAR NULL,
  anon14 VARCHAR NULL,
  anon15 VARCHAR NULL,
  anon16 VARCHAR NULL,
  anon17 VARCHAR NULL,
  anon18 VARCHAR NULL,
  anon10 VARCHAR NULL,
  anon11 VARCHAR NULL,
  # ...
  # 列表一直继续...
  # ...
  anon715 VARCHAR NULL,
)
```

SQL 编译器将其转换为 Rust 结构体：

```rust
#[derive(Clone, Debug, Eq, PartialEq, Default, PartialOrd, Ord)]
pub struct struct_832943b1fac84177 {
  field0: Option<bool>,
  field1: Option<bool>,
  field2: Option<bool>,
  field3: Option<bool>,
  field4: Option<SqlString>,
  field5: Option<SqlString>,
  field6: Option<SqlString>,
  field7: Option<i32>,
  field8: Option<ShoppingCart>,
  field9: Option<bool>,
  field10: Option<bool>,
  field11: Option<bool>,
  field12: Option<SqlString>,
  // ...
  // 列表一直继续...
  // ...
  field715: Option<SqlString>,
}
```

这个结构体有数百个字段，几乎所有字段都是可选的。

这直接来自 SQL。可空列在 Rust 中变成 `Option<T>`。

## 内存布局分析

让我们检查一个较小版本的结构体的内存布局（只有前 8 个字段）。使用 `memoffset` crate 来导出布局：

```
(size=40B, align=8)
Offset
0x00 ┌──────────────────────────────────────────────┐
     │ field7: Option<i32>                           │
     │ size 8, align 4                               │
     │ bytes: [discriminant + i32 (+ padding)]       │
0x08 ├──────────────────────────────────────────────┤
     │ field4: Option<SqlString> (8B)                │
     │ SqlString is 8B (ArcStr pointer)              │
0x10 ├──────────────────────────────────────────────┤
     │ field5: Option<SqlString> (8B)                │
0x18 ├──────────────────────────────────────────────┤
     │ field6: Option<SqlString> (8B)                │
0x20 ├──────────────────────────────────────────────┤
     │ field0: Option<bool> (1B)                     │
0x21 ├──────────────────────────────────────────────┤
     │ field1: Option<bool> (1B)                     │
0x22 ├──────────────────────────────────────────────┤
     │ field2: Option<bool> (1B)                     │
0x23 ├──────────────────────────────────────────────┤
     │ field3: Option<bool> (1B)                     │
0x24 ├──────────────────────────────────────────────┤
     │ padding (4B) rounds total size to mult. of 8  │
0x28 └──────────────────────────────────────────────┘
```

几点值得注意：

* Rust 编译器重新排列了字段。这对 Rust 结构体来说是正常的。
* `Option<bool>` 和 `Option<SqlString>` 本质上是免费的。Rust 使用 **niche 优化**（niche optimization）来编码 `None` 而不需要额外空间。例如，`SqlString` 是一个 `ArcStr` 指针，Rust 保证它永远不会是 null（通过 `NonNull`）。
* 真正的开销只来自 `Option<i32>`、解包的 `Option<bool>` 值以及末尾的填充。

总体而言，这个布局已经相当高效。即使有几个 `Option`，结构体也只占用 **40 字节**。

所以内存表示不是问题。

## 序列化瓶颈

Feldera 几乎总是用于不适合内存的数据集。

所以这些结构体最终会被写入磁盘。这意味着我们需要序列化它们。

他们使用 **rkyv**，一个 Rust 的零拷贝序列化框架。使用 rkyv，序列化通常只需要几个 derive 宏：

```rust
#[derive(Debug, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
pub struct struct_832943b1fac84177 {
  field0: Option<bool>,
  field1: Option<bool>,
  field2: Option<bool>,
  field3: Option<bool>,
  field4: Option<SqlString>,
  field5: Option<SqlString>,
  field6: Option<SqlString>,
  field7: Option<i32>
}
```

在底层，rkyv 生成结构体的归档表示。如果我们检查展开的代码（`cargo expand`），会看到类似这样的内容：

```rust
/// [`struct_832943b1fac84177`] 的归档版本
pub struct Archivedstruct_832943b1fac84177 {
  /// [`struct_832943b1fac84177::field0`] 的归档对应项
  field0: rkyv::option::ArchivedOption<bool>,
  /// [`struct_832943b1fac84177::field1`] 的归档对应项
  field1: rkyv::option::ArchivedOption<bool>,
  /// [`struct_832943b1fac84177::field2`] 的归档对应项
  field2: rkyv::option::ArchivedOption<bool>,
  /// [`struct_832943b1fac84177::field3`] 的归档对应项
  field3: rkyv::option::ArchivedOption<bool>,
  /// [`struct_832943b1fac84177::field4`] 的归档对应项
  field4: rkyv::option::ArchivedOption<ArchivedString>,
  /// [`struct_832943b1fac84177::field5`] 的归档对应项
  field5: rkyv::option::ArchivedOption<ArchivedString>,
  /// [`struct_832943b1fac84177::field6`] 的归档对应项
  field6: rkyv::option::ArchivedOption<ArchivedString>,
  /// [`struct_832943b1fac84177::field7`] 的归档对应项
  field7: rkyv::option::ArchivedOption<i32>
}
```

这里发生了几件事：

* 每个结构体都有自己的 `Archived` 对应版本，定义序列化布局
* 转换递归应用于每个字段
* 基本类型（bool、i32 等）归档到自身
* 更复杂的类型使用特殊的归档版本，如 `ArchivedOption` 和 `ArchivedString`

到目前为止，一切看起来都很合理。但问题也正是在这里开始出现的。

## 优化的破坏

看看 `ArchivedString` 的实现，大致如下：

```rust
static const INLINE_CAPACITY: usize = 15;

#[derive(Clone, Copy)]
#[repr(C)]
struct InlineRepr {
  bytes: [u8; INLINE_CAPACITY],
  len: u8,
}

/// 可以内联短字符串的归档字符串表示
pub union ArchivedStringRepr {
  out_of_line: OutOfLineRepr,
  inline: InlineRepr,
}
```

这个布局很聪明。短字符串被内联存储，避免了内存分配。

但它破坏了一个重要的 Rust 优化。

前面我们看到 `Option<T>` 有时可以通过使用 niche 值（例如 null 指针）免费存储 `None`。但 `ArchivedString` 不再有这样的 niche。所有字节模式现在都是有效的，因为内联表示使用了整个缓冲区。

这意味着 `Option<ArchivedString>` 必须存储一个显式的判别式（discriminant）。

所以 `Option<SqlString>` 不再免费了。

前面这个结构体有 700 多个可选字段。

在 Rust 中，你永远不会设计这样的结构体。早在达到 700 个 `Option` 之前，你就会选择不同的布局。

但 SQL 模式通常就是这样。列默认是可空的，宽表很常见。

一旦我们序列化它们，这就成了问题。以下是前面 8 字段结构体的归档布局：

```
• struct_...::Archived (rkyv size_64)
(size=88B, align=8)
Offset
0x00 ┌──────────────────────────────────────────────┐
     │ field4: Archived<Option<SqlString>>           │
     │ size: 24B                                     │
     | (16 bytes SqlString, 8 bytes Option)          │
0x18 ├──────────────────────────────────────────────┤
     │ field5: Archived<Option<SqlString>>           │
     │ size: 24B                                     │
0x30 ├──────────────────────────────────────────────┤
     │ field6: Archived<Option<SqlString>>           │
     │ size: 24B                                     │
0x48 ├──────────────────────────────────────────────┤
     │ field7: Archived<Option<i32>>                 │
     │ size: 8B                                      │
0x50 ├──────────────────────────────────────────────┤
     │ field0: Archived<Option<bool>>                │
     │ size: 2B                                      │
0x52 ├──────────────────────────────────────────────┤
     │ field1: Archived<Option<bool>>                │
     │ size: 2B                                      │
0x54 ├──────────────────────────────────────────────┤
     │ field2: Archived<Option<bool>>                │
     │ size: 2B                                      │
0x56 ├──────────────────────────────────────────────┤
     │ field3: Archived<Option<bool>>                │
     │ size: 2B                                      │
0x58 └──────────────────────────────────────────────┘
```

注意字符串部分：归档字符串 16 字节，Option 判别式 8 字节。即使字符串为空或值为 `None` 也是如此。

所以归档结构体最终是 **88 字节**。内存版本是 **40 字节**。大了 **2 倍多**。

## 解决方案：Bitmap 优化

修复方法很简单：不再存储 `Option<T>`，而是存储一个 bitmap 来记录哪些字段是 `None`。

在序列化期间，布局如下：

`| bitmap | values... |`

bitmap 中的每一位对应一个字段：

```
0 → 字段是 None
1 → 字段存在
```

反序列化行时，我们先检查 bitmap。

* 如果位是 `0`，字段是 `None`。
* 如果位是 `1`，我们读取值并用 `Some(...)` 包装它。

### 实现 NoneUtils trait

要使用 bitmap 技巧，我们需要在序列化期间回答一个问题：

**这个字段是 `None` 吗？**

这听起来很容易，但序列化器对某些类型 `T` 是泛型的。

Rust 没有反射，所以我们不能简单地询问 `T` 是否是 `Option`。

幸运的是，我们控制这些结构体中出现的类型。

所以我们引入一个小辅助 trait：

```rust
pub trait NoneUtils {
  type Inner;
  fn is_none(&self) -> bool;
  fn unwrap_or_self(&self) -> &Self::Inner;
  fn from_inner(inner: Self::Inner) -> Self;
}
```

这个想法很简单：统一对待 `Option<T>` 和 `T`。

`Option<T>` 暴露它是否是 `None` 并允许访问内部值：

```rust
impl<T> NoneUtils for Option<T> {
  type Inner = T;

  fn is_none(&self) -> bool {
    self.is_none()
  }

  fn unwrap_or_self(&self) -> &Self::Inner {
    self.as_ref()
      .expect("NoneUtils::unwrap_or_self called on None")
  }

  fn from_inner(inner: Self::Inner) -> Self {
    Some(inner)
  }
}
```

其他所有内容都表现为始终存在：

```rust
impl<T> NoneUtils for T {
  type Inner = T;

  fn is_none(&self) -> bool {
    false
  }

  fn unwrap_or_self(&self) -> &Self::Inner {
    self
  }

  fn from_inner(inner: Self::Inner) -> Self {
    inner
  }
}
```

有了这个 trait，序列化器可以统一处理每个字段。

它调用 `is_none()` 来更新 bitmap，然后如果值存在，使用 `unwrap_or_self()` 进行序列化。

### 新的序列化布局

现在我们有了需要的构建块：`NoneUtils`。

它让序列化器可以对任何字段问两个问题：

* 这个值是 `None` 吗？
* 如果不是，给我内部值

这足以改变结构体的序列化布局。

序列化的两个新步骤：

1. 写入一个 **bitmap**，记录哪些字段是 `None`。
2. 序列化字段，**不带** `Option` 包装。

概念上布局如下：

`| bitmap | field0 | field1 | field2 | field3 | ... |`

bitmap 为每个字段存储一位：

```
bit = 1 → 值存在
bit = 0 → 值为 None
```

字段本身存储时不带 `Option`：

```
Option<T> → T
T         → T
```

序列化期间我们调用：`value.unwrap_or_self()`

这从归档布局中移除了 `Option` 开销。

反序列化反转该过程。

我们查询 bitmap 来重建每个字段：

```rust
if bitmap[i] == 0
  return None
else
  read value
  return Some(value)
```

同样，`NoneUtils` 通过 `T::from_inner(inner)` 隐藏细节。

生成所有这些逻辑的代码由宏自动产生。

移除 Option 的布局紧凑、简单、缓存友好。

### 稀疏布局优化

但这里还有另一个机会：并非每一行总是看起来一样。如果许多字段是 `NULL`，为每个字段顺序保留空间会浪费空间。在这种情况下，我们可以只存储实际存在的值。

由于字段类型可能有不同大小的可变长度，我们无法提前计算它们的偏移量。

所以稀疏布局保留一个相对指针索引，指向存储的值：

`| bitmap | ptrs | values... |`

bitmap 仍然记录哪些字段存在。`ptrs` 向量为每个存在的字段包含一个相对指针，指向值区域。读取字段时，我们先检查 bitmap。如果位被设置，我们使用指针直接跳转到归档值。

这让我们可以完全跳过 `NULL` 字段，同时仍然支持快速访问。对于有许多可选列的宽 SQL 表，这可以显著减少行大小。

## 最终结果

对于有数百个可空列的表，收益显著。之前一个 `None` 或空的字符串总是消耗 24 字节，现在最好的情况下只消耗 1 位。

在引发这次调查的工作负载中，他们成功将序列化行大小减少了约 **2 倍**。磁盘 IO 相应下降。吞吐量恢复到客户预期的水平。

## 总结与思考

Rust 结构体很棒。

但它们做了一个重要假设：

> 大多数字段都存在。

SQL 表通常做出相反的假设：

> 大多数字段 _可能不存在_。

如果你结合这三件事：

* 数百个可空列
* 小字符串和/或稀疏数据
* 面向行的存储

普通结构体布局的开销就会成为瓶颈。

修复方法出奇地简单。得益于 rkyv 作为序列化框架提供的灵活性，他们可以保持内存中的结构体接口，只改变序列化格式——现在逐行选择最佳表示（密集 vs 稀疏）。

**关键要点：**

1. **Niche 优化有限制** - Rust 的 niche 优化很强大，但自定义序列化格式可能破坏它
2. **SQL 与 Rust 的假设冲突** - SQL 默认可空，Rust 假设数据存在，这种不匹配需要专门处理
3. **Bitmap 是经典方案** - 用 bitmap 跟踪 null 值是数据库系统的常见优化
4. **有时候最好的优化不是算法** - 而是改变数据的形状

> 有时候最好的优化不是聪明的算法。有时候只是改变数据的形状。

---

这个问题很有代表性：当我们将一个领域的抽象（SQL 表）映射到另一个领域（Rust 结构体）时，假设的差异可能导致意想不到的性能问题。理解这些底层细节，才能在系统设计中做出正确的权衡。