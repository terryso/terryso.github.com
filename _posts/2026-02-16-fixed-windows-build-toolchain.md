---
layout: post
title: "告别 Visual Studio 安装噩梦：用 msvcup 实现声明式 Windows 构建环境"
date: 2026-02-16 07:08:34 +0800
categories: tech-translation
description: "Windows 原生开发一直被 Visual Studio 的臃肿安装所困扰。本文介绍 msvcup 工具，它能以声明式、版本化的方式安装 MSVC 工具链，让 Windows 构建环境像 Linux 一样简洁可控。"
original_url: https://marler8997.github.io/blog/fixed-windows/
source: Hacker News
---

本文翻译自 [Welcome to Johnny's World](https://marler8997.github.io/blog/fixed-windows/)，原载于 Hacker News。

## Visual Studio：一个 "选择你自己的冒险" 噩梦

想象你正在维护一个原生项目。你使用 Visual Studio 在 Windows 上构建，所以你很负责任地列出了依赖项：

> 构建要求：安装 Visual Studio

如果你还不知道这意味着什么，我羡慕你。不幸的是，现在连 Boromir 都知道了……

![SimplyInstallVs](https://marler8997.github.io/SimplyInstallVs.png)

说得真好。

你可能没有意识到，你实际上已经成为了 Microsoft "Visual Studio Installer" 的无偿技术支持。你可能会发现 GitHub Issues 越来越少关于你的代码，而更多关于 Windows 上的构建失败。你发现自己要向贡献者解释，他们没有勾选 "Desktop development with C++" 工作负载，而且具体需要 v143 构建工具和 10.0.22621.0 SDK。不，不是那个，是**另一个**。你花在自己项目上的时间越来越少，因为你忙着为一个 50GB 的 IDE 做人工依赖解析器。

说 "安装 Visual Studio" 就像是给贡献者一本充满糟糕结局的 "选择你自己的冒险" 书，其中一些结局甚至无法回退。这些年来，我不止一次不得不重装整个操作系统。

### 为什么这场悲剧只发生在 Windows 上？

在 **Linux** 上，工具链通常只需要一个包管理器命令就能搞定。另一方面，"Visual Studio" 包含数千个组件。它如此庞大，以至于 Microsoft 用一个复杂的 GUI 安装程序来分发它，你在其中穿梭于复选框的迷宫，寻找哪个 "工作负载" 或 "单个组件" 包含实际的编译器。选错了，你可能会浪费几个小时安装不需要的东西。漏掉一个，比如 "Windows 10 SDK (10.0.17763.0)" 或 "Spectre-mitigated libs"，你的构建会在三个小时后失败，并出现一个晦涩的错误如 `MSB8101`。如果你需要降级到旧版本的构建工具来处理遗留项目，那就求神保佑吧。

Visual Studio 生态系统建立在 "一体化" 单体架构的遗产之上。它将编辑器、编译器和 SDK 混淆成一个纠缠不清的网。当我们把 "Visual Studio" 列为依赖时，我们没有区分用于编写代码的工具和编译代码所需的环境。

痛苦很快叠加：

- **数小时的等待**：你花一个下午看着进度条下载 15GB，只为了得到一个 50MB 的编译器。
- **零透明度**：你不知道安装了哪些文件或它们去了哪里。你的注册表充满了垃圾，后台更新服务永久驻留在任务管理器中。
- **无版本控制**：你不能将编译器签入 Git。如果队友有稍微不同的 Build Tools 版本，你的构建可能会悄然分歧。
- **"幽灵" 环境**：卸载永远不会真正干净。换到新机器意味着重复整个 GUI 舞蹈，祈祷你勾选了相同的复选框。

即使在安装之后，从命令行编译单个 C 文件也需要找到 Developer Command Prompt。在底层，这个快捷方式调用 `vcvarsall.bat`，一个脆弱的批处理脚本，全局修改你的环境变量，只为了找到编译器这周藏在哪里。

最终，你的构建指令看起来像法律免责声明：

> "在我的机器上可用，VS 17.4.2 (Build 33027.167) 和 SDK 10.0.22621.0。如果你有 17.5，请参阅 Issue #412。如果你在 ARM64 上，祝你好运。"

在 Windows 上，这已经成为 "经商成本"。我们告诉用户等待三个小时进行 20GB 的安装，只是为了编译一个 5MB 的可执行文件。**它已经成为原生开发的积极威慑。**

## 一种新方法

我对成为别人安装程序的人工调试器不感兴趣。我希望 MSVC 工具链表现得像一个现代依赖项：版本化、隔离、声明式。

我花了几周时间构建一个开源工具来改善情况。它叫 **msvcup**。它是一个小型 CLI 程序。在良好的网络/硬件上，它可以在几分钟内安装工具链/SDK，包括所有用于交叉编译到/从 ARM 的内容。工具链/SDK 的每个版本都有自己的隔离目录。它是幂等的，速度足够快，可以在每次构建时调用。让我们试试。

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

就这样。

信不信由你，这个 `build.bat` 脚本取代了 "安装 Visual Studio" 的需求。这个脚本应该可以在任何 Windows 10 以来的 Windows 系统上运行（假设它有 curl/tar，这些自 2018 年以来就已内置）。它安装 MSVC 工具链、Windows SDK，然后编译我们的程序。

对于我的 Windows 开发者同伴们，花点时间。Visual Studio 再也不能伤害你了。上面的 `build.bat` 不仅仅是一个辅助脚本；它是从 Visual Studio Installer 独立的宣言。我们的依赖项完全指定，使构建在机器之间可重现。当这些依赖项安装时，它们不会污染你的注册表或将你锁定在单一全局版本中。

还要注意，第一次运行后，`msvcup` 命令只需要毫秒，这意味着我们可以将这些命令留在构建脚本中，现在我们有了一个完全自包含的脚本，几乎可以在任何现代 Windows 机器上构建我们的项目。

## 它是如何工作的？

msvcup 的灵感来自 Mārtiņš Možeiko 编写的一个小型 Python 脚本。关键的洞察是 Microsoft 发布描述 Visual Studio 中每个组件的 JSON manifests，官方安装程序使用的就是这些 manifests。msvcup 解析这些 manifests，识别编译所需的包（编译器、链接器、头文件和库），并直接从 Microsoft 的 CDN 下载。所有内容都放在 `C:\msvcup\` 下的版本化目录中。有关锁定文件、交叉编译和其他功能的详细信息，请参阅 msvcup README.md。

敏锐的人还会注意到，我们的 `build.bat` 脚本从未 source 任何批处理文件来设置 "开发者环境"。该脚本包含两个 msvcup 命令。第一个安装工具链/SDK，像正常安装一样，它包含 "vcvars" 脚本来设置开发者环境。相反，我们的 `build.bat` 利用 `msvcup autoenv` 命令创建一个 "自动环境"。这创建了一个目录，其中包含包装可执行文件，在转发到底层工具之前代表你设置环境变量。它甚至包括一个 `toolchain.cmake` 文件，它将你的 CMake 项目指向这些工具，允许你在特殊环境之外构建 CMake 项目。

在 Tuple（一个结对编程应用），我将 msvcup 集成到我们的构建系统和 CI 中，这使我们能够移除用户/CI 预安装 Visual Studio 的要求。Tuple 编译数百个 C/C++ 项目，包括 WebRTC。这使 CI 能够进行 x86_64 和 ARM 构建，并保持 CI 和每个人使用相同的工具链/SDK。

好处：

- **所有内容都安装在版本化目录中。** 并排安装版本没有问题。如果出现问题，易于删除或重新安装。
- **开箱即用的交叉编译支持。** msvcup 目前总是下载所有支持的交叉目标的工具，所以你不必费力寻找交叉编译所需的所有组件。
- **锁定文件支持。** 所有 payloads/URLs 的自包含列表。每个人都使用相同的包，如果 Microsoft 在上游更改了某些内容，你会知道。
- **极快。** 当没有工作要做时，`install` 和 `autoenv` 命令是幂等的，在毫秒内完成。

不再有 "因为我安装了 2019 Build Tools 所以它在我的机器上可用"。不再有注册表潜入寻找 `cl.exe` 这周藏在哪里。有了 msvcup，你的环境由你的代码定义，跨机器可移植，并准备在毫秒内编译。

### 局限性

msvcup 专注于核心编译工具链。如果你需要完整的 Visual Studio IDE、基于 MSBuild 的项目系统，或 C++/CLI 编译器等组件，你仍然需要官方安装程序。不过，对于大多数原生开发工作流程，它涵盖了你的实际需求。

## 一个真实世界的例子：构建 Raylib

让我们在一个真实项目上试试。这是一个在干净的 Windows 系统上从头构建 raylib 的脚本。在这种情况下，我们只使用 SDK 而不使用 autoenv：

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

无需 Visual Studio 安装。无需 GUI。无需祈祷。只是一个完全按它所说的做的脚本。

P.S. 这里有一个页面展示了如何使用 msvcup 在 Windows 上从头构建 LLVM 和 Zig。

---

## 译者总结

这篇文章直击 Windows 原生开发的痛点。作为一个长期使用 Windows 进行 C/C++ 开发的程序员，我深有体会：

1. **Visual Studio 的 "臃肿" 问题**：安装一个编译器需要下载几十 GB 的 IDE，这在 Linux 世界里是不可想象的。`apt install build-essential` 一行命令就能搞定的事情，在 Windows 上变成了一个 GUI 迷宫。

2. **声明式构建环境的价值**：msvcup 的核心思想是让构建环境成为代码的一部分。通过锁定文件和版本化目录，你可以确保每个开发者、每个 CI 环境都使用完全相同的工具链。这与现代开发实践（如 Docker、Nix）的理念一致。

3. **对开源项目的意义**：如果一个开源项目使用 msvcup，贡献者不需要预先安装 Visual Studio。只需运行一个构建脚本，一切都会自动搞定。这大大降低了贡献门槛。

4. **CI/CD 的福音**：在 CI 环境中，预安装 Visual Studio 既耗时又不可靠。msvcup 让 CI 环境可以完全自动化设置，无需人工干预。

**核心要点**：
- msvcup 让 MSVC 工具链像 Linux 包管理器一样简单可控
- 版本化、隔离、声明式的构建环境
- 无需 Visual Studio Installer，无需 GUI，无需 "选择你自己的冒险"
- 支持锁定文件，确保团队使用相同的工具链版本
- 交叉编译支持开箱即用

对于任何在 Windows 上进行原生开发的团队，这绝对是一个值得尝试的工具。
