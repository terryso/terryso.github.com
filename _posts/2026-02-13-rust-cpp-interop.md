---
layout: post
title: "如何让单线程 C++ 与多线程 Rust 安全协作"
date: 2026-02-13 18:54:45 +0800
categories: tech-translation
description: "Antithesis 团队分享了他们如何解决一个棘手的工程问题：将单线程同步的 C++ 代码与多线程异步的 Rust 代码安全地集成在一起，涉及 Send/Sync trait、FFI 跨语言调用以及线程安全的深度思考。"
original_url: https://antithesis.com/blog/2026/rust_cpp/
source: Hacker News
---

本文翻译自 [How we interfaced single-threaded C++ with multi-threaded Rust](https://antithesis.com/blog/2026/rust_cpp/)，原载于 Hacker News。

## 背景：Antithesis 的架构

当用户将软件交给 Antithesis 进行测试时，他们会在确定性 hypervisor（Determinator）的容器中运行。这个确定性 hypervisor 耗时数年开发，它将所有非确定性操作（获取时间、随机数、任何输入等）替换为由控制信号流控制的确定性版本。对于给定的一组控制信号，Determinator 每次都会执行完全相同的操作。

Antithesis 的 **fuzzer** 是控制这一切的程序。它决定向 Determinator 发送哪些控制信号来操纵被测系统并发现 bug。

Fuzzer 创建一个控制信号字节的状态树，其中一些字节会触发 bug，一些则不会：

![状态树](https://antithesis.com/img_opt/6b1ckXDMqr-2217.png)

Fuzzer 的逻辑部分（称为 **controller**）负责决定"从哪里开始"和"提供什么输入"。Fuzzer 使用单线程 C++ 编写，所有 controller 通过回调接口与核心 fuzzer 交互：

```rust
poll_for_inputs(&controller) -> (start_state, inputs)
advertise_outputs(&controller, states)
```

几年前，团队添加了让 fuzzer 调用 Rust 的能力，以便更容易实现新的控制策略。Rust 端是多线程和异步的，使用"从这里开始，提供这些输入，然后 await 返回的输出"这样的异步接口，而不是 C++ 的回调式接口。

这篇文章讲述的就是如何将多线程异步 Rust 与单线程同步 C++ 进行接口对接的故事。

## 基础知识

### 结合 C++ 和 Rust

为了实现 Rust 和 C++ 的互操作，团队使用了 Rust crate **cxx**，它在 C++ 和 Rust 之间创建了 FFI（Foreign Function Interface）。它允许定义三种东西：

1. **`extern Rust` 类型**：暴露给 C++ 的 Rust 类型。cxx 工具创建一个 C++ 头文件，生成将 C++ 调用约定转换为 Rust 调用约定的代码。
2. **`extern C++` 类型**：暴露给 Rust 的 C++ 类型。你指定函数调用的 Rust 签名，cxx 将其与现有 C++ 函数匹配。
3. **共享结构体**：没有任何方法的纯结构体。你在 Rust 中声明它们，cxx 创建 C++ 头文件，可以在两边自由传递。

### 结合同步和异步代码

核心思想是：编写异步、多线程的 Rust 代码，它通过 async channels 发送信息。这些 channels 的另一端是同步 Rust，由 C++ 同步调用。同步 Rust 负责在 async channels 之间发送和接收数据，并在 C++ 格式和 Rust 格式之间进行转换。

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Single-thread  │     │  Sync Rust      │     │  Multi-thread   │
│  C++            │────▶│  (Bridge)       │◀───▶│  Async Rust     │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 挑战 1：线程不安全的对象

有一个技术挑战：`start` 和 `result_states` 是 C++ 对象（类型为 `State`），我们需要在线程之间传递它们。默认情况下，**cxx** 不会为 C++ 类型实现 `Send` 或 `Sync`。

### 插曲：Send 和 Sync

- 类型 `T` 是 `Send`：如果可以安全地在不同线程间拥有 **独占访问**（`T` 或 `&mut T`）
- 类型 `T` 是 `Sync`：如果可以安全地在不同线程间拥有 **共享访问**（`&T`）

有一个众所周知的结论：`T` 是 `Sync` 当且仅当 `&T` 是 `Send`。

通常编译器会根据 Rust 代码自动实现 `Send` 和 `Sync`。但 Rust 编译器无法推理 C++ 代码，所以不会自动实现它们。

### 问题的根源

作者第一次尝试解决这个问题时，直接写了：

```rust
unsafe impl Send for State {}
```

**当然，这导致了间歇性段错误（segfault）。**

原因是 C++ 端的 `State` 包含一个非线程安全的引用计数指针 `ref_ptr`：

```cpp
struct State {
    ref_ptr<StateImpl> impl;
    ...
}
```

当在 Rust 端使用 `State` 对象时，有时会遇到竞态条件，导致引用计数错误，然后删除仍在使用的对象。

### 解决方案：CppOwner 和 CppBorrower

解决方案涉及两个 Rust 结构体：

```rust
// 只存在于主线程
pub struct CppOwner<T> {
    value: Arc<T>
}

impl<T> CppOwner<T> {
    pub fn borrow(&self) -> CppBorrower<T> {
        CppBorrower { value: self.value.clone() }
    }

    pub fn has_borrowers(&self) -> bool {
        Arc::strong_count(&self.value) > 1
    }
}

impl<T> Drop for CppOwner<T> {
    fn drop(&mut self) {
        if self.has_borrowers() {
            panic!("No!");
        }
    }
}

// 可以在所有线程间传递
pub struct CppBorrower<T> {
    value: Arc<T>
}

unsafe impl<T: Sync> Send for CppBorrower<T> {}
```

使用方式：

```rust
// 在主线程
let cpp_state = CppOwner::new(state.cpp_clone());
channel.send(cpp_state.borrow());
self.in_flight.insert(cpp_state);

// 稍后，仍在主线程
self.in_flight.retain(|s| s.has_borrowers());
```

### 设计挑战与更好的解决方案

这个方案用了大约两年，但垃圾回收效率不高。当有人尝试在生产代码中使用 Rust 接口时，问题变得明显。

**更好的解决方案**：让 `CppOwner` 直接拥有 `T`（不是 `Arc<T>`），然后传递 `Arc<CppOwner<T>>`。当最后一个引用计数消失并 drop `CppOwner<T>` 时，将 `T` 发送回主线程进行删除。

#### SendWrapper

```rust
pub struct SendWrapper<T>(T);

// 即使 T: !Send
unsafe impl<T> Send for SendWrapper<T> {}

impl<T> Drop for SendWrapper<T> {
    fn drop(&mut self) {
        panic!("Cannot drop a SendWrapper!")
    }
}
```

`SendWrapper<T>` 即使 `T` 本身不是 `Send`，它也是 `Send`。但由于 `T` 可能不是 `Send`，所以不能安全地获取对 `T` 的独占访问。

#### 改进的 CppOwner

```rust
pub struct CppOwner<T>(ManuallyDrop<SendWrapper<T>>);

impl<T> Drop for CppOwner<T> {
    fn drop(&mut self) {
        let val: SendWrapper<T> = unsafe { ManuallyDrop::take(&mut self.0) };
        DROP_QUEUE.push(val);
    }
}
```

`DROP_QUEUE` 是一个静态的 `DropQueue` 实例：

```rust
pub struct DropQueue<T>(ConcurrentQueue<SendWrapper<T>>);

impl<T> DropQueue<T> {
    // SAFETY: 只能在主线程调用
    pub unsafe fn drain(&self) {
        for val in self.0.try_iter() {
            drop(unsafe { val.unwrap_unchecked() })
        }
    }
}
```

## 挑战 2：线程不安全的函数

另一个问题是：某些 C++ 函数（如 `get_details`）只能安全地在主线程上调用。

### 第一个解决方案

使用请求/响应 channel 模式：

```
┌──────────────┐   request    ┌──────────────┐
│  Async Rust  │─────────────▶│  Sync Rust   │
│              │◀─────────────│  (main)      │
└──────────────┘   response   └──────────────┘
```

1. 在异步部分：创建带有函数参数的请求对象，通过"请求" channel 传递
2. 在同步 Rust 部分：轮询 channel 获取请求对象，调用 C++ 函数，将结果推入"结果" channel

### 更好的解决方案：MainThreadToken

```rust
#[derive(Clone, Copy)]
pub struct MainThreadToken(PhantomData<*mut ()>);
```

`PhantomData<*mut ()>` 确保 struct 不是 `Send` 或 `Sync`。还有运行时检查：

```rust
pub static MAIN_THREAD_ID ...

pub unsafe fn new() -> Self {
    assert_eq!(*MAIN_THREAD_ID, std::thread::current().id());
    Self(PhantomData)
}
```

使用 `MainThreadToken`，可以将只能在主线程调用的函数变为安全的：

```rust
// 之前
// SAFETY: 只能在主线程调用
pub unsafe fn drain(&self)

// 之后
pub fn drain(&self, _token: MainThreadToken)
```

### 为 C++ 类型建模线程安全性

#### Sync 和 Unsync 方法

在 C++ 端定义两个标记宏：

```cpp
#define SYNC
#define UNSYNC
```

使用它们标记函数：

```cpp
int get_immutable_data() SYNC const;    // 线程安全
int get_mutable_data_unsync() UNSYNC const;  // 非线程安全
```

**定义**：
1. **非 const 方法**：可以独占访问（如非原子写入、构造函数/析构函数）
2. **const, sync 方法**：可以有同步的共享访问（线程安全，无需外部同步）
3. **const, unsync 方法**：只能有非同步的共享访问（需要外部同步）

| 并发安全？ | non-const | const, sync | const, unsync |
|-----------|-----------|-------------|---------------|
| non-const | N | N | N |
| const, sync | N | Y | Y |
| const, unsync | N | Y | N |

在 Rust 端：

```rust
// SYNC 方法 - 使用默认签名
fn get_immutable_data(&self) -> i32;

// UNSYNC 方法 - 标记为 unsafe
/// # Safety: main thread only
unsafe fn get_mutable_data_unsync(&self) -> i32;

// 安全版本，使用 MainThreadToken
fn get_mutable_data(&self, _token: MainThreadToken) -> i32 {
    unsafe { self.get_mutable_data_unsync() }
}
```

## 总结

这篇文章涵盖了大量内容。团队使用 **cxx** 从 C++ 调用 Rust，C++ 代码是单线程的，但 Rust 代码是多线程的。这导致了两个主要问题：

**问题 1：非线程安全的对象**
- 最初使用 `CppOwner` 和 `CppBorrower` 结构体解决
- 后来用 `SendWrapper` 改进，在线程间安全地"走私" C++ 类型，`CppOwner` 通过将对象发送回主线程来处理 drop

**问题 2：非线程安全的函数**
- 在 C++ 端创建命名和标记函数的约定（`SYNC`/`UNSYNC`）
- 在 Rust 端将某些函数标记为 `unsafe`
- 创建 `MainThreadToken` 证明载体类型，只能在主线程拥有
- 使用它制作 unsafe 函数的安全版本

这个解决方案既"Rust-y"（编译器有足够信息确保正确调用），又让 C++ 程序员满意（有明确的定义和代码审查检查点）。

---

**要点总结**：
1. 跨语言 FFI 的线程安全需要仔细设计，不能简单地将 C++ 类型标记为 `Send`
2. `SendWrapper` 模式可以在不破坏安全性的前提下"走私"非线程安全类型
3. `MainThreadToken` 提供了编译时保证某函数只在主线程调用的优雅方式
4. C++ 的 `const` 不等于线程安全，需要额外的标记来区分
5. 良好的设计应该让编译器帮助你发现问题，而不是依赖开发者"小心谨慎"

> 译者注：这是一个非常硬核的工程实践分享。Antithesis 团队在处理跨语言、跨线程模型集成时展现出的系统性思维值得学习。特别是 `SendWrapper` 和 `MainThreadToken` 这两个抽象，既解决了实际问题，又保持了 Rust 的安全哲学。如果你也在做 Rust/C++ 混合开发，这篇文章值得反复研读。
