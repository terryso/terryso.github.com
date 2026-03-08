---
layout: post
title: "WebAssembly 开发实战：Rust 与 wasm-bindgen 的最佳实践"
date: 2026-03-08 21:08:10 +0800
categories: tech-translation
description: "本文总结了使用 Rust 编写 WebAssembly 时的实战经验和设计模式，包括命名规范、内存管理、错误处理等关键技巧，帮助你避开 wasm-bindgen 的常见陷阱。"
original_url: https://notes.brooklynzelenka.com/Blog/Notes-on-Writing-Wasm
source: Hacker News
---

本文翻译自 [Notes on Writing Wasm](https://notes.brooklynzelenka.com/Blog/Notes-on-Writing-Wasm)，原载于 Hacker News。

---

过去几年，我写了越来越多的 Rust WebAssembly（以下简称 Wasm）代码。网上关于 Wasm 的观点很多，wasm-bindgen 这个工具——怎么说呢——并非人见人爱。但随着经验的积累，我学会了如何绕过它的各种缺陷，也总结出了一些显著改善开发体验的模式。

先声明两点：

1. 我非常感谢 wasm-bindgen 维护者的工作
2. 很可能存在比我这里介绍的更好的方法；这只是我在实践中摸索出的经验之谈！

我见过优秀的程序员和 bindgen 搏斗。我不敢说自己掌握了所有答案，但这篇文章记录了一套让 Rust+Wasm 开发变得轻松得多的模式。

## TL;DR 核心要点

除非有充分的理由，否则请遵循以下原则：

1. **跨 Wasm 边界传递数据时，优先使用 `&reference`（引用）**
2. **优先使用 `Rc<RefCell<T>>` 或 `Arc<Mutex<T>>` 而非 `&mut`**
3. **不要在导出类型上 derive `Copy`**
4. **对于需要在集合（`Vec` 等）中传递的类型，使用 `wasm_refgen`**
5. **所有 Rust 导出类型加 `Wasm*` 前缀，并通过 `js_name`/`js_class` 设置为无前缀的名称**
6. **所有 JS 导入类型加 `Js*` 前缀**
7. **为所有 Rust 导出的错误类型实现 `From<YourError> for JsValue`，使用 `js_sys::Error`**

## 快速回顾：wasm-bindgen 是如何工作的

`wasm-bindgen` 生成胶水代码，让 Rust 的结构体、方法和函数可以被 JS/TS 调用。有些 Rust 类型有直接的 JS 表示（实现了 `IntoWasmAbi` trait）；其他的则完全生活在 Wasm 一侧，通过不透明句柄（opaque handle）访问。

Wasm 绑定通常长这样：

```rust
#[wasm_bindgen(js_name = Foo)]
pub struct WasmFoo(RustFoo);

#[wasm_bindgen(js_name = Bar)]
pub struct WasmBar(RustBar);
```

从概念上讲，JS 端持有的是类似 `{ __wbg_ptr: 12345 }` 这样的轻量对象，它们索引到 Wasm 端的一个表，而真正的 Rust 值就存储在这个表中。

棘手的地方在于，你需要同时处理两种内存模型：

- **JavaScript**：垃圾回收、可重入、异步
- **Rust**：显式所有权、借用规则、别名规则

Bindgen 试图帮忙，但它同时存在「欠拟合」和「过拟合」的问题：有些安全的模式被拒绝，而有些明摆着的坑却被欣然接受。归根结底，跨越边界的所有东西都必须有某种 JS 表示，所以了解这种表示是什么非常重要。

## 命名很重要

计算机科学最难的两个问题：命名、缓存、和差一错误。命名对于心智框架和追踪程序运行状态极其重要，这在 bindgen 开发中尤其容易成为痛点。我使用以下命名规范：

### IntoWasmAbi 类型

这些是 Wasm 的基础类型，如 `u32`、`String`、`Vec<u8>` 等。它们在跨越边界时会被转换为原生的 JS 或 Rust 类型。我们不需要对这些类型做任何特殊处理。

### Rust 导出的结构体加 `Wasm*` 前缀

这是你最常打交道的地方。用 newtype 包装 Rust 的 enum 和 struct 并重新暴露给 JS，这是 Wasm 开发的基本功。这些包装器加上 `Wasm*` 前缀，有助于区分它们与 JS 导入的接口、`IntoWasmAbi` 类型和普通 Rust 对象。

```rust
#[derive(Debug, Clone, Copy, PartialOrd, Ord, PartialEq, Eq)]
pub enum StreetLight {
    Red,
    Yellow,
    Green,
}

#[derive(Debug, Clone, PartialOrd, Ord, PartialEq, Eq)]
#[wasm_bindgen(js_name = StreetLight)]
pub struct WasmStreetLight(StreetLight);

#[wasm_bindgen(js_class = StreetLight)]
impl WasmStreetLight {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self(StreetLight::Red)
    }

    // ...
}
```

在 JS 端，只有一个 StreetLight，所以前缀消失了。而在 Rust 端，前缀让导出类型在视觉上与普通 Rust 类型、JS 导入接口和 `IntoWasmAbi` 值区分开来。

### JS 导入的接口加 `Js*` 前缀

任何通过 `extern "C"` 引入 Rust 的接口都是鸭子类型的（duck typed）。它们可以不受限制地跨越边界，这是一个非常有用的逃生舱。

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

// 使用
const gonna_win: bool = maelle.js_hp() != 0;
```

鸭子类型对于想要把 Rust trait 暴露给 JS 的情况非常有帮助：只要你的 Rust 导出类型实现了该接口，你就可以接受 Rust 导出类型作为 JS 导入类型，同时保留用 JS 导入类型替换它的能力。

**注意**：如果你不在 Rust 端给方法加上 `js_*` 前缀，可能会遇到命名空间冲突。

## 不要 derive Copy

`Copy` 会让你意外复制一个实际上是资源句柄的 Rust 值，导致空指针问题。养成习惯，在导出的包装器上避免使用它。这可能是个难改的肌肉记忆，因为在普通 Rust 代码中我们通常希望 `Copy` 到处都是。

`Copy` 只在包装纯数据（实现了 `IntoWasmAbi`）时可以接受，绝对不要用于句柄。我把它归结为一种优化：默认不使用 `Copy`，除非你真的确定没问题。

## 避免句柄断裂

不管 `wasm-bindgen` 多努力，它也无法在运行时阻止句柄断裂。一个常见原因是向 Rust 传递所有权值：

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

如果你这样做，当然会消耗你的 `Bar`，但由于这是跨越边界的操作，编译器不会帮你管理 JS 端！对象会在 Rust 端被释放，但你的 JS 句柄还在，指向的却已经是什么都没有了。下次你试图使用这个句柄时，就会抛出错误。

### 优先通过引用传递（默认）

如果你只从这篇文章带走一件事，那就是：

> **永远不要在跨边界时消耗导出值，除非你有明确的理由并且会在 JS 端管理句柄。**

这很简单：所有东西都通过引用传递。消耗一个值对编译器来说是完全「合法」的，因为它会愉快地在 Rust 端释放内存，**但 JS 端的句柄不会被清理**。下次你使用这个句柄时，它就会抛出错误。除非你在做特定的内存管理，否则直接避免这种情况：通过 `&reference` 传递，使用内部可变性。

这很容易做到：默认用 `Rc<RefCell<T>>` 或 `Arc<Mutex<T>>` 包装非 `IntoWasmAbi` 类型。跨越 Wasm 边界的成本绝对超过一次 `Rc` 引用计数增加，所以这不太可能成为性能瓶颈。

```rust
#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = Foo)]
pub struct WasmFoo(pub(crate) Rc<RefCell<Foo>>);

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = Bar)]
pub struct WasmBar(pub(crate) Rc<RefCell<Bar>>);

#[wasm_bindgen(js_class = Foo)]
impl WasmFoo {
    #[wasm_bindgen(js_name = "doSomething")]
    pub fn do_something(&self, bar: WasmBar) -> Result<(), Error> {
        // ...
    }
}
```

### 避免 `&mut`

这可能会让人很沮丧：有些情况下，使用 `&mut self` 会因为重入（re-entrancy）而抛出运行时错误。考虑到 JS 默认是单线程的，这种情况出现的频率比我预期的要高，但 JS 的 `async` 不必遵守 Rust 的编译时排他性检查。

> **如果你无法证明排他性，就不要假装你有它。使用适合你并发模型的内部可变性原语。**

## 绕过引用限制：使用 wasm_refgen

如前所述，你可以用 `extern "C"` JS 导入来模拟任何鸭子类型的接口，**包括 Rust 导出**。这意味着我们可以绕过 `wasm-bindgen` 的多个限制。

Bindgen 限制了哪些类型可以跨越边界传递。最常遇到的是 `&[T]` 只在 `T` 是 `IntoWasmAbi` 时才能工作——通常不是你的 Rust 导出结构体。这意味着你经常被迫构造 `Vec<T>`。返回给 JS 的不是一堆 `T`，而是指向 Wasm 端 `T` 的**句柄**（如 `{ __wbg_ptr: 12345 }`。

解决方案：

1. 让导出类型廉价地 clone（使用 `Rc` 或 `Arc`）
2. 暴露一个带命名空间的 clone 方法
3. 通过 JS 接口导入该方法
4. 用友好的语法转换（`.into`）

```rust
// Step 1: 让 clone 变得廉价
#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = Character)]
pub struct WasmCharacter(Rc<RefCell<Character>>);

#[wasm_bindgen(js_class = Character)]
impl WasmCharacter {
    // ...

    // Step 2: 暴露带命名空间的 clone 方法
    #[doc(hidden)]
    pub fn __myapp_character_clone(&self) -> Self {
        self.clone()
    }
}

#[wasm_bindgen]
extern "C" {
    type JsCharacter;

    // Step 3: 创建 JS 导入接口
    pub fn __myapp_character_clone(this: &JsCharacter) -> WasmCharacter;
}

// Step 4: 实现 From 方便转换
impl From<JsCharacter> for WasmCharacter {
    fn from(js: JsCharacter) -> Self {
        js.__myapp_character_clone()
    }
}

// Step 5: 使用
pub fn do_many_things(js_foos: Vec<JsFoo>) {
    let rust_foos: Vec<WasmFoo> = js_foos.iter().map(Into::into).collect();
    // ...
}
```

为了简化这个模式，我创建了一个宏 `wasm_refgen`：

```rust
use std::{rc::Rc, cell::RefCell};
use wasm_bindgen::prelude::*;
use wasm_refgen::wasm_refgen;

#[derive(Clone)]
#[wasm_bindgen(js_name = "Foo")]
pub struct WasmFoo {
   map: Rc<RefCell<HashMap<String, u8>>>,
   id: u32
}

#[wasm_refgen(js_ref = JsFoo)]
#[wasm_bindgen(js_class = "Foo")]
impl WasmFoo {
   // ... 你的普通方法
}
```

## 自动转换为 JS 错误

处理来自 Wasm 的错误有多种方式，但我认为最好的平衡是将其转换为 `js_sys::Error` 再变成 `JsValue`。这样我们可以返回 `Result<T, MyError>` 而不是 `Result<T, JsValue>`。

```rust
#[derive(Debug, Clone, thiserror::Error)]
pub enum RwError {
    #[error("cannot read {0}")]
    CannotRead(String),

    #[error("cannot write")]
    CannotWrite,
}

// 重要：不要加 #[wasm_bindgen]
#[derive(Debug, Clone, thiserror::Error)]
#[error(transparent)]
pub struct WasmRwError(#[from] RwError);

impl From<WasmRwError> for JsValue {
    fn from(wasm: WasmRwError) -> Self {
        let err = js_sys::Error::new(&wasm.to_string());
        err.set_name("RwError");
        err.into()
    }
}
```

这样你可以返回 `Result<T, WasmRwError>`，在 Rust 端保留良好的错误类型，同时在 JS 端获得真正的 `Error` 对象。还可以使用 `?` 语法，无需到处做 `JsValue` 转换。

## 打印构建信息

这是一个节省了我大量调试时间的质量改进：在启动时打印确切的构建版本、dirty 状态和 Git hash 到控制台。

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    set_panic_hook();

    web_sys::console.info1(format!(
        "your_package_wasm v{} ({})",
        env!("CARGO_PKG_VERSION"),
        build_info::GIT_HASH
    ));
}
```

## 总结

Rust+Wasm 很强大——但如果你假装边界不存在，它会毫不留情。要明确，命名要清晰，通过引用传递，并使用鸭子类型绕过 bindgen 的任何（不合理的）限制。

---

**核心要点：**

1. 跨边界传递时优先用引用，用 `Rc<RefCell<T>>` 包装
2. 导出类型加 `Wasm*` 前缀，导入类型加 `Js*` 前缀
3. 不要在导出类型上 derive `Copy`
4. 用 `wasm_refgen` 处理集合中的类型传递
5. 实现 `From<Error> for JsValue` 获得更好的错误处理体验
6. 打印构建信息方便调试
