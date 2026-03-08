---
layout: post
title: "Rust Wasm 开发实战笔记：wasm-bindgen 最佳实践"
date: 2026-03-08 23:14:45 +0800
categories: tech-translation
description: "一篇深入浅出的 Rust WebAssembly 开发指南，总结了使用 wasm-bindgen 时的命名规范、内存管理策略、引用传递模式等实战经验，帮助开发者避开常见陷阱。"
original_url: https://notes.brooklynzelenka.com/Blog/Notes-on-Writing-Wasm
source: Hacker News
---

本文翻译自 [Notes on Writing Wasm](https://notes.brooklynzelenka.com/Blog/Notes-on-Writing-Wasm)，原载于 Hacker News。

## 引言

过去几年，作者一直在大量编写基于 Rust 的 WebAssembly（Wasm）代码。网络上关于 Wasm 的观点众多，而 wasm-bindgen 这个工具——怎么说呢——并非人见人爱。但随着使用经验的积累，以及学会如何规避其不足之处，作者发现了一些能够显著改善开发体验的模式。

首先需要声明两点：

1. 深深感谢 wasm-bindgen 维护者的辛勤工作
2. 可能存在比本文介绍的方法更好的实践方式；这里只是分享实际项目中行之有效的经验

作者见过优秀的程序员与 bindgen 斗智斗勇。不敢说掌握了所有答案，但这篇文章记录了一套让 Rust+Wasm 开发变得轻松得多的模式。

## TL;DR：核心要点

除非有充分理由不这样做，否则请遵循以下原则：

1. **所有跨 Wasm 边界的数据都通过引用（`&reference`）传递**
2. **优先使用 `Rc<RefCell<T>>` 或 `Arc<Mutex<T>>`，而非 `&mut`**
3. **导出类型不要派生 `Copy` trait**
4. **需要在集合（`Vec` 等）中跨边界传递的类型，使用 `wasm_refgen`**
5. **所有 Rust 导出类型以 `Wasm*` 为前缀，并将 `js_name`/`js_class` 设为无前缀的名称**
6. **所有 JS 导入类型以 `Js*` 为前缀**
7. **为所有 Rust 导出的错误类型实现 `From<YourError> for JsValue`，使用 `js_sys::Error`**

## 快速回顾：wasm-bindgen 工作原理

`wasm-bindgen` 生成胶水代码，使得 Rust 的结构体、方法和函数可以从 JS/TS 调用。某些 Rust 类型有直接的 JS 表示（实现了 `IntoWasmAbi` 的类型）；其他类型则完全驻留在 Wasm 端，通过不透明句柄（opaque handle）访问。

Wasm 绑定通常长这样：

```rust
#[wasm_bindgen(js_name = Foo)]
pub struct WasmFoo(RustFoo)

#[wasm_bindgen(js_name = Bar)]
pub struct WasmBar(RustBar)
```

从概念上讲，JS 端持有类似 `{ __wbg_ptr: 12345 }` 的小对象，这些是指向 Wasm 端表中实际 Rust 值的索引。

棘手之处在于你需要同时处理两种内存模型：

- **JavaScript**：垃圾回收、可重入、异步
- **Rust**：显式所有权、借用、别名规则

Bindgen 试图提供帮助，但它既「矫枉过正」又「力有不逮」：某些安全的模式被拒绝，而某些明显的陷阱却被欣然接受。归根结底，跨边界的所有东西都必须有某种 JS 表示，因此了解这种表示是什么非常重要。

## 命名很重要

计算机科学中最难的两个问题是命名、缓存失效和差一错误（off-by-one error）——这是老生常谈的笑话了。命名对于心理框架和追踪正在发生的事情极其重要，而这在使用 bindgen 时往往是痛苦的主要来源。

### IntoWasmAbi 类型

> `IntoWasmAbi` trait [...] 任何可以转换为能够直接跨越 Wasm ABI 的类型的 trait。

这些是 Wasm 的原语类型，如 `u32`、`String`、`Vec<u8>` 等。它们在跨越边界时会被转换为本地的 JS 和 Rust 类型。我们不需要对这些类型做任何特殊处理。

### Rust 导出的结构体使用 `Wasm*` 前缀

这是你通常花费大部分时间的地方。将 Rust 枚举和结构体包装在新类型（newtype）中重新暴露给 JS 是 Wasm 的主要工作。这些包装器使用 `Wasm*` 前缀，以帮助区分它们与 JS 导入接口、`IntoWasmAbi` 类型和普通 Rust 对象。在 JS 端，我们可以去掉 `Wasm` 前缀，因为它只有一种表示，而且（如果处理得当）JS 端通常不需要区分类型的来源。

```rust
#[derive(Debug, Clone, Copy, PartialOrd, Ord, PartialEq, Eq)]
pub enum StreetLight {
    Red,
    Yellow,
    Green,
}

#[derive(Debug, Clone, PartialOrd, Ord, PartialEq, Eq)]
#[wasm_bindgen(js_name = StreetLight)]
pub struct WasmStreetLight(StreetLight)

#[wasm_bindgen(js_class = StreetLight)]
impl WasmStreetLight {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(StreetLight::Red)
    }

    // ...
}
```

在 JS 端，只有一个 StreetLight，所以前缀消失了。在 Rust 端，前缀使导出类型在视觉上与以下类型区分开来：

- 普通 Rust 类型
- JS 导入接口
- `IntoWasmAbi` 值

### JS 导入接口使用 `Js*` 前缀

通过 `extern "C"` 引入 Rust 的任何接口都会获得一个鸭子类型接口（默认情况下）。这些可以不受限制地跨越边界，这使它们成为一个非常有用的逃生舱口。

```rust
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = logCurrentTime)]
    pub fn js_log_current_time(timestamp: u32);
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = Hero)]
    type JsCharacter;

    #[wasm_bindgen(method, getter, js_name = hp)]
    pub fn js_hp(this: &JsCharacter) -> u32;
}

// 其他地方
const gonna_win: bool = maelle.js_hp() != 0
```

鸭子类型对于想将 Rust trait 暴露给 JS 的情况非常有帮助：只要你的 Rust 导出类型实现了该接口，你就可以接受 Rust 导出类型作为 JS 导入类型，同时保留用 JS 导入类型替换它的能力。

一个具体例子：如果你正在导出一个存储接口，你可能有一个默认的 Rust 实现，但如果下游开发者想给它一个 IndexedDB 或 S3 后端，则需要可扩展性。

> 注意：稍后我们会在 `wasm_refgen` 中「滥用」这种「Rust 导出上的鸭子类型 JS 导入」。

这种方法的主要注意事项是：1. 如果接口更改则会变得脆弱；2. 如果不在 Rust 端用 `js_*` 前缀你的方法，可能会遇到命名空间冲突（因此建议在所有地方都按约定使用前缀）。额外的好处是，这让你非常清楚在哪里进行了跨 Wasm 边界的方法调用。

## 不要派生 `Copy`

`Copy` 使得意外复制实际上是资源薄句柄的 Rust 值变得轻而易举，从而导致空指针。养成在导出包装器上避免使用它的习惯。这可能是一个很难打破的肌肉记忆，因为在普通 Rust 代码中我们通常希望尽可能使用 `Copy`。

`Copy` 只有在导出包装 `IntoWasmAbi` 纯数据时才可接受，绝不能用于句柄。我将其归类为一种优化；默认使用非 `Copy`，除非你非常确定它没问题。

## 避免句柄断裂

尽管 `wasm-bindgen` 尽了最大努力，但无法防止运行时句柄断裂。一个常见的罪魁祸首是将拥有值传递给 Rust：

```rust
#[wasm_bindgen(js_class = Foo)]
impl WasmFoo {
    #[wasm_bindgen(js_name = "doSomething")]
    pub fn do_something(&self, bar: Bar) -> Result<(), Error> {
        // ...
    }

    #[wasm_bindgen(js_name = "doSomethingElse")]
    pub fn do_something_else(&self, bars: Vec<Bar>) -> Result<(), Error> {
        // ...
    }
}
```

如果你这样做，当然会消耗你的 `Bar`（们），但由于这跨越了边界，你不会从编译器那里得到关于如何管理 JS 端的帮助！对象会在 Rust 端被释放，但你仍然有一个 JS 句柄，现在它指向虚无。你可能会说「说好的内存安全呢」，而且你并没有错。

为什么会遇到这种情况？有几个原因：

- Bindgen 禁止 `&[T]`，除非 `T: IntoWasmAbi`
- `Vec<&T>` 不被允许
- 你只是想让编译器停止叫唤

实现了 `IntoWasmAbi` 但不是 `Copy` 的类型会在边界上被克隆（没有句柄），因此它们的行为与非 `IntoWasmAbi` 类型和 `Copy` 类型都不同。

### 优先通过引用传递（默认）

如果你要从这篇文章中带走一样东西，那就带走这个：

> 永远不要跨边界消耗导出值，除非你有明确的理由这样做，并且打算在 JS 端管理句柄。

这一点非常直接：通过引用传递所有东西。消耗一个值对编译器来说完全「合法」，因为它会愉快地在 Rust 端释放内存，但 JS 端的句柄不会被清理。下次你去使用那个句柄时，它会抛出错误。除非你在做一些特定的内存管理工作，否则直接避免这种情况：通过 `&reference` 传递并使用内部可变性。

这是一个非常容易遵循的模式：默认将非 `IntoWasmAbi` 类型包装在 `Rc<RefCell<T>>` 或 `Arc<Mutex<T>>` 中，具体取决于你的代码结构是否以及如何支持异步。跨越 Wasm 边界的成本绝对超过 `Rc` 的增量，所以这极不可能是性能瓶颈。

```rust
#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = Foo)]
pub struct WasmFoo(pub(crate) Rc<RefCell<Foo>>)

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = Bar)]
pub struct WasmBar(pub(crate) Rc<RefCell<Bar>>)

#[wasm_bindgen(js_class = Foo)]
impl WasmFoo {
    #[wasm_bindgen(js_name = "doSomething")]
    pub fn do_something(&self, bar: WasmBar) -> Result<(), Error> {
        // ...
    }
}
```

### 避免 `&mut`

这种情况发生时可能非常令人沮丧：在某些情况下，由于重入，使用 `&mut self` 可能会抛出运行时错误。鉴于 JS 的默认行为是单线程的，这种情况出现的频率比我预期的要高，但 JS 的 `async` 不必遵守 Rust 的编译时排他性检查。

> 如果你不能证明排他性，就不要假装你有它。使用适合你并发模型的内部可变性原语。

## 绕过引用限制

如前所述，你可以使用 `extern "C"` JS 导入来建模任何鸭子类型接口，包括 Rust 导出。这意味着我们能够绕过 `wasm-bindgen` 中的几个限制。

### 所有权集合限制

Bindgen 限制了哪些类型可以跨越边界传递。人们经常首先遇到的是 `&[T]` 只有在 `T` 是 `IntoWasmAbi`（包括 JS 导入类型）时才有效——即通常不是你的 Rust 导出结构体。这意味着你经常被迫构造一个 `Vec<T>`。这是有道理的，因为 JS 将控制结果 JS 数组，并可以随意修改它。这也意味着当类型返回时，除非适用前面的 `IntoWasmAbi` 警告，否则你无法接受它作为 `&[T]` 或 `Vec<T>`。

一个典型的例子是当 `T` 没有实现 JS 管理的类型时，返回拥有的 `Vec<T>` 而不是切片。返回给 JS 的不是一堆 `T`，而是指向驻留在 Wasm 端的 `T` 的句柄（例如 `{ __wbg_ptr: 12345 }`）。

另一方面，我们能够将句柄视为符合某种接口的鸭子类型对象。句柄比 Rust 导出类型受到的限制少得多，可以更自由地传递。

解决方案非常直接：

- 让你的导出类型克隆成本低廉
- 暴露一个命名空间的克隆方法
- 通过 JS 接口导入该方法
- 用友好的人体工程学转换（`.into`）

```rust
// 步骤 1：使 `clone` 成本低廉（即如果还不便宜，使用 `Rc` 或 `Arc`）
#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = Character)]
pub struct WasmCharacter(Rc<RefCell<Character>>)

#[wasm_bindgen(js_class = Character)]
impl WasmCharacter {
    // ...

    // 步骤 2：在 Wasm 导出上暴露一个*命名空间*（重要！）`clone` 函数
    #[doc(hidden)]
    pub fn __myapp_character_clone(&self) -> Self {
        self.clone()
    }
}

#[wasm_bindgen]
extern "C" {
    type JsCharacter

    // 步骤 3：创建一个带有该命名空间 `clone` 的 JS 导入接口
    pub fn __myapp_character_clone(this: &JsCharacter) -> WasmCharacter;
}

// 步骤 4：为了方便，将命名空间克隆包装在 `.from` 中
impl From<JsCharacter> for WasmCharacter {
    fn from(js: JsCharacter) -> Self {
        js.__myapp_character_clone()
    }
}

//                             类型良好的 Vec
// 步骤 5：使用它！                 vvvvv
pub fn do_many_things(js_foos: Vec<JsFoo>) {
  let rust_foos: Vec<WasmFoo> = js_foos.iter().map(Into::into).collect();
  // ...             ^^^^^^^
  //                已转换
}
```

这仍然要求你手动跟踪 bindgen 认为哪些部分是 JS 导入，哪些是 Rust 导出，但通过我们的命名约定，发生的事情非常清楚。转换不是免费的，但（在我看来）它使你的接口更加灵活和清晰。

### 使用 wasm_refgen

上述模式可能有点脆弱——即使在编写样板代码时——因为所有名称都必须恰到好处地对齐，而且像这样跨越边界时你不会得到编译器帮助。为了使这更加可靠，作者将这个模式封装成了一个从 `wasm_refgen` 导出的宏。

```rust
use std::{rc::Rc, cell::RefCell};
use wasm_bindgen::prelude::*;
use wasm_refgen::wasm_refgen;

#[derive(Clone)]
#[wasm_bindgen(js_name = "Foo")]
pub struct WasmFoo {
   map: Rc<RefCell<HashMap<String, u8>>>, // 克隆成本低廉
   id: u32 // 克隆成本低廉
}

#[wasm_refgen(js_ref = JsFoo)] // <-- 这行
#[wasm_bindgen(js_class = "Foo")]
impl WasmFoo {
   // ... 你的普通方法
}
```

## 自动转换为 JS 错误

有几种方法可以处理来自 Wasm 的错误，但在我看来，细节和便利性的最佳平衡是在它们变成 `JsValue` 的路上将它们转换为 `js_sys::Error`。这让我们返回 `Result<T, MyError>` 而不是 `Result<T, JsValue>`。

例如，假设我们有这个类型：

```rust
#[derive(Debug, Clone, thiserror::Error)]
pub enum RwError {
    #[error("cannot read {0}")]
    CannotRead(String),

    #[error("cannot write")]
    CannotWrite
}
```

事实上这是一个枚举实际上不是问题（其余的技术仍然有效），但如果你正在包装另一个 crate，你需要一个新类型包装器：

```rust
// 重要：不要加 #[wasm_bindgen]
#[derive(Debug, Clone, thiserror::Error)]
#[error(transparent)]
pub struct WasmRwError(#[from] RwError) // #[from] 让我们使用 `?` 语法提升到新类型
```

我们可以给这个加上 `#[wasm_bindgen]` 然后就完事了，但那样我们在 JS 端就不会得到好的错误信息。相反，我们用最后一点胶水自己转换为 `JsValue`：

```rust
impl From<WasmRwError> for JsValue {
    fn from(wasm: WasmRwError) -> Self {
        let err = js_sys::Error::new(&wasm.to_string()); // 错误消息
        err.set_name("RwError"); // 好的 JS 错误类型
        err.into() // 转换为 `JsValue`
    }
}
```

现在你可以返回 `Result<T, WasmRwError>`，包括如果你想在代码的其他地方调用 Wasm 包装的函数。它在 Rust 端保留了好的错误（至少作为文档类型）。你还获得 `?` 语法，而无需在每个发生此错误的地方进行就地 `JsValue` 转换；bindgen 会帮你进行转换。

- 类型化的 Rust 错误
- `?` 传播
- 真正的 JS `Error` 对象
- 调用点零样板代码

这可以作为复制粘贴模板使用；作者曾考虑将其包装为宏，但不到 10 行代码。实际上惊讶于没有类似 `#[wasm_bindgen(error)]` 的东西可用（也许有，只是找不到；也许值得向上游贡献）。

## 打印构建信息

这是一个生活质量改进，节省了许多小时的痛苦：在启动时将确切的构建版本、脏状态和 Git 哈希打印到控制台。如果你同时在开发一个使用它的纯 JS 库和 Wasm 项目，让像 `Vite` 这样的 JS 打包器获取变化可能会不稳定。

这需要一些设置，特别是在 Cargo workspace 中，但物有所值。

**$WORKSPACE/Cargo.toml:**

```toml
[workspace]
resolver = "3"
members = [
  "build_info",
  # ...
]
```

**$WORKSPACE/build_info/Cargo.toml:**

```toml
[package]
name = "build_info"
publish = false
# ...
```

**$WORKSPACE/build_info/build.rs:**（完整代码见原文）

**$WORKSPACE/build_info/src/lib.rs:**

```rust
#![no_std]
pub const GIT_HASH: &str = env!("GIT_HASH");
```

**在 Wasm 中打印：**

```rust
use wasm_bindgen::prelude::*;

// ...

#[wasm_bindgen(start)]
pub fn start() {
    set_panic_hook();

    // 作者实际上在这里使用 `tracing::info!`，
    // 但这超出了本文的范围
    web_sys::console.info1(format!(
        "️your_package_wasm v{} ({})",
        env!("CARGO_PKG_VERSION"),
        build_info::GIT_HASH
    ));
}
```

## 总结

Rust+Wasm 很强大——但如果你假装边界不存在，它会毫不留情。要明确，命名清晰，通过引用传递，并利用鸭子类型绕过 bindgen 施加的任何（不合理的）限制。

希望这对其他人有帮助！作者可能会随着时间推移发现更多模式并更新这篇文章。

---

## 译者总结

这篇文章提供了非常实用的 Rust + WebAssembly 开发经验。核心要点：

1. **命名约定**：`Wasm*` 前缀用于导出，`Js*` 前缀用于导入，这让代码更清晰
2. **内存管理**：不要用 `Copy`，用 `Rc<RefCell<T>>` 包装，避免 `&mut`
3. **引用优先**：跨边界永远用引用传递，避免句柄断裂
4. **错误处理**：实现 `From<Error> for JsValue`，返回真正的 JS Error 对象
5. **调试友好**：打印构建版本和 Git 哈希，对调试非常有帮助

`wasm_refgen` 这个工具看起来很有用，解决了集合类型跨边界的痛点。如果你在写 Rust Wasm，这些模式值得参考。
