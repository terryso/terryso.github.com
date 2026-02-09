---
layout: post
title: "关于生成 C 代码的六个思考"
date: 2026-02-10 00:29:02 +0800
categories: tech-translation
description: "一位编译器工程师分享在生成 C 代码时的实践经验，包括静态内联函数、类型安全、内存拷贝和 ABI 处理等方面的见解"
original_url: https://wingolog.org/archives/2026/02/09/six-thoughts-on-generating-c
source: Hacker News
---

本文翻译自 [six thoughts on generating c](https://wingolog.org/archives/2026/02/09/six-thoughts-on-generating-c)，原载于 Hacker News。

---

我从事编译器工作，这意味着我编写的程序能够将程序转换为程序。有时候，你需要输出的目标语言比汇编语言更高级，而 C 语言往往是这样的选择。

生成 C 代码比手写 C 代码要省心得多，因为代码生成器通常可以避免那些手写 C 时必须小心翼翼处理的未定义行为陷阱。不过，我发现一些模式能够帮助我获得更好的结果。

今天的笔记是我总结的一些行之有效的经验。我不敢自夸这些是"最佳实践"，但它们是我的实践，如果你喜欢，也可以借鉴。

## 1. static inline 函数实现数据抽象

当我学习 C 语言时（是在 GStreamer 的早期，哦，感谢上天，它的网站至今还是那个样子！），我们使用大量的预处理器宏。后来我们逐渐明白，许多宏的使用应该是内联函数；宏用于标记粘贴和生成名称，而不是用于数据访问或其他实现。

但我后来才意识到，始终内联的函数可以完全消除数据抽象带来的任何性能损失。例如，在 Wastrel 中，我可以通过一个 memory 结构体来描述 WebAssembly 内存的边界范围，以及另一个结构体来描述访问：

```c
struct memory { uintptr_t base; uint64_t size; };
struct access { uint32_t addr; uint32_t len; };
```

然后，如果我想要一个指向该内存的可写指针，我可以这样做：

```c
#define static_inline \
  static inline __attribute__((always_inline))

static_inline void* write_ptr(struct memory m, struct access a) {
  BOUNDS_CHECK(m, a);
  char *base = __builtin_assume_aligned((char *) m.base_addr, 4096);
  return (void *) (base + a.addr);
}
```

（Wastrel 通常会省略 BOUNDS_CHECK 的任何代码，只是依赖内存被映射到适当大小的 PROT_NONE 区域。我们在那里使用宏，是因为如果边界检查失败并终止进程，能够使用 `__FILE__` 和 `__LINE__` 是很方便的。）

无论是否启用显式边界检查，`static_inline` 属性都确保抽象成本完全消失；而在省略边界检查的情况下，我们甚至不需要内存的大小或访问的长度，因此它们根本不会被分配。

如果 `write_ptr` 不是 `static_inline`，我会担心某个地方这些结构体值会通过内存传递。这主要是一个关注点，即按值返回结构体的函数；例如在 AArch64 中，返回 `struct memory` 会使用与调用 `void (*)(struct memory)` 的参数相同的寄存器，但 SYS-V x64 ABI 只分配两个通用寄存器用于返回值。我大多不想考虑这种类型的瓶颈，这就是 static inline 函数为我做的事情。

## 2. 避免隐式整数转换

C 有一组奇特的默认整数转换规则，例如将 `uint8_t` 提升为有符号 int，并且有符号整数还有奇怪的边界条件。在生成 C 代码时，我们应该避开这些规则，而是显式地处理：定义 `static inline u8_to_u32`、`s16_to_s32` 等转换函数，并开启 `-Wconversion`。

使用 static inline 转换函数还允许生成的代码断言操作数是特定类型。理想情况下，你最终会处于所有转换都在辅助函数中，而生成的代码中没有任何转换的情况。

## 3. 用意图包装原始指针和整数

Whippet 是一个用 C 编写的垃圾回收器。垃圾回收器跨越所有数据抽象：对象有时被视为绝对地址，或分页空间中的范围，或从对齐区域开始的偏移量等等。如果你用 `size_t` 或 `uintptr_t` 或其他什么来表示所有这些概念，你会过得很糟糕。因此 Whippet 有 `struct gc_ref`、`struct gc_edge` 等：单成员结构体，其目的是通过划分适用的操作集来避免混淆。`gc_edge_address` 调用永远不会应用于 `struct gc_ref`，其他类型和操作也是如此。

这对于手写代码来说是一个很好的模式，但对于编译器来说特别强大：你经常最终会编译已知类型或类别的术语，并且你希望避免在残差 C 中出现错误。

例如，在编译 WebAssembly 时，考虑 `struct.set` 的操作语义：文本渲染声明，"断言：由于验证，_val_ 是某个 ref.struct structaddr。" 如果这个断言能够转换为 C 岂不是很好？在这种情况下它可以：使用单继承子类型化（正如 WebAssembly 所拥有的），你可以创建一个指针子类型森林：

```c
typedef struct anyref { uintptr_t value; } anyref;
typedef struct eqref { anyref p; } eqref;
typedef struct i31ref { eqref p; } i31ref;
typedef struct arrayref { eqref p; } arrayref;
typedef struct structref { eqref p; } structref;
```

因此，对于 `(type $type_0 (struct (mut f64)))`，我可能会生成：

```c
typedef struct type_0ref { structref p; } type_0ref;
```

然后，如果我为 `$type_0` 生成字段设置器，我让它接受 `type_0ref`：

```c
static inline void
type_0_set_field_0(type_0ref obj, double val) {
  ...
}
```

通过这种方式，类型从源语言传递到目标语言。对于实际的对象表示，也有类似的类型森林：

```c
typedef struct wasm_any { uintptr_t type_tag; } wasm_any;
typedef struct wasm_struct { wasm_any p; } wasm_struct;
typedef struct type_0 { wasm_struct p; double field_0; } type_0;
```

并且我们生成小的转换例程，根据需要在 `type_0ref` 和 `type_0*` 之间来回转换。没有开销，因为所有例程都是 static inline，我们免费获得指针子类型化：如果 `struct.set $type_0 0` 指令传递 `$type_0` 的子类型，编译器可以生成一个类型检查的向上转换。

## 4. 不要害怕 memcpy

在 WebAssembly 中，对线性内存的访问不一定是对齐的，所以我们不能只是将地址转换为（比如说）`int32_t*` 并解引用。相反，我们使用 `memcpy(&i32, addr, sizeof(int32_t))`，并信任编译器在可以的情况下只发出一个未对齐的加载（它确实可以）。这里不需要更多的话！

## 5. 对于 ABI 和尾调用，执行手动寄存器分配

所以，GCC 终于有了 `__attribute__((musttail))`：值得赞美。然而，在编译 WebAssembly 时，你可能最终编译一个有 30 个参数或 30 个返回值的函数；我不信任 C 编译器能够在尾调用到或来自这样的函数时可靠地洗牌不同的栈参数需求。如果它不能满足其 musttail 义务，它甚至可能拒绝编译文件；这对于目标语言来说不是一个好特性。

你真的希望所有函数参数都分配到寄存器。你可以确保这种情况，例如，你只在寄存器中传递前 n 个值，然后将其余的传递在全局变量中。你不需要在栈上传递它们，因为你可以让被调用者在序言部分将它们加载回局部变量。

有趣的是，这也很好地启用了编译到 C 时的多个返回值：只需遍历程序中使用的函数类型集，分配足够数量的正确类型的全局变量来存储所有返回值，并使函数尾声将任何"多余"的返回值——如果有的话，超过第一个返回值的返回值——存储在全局变量中，并让调用者在调用后立即重新加载这些值。

## 6. 还有什么不喜欢的

生成 C 是一个局部最优：你获得了 GCC 或 Clang 的工业级指令选择和寄存器分配，你不必实现许多孔洞式优化，并且你可以链接到可能可内联的 C 运行时例程。很难以边际方式改进这个设计点。

当然有缺点。作为一个 Scheme 程序员，我最大的烦恼是我无法控制栈：我不知道给定的函数需要多少栈，也无法以任何合理的方式扩展程序的栈。我无法迭代栈以精确枚举嵌入的指针（但这也许没关系）。我当然不能切片栈来捕获 delimited continuation。

另一个主要的烦恼是关于副表：你希望能够实现所谓的零成本异常，但没有编译器和工具链的支持，这是不可能的。

最后，源级调试很棘手。你希望能够嵌入与你残差代码对应的 DWARF 信息；我不知道在生成 C 时如何做到这一点。

（你问为什么不使用 Rust？当然你在问。就其价值而言，我发现生命周期是前端问题；如果我有一个具有显式生命周期的源语言，我会考虑生成 Rust，因为我可以机器检查输出具有与输入相同的保证。同样，如果我使用 Rust 标准库。但是如果你从一种没有花哨生命周期的语言编译，我不知道你会从 Rust 得到什么：更少的隐式转换，是的，但不太成熟的尾调用支持，更长的编译时间... 我认为这是一场平局。）

好吧。没有什么东西是完美的，最好睁大眼睛进入事物。如果你读到这里，我希望这些笔记在你的生成工作中帮助你。对我来说，一旦我生成的 C 代码通过了类型检查，它就可以工作：几乎不需要调试。黑客并不总是这样，但当它来临时我会接受。直到下一次，快乐黑客！

---

## 关键要点

这篇文章的核心价值在于作者作为编译器工程师的实战经验总结：

1. **利用 static inline 消除抽象成本**——通过 `__attribute__((always_inline))` 确保零性能损失的抽象层
2. **显式处理类型转换**——避免 C 语言的隐式整数转换陷阱，开启 `-Wconversion` 警告
3. **类型安全的指针包装**——使用单成员结构体实现编译期类型检查和子类型化
4. **信任编译器的 memcpy 优化**——对于未对齐内存访问，memcpy 通常会被优化为单条指令
5. **手动寄存器分配应对极端情况**——处理大量参数/返回值时，全局变量比栈传递更可靠
6. **生成 C 代码的权衡**——获得成熟的优化能力，但牺牲了栈控制和零成本异常

这些经验对于任何需要将高级语言编译到 C 代码的项目都有参考价值，特别是 WebAssembly、DSL 等场景。
