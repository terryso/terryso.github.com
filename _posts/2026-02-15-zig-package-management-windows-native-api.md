---
layout: post
title: "Zig 包管理增强与绕过 Kernel32.dll：深入 Native API"
date: 2026-02-15 02:07:41 +0800
categories: tech-translation
description: "本文介绍 Zig 语言最新两项重大更新：本地包存储与 --fork 标志带来的工作流改进，以及在 Windows 上直接调用 ntdll.dll 绕过 kernel32.dll 底层优化的技术探索。"
original_url: https://ziglang.org/devlog/2026/#2026-02-13
source: Hacker News
---

本文翻译自 [Zig Devlog 2026](https://ziglang.org/devlog/2026/)，原载于 Hacker News。

## 两大包管理工作流增强

作者：Andrew Kelley

如果你有一个带依赖的 Zig 项目，最近有两项重大更新值得关注。

### 本地包存储

获取的包现在会被存储在项目根目录的 `zig-pkg` 目录中（与 `build.zig` 同级）。

例如，在运行 `zig build` 后：

```
$ du -sh zig-pkg/*
13M    freetype-2.14.1-alzUkTyBqgBwke4Jsot997WYSpl207Ij9oO-2QOvGrOi
20K    opus-0.0.2-vuF-cMAkAADVsm707MYCtPmqmRs0gzg84Sz0qGbb5E3w
4.3M   pulseaudio-16.1.1-9-mk_62MZkNwBaFwiZ7ZVrYRIf_3dTqqJR5PbMRCJzSuLw
5.2M   uucode-0.1.0-ZZjBPvtWUACf5dqD_f9I37VGFsN24436CuceC5pTJ25n
728K   vaxis-0.5.1-BWNV_AxECQCj3p4Hcv4U3Yo1WMUJ7Z2FUj0UkpuJGxQQ
```

建议将此目录添加到项目的 `.gitignore` 中。但与 `.zig-cache` 不同，这种设计支持创建自包含的源码压缩包，包含所有依赖，可用于离线构建或归档。

同时，依赖的**额外副本**会被缓存在全局位置。根据 `paths` 过滤器过滤未使用文件后，内容会被重新压缩：

```
$ du -sh ~/.cache/zig/p/*
2.4M    freetype-2.14.1-alzUkTyBqgBwke4Jsot997WYSpl207Ij9oO-2QOvGrOi.tar.gz
4.0K    opus-0.0.2-vuF-cMAkAADVsm707MYCtPmqmRs0gzg84Sz0qGbb5E3w.tar.gz
636K    pulseaudio-16.1.1-9-mk_62MZkNwBaFwiZ7ZVrYRIf_3dTqqJR5PbMRCJzSuLw.tar.gz
880K    uucode-0.1.0-ZZjBPvtWUACf5dqD_f9I37VGFsN24436CuceC5pTJ25n.tar.gz
120K    vaxis-0.5.1-BWNV_BFECQBbXeTeFd48uTJRjD5a-KD6kPuKanzzVB01.tar.gz
```

**这个设计的动机是让调试更方便**。你可以直接编辑这些文件，看看会发生什么。用 git clone 替换包目录。对整个依赖树进行 grep 搜索。配置 IDE 基于 `zig-pkg` 目录进行自动补全。用 baobab 分析依赖树大小。

全局缓存使用压缩文件也便于在计算机之间共享缓存数据。未来还计划支持依赖树的 P2P torrent 共享。通过将包重新压缩为规范形式，节点之间可以以最小的带宽共享 Zig 包。这个想法很棒——既提供了网络中断的恢复能力，又能形成一个"流行度竞赛"——通过 seeder 数量发现哪些开源包最受欢迎！

### 新增 --fork 标志

第二项更新是为 `zig build` 添加了 `--fork` 标志：

```
zig build --fork=[path]
```

这是一个**项目覆盖**选项。给定一个项目的源码检出路径，整个依赖树中所有匹配该项目的包都会被覆盖。

由于包内容哈希包含名称和指纹，**这在包被获取之前就会解析**。

这是临时使用一个或多个完全独立目录中的 fork 的简便方法。你可以在整个依赖树上迭代直到一切正常，同时舒适地使用依赖项目的开发环境和源码控制。

作为 CLI 标志，它是临时的。一旦去掉标志，你就回到了使用原始获取的依赖树。

如果项目不匹配，会报错避免混淆：

```
$ zig build --fork=/home/andy/dev/mime
error: fork /home/andy/dev/mime matched no mime packages
$
```

如果项目匹配，会给出提醒：

```
$ zig build --fork=/home/andy/dev/dvui
info: fork /home/andy/dev/dvui matched 1 (dvui) packages
...
```

这个功能旨在增强处理生态系统中断的工作流。新的工作流程如下：

1. 由于生态系统问题导致从源码构建失败
2. 使用 `--fork` 调试直到项目再次工作。期间可以使用实际的上游源码控制、测试套件、`zig build test --watch -fincremental` 等
3. 现在你有一个选择：自私地继续自己的工作，或者将补丁提交到上游

你甚至可以跳过将 `build.zig.zon` 切换到你的 fork 的步骤——除非你预计上游需要很长时间才能合并你的修复。

---

## 绕过 Kernel32.dll：为了乐趣与效率

作者：Andrew Kelley

Windows 操作系统为内核操作提供了大量的 ABI 接口。但并非所有 ABI 都是平等的。正如 Casey Muratori 在他的演讲《The Only Unbreakable Law》中指出的，软件开发团队的组织结构直接影响他们生产的软件结构。

Windows 上的 DLL 按层次组织，有些 API 是底层 API 的高级封装。例如，每当你调用 `kernel32.dll` 的函数时，实际工作最终由 `ntdll.dll` 完成。你可以通过 ProcMon.exe 检查堆栈跟踪直接观察到这一点。

我们凭经验学到的是，ntdll API 通常设计良好、合理且强大，但 kernel32 封装引入了不必要的堆分配、额外的失败模式、意外的 CPU 使用和膨胀。

这就是为什么 Zig 标准库的策略是**优先使用 Native API 而非 Win32**。我们还没完全做到——仍有很多对 kernel32 的调用——但最近取得了很大进展。举两个例子：

### 示例 1：熵（随机数）

根据官方文档，Windows 没有直接获取随机字节的方法。

许多项目包括 Chromium、boringssl、Firefox 和 Rust 从 `advapi32.dll` 调用 `SystemFunction036`，因为它在 Windows 8 之前的版本上工作。

不幸的是，从 Windows 8 开始，第一次调用此函数时，它会动态加载 `bcryptprimitives.dll` 并调用 ProcessPrng。如果加载 DLL 失败（例如由于系统过载，我们在 Zig CI 上多次观察到这种情况），它返回错误 38（从一个返回类型为 `void` 且文档说明永远不会失败的函数返回）。

`ProcessPrng` 做的第一件事是堆分配少量常量字节。如果失败，它在 `BOOL` 中返回 `NO_MEMORY`（文档说明行为是永远不会失败，总是返回 `TRUE`）。

`bcryptprimitives.dll` 显然每次加载时都会运行测试套件。

而 `ProcessPrng` **真正**做的只是对 `"\\Device\\CNG"` 调用 `NtOpenFile`，然后用 `NtDeviceIoControlFile` 读取 48 字节获取种子，然后初始化每个 CPU 的基于 AES 的 CSPRNG。

所以 `bcryptprimitives.dll` 和 `advapi32.dll` 的依赖都可以避免，首次 RNG 读取时的非确定性失败和延迟也可以避免。

### 示例 2：NtReadFile 和 NtWriteFile

`ReadFile` 看起来像这样：

```zig
pub extern "kernel32" fn ReadFile(
    hFile: HANDLE,
    lpBuffer: LPVOID,
    nNumberOfBytesToRead: DWORD,
    lpNumberOfBytesRead: ?*DWORD,
    lpOverlapped: ?*OVERLAPPED,
) callconv(.winapi) BOOL;
```

`NtReadFile` 看起来像这样：

```zig
pub extern "ntdll" fn NtReadFile(
    FileHandle: HANDLE,
    Event: ?HANDLE,
    ApcRoutine: ?*const IO_APC_ROUTINE,
    ApcContext: ?*anyopaque,
    IoStatusBlock: *IO_STATUS_BLOCK,
    Buffer: *anyopaque,
    Length: ULONG,
    ByteOffset: ?*const LARGE_INTEGER,
    Key: ?*const ULONG,
) callconv(.winapi) NTSTATUS;
```

提醒一下，**上面的函数是通过调用下面的函数实现的**。

我们已经可以看到使用底层 API 的一些好处。例如，**真正的** API 直接将错误码作为返回值，而 kernel32 封装将状态码隐藏在某处，返回 `BOOL`，然后需要你调用 `GetLastError` 找出出了什么问题。想象一下！从函数返回一个值 🌈

此外，`OVERLAPPED` 是一个假类型。Windows 内核实际上不知道也不关心它！真正的原语是 events、APC 和 `IO_STATUS_BLOCK`。

如果你有同步文件句柄，那么 `Event` 和 `ApcRoutine` 必须为 `null`。你会立即在 `IO_STATUS_BLOCK` 中得到答案。如果你在这里传递 APC 例程，一些过时的 32 位代码会运行，你会得到垃圾结果。

另一方面，如果你有异步文件句柄，那么你需要使用 `Event` 或 `ApcRoutine`。`kernel32.dll` 使用 events，这意味着它为了读取文件而进行额外的、不必要的资源分配和管理。相反，Zig 现在传递 APC 例程，然后调用 `NtDelayExecution`。这与取消无缝集成，使在执行文件 I/O 时取消任务成为可能，无论文件是以同步模式还是异步模式打开。

有关此主题的深入探讨，请参阅 GitHub issue：[Windows: Prefer the Native API over Win32](https://github.com/ziglang/zig/issues/14208)。

---

## zig libc 进展

作者：Andrew Kelley

在过去一个月左右，几位积极的贡献者对 zig libc 子项目产生了兴趣。其思想是通过将 libc 函数作为 Zig 标准库封装而不是作为第三方 C 源文件提供，逐步删除冗余代码。在许多情况下，这些函数是一对一映射，如 `memcpy` 或 `atan2`，或者简单地封装泛型函数，如 `strnlen`：

```zig
fn strnlen(str: [*:0]const c_char, max: usize) callconv(.c) usize {
    return std.mem.findScalar(u8, @ptrCast(str[0..max]), 0) orelse max;
}
```

到目前为止，大约 250 个 C 源文件已从 Zig 仓库中删除，还剩 2032 个。

每个完成转换的函数，Zig 就获得对第三方项目和 C 编程语言的独立性，编译速度提高，Zig 的安装大小简化和减少，静态链接 libc 的用户应用程序享受更小的二进制大小。

此外，最近的增强使 zig libc 与其他 Zig 代码共享 Zig Compilation Unit，而不是作为单独的静态存档稍后链接在一起。这是 Zig 拥有集成编译器和链接器的优势之一。当导出的 libc 函数共享 ZCU 时，冗余代码被消除，因为函数可以一起优化。这有点像在 libc 边界上启用 LTO（链接时优化），只是它在前端正确完成，而不是太晚在链接器中完成。

此外，当这项工作与最近的 std.Io 更改结合时，用户有可能无缝控制 libc 如何执行 I/O——例如强制所有对 `read` 和 `write` 的调用参与 io_uring 事件循环，即使该代码不是为这种用例编写的。或者，可以为第三方 C 代码启用资源泄漏检测。目前这只是个纸上谈兵的想法，还没有实验过，但这个想法让我很感兴趣。

特别感谢 Szabolcs Nagy 的 libc-test。这个项目在确保我们不退化任何数学函数方面帮了大忙。

提醒我们的用户，现在 Zig 正在转型为静态 libc 提供者，如果你遇到 Zig 提供的 musl、mingw-w64 或 wasi-libc libc 功能问题，**请先在 Zig 提交 bug 报告**，这样我们就不会因为 Zig 中的 bug 而打扰独立 libc 实现项目的维护者，而这些 bug 不再由他们负责。

---

## 个人总结

这篇 Zig 开发日志展示了 Zig 语言在两个重要方向的持续迭代：

### 包管理工作的实用主义

1. **本地存储增强开发体验**：将依赖包存储在项目本地的 `zig-pkg` 目录，这是一个非常实用的改变。它让开发者可以轻松地调试依赖、配置 IDE 自动补全、甚至直接修改依赖源码。这种"方便调试"的设计哲学值得其他包管理器学习。

2. **--fork 标志解决生态痛点**：这是一个非常聪明的设计。在处理依赖树中某个包的问题时，传统做法是修改 `build.zig.zon` 指向你的 fork，修复后再改回来。`--fork` 让这个过程变得临时且干净——一个 CLI 标志就能覆盖整个依赖树中的某个包，修复完成后去掉标志就恢复原状。

### Windows 平台的底层优化

1. **直接使用 Native API**：Zig 选择绕过 `kernel32.dll` 直接调用 `ntdll.dll` 的做法很有技术勇气。这需要深入理解 Windows 内部机制，但收益明显：避免不必要的堆分配、减少失败模式、消除意外的 CPU 使用。

2. **随机数生成的案例特别精彩**：通过分析 `SystemFunction036` → `ProcessPrng` → 实际的 `NtOpenFile` 调用链，Zig 团队发现了 Windows API 层层的封装带来的问题，并选择直接使用底层 API。这种对细节的关注是系统编程的精髓。

3. **libc 的 Zig 化**：逐步用 Zig 代码替换第三方 C 源文件，这不仅能减少安装体积、提高编译速度，更重要的是让 Zig 在技术栈上更加独立。共享 ZCU 带来的跨边界优化也是一个技术亮点。

对于关注系统编程和语言设计的开发者来说，Zig 的这些实践提供了很好的参考：在追求技术纯粹性的同时，也要考虑实际开发者的工作流体验。
