---
layout: post
title: "Zig 0.16 新特性：io_uring 与 GCD 标准库实现已落地"
date: 2026-03-11 21:25:25 +0800
categories: tech-translation
description: "Zig 标准库新增 io_uring 和 Grand Central Dispatch 两种异步 I/O 实现，基于用户态栈切换技术，支持无缝切换 I/O 后端"
original_url: https://ziglang.org/devlog/2026/#2026-02-13
source: Hacker News
---

本文翻译自 [io_uring and Grand Central Dispatch std.Io implementations landed](https://ziglang.org/devlog/2026/#2026-02-13)，原载于 Hacker News。

## 核心更新

随着 Zig 0.16.0 发布周期接近尾声，Jacob 完成了一项重要工作：让 `std.Io.Evented` 赶上了最新的 API 变更。现在 Zig 标准库正式支持两种新的异步 I/O 实现：

- **io_uring 实现** - Linux 的高性能异步 I/O 接口
- **Grand Central Dispatch 实现** - macOS/iOS 的并发调度框架

这两种实现都基于**用户态栈切换**（userspace stack switching）技术，你可能听过它的其他名字：「fibers」、「stackful coroutines」（有栈协程）或「green threads」（绿色线程）。

## 如何使用

现在你可以在自己的项目中尝试这些新特性。不过先提醒一下，它们目前还处于**实验性阶段**，在正式生产使用前还有一些工作要做：

- 更好的错误处理
- 移除调试日志
- 诊断使用 `IoMode.evented` 时编译器性能下降的问题
- 少数函数尚未实现
- 需要更多测试覆盖
- 需要一个内置函数来告诉你给定函数的最大栈大小（这对于关闭 overcommit 时使用这些实现非常重要）

### 代码示例

让我们看看实际代码。首先是使用 `std.Io.Threaded` 的传统线程版本：

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

使用 `strace` 追踪系统调用：

```
$ strace ./hello_threaded
execve("./hello_threaded", ["./hello_threaded"], 0x7ffc1da88b20 /* 98 vars */) = 0
mmap(NULL, 262207, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f583f338000
...
writev(1, [{iov_base="Hello, World!\n", iov_len=14}], 1Hello, World!
) = 14
...
exit_group(0) = ?
```

可以看到，传统版本使用的是标准的 `writev` 系统调用。

### 切换到 io_uring

重点来了！**只需要改几行代码**，就可以切换到 io_uring：

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

注意到 `app` 函数**完全相同**吗？这就是 Zig I/O 抽象的威力。

再看看 io_uring 版本的系统调用：

```
execve("./hello_evented", ["./hello_evented"], 0x7fff368894f0 /* 98 vars */) = 0
...
io_uring_setup(64, {...}) = 3
mmap(NULL, 2368, PROT_READ|PROT_WRITE, MAP_SHARED|MAP_POPULATE, 3, 0) = 0x7f70a4ba0000
mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_SHARED|MAP_POPULATE, 3, 0x10000000) = 0x7f70a4b9f000
io_uring_enter(3, 1, 1, IORING_ENTER_GETEVENTS, NULL, 8Hello, World!
) = 1
io_uring_enter(3, 1, 1, IORING_ENTER_GETEVENTS, NULL, 8) = 1
...
exit_group(0) = ?
```

现在使用的是 `io_uring_setup` 和 `io_uring_enter`，这是 Linux 的高性能异步 I/O 接口。

## 当前状态

Zig 编译器本身已经可以使用 `std.Io.Evented` 正常工作（无论是 io_uring 还是 GCD），但如前所述，目前存在性能下降的问题，还需要进一步调查和优化。

## 个人见解

这次更新体现了 Zig 语言设计的一个核心理念：**抽象不应该有运行时成本**。你写的是同一份业务代码，但底层可以根据平台选择最优的 I/O 实现：

- Linux 上用 io_uring 获得极致性能
- macOS/iOS 上用 GCD 充分利用系统优化
- 其他平台回退到线程池

这种「一次编写，处处优化」的能力，对于需要跨平台高性能的项目来说非常有价值。io_uring 虽然强大，但直接使用 API 相当复杂，Zig 把它封装成标准库的一部分，大大降低了使用门槛。

期待 Zig 0.16.0 正式发布时这些特性能更加成熟稳定！

Happy hacking!

---

**关键要点：**

1. Zig 0.16 新增 io_uring 和 GCD 两种异步 I/O 实现
2. 基于用户态栈切换（fiber/coroutine）技术
3. 业务代码无需修改即可切换底层 I/O 实现
4. 目前处于实验阶段，存在一些待优化项
5. 体现了 Zig「零成本抽象」的设计哲学
