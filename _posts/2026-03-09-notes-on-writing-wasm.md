---
layout: post
title: "WebAssembly 开发实战笔记"
date: 2026-03-09 04:25:24 +0800
categories: tech-translation
description: "一篇关于 Rust + WebAssembly 开发的实战经验总结，分享了在 wasm-bindgen 开发中总结的一系列实用模式和最佳实践，帮助开发者更高效地跨越 Rust 与 JavaScript 的边界。"
original_url: https://notes.brooklynzelenka.com/Blog/Notes-on-Writing-Wasm
source: Hacker News
---

本文翻译自 [Notes on Writing Wasm](https://notes.brooklynzelenka.com/Blog/Notes-on-Writing-Wasm)，原载于 Hacker News。

---

过去几年，我一直在用 Rust 编写越来越多的 WebAssembly（Wasm）代码。网上关于 Wasm 的讨论很多，而 `wasm-bindgen` 这个工具——怎么说呢——并不是人人都爱。但随着经验的积累，我逐渐摸索出了一些绕过其短板的方法，发现了一些能显著改善开发体验的模式。

首先声明两点：

1. 我非常感谢 wasm-bindgen 维护者们的辛勤工作
2. 完全可能存在比本文介绍的更好的方法——这里只是我在实践中总结出的经验！

我见过很多优秀的程序员与 bindgen 斗得焦头烂额。我不敢说自己掌握了所有答案，但这篇文章记录了一套让 Rust + Wasm 开发变得更加顺畅的模式。

## TL;DR

除非有充分的理由不这么做，否则请遵循以下原则：

1. 跨越 Wasm 边界时，始终通过 `&reference` 传递
2. 优先使用 `Rc<RefCell<T>>` 或 `Arc<Mutex<T>>`，而非 `&mut`
3. 不要在导出类型上派生 `Copy`
4. 对于需要在集合（`Vec` 等）中跨越边界的类型，使用 `wasm_refgen`
5. 所有 Rust 导出类型以 `Wasm*` 为前缀，并将 `js_name`/`js_class` 设为无前缀的名称
6. 所有 JS 导入类型以 `Js*` 为前缀
7. 为所有 Rust 导出的错误类型实现 `From<T> for JsValue`，使用 `js_sys::Error`

## 快速回顾

`wasm-bindgen` 生成胶水代码，让 Rust 的结构体、方法和函数可以从 JS/TS 调用。某些 Rust 类型有直接的 JS 表示（实现了 `IntoWasmAbi` trait 的类型）；其他类型则完全存在于 Wasm 一侧，通过不透明句柄访问。

Wasm 绑定通常长这样：

```rust
#[wasm_bindgen(js_name = Foo)]
pub struct WasmFoo(RustFoo);

#[wasm_bindgen(js_name = Bar)]
pub struct WasmBar(RustBar);
```

从概念上讲，JS 端持有的是类似 `{ __wbg_ptr: 12345 }` 的小对象，它们索引到 Wasm 端的一个表，而该表持有真正的 Rust 值。

棘手的是，你需要同时处理两种内存模型：

- **JavaScript**：垃圾回收、可重入、异步
- **Rust**：显式所有权、借用、别名规则

Bindgen 试图帮忙，但它既"欠拟合"又"过拟合"：一些安全的模式被拒绝，一些真正的"脚枪"却被愉快地接受。归根结底，跨越边界的所有东西都必须有某种 JS 表示，因此了解这种表示是什么非常重要。

## 你应该手写绑定吗？

我对大多数事情的态度是"你自己看着办"，这个问题很大程度上也是个人偏好。我在网上看到不少代码似乎更倾向于使用 `js_sys` 手动转换。这是一种合理的策略，但我发现这样做既耗时又脆弱。如果你修改了 Rust 类型，当你手动调用 `dyn_into` 做运行时检查时，编译器帮不了你。Bindgen 反正都会插入相同的运行时检查，但如果你善用它的胶水代码（包括本文介绍的一些模式），你可以获得更好的编译时反馈。

## 命名很重要

计算机科学中最难的两个问题是命名、缓存失效和差一错误——这是个老笑话了。但在使用 bindgen 时，命名对于思维框架和追踪正在发生的事情极其重要，而这往往是痛苦的来源。

### `IntoWasmAbi` 类型

> **引用**
>
> Trait `IntoWasmAbi` [...] 任何可以转换为能直接跨越 Wasm ABI 的类型的东西都可以实现此 trait。

这些是 Wasm 的原始类型，如 `u32`、`String`、`Vec<u8>` 等。它们在跨越边界时会被转换为/自原生 JS 和 Rust 类型。我们不需要对这些类型做任何特殊处理。

### Rust 导出结构体使用 `Wasm*` 前缀

这是你通常花费大部分时间的地方。将 Rust 的枚举和结构体包装在新类型中重新暴露给 JS 是 Wasm 开发的基础工作。这些包装器使用 `Wasm*` 前缀，有助于区分它们与 JS 导入接口、`IntoWasmAbi` 类型和普通 Rust 对象。在 JS 端，我们可以去掉 `Wasm` 前缀，因为它只有一种表示，而且（如果做得正确）JS 端通常不需要区分类型的来源。

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

在 JS 端，只有一个 `StreetLight`，所以前缀消失了。在 Rust 端，前缀让导出类型在视觉上与以下类型区分开来：

- 普通 Rust 类型
- JS 导入接口
- `IntoWasmAbi` 值

### JS 导入接口使用 `Js*` 前缀

通过 `extern "C"` 引入 Rust 的任何接口都会获得一个鸭子类型的接口（默认情况下）。它们可以无限制地跨越边界传递，这使它们成为一个非常有用的逃生舱口。

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
const gonna_win: bool = maelle.js_hp() != 0;
```

鸭子类型对于想要将 Rust trait 暴露给 JS 的情况非常有帮助：只要你的 Rust 导出类型实现了该接口，你就可以接受 Rust 导出类型作为 JS 导入类型，同时保留用 JS 导入类型替换它的能力。

一个具体的例子是：如果你要导出一个存储接口，你可能有一个默认的 Rust 实现，但也希望下游开发者能够给它换上 IndexedDB 或 S3 后端。

> **注意**
>
> 我们稍后会在 `wasm_refgen` 中滥用这个"Rust 导出类型上的鸭子类型 JS 导入"技巧。

这种方法的主要陷阱是：1. 如果接口变化会很脆弱，2. 如果你在 Rust 端的方法不加 `js_*` 前缀，可能会遇到命名空间冲突（这就是为什么我建议在任何地方都按约定加前缀）。作为额外的好处，这让你非常清楚哪里在跨越 Wasm 边界进行方法调用。

## 不要派生 `Copy`

`Copy` 让意外复制实际上是资源薄句柄的 Rust 值变得非常容易，导致空指针。养成在导出包装器上避免使用它的习惯。这可能是一个难以打破的肌肉记忆，因为在普通 Rust 代码中，我们通常尽可能想要 `Copy`。

`Copy` 只有在导出包装 `IntoWasmAbi` 的纯数据时才可接受，对于句柄绝对不行。我将其视为一种优化；默认不使用 `Copy`，除非你真的确定没问题。

## 避免断掉的句柄

尽管 `wasm-bindgen` 尽了最大努力，但无法在运行时防止句柄断掉。一个常见的罪魁祸首是将所有权值传递给 Rust：

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

如果你这样做，当然会消耗你的 `Bar`，但由于这跨越了边界，编译器不会帮你管理 JS 端！对象会在 Rust 端被释放，但你仍然有一个 JS 句柄，现在它什么都不指向。你可能会说"说好的内存安全呢"，你也没错。

为什么你会陷入这种情况？有几个原因：

- Bindgen 禁止 `&[T]`，除非 `T: IntoWasmAbi`
- `Vec<&T>` 是不允许的
- 你只是想让编译器停止大喊大叫

实现了 `IntoWasmAbi` 但不是 `Copy` 的类型在跨越边界时会被克隆（没有句柄），所以它们的行为与非 `IntoWasmAbi` 类型和 `Copy` 类型都不同。

## 优先按引用传递（默认）

如果你从这篇文章中学到一件事，那就学这个：

> **重要**
>
> 除非你有明确的理由并且打算在 JS 端管理句柄，否则永远不要在跨越边界时消耗导出值。

这很简单：一切都通过引用传递。消耗一个值对编译器来说是完全"合法"的，因为它会愉快地在 Rust 端释放内存，**但 JS 端的句柄不会被清理**。下次你尝试使用那个句柄时，它会抛出错误。除非你在做一些特定的内存管理，否则直接避免这种情况：通过 `&reference` 传递并使用内部可变性。

这是一个很容易遵循的模式：默认将非 `IntoWasmAbi` 类型包装在 `Rc<RefCell<T>>` 或 `Arc<Mutex<T>>` 中（取决于你的代码是否以及如何为异步结构化）。跨越 Wasm 边界的开销绝对超过了 `Rc` 的开销，所以这不太可能成为性能瓶颈。

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

## 避免 `&mut`

这可能令人沮丧：有些情况下，由于重入，使用 `&mut self` 会在运行时抛出错误。这种情况比我预期的更频繁，考虑到 JS 的默认行为是单线程的，但 JS 的 `async` 不必遵守 Rust 的编译时排他性检查。

> **重要**
>
> 如果你不能证明排他性，就不要假装你有它。使用适合你并发模型的内部可变性原语。

## 绕过引用限制

如前所述，你可以使用 `extern "C"` JS 导入来建模任何鸭子类型接口，**包括** Rust 导出。这意味着我们能够绕过 `wasm-bindgen` 中的几个限制。

### 所有权集合限制

Bindgen 限制了哪些类型可以跨越边界传递。人们经常遇到的第一个限制是 `&[T]` 只有在 `T` 是 `IntoWasmAbi`（包括 JS 导入类型）时才有效——也就是说，通常不是你的 Rust 导出结构体。这意味着你经常被迫构造 `Vec<T>`。这是有道理的，因为 JS 将控制生成的 JS 数组，并可以随意修改它。这也意味着当类型返回时，除非前面的 `IntoWasmAbi` 警告适用，否则你无法将其作为 `&[T]` 或 `Vec<&T>` 接收。

一个经典的例子是当 `T` 没有实现 JS 管理的类型时，返回所有权的 `Vec<T>` 而不是切片。返回给 JS 的不是一堆 `T`，而是指向 Wasm 端的 `T` 的句柄（例如 `{ __wbg_ptr: 12345 }`）。

另一方面，我们能够将句柄视为符合某种接口的鸭子类型对象。句柄比 Rust 导出类型受到的限制少得多，可以更自由地传递。

解决方法相当直接：

- 让你的导出类型克隆成本低
- 暴露一个命名空间的克隆方法
- 通过 JS 接口导入该方法
- 使用友好的人体工程学转换（`.into`）

```rust
// 步骤 1：让 `clone` 代价低（即如果还不便宜就使用 `Rc` 或 `Arc`）
#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = Character)]
pub struct WasmCharacter(Rc<RefCell<Character>>);

#[wasm_bindgen(js_class = Character)]
impl WasmCharacter {
    // ...

    // 步骤 2：在 Wasm 导出上暴露一个*命名空间化的*（重要！）`clone` 函数
    #[doc(hidden)]
    pub fn __myapp_character_clone(&self) -> Self {
        self.clone()
    }
}

#[wasm_bindgen]
extern "C" {
    type JsCharacter;

    // 步骤 3：创建一个带有该命名空间 `clone` 的 JS 导入接口
    pub fn __myapp_character_clone(this: &JsCharacter) -> WasmCharacter;
}

// 步骤 4：为了方便，将命名空间克隆包装在 `.from` 中
impl From<JsCharacter> for WasmCharacter {
    fn from(js: JsCharacter) -> Self {
        js.__myapp_character_clone()
    }
}

// 类型良好的 Vec
// 步骤 5：使用它！ vvvvv
pub fn do_many_things(js_foos: Vec<JsFoo>) {
    let rust_foos: Vec<WasmFoo> = js_foos.iter().map(Into::into).collect();
    // ...           ^^^^^^^
    // 已转换
}
```

这仍然需要你手动跟踪 bindgen 认为哪些部分是 JS 导入，哪些是 Rust 导出，但通过我们的命名约定，发生的事情很清楚。转换不是免费的，但（在我看来）它让你的接口更加灵活和可读。

## 使用 wasm_refgen

上述模式可能有点脆弱——即使在编写样板代码时——因为所有名称都必须精确对齐，而且像这样跨越边界时你得不到编译器帮助。为了使这更可靠，我将此模式封装为一个从 `wasm_refgen` 导出的宏。

```rust
use std::{rc::Rc, cell::RefCell};
use wasm_bindgen::prelude::*;
use wasm_refgen::wasm_refgen;

#[derive(Clone)]
#[wasm_bindgen(js_name = "Foo")]
pub struct WasmFoo {
    map: Rc<RefCell<HashMap<u32, String>>>, // 克隆成本低
    id: u32 // 克隆成本低
}

#[wasm_refgen(js_ref = JsFoo)] // <-- 这个
#[wasm_bindgen(js_class = "Foo")]
impl WasmFoo {
    // ... 你的普通方法
}
```

```
┌───────────────────────────┐
│                           │
│    JS Foo instance        │
│    Class: Foo             │
│    Object { wbg_ptr: 12345 }   │
│                           │
└─┬──────────────────────┬──┘
  │                      │
  │                      │
  Implements             │
  │                      │
  │                      │
┌─▼───────────────────┐  │
│                     │  │
│  TS Interface: Foo  │  Pointer
│  only method:       │  │
│  __wasm_refgen_to_Foo  │
│                     │  │
└───┬─────────────────┘  │
 JS/TS                   │
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─
 Wasm                    │                      │
  │                      │                      │
┌─┼──────────────────────┼──────────────────────┼───────────┐
│ ▼                      ▼                      ▼           │
│ ┌────────────────┐    ┌────────────────┐                 │
│ │                │    │                │                 │
│ │  &JsFoo        ◀───▶│  WasmFoo       │                 │
│ │  Opaque Wrapper│    │  Instance #1   │                 │
│ │                │    │                │                 │
│ └────────────────┘    └────────────────┘                 │
└──────────────────────┬───────────────────────────────────┘
                       │
                       │
          Into::into   │
    (uses `__wasm_refgen_to_Foo`)
    (which is a wrapper for `clone`)
                       │
                       ▼
              ┌────────────────┐
              │                │
              │  WasmFoo       │
              │  Instance #2   │
              │                │
              └────────────────┘
```

跨越边界传递的引用实际上已经被 bindgen 按所有权传递了——但这些句柄从边界表中获取引用。回想一下，我们的 `Into::into` 在底层调用 `clone`，所以这些总是可以安全消耗而不会破坏 JS 句柄！

```rust
pub fn do_many_things(js_foos: Vec<JsFoo>) {
    let rust_foos: Vec<WasmFoo> = js_foos.iter().map(Into::into).collect();
    // ...
}
```

## 自动转换为 JS 错误

处理来自 Wasm 的错误有几种方法，但在我看来，细节和便利的最佳平衡是在错误到达 `JsValue` 之前将它们转换为 `js_sys::Error`。这让我们返回 `Result<T, MyError>` 而不是 `Result<T, JsValue>`。

例如，假设我们有这个类型：

```rust
#[derive(Debug, Clone, thiserror::Error)]
pub enum RwError {
    #[error("cannot read {0}")]
    CannotRead(String),

    #[error("cannot write")]
    CannotWrite,
}
```

这是一个枚举实际上不是问题（其余的技术仍然有效），但如果你在包装另一个 crate，你需要一个新类型包装器：

```rust
// 重要：不要加 #[wasm_bindgen]
#[derive(Debug, Clone, thiserror::Error)]
#[error(transparent)]
pub struct WasmRwError(#[from] RwError); // #[from] 让我们获得 `?` 符号来提升到新类型
```

我们"可以"在这里加个 `#[wasm_bindgen]` 然后收工，但这样我们在 JS 端就得不到好的错误信息。相反，我们自己转换为 `JsValue`，使用最后一点胶水：

```rust
impl From<WasmRwError> for JsValue {
    fn from(wasm: WasmRwError) -> Self {
        let err = js_sys::Error::new(&wasm.to_string()); // 错误消息
        err.set_name("RwError"); // 好看的 JS 错误类型
        err.into() // 转换为 `JsValue`
    }
}
```

现在你可以返回 `Result<T, WasmRwError>`，包括如果你想在代码的其他地方调用这个 Wasm 包装函数。它在 Rust 端保留了好的错误（至少作为文档类型）。你也可以使用 `?` 符号，而不需要在这个错误出现的每个地方做原地 `JsValue` 转换；bindgen 会帮你做转换。

- 类型化的 Rust 错误
- `?` 传播
- 真正的 JS `Error` 对象
- 调用点零样板代码

这可以作为复制粘贴模板使用；我曾经考虑过把它封装成宏，但它不到 10 行代码。我实际上很惊讶没有类似 `#[wasm_bindgen(error)]` 的东西（也许有，只是我找不到；也许值得向上游贡献）。

## 打印构建信息

这是一个节省了我许多悲伤时间的质量改进：在启动时将精确的构建版本、dirty 状态和 Git 哈希打印到控制台。如果你在开发 Wasm 项目的同时开发一个使用它的纯 JS 库，让 JS 打包器（如 `Vite`）获取更改可能时好时坏。

这需要一些设置，特别是在 Cargo workspace 中，但很值得。以下是我当前的设置：

**$WORKSPACE/Cargo.toml**

```toml
[workspace]
resolver = "3"
members = [
    "build_info",
    # ...
]
```

**$WORKSPACE/build_info/Cargo.toml**

```toml
[package]
name = "build_info"
publish = false
# ...
```

**$WORKSPACE/build_info/build.rs**

```rust
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[allow(clippy::unwrap_used)]
fn main() {
    let ws = env::var("CARGO_WORKSPACE_DIR").map_or_else(
        |_| PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()),
        PathBuf::from,
    );

    let repo_root = find_repo_root(&ws).unwrap_or(ws.clone());
    let git_dir = repo_root.join(".git");
    watch_git(&git_dir);

    let git_hash = cmd_out(
        "git",
        &[
            "-C",
            repo_root.to_str().unwrap(),
            "rev-parse",
            "--short",
            "HEAD",
        ],
    )
    .unwrap_or_else(|| "unknown".to_string());

    let dirty = cmd_out(
        "git",
        &["-C", repo_root.to_str().unwrap(), "status", "--porcelain"],
    )
    .is_some_and(|s| !s.is_empty());

    let git_hash = if dirty {
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        format!("{git_hash}-dirty-{secs}")
    } else {
        git_hash
    };

    println!("cargo:rustc-env=GIT_HASH={git_hash}");
}

fn cmd_out(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd).args(args).output().ok().and_then(|o| {
        if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        }
    })
}

fn find_repo_root(start: &Path) -> Option<PathBuf> {
    let mut cur = Some(start);
    while let Some(dir) = cur {
        if dir.join(".git").exists() {
            return Some(dir.to_path_buf());
        }
        cur = dir.parent();
    }
    None
}

fn watch_git(git_dir: &Path) {
    println!("cargo:rerun-if-changed={}", git_dir.join("HEAD").display());
    if let Ok(head) = fs::read_to_string(git_dir.join("HEAD")) {
        if let Some(rest) = head.strip_prefix("ref: ").map(str::trim) {
            println!("cargo:rerun-if-changed={}", git_dir.join(rest).display());
            println!(
                "cargo:rerun-if-changed={}",
                git_dir.join("packed-refs").display()
            );
        }
    }
    println!("cargo:rerun-if-changed={}", git_dir.join("index").display());
    let fetch_head = git_dir.join("FETCH_HEAD");
    if fetch_head.exists() {
        println!("cargo:rerun-if-changed={}", fetch_head.display());
    }
}
```

**$WORKSPACE/build_info/src/lib.rs**

```rust
#![no_std]

pub const GIT_HASH: &str = env!("GIT_HASH");
```

最后，在 Wasm 中打印：

```rust
use wasm_bindgen::prelude::*;
// ...

#[wasm_bindgen(start)]
pub fn start() {
    set_panic_hook();
    // 我实际上在这里使用 `tracing::info!`，
    // 但这超出了本文的范围
    web_sys::console::info_1(&format!(
        "️your_package_wasm v{} ({})",
        env!("CARGO_PKG_VERSION"),
        build_info::GIT_HASH
    ).into());
}
```

## 总结

Rust + Wasm 很强大——但如果你假装边界不存在，它会毫不留情。要显式，命名清晰，按引用传递，并对 bindgen 施加的任何（不合理的）限制使用鸭子类型绕过。

希望这些对其他人有帮助！随着我发现更多模式，我可能会随时间更新这篇文章。

---

## 译者总结

这篇文章是作者在 Rust + WebAssembly 开发中的实战经验总结，核心要点：

1. **命名规范是关键**：用 `Wasm*` 前缀标识 Rust 导出类型，`Js*` 前缀标识 JS 导入接口，让代码更清晰
2. **优先按引用传递**：避免在 Wasm 边界消耗所有权，使用 `Rc<RefCell<T>>` 实现内部可变性
3. **善用鸭子类型**：通过 `extern "C"` JS 导入绕过 bindgen 的类型限制
4. **错误处理要友好**：将 Rust 错误转换为 JS `Error` 对象，保留类型安全的同时提供良好的调试体验
5. **调试信息不可少**：打印构建版本和 Git 哈希，在多人协作时尤其重要

这些模式虽然需要一些额外的样板代码，但能显著提升开发效率和代码可维护性。对于正在探索 Rust + Wasm 的开发者来说，这是一份非常实用的参考指南。
