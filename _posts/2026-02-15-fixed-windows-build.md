---
layout: post
title: "告别 Visual Studio 安装噩梦：用 msvcup 实现干净的 Windows 原生开发环境"
date: 2026-02-15 22:41:12 +0800
categories: tech-translation
description: "在 Windows 上做原生开发，安装 Visual Studio 就像打开潘多拉魔盒。这篇文章介绍了一个叫 msvcup 的开源工具，让你用一行命令就能获得干净的 MSVC 编译环境，彻底告别那个 50GB 的庞然大物。"
original_url: https://marler8997.github.io/blog/fixed-windows/
source: Hacker News
---

本文翻译自 [Welcome to Johnny's World: Fixed Windows](https://marler8997.github.io/blog/fixed-windows/)，原载于 Hacker News。

## 问题：Visual Studio 是个无底洞

假设你在维护一个原生项目。因为要在 Windows 上构建，你很负责任地在依赖列表里写上：

> 构建要求：安装 Visual Studio

如果你还不知道这意味着什么，那我真羡慕你。

![One does not simply install Visual Studio](https://marler8997.github.io/SimplyInstallVs.png)

说"安装 Visual Studio"就像给贡献者一本充满坏结局的冒险游戏书，有些分支甚至不让你回头。我这些年不得不重装系统不止一次。

当你把 Visual Studio 列为依赖时，你其实是在无偿充当微软"Visual Studio Installer"的技术支持。你会发现 GitHub Issues 变得越来越不关于你的代码，而是关于 Windows 上的构建失败。你开始向贡献者解释：他们没有勾选"Desktop development with C++"工作负载，而且需要的是 v143 构建工具和 10.0.22621.0 SDK。不对，不是那个，是另一个。你花在自己项目上的时间越来越少，因为你忙着为一个 50GB 的 IDE 做人工依赖解析。

### 为什么只有 Windows 这么痛苦？

在 **Linux** 上，工具链通常就是一个包管理器命令的事。而"Visual Studio"是成千上万个组件的集合。它庞大到微软用一个复杂的 GUI 安装程序来分发，你在其中穿梭于复选框的迷宫，寻找哪个"工作负载"或"单个组件"包含真正的编译器。选错了可能会浪费几小时安装不需要的东西。漏选一个（比如"Windows 10 SDK (10.0.17763.0)"或"Spectre 缓解库"），构建就会在三小时后失败，报一个像 `MSB8101` 这样晦涩的错误。

Visual Studio 生态系统建立在"全合一"巨石架构的遗产上。它把编辑器、编译器和 SDK 混成一个纠缠不清的网。当我们把"Visual Studio"列为依赖时，我们没有区分用来写代码的工具和编译代码所需的环境。

痛苦会快速叠加：

- **漫长的等待**：你花一下午看进度条下载 15GB，只为了得到一个 50MB 的编译器
- **零透明度**：你不知道安装了哪些文件，也不知道它们去了哪里。注册表充满垃圾，后台更新服务常驻任务管理器
- **无版本控制**：你不能把编译器提交到 Git。如果队友的 Build Tools 版本稍有不同，构建可能悄悄分叉
- **"幽灵"环境**：卸载永远不彻底。换新机器意味着重演整个 GUI 舞蹈，祈祷你勾选了相同的选项

即使在安装之后，从命令行编译单个 C 文件也需要找到"Developer Command Prompt"。在底层，这个快捷方式调用 `vcvarsall.bat`，一个脆弱的批处理脚本，全局修改你的环境变量，只为了找到编译器这周藏在哪里。

最终，你的构建说明看起来像法律免责声明：

> "在我的机器上可以用，VS 17.4.2 (Build 33027.167) 和 SDK 10.0.22621.0。如果你有 17.5，请看 Issue #412。如果你是 ARM64，祝你好运。"

在 Windows 上，这已成为"做生意的成本"。我们让用户等三小时装 20GB，只为了编译一个 5MB 的可执行文件。**这已成为原生开发的积极阻碍。**

## 新方案：msvcup

我不想再为别人的安装程序做人肉调试器了。我想要 MSVC 工具链像现代依赖一样：版本化、隔离、声明式。

我花了几周时间构建了一个开源工具来改善这种情况。它叫 [msvcup](https://github.com/marler8997/msvcup)。这是一个小型 CLI 程序。在网络和硬件良好的情况下，它可以在几分钟内安装工具链和 SDK，包括所有交叉编译到/从 ARM 的内容。每个版本的工具链和 SDK 都有自己的隔离目录。它是幂等的，足够快，可以在每次构建时调用。

让我们试试。创建 `hello.c` 和 `build.bat`：

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

就这么简单。

信不信由你，这个 `build.bat` 脚本取代了"安装 Visual Studio"的需求。这个脚本应该能在任何 Windows 10 以来的 Windows 系统上运行（假设有 curl/tar，这些从 2018 年开始内置）。它安装 MSVC 工具链、Windows SDK，然后编译我们的程序。

对于我的 Windows 开发者朋友们，花点时间消化一下。Visual Studio 再也不能伤害你了。上面的 `build.bat` 不仅仅是一个辅助脚本；它是从 Visual Studio Installer 独立的宣言。我们的依赖完全指定，使构建在机器间可复现。当这些依赖安装时，它们不会污染你的注册表或锁定你到单一全局版本。

还要注意，第一次运行后，`msvcup` 命令只需要毫秒级时间，意味着我们可以把这些命令留在构建脚本里，现在我们有了一个完全自包含的脚本，可以在几乎所有现代 Windows 机器上构建我们的项目。

## 它是怎么工作的？

msvcup 的灵感来自 Mārtiņš Možeiko 写的一个小型 Python 脚本。关键洞察是：微软发布描述 Visual Studio 每个组件的 JSON manifests，和官方安装程序使用的是同一份。msvcup 解析这些 manifests，识别编译所需的包（编译器、链接器、头文件和库），直接从微软的 CDN 下载。所有东西都落在 `C:\msvcup\` 下的版本化目录里。

细心的人会注意到我们的 `build.bat` 脚本从未 source 任何批处理文件来设置"Developer Environment"。脚本包含两个 msvcup 命令。第一个安装工具链和 SDK，像正常安装一样，它包含"vcvars"脚本来设置开发者环境。但我们的 `build.bat` 利用 `msvcup autoenv` 命令创建一个"Automatic Environment"。这创建一个包含包装可执行文件的目录，在转发到底层工具之前代表你设置环境变量。它甚至包含一个 `toolchain.cmake` 文件，可以让你的 CMake 项目指向这些工具，允许你在特殊环境之外构建 CMake 项目。

在 Tuple（一个结对编程应用），我把 msvcup 集成到我们的构建系统和 CI 中，这让我们可以移除用户和 CI 预装 Visual Studio 的要求。Tuple 编译数百个 C/C++ 项目，包括 WebRTC。这使 CI 上可以同时做 x86_64 和 ARM 构建，并保持 CI 和每个人使用相同的工具链和 SDK。

**好处总结：**

- **所有东西安装到版本化目录**。可以并排安装多个版本。出问题时容易删除或重装
- **开箱即用的交叉编译**。msvcup 目前总是下载所有支持跨目标的工具，所以你不需要费心寻找交叉编译所需的所有组件
- **Lock file 支持**。一个包含所有 payloads/URLs 的自包含列表。每个人使用相同的包，如果微软在上游改变了什么，你会知道
- **极快**。当没有工作要做时，`install` 和 `autoenv` 命令是幂等的，在毫秒内完成

不再有"在我机器上能用因为我装了 2019 Build Tools"。不再有注册表潜水找 `cl.exe` 这周藏在哪里。有了 msvcup，你的环境由你的代码定义，在机器间可移植，毫秒级就能准备好编译。

### 局限性

msvcup 专注于核心编译工具链。如果你需要完整的 Visual Studio IDE、基于 MSBuild 的项目系统，或 C++/CLI 编译器等组件，你仍然需要官方安装程序。不过对于大多数原生开发工作流，它覆盖了你实际需要的东西。

## 真实示例：构建 Raylib

让我们在一个真实项目上试试。这是一个在干净的 Windows 系统上从头构建 raylib 的脚本：

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

没有 Visual Studio 安装。没有 GUI。不用祈祷。只是一个确切做它所说之事的脚本。

---

## 关键要点

1. **Visual Studio Installer 是个陷阱** - 它把简单的事情（装个编译器）变成了充满选择错误的迷宫，浪费时间和磁盘空间
2. **msvcup 提供了现代依赖管理体验** - 版本化、隔离、声明式，就像你在 npm/cargo/pip 世界里习惯的那样
3. **自包含构建脚本** - 你的项目可以携带自己的构建环境定义，新贡献者不需要任何预配置
4. **lock file 保证可复现性** - 团队所有人用完全相同的包版本，上游变化会被检测到
5. **交叉编译开箱即用** - x86_64 和 ARM 目标都包含在内

如果你在 Windows 上做 C/C++ 开发，尤其是维护开源项目，msvcup 值得一试。它不能完全替代 Visual Studio IDE，但对于 CI 和命令行构建场景，它是一个游戏规则改变者。

P.S. 作者还提供了用 msvcup 在 Windows 上从头构建 LLVM 和 Zig 的[示例页面](https://github.com/marler8997/msvcup)。
