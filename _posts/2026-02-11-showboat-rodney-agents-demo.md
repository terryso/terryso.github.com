---
layout: post
title: "Showboat 和 Rodney：让 AI 代码演示更简单"
date: 2026-02-11 03:40:46 +0800
categories: tech-translation
description: "Simon Willison 推出了两个新工具，帮助 AI 编程助手自动生成演示文档和浏览器自动化测试，让代码验证变得更高效。"
original_url: https://simonwillison.net/2026/Feb/10/showboat-and-rodney/
source: Hacker News
---

本文翻译自 [Introducing Showboat and Rodney, so agents can demo what they've built](https://simonwillison.net/2026/Feb/10/showboat-and-rodney/)，原载于 Hacker News。

## 让 AI 证明代码真的能工作

软件开发的核心任务从来不是写代码，而是**交付能正常工作的代码**。当我们越来越多地使用 AI 编程助手时，这个挑战变得更加重要——我们需要证明代码确实能按预期运行。

最近我写到了这个观点，但真正的问题是：如何让 AI 不仅写出代码，还能向我们展示这些代码实际运行的效果？这不是简单的自动化测试就能解决的问题——我们需要的是能够展示进展、帮助我们直观理解 AI 生成软件能力的工具。

这就是我发布两个新工具 **Showboat** 和 **Rodney** 的原因。

### Showboat：让 AI 自动生成演示文档

Showboat 是一个 CLI 工具（Go 编写的二进制文件，用 Python 封装以便安装），它的设计目标是帮助 AI 构建一个 Markdown 文档，精确展示它刚开发的代码能做什么。

这个工具不是给人用的，而是给 AI 编程助手用的。但如果你想手动运行，大概是这样：

```bash
showboat init demo.md '如何使用 curl 和 jq'
showboat note demo.md "这里演示如何组合使用 curl 和 jq"
showboat exec demo.md bash 'curl -s https://api.github.com/repos/simonw/rodney | jq .description'
showboat note demo.md "下面是 curl 的 logo，演示 image 命令："
showboat image demo.md 'curl -o curl-logo.png https://curl.se/logo/curl-logo.png && echo curl-logo.png'
```

运行后在 VS Code 中预览，你会看到一个格式精美的 Markdown 文档，包含代码块、执行结果和截图。

**核心设计思路：**

- `showboat init` - 初始化演示文档
- `showboat note` - 添加说明文字
- `showboat exec` - 执行命令并自动捕获输出
- `showboat image` - 从命令输出中提取图片路径并嵌入

整个工具只有 172 行 Go 代码，非常简单。最有意思的是它的 `--help` 输出——这是专门为 AI 设计的，包含了 AI 使用这个工具需要的所有信息。

这意味着你可以直接告诉 Claude：

> "运行 `uvx showboat --help`，然后用 showboat 创建一个 demo.md 文档来演示你刚构建的功能"

AI 会读取帮助文档，然后使用 Showboat 的所有功能来创建演示文档。

**实际使用体验：**

当 AI 在构建 Showboat 文档时，你可以在 VS Code 中打开它，实时看到预览面板随着 AI 的演示步骤不断更新。这有点像同事在屏幕共享会议中向你展示他们的最新工作。

我用 Showboat 为多个项目创建了演示文档，包括：
- shot-scraper 的完整功能演示
- sqlite-history-json 的 CLI 功能
- 甚至在 QEMU 模拟的 Linux 环境中运行 libkrun 微虚拟机

*有趣的是，我发现 AI 会"作弊"！由于演示文件就是 Markdown，AI 有时会直接编辑文件而不是用 Showboat 命令，这可能导致命令输出与实际执行不符。我专门开了一个 issue 来跟踪这个问题。*

### Rodney：命令行浏览器自动化

我的很多项目都涉及 Web 界面，AI 经常会构建全新的页面，我也想在演示中看到这些界面。

Showboat 的 image 功能原本设计用来配合 shot-scraper 或 Playwright 截图，但我找不到好的命令行工具来管理多步骤的浏览器会话，所以决定自己造一个轮子。

Claude Opus 4.6 推荐了 **Rod** 这个 Go 库，它提供了 Chrome DevTools 协议的完整封装。Rod 非常棒——基本上涵盖了自动化 Chrome 能做的所有事情，而且编译后只有几 MB。

唯一的问题是 Rod 没有 CLI，于是 **Rodney** 诞生了（名字来自 Rod 库 + 英剧《Only Fools and Horses》的梗）。

**使用示例：**

```bash
rodney start  # 后台启动 Chrome
rodney open https://datasette.io/
rodney js 'Array.from(document.links).map(el => el.href).slice(0, 5)'
rodney click 'a[href="/for"]'
rodney js location.href
rodney js document.title
rodney screenshot datasette-for-page.png
rodney stop
```

和 Showboat 一样，这个工具也不是给人用的——它的目标是让 AI 代码助手能够运行 `rodney --help` 后就知道如何使用。

我用 Showboat 创建了三个 Rodney 的演示文档：
1. Rodney 的原始功能集（页面截图和 JavaScript 执行）
2. 新的无障碍测试功能
3. 使用这些功能对网页进行基础的无障碍审计

**印象最深的是**，当我告诉 Claude "用 showboat 和 rodney 对 https://latest.datasette.io/fixtures 进行无障碍审计"时，它的响应非常出色。

### 测试驱动开发有帮助，但手动测试仍然必要

我一直对"测试优先、最大测试覆盖率"的软件开发理念持怀疑态度（我更喜欢"包含测试的开发"），但最近我改变了看法——测试优先是迫使 AI 只编写解决问题所需代码的有效方式。

我现在很多 Python 编程会话都以这样的方式开始：

> "运行 `uv run pytest` 执行现有测试。使用红绿 TDD 模式开发。"

告诉 AI 如何运行测试，同时也向它传递了一个信号：这个项目的测试很重要，而且有良好的测试模式。AI 在编写自己的测试前会先阅读现有测试，所以拥有干净、有良好模式的测试套件会让 AI 更有可能写出好的测试。

所有前沿模型都理解"红绿 TDD"意味着：先写测试，看它失败，然后写代码让它通过——这是一个很方便的快捷指令。

我发现这大大提高了代码质量，也让 AI 更有可能以最少的提示产生正确的结果。

但任何做过测试的人都知道，自动化测试通过并不代表软件真的能正常工作！这正是 Showboat 和 Rodney 的动机——我从来不会亲眼看到功能运行前就信任它。

在构建 Showboat 之前，我经常在 AI 会话中添加一个"手动测试"步骤：

> "测试通过后，启动开发服务器，用 curl 测试新功能"

### 我在手机上构建了这两个工具

Showboat 和 Rodney 都是通过 Claude iPhone app 创建的 Claude Code for web 项目。它们大部分的后续功能开发也是以同样的方式完成的。

我现在仍然有点惊讶，我在手机上完成了多少编程工作。但我估计，现在我推送到 GitHub 的大部分代码，都是通过 iPhone app 驱动的 AI 编程助手为我编写的。

我最初设计这两个工具是为了在 Claude Code for web 这样的异步编码环境中使用。目前来看，效果非常好。

## 总结

Showboat 和 Rodney 解决了 AI 编程助手的核心问题：**如何证明代码真的能工作**。

- Showboat 让 AI 自动生成包含代码执行结果的演示文档
- Rodney 提供命令行浏览器自动化，让 AI 能截图和测试 Web 界面
- 两者都设计了完善的 `--help` 输出，让 AI 能直接理解如何使用

这两个工具虽然简单（Showboat 只有 172 行代码），但它们代表了一个重要趋势：我们正在从"写代码"转向"交付能工作的代码"，而 AI 需要新的工具来展示它的工作成果。

测试很重要，但亲眼看到功能运行更重要。这就是为什么即使在 TDD 时代，我们仍然需要像 Showboat 和 Rodney 这样的演示工具。
