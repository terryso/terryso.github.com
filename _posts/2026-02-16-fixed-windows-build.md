---
layout: post
title: "告别 Visual Studio 安装噩梦：msvcup 让 Windows 原生开发重获自由"
date: 2026-02-16 04:05:26 +0800
categories: tech-translation
description: "如果你厌倦了 Visual Studio 动辄 50GB 的安装包和让人崩溃的组件选择，这篇文章介绍了一个开源工具 msvcup，它能在几分钟内完成 MSVC 工具链的安装，让你的 Windows 构建环境像 Linux 一样简洁可控。"
original_url: https://marler8997.github.io/blog/fixed-windows/
source: Hacker News
---

本文翻译自 [Fixed Windows](https://marler8997.github.io/blog/fixed-windows/)，原载于 Hacker News。

---

## 痛点：Visual Studio 安装之殇

想象一下，你正在维护一个原生项目。由于需要在 Windows 上构建，你很负责任地在文档中写下了构建依赖：

> Build Requirements: Install Visual Studio

如果你还不知道这意味着什么，那我真的很羡慕你。不幸的是，现在连 Boromir 都知道这是一个错误的决定……

当你把 "Install Visual Studio" 作为依赖时，你实际上已经签约成为了微软 "Visual Studio Installer" 的免费技术支持。你会发现 GitHub Issues 不再是关于你的代码，而是关于 Windows 上的构建失败。你不得不向贡献者解释：他们没有勾选 "Desktop development with C++" 工作负载，而是需要专门选择 v143 构建工具和 10.0.22621.0 SDK。不对，不是那个，是另一个。你花在自己项目上的时间越来越少，因为你忙着为一个 50GB 的 IDE 做人肉依赖解析器。

说 "Install Visual Studio" 就像给贡献者一本充满坏结局的「选择你自己的冒险」书籍，有些选择甚至没有回头路。这些年来，我不得不多次重装整个操作系统。

### 为什么这种悲剧只发生在 Windows 上？

在 **Linux** 上，工具链通常只需要一个包管理器命令就能搞定。另一方面，"Visual Studio" 包含数千个组件。它太庞大了，以至于微软用一个复杂的 GUI 安装程序来分发它，你需要在一个复选框迷宫中导航，寻找哪些 "Workloads" 或 "Individual Components" 包含真正的编译器。选错了，你可能会浪费几个小时安装不需要的东西。漏选一个，比如 "Windows 10 SDK (10.0.17763.0)" 或 "Spectre-mitigated libs"，你的构建会在三小时后失败，并给出一个像 `MSB8101` 这样晦涩的错误。

Visual Studio 生态系统建立在「一体化」单体架构的遗留问题上。它把编辑器、编译器和 SDK 混淆成一个纠缠不清的网。当我们把 "Visual Studio" 列为依赖时，我们没有区分用来写代码的工具和编译代码所需的环境。

这种痛苦会迅速累积：

- **漫长的等待**：你花一下午看着进度条下载 15GB，只为了得到一个 50MB 的编译器。
- **零透明度**：你不知道安装了哪些文件，也不知道它们去了哪里。你的注册表里满是垃圾，后台更新服务永久驻留在任务管理器中。
- **无版本控制**：你不能把编译器检入 Git。如果队友的 Build Tools 版本略有不同，构建可能会悄悄偏离。
- **「幽灵」环境**：卸载永远不会真正干净。换一台新机器意味着重复整个 GUI 操作，祈祷你勾选了相同的选项。

即使在安装之后，从命令行编译单个 C 文件也需要找到 "Developer Command Prompt"。在底层，这个快捷方式调用 `vcvarsall.bat`，一个脆弱的批处理脚本，全局修改你的环境变量，只为了找到编译器这周藏在哪里。

最终，你的构建说明看起来像法律免责声明：

> "在我的机器上可以工作，使用 VS 17.4.2 (Build 33027.167) 和 SDK 10.0.22621.0。如果你使用 17.5，请查看 Issue #412。如果你在 ARM64 上，祝你好运。"

在 Windows 上，这已经成为「做生意的基本成本」。我们告诉用户等待三小时安装 20GB，只为了编译一个 5MB 的可执行文件。**这已经成为原生开发的实质性障碍。**

## 新的解决方案

我不想成为别人安装程序的人肉调试器。我希望 MSVC 工具链像现代依赖一样：版本化、隔离、声明式。

我花了几周时间构建了一个开源工具来改善这种状况。它叫 **msvcup**。这是一个小型 CLI 程序。在网络/硬件良好的情况下，它可以在几分钟内安装工具链/SDK，包括交叉编译到/从 ARM 所需的一切。每个版本的工具链/SDK 都有自己的隔离目录。它是幂等的，速度足够快，可以在每次构建时调用。

### 快速上手

创建 `hello.c` 和 `build.bat`：

```c
#include <stdio.h>
int main() { printf("Hello, World\n"); }
```

```batch
@setlocal

@if not exist msvcup.exe (
    echo msvcup.exe: installing...
    curl -L -o msvcup.zip https://github.com/marler8997/msvcup/releases/download/v2026_02_07/msvcup-x86_64-windows.zip
    tar xf msvcup.zip
    del msvcup.zip
) else (
    echo msvcup.exe: already installed
)
@if not exist msvcup.exe exit /b 1

set MSVC=msvc-14.44.17.14
set SDK=sdk-10.0.22621.7

msvcup install --lock-file msvcup.lock --manifest-update-off %MSVC% %SDK%
@if %errorlevel% neq 0 (exit /b %errorlevel%)

msvcup autoenv --target-cpu x64 --out-dir autoenv %MSVC% %SDK%
@if %errorlevel% neq 0 (exit /b %errorlevel%)

.\autoenv\cl hello.c
```

就这样完成了。

相信我，这个 `build.bat` 脚本取代了「安装 Visual Studio」的需求。这个脚本应该能在任何 Windows 10 及以上系统上运行（假设有 curl/tar，这两个工具自 2018 年起就已内置）。它安装 MSVC 工具链、Windows SDK，然后编译我们的程序。

对于我的 Windows 开发者朋友们，请花一点时间消化一下。Visual Studio 再也不能伤害你了。上面的 `build.bat` 不仅仅是一个辅助脚本；它是对 Visual Studio Installer 的独立宣言。我们的依赖完全被指定，使构建在机器间可复现。当这些依赖被安装时，它们不会污染你的注册表或锁定你到单一的全局版本。

还要注意，在第一次运行后，`msvcup` 命令只需要几毫秒，这意味着我们可以把这些命令留在构建脚本中，现在我们有了一个完全自包含的脚本，可以在几乎任何现代 Windows 机器上构建我们的项目。

## 它是如何工作的？

msvcup 的灵感来自 Mārtiņš Možeiko 编写的一个小型 Python 脚本。关键洞察是：微软发布描述 Visual Studio 中每个组件的 JSON 清单，这些就是官方安装程序使用的相同清单。msvcup 解析这些清单，识别编译所需的包（编译器、链接器、头文件和库），并直接从微软的 CDN 下载它们。所有内容都放在 `C:\msvcup\` 下的版本化目录中。

细心的读者会注意到，我们的 `build.bat` 脚本从未 source 任何批处理文件来设置「开发者环境」。脚本包含两个 msvcup 命令。第一个安装工具链/SDK，像普通安装一样，它包含「vcvars」脚本来设置开发者环境。相反，我们的 `build.bat` 利用 `msvcup autoenv` 命令创建一个「自动环境」。这创建了一个包含包装可执行文件的目录，这些可执行文件会在转发到底层工具之前代表你设置环境变量。它甚至包含一个 `toolchain.cmake` 文件，会将你的 CMake 项目指向这些工具，让你可以在特殊环境之外构建 CMake 项目。

在 Tuple（一个结对编程应用），我将 msvcup 集成到我们的构建系统和 CI 中，这使我们能够移除用户/CI 预安装 Visual Studio 的要求。Tuple 编译数百个 C/C++ 项目，包括 WebRTC。这使 CI 能够进行 x86_64 和 ARM 构建，并让 CI 和所有人都使用相同的工具链/SDK。

### 核心优势

- **一切安装到版本化目录**。可以并排安装多个版本。如果出了问题，很容易删除或重新安装。
- **开箱即用的交叉编译**。msvcup 目前总是下载所有支持的交叉目标的工具，所以你不需要费力寻找交叉编译所需的所有组件。
- **Lock 文件支持**。一个自包含的所有 payload/URL 列表。每个人都使用相同的包，如果微软在上游改变了什么，你会知道。
- **极快**。当没有工作要做时，`install` 和 `autoenv` 命令是幂等的，在几毫秒内完成。

不再有「因为它在我机器上安装了 2019 Build Tools 所以能工作」。不再需要潜入注册表寻找 `cl.exe` 这周藏在哪里。有了 msvcup，你的环境由你的代码定义，可以跨机器移植，并在几毫秒内准备好编译。

### 局限性

msvcup 专注于核心编译工具链。如果你需要完整的 Visual Studio IDE、基于 MSBuild 的项目系统，或 C++/CLI 编译器等组件，你仍然需要官方安装程序。不过，对于大多数原生开发工作流程，它覆盖了你真正需要的内容。

## 实战案例：构建 Raylib

让我们在一个真实项目上试试。这是一个在干净的 Windows 系统上从零开始构建 raylib 的脚本。在这种情况下，我们只使用 SDK 而不使用 autoenv：

```batch
@setlocal

set TARGET_CPU=x64

@if not exist msvcup.exe (
    echo msvcup.exe: installing...
    curl -L -o msvcup.zip https://github.com/marler8997/msvcup/releases/download/v2026_02_07/msvcup-x86_64-windows.zip
    tar xf msvcup.zip
    del msvcup.zip
)

set MSVC=msvc-14.44.17.14
set SDK=sdk-10.0.22621.7

msvcup.exe install --lock-file msvcup.lock --manifest-update-off %MSVC% %SDK%
@if %errorlevel% neq 0 (exit /b %errorlevel%)

@if not exist raylib (
    git clone https://github.com/raysan5/raylib -b 5.5
)

call C:\msvcup\%MSVC%\vcvars-%TARGET_CPU%.bat
call C:\msvcup\%SDK%\vcvars-%TARGET_CPU%.bat

cmd /c "cd raylib\projects\scripts && build-windows"
@if %errorlevel% neq 0 (exit /b %errorlevel%)

@echo build success: game exe at:
@echo .\raylib\projects\scripts\builds\windows-msvc\game.exe
```

没有 Visual Studio 安装。没有 GUI。不需要祈祷。只有一个脚本，做它说要做的事情。

P.S. 作者还提供了一个页面，展示如何使用 msvcup 在 Windows 上从零开始构建 LLVM 和 Zig。

---

## 个人感悟

这篇文章让我想起了自己使用 Visual Studio 的痛苦经历。作为一个从 Linux 开发转到 Windows 的开发者，那种「只需要一个命令安装工具链」的体验在 Windows 上简直是奢望。

msvcup 的设计哲学很值得学习：

1. **声明式依赖**：把工具链版本写进脚本，就像 package.json 一样
2. **幂等操作**：每次运行都安全，不会重复下载或破坏环境
3. **隔离安装**：不同版本可以共存，删除就是删文件夹，干净利落
4. **直接透明**：不需要 GUI，不需要注册表，一切都在明处

对于做跨平台 C/C++ 开发的同学，这个工具可能会改变你对 Windows 开发的看法。它让 Windows 构建环境终于有了 Linux 那种「可预测、可复现」的感觉。

---

**关键要点**：

- Visual Studio 安装程序是原生开发的主要痛点，动辄 50GB 安装包
- msvcup 是一个开源 CLI 工具，可在几分钟内安装 MSVC 工具链
- 支持版本隔离、lock 文件、交叉编译，构建可复现
- 特别适合 CI/CD 场景，无需预装 Visual Studio
