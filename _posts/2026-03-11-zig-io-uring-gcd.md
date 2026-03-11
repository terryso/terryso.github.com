---
layout: post
title: "Zig 的 io_uring 与 Grand Central Dispatch 实现已落地"
date: 2026-03-11 19:20:34 +0800
categories: tech-translation
description: "Zig 0.16.0 发布周期接近尾声，社区贡献者 Jacob 完成了基于用户态栈切换的 io_uring 和 GCD 实现，让 Zig 代码可以轻松切换不同的 I/O 实现。"
original_url: https://ziglang.org/devlog/2026/#2026-03-10
source: Hacker News
---

本文翻译自 [Zig Devlog 2026 - February 13](https://ziglang.org/devlog/2026/)，原载于 Hacker News。

## 引言

随着 Zig 0.16.0 发布周期接近尾声，社区贡献者 Jacob 一直在努力推进 `std.Io.Evented` 的实现，使其跟上最新的 API 变化。今天要介绍的是两个重要的里程碑：

- **io_uring 实现**（Linux）
- **Grand Central Dispatch 实现**（macOS/iOS）

这两个实现都基于用户态栈切换技术，在其他语言生态中你可能听说过 "fibers"、"stackful coroutines" 或 "green threads" 这些概念——本质上都是同一类技术。

## 现在可以尝鲜了

这两个实现现在**已经可以拿来玩了**，只需在你的应用中使用 `std.Io.Evented` 构建即可。不过需要提醒的是，它们目前仍应被视为**实验性功能**，因为还有一些重要的后续工作需要完成才能真正可靠、健壮地使用：

1. 更好的错误处理
2. 移除调试日志
3. 诊断编译器使用 `IoMode.evented` 时出现的意外性能下降问题
4. 少数函数尚未实现
5. 需要更多测试覆盖
6. 需要一个内置函数来告诉你给定函数的最大栈大小（这在 overcommit 关闭时让这些实现变得实用）

## I/O 实现可以无缝切换

带着这些注意事项，我们似乎真的到达了"应许之地"——Zig 代码可以毫不费力地切换 I/O 实现。

先看一个使用 `std.Io.Threaded` 的传统实现：

```zig
const std = @import("std");

pub fn main(init: std.process.Init.Minimal) !void {
    var debug_allocator: std.heap.DebugAllocator(.{}) = .init;
    const gpa = debug_allocator.allocator();

    var threaded: std.Io.Threaded = .init(gpa, .{
        .argv0 = .init(init.args),
        .environ = init.environ,
    });
    defer threaded.deinit();

    const io = threaded.io();
    return app(io);
}

fn app(io: std.Io) !void {
    try std.Io.File.stdout().writeStreamingAll(io, "Hello, World!\n");
}
```

使用 `strace` 追踪可以看到传统的系统调用模式：

```
$ strace ./hello_threaded
execve("./hello_threaded", ["./hello_threaded"], 0x7ffc1da88b20 /* 98 vars */) = 0
...
writev(1, [{iov_base="Hello, World!\n", iov_len=14}], 1Hello, World!
) = 14
...
exit_group(0) = ?
+++ exited with 0 +++
```

**现在，只需切换 I/O 实现**：

```zig
const std = @import("std");

pub fn main(init: std.process.Init.Minimal) !void {
    var debug_allocator: std.heap.DebugAllocator(.{}) = .init;
    const gpa = debug_allocator.allocator();

    var evented: std.Io.Evented = undefined;
    try evented.init(gpa, .{
        .argv0 = .init(init.args),
        .environ = init.environ,
        .backing_allocator_needs_mutex = false,
    });
    defer evented.deinit();

    const io = evented.io();
    return app(io);
}

fn app(io: std.Io) !void {
    try std.Io.File.stdout().writeStreamingAll(io, "Hello, World!\n");
}
```

再看 `strace` 输出，现在使用了 io_uring：

```
execve("./hello_evented", ["./hello_evented"], 0x7fff368894f0 /* 98 vars */) = 0
...
io_uring_setup(64, {flags=IORING_SETUP_COOP_TASKRUN|IORING_SETUP_SINGLE_ISSUER, ...}) = 3
mmap(NULL, 2368, PROT_READ|PROT_WRITE, MAP_SHARED|MAP_POPULATE, 3, 0) = 0x7f70a4ba0000
mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_SHARED|MAP_POPULATE, 3, 0x10000000) = 0x7f70a4b9f000
io_uring_enter(3, 1, 1, IORING_ENTER_GETEVENTS, NULL, 8Hello, World!
) = 1
io_uring_enter(3, 1, 1, IORING_ENTER_GETEVENTS, NULL, 8) = 1
...
exit_group(0) = ?
+++ exited with 0 +++
```

**关键点**：两个代码片段中的 `app` 函数是完全相同的！

## 超越 Hello World

Zig 编译器本身已经可以正常使用 `std.Io.Evented`（无论是 io_uring 还是 GCD），不过正如前面提到的，目前还存在一个尚未诊断的性能下降问题。

## 个人见解

这个进展对 Zig 生态系统意义重大。io_uring 是 Linux 上高性能异步 I/O 的未来，而 GCD 则是 Apple 平台的原生并发解决方案。能够用同一套代码、仅仅切换几行初始化逻辑就获得平台最优的 I/O 性能，这是一个非常优雅的设计。

不过要注意的是，基于用户态栈切换的协程虽然灵活，但也带来了栈内存管理的复杂性。Zig 团队提到的"内置函数获取函数最大栈大小"这个需求，正是解决 overcommit 问题的关键——你需要在编译期就知道需要预留多少栈空间。

对于中国开发者来说，如果你对高性能网络编程感兴趣，这个特性值得持续关注。当你需要处理大量并发连接时，io_uring 的性能优势会非常明显。

---

**关键要点：**

1. Zig 的 `std.Io.Evented` 现在支持 io_uring（Linux）和 GCD（macOS）
2. 应用代码无需修改即可切换 I/O 后端
3. 目前仍为实验性功能，不建议用于生产环境
4. 编译器本身已经可以用 evented 模式运行，但性能还需优化

Happy hacking!
