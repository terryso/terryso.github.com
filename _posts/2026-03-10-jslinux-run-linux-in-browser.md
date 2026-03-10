---
layout: post
title: "JSLinux：在浏览器中运行完整的 Linux 和 Windows 系统"
date: 2026-03-10 16:27:25 +0800
categories: tech-translation
description: "Fabrice Bellard 的 JSLinux 项目让你可以直接在浏览器中运行 Linux、Windows 2000、FreeDOS 等操作系统，无需安装任何软件。"
original_url: https://bellard.org/jslinux/
source: Hacker News
---

本文翻译自 [JSLinux](https://bellard.org/jslinux/)，原载于 Hacker News。

## 这是什么魔法？

想象一下，打开浏览器，点击一个链接，几秒钟后你就进入了一个完整的 Linux 命令行环境——不需要安装虚拟机，不需要配置双系统，甚至不需要管理员权限。这不是魔法，这是 **JSLinux**，由传奇程序员 Fabrice Bellard 开发的浏览器版 PC 模拟器。

JSLinux 使用 JavaScript 和 WebAssembly 在浏览器中模拟完整的 x86 和 RISC-V CPU，让你可以运行真实的操作系统。从轻量级的 Alpine Linux 到完整的 Windows 2000，从复古的 FreeDOS 到前沿的 RISC-V Fedora，都能在你的浏览器标签页里运行。

## 支持哪些系统？

JSLinux 提供了多种预配置的虚拟机：

| CPU 架构 | 操作系统 | 界面类型 | 特点 |
|---------|---------|---------|------|
| x86_64 | Alpine Linux 3.23.2 | 控制台 | 最新版本，性能最佳 |
| x86 | Alpine Linux 3.12.0 | X Window | 带图形界面 |
| x86 | Windows 2000 | 图形界面 | 怀旧经典 |
| x86 | FreeDOS | VGA 文本 | DOS 时代回忆 |
| riscv64 | Buildroot Linux | 控制台/X Window | RISC-V 体验 |
| riscv64 | Fedora 33 | 控制台/X Window | 完整发行版 |

## 技术内幕

### 项目演进史

JSLinux 的历史可以追溯到 2011 年，那是 JavaScript 性能开始飞速发展的时代：

1. **2011 年**：初版 JSLinux 诞生，成为第一个能在浏览器中运行 Linux 的 PC/x86 模拟器。Bellard 复用了他另一个著名项目 QEMU 的部分代码来实现 x86 指令集和设备模拟。

2. **2015 年**：升级到 asm.js（JavaScript 的一个子集，可以被浏览器更高效地编译执行），性能大幅提升。

3. **2016 年**：Bellard 将其另一个项目 TinyEMU（最初是 RISC-V 模拟器）通过 Emscripten 编译成 JavaScript 版本。同时引入了 VirtIO 9P 文件系统，支持远程文件系统和文件导入导出。

4. **现在**：令人惊讶的是，Bellard 甚至将手写的 asm.js 代码转换回 C 语言，再用 Emscripten 重新编译——经过仔细调优，新版本反而比手写的 asm.js 版本更快！这也展示了现代编译器技术的强大。

### CPU 模拟能力

**x86 架构**支持：
- 完整的 x87 FPU，支持精确的 80 位浮点数
- PAE 内存扩展和 NX（No-eXecute）位支持
- CMOV 条件移动指令
- MMX 和 SSE2 指令集
- **AMD SVM 虚拟化扩展**（支持嵌套虚拟化！）
- RDPMC 指令用于读取指令计数

**RISC-V 架构**支持：
- 32 位或 64 位 CPU
- 64 位 FPU
- 压缩指令集（RVC）

### 模拟的硬件设备

为了运行完整的操作系统，JSLinux 模拟了相当多的硬件：

- **8259 可编程中断控制器**
- **8254 可编程定时器**
- **16450 UART**（串口，用于调试）
- **实时时钟（RTC）**
- **PCI 总线**
- **VirtIO 设备**：控制台、9P 文件系统、网络、块设备、输入设备
- **简单帧缓冲区**
- IDE 控制器、PS/2 键盘鼠标、VGA 显示（用于 Windows）

## 性能表现

在 2017 年的典型桌面 PC 上使用 Firefox 浏览器，x86 模拟器可以达到约 **100 MIPS** 的执行速度。对于大多数命令行操作和轻量级图形界面来说，这个性能已经足够流畅。

系统内置了 `vmtime` 工具，可以进行详细的性能基准测试。这也让 JSLinux 成为了一个有趣的 JavaScript 引擎基准测试工具——"你的浏览器启动 Linux 需要多长时间？"

## 实用功能

### 文件传输

- **上传文件**：点击终端下方的向上箭头按钮，文件会被复制到 home 目录
- **导出文件**：在 Linux 虚拟机中使用 `export_file filename` 命令

### 网络访问

通过 WebSocket VPN 技术，虚拟机可以访问互联网（带宽限制为 40 kB/s，每个公网 IP 最多两个连接）。这个 VPN 服务由 Benjamin Burns 提供。

### 自定义配置

通过 URL 参数可以自定义虚拟机配置：

```
https://bellard.org/jslinux/vm.html?url=buildroot-x86.cfg&mem=128&cols=120&rows=40
```

支持的参数包括：
- `mem`：内存大小（MB）
- `cols`/`rows`：终端行列数
- `font_size`：字体大小
- `graphic`：0=终端模式，1=图形模式
- `w`/`h`：图形模式下的分辨率
- `kbmap`：键盘布局（如 us、de、fr）

## 实际用途

作者坦言最初只是"为了好玩"——证明 JavaScript 引擎已经足够快，可以做复杂的事情。但实际上 JSLinux 有很多实际用途：

1. **学习和教学**：在不离开浏览器的情况下学习 Unix 命令行工具
2. **基准测试**：测试 JavaScript 引擎性能，评估 asm.js 和 WASM 的效果
3. **安全文件访问**：通过 vfsync 在浏览器中安全访问文件
4. **怀旧计算**：运行老旧的 PC 软件（Windows 2000、DOS 程序等）
5. **技术体验**：尝试 RISC-V 架构，无需购买 RISC-V 硬件

## 关于作者

Fabrice Bellard 是编程界的传奇人物，他的作品包括：
- **FFmpeg**：最流行的音视频处理库
- **QEMU**：广泛使用的开源模拟器
- **TCC**：Tiny C Compiler，极速的 C 编译器
- **计算 π 的世界纪录**：曾计算到 2.7 万亿位

JSLinux 的源代码可以在 TinyEMU 项目中找到。

## 类似项目

如果你对浏览器中的系统模拟感兴趣，还可以看看：
- **v86**：另一个 PC 模拟器项目
- **jor1k**：OpenRISC OR1K CPU 模拟器
- **angel**：RISC-V CPU 模拟器

---

## 总结

JSLinux 是 Web 技术进步的一个绝佳展示。从 2011 年的"这能跑吗？"到今天流畅运行 Windows 2000 和 Fedora，它见证了 JavaScript 性能的巨大飞跃。

对于开发者来说，JSLinux 不仅是炫技之作，更是一个实用的学习工具。下次想快速测试一个 Linux 命令，或者想给朋友展示"浏览器里跑 Windows"的魔法，不妨试试这个项目。

**立即体验**：[https://bellard.org/jslinux/](https://bellard.org/jslinux/)
