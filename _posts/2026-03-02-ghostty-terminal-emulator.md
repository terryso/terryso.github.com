---
layout: post
title: "Ghostty：一款快速、跨平台的新一代终端模拟器"
date: 2026-03-02 06:37:05 +0800
categories: tech-translation
description: "Ghostty 是一款快速、功能丰富且跨平台的终端模拟器，采用平台原生 UI 和 GPU 加速。本文介绍其主要特性、配置方式以及为何值得关注。"
original_url: https://ghostty.org/docs
source: Hacker News
---

本文翻译自 [Ghostty Docs](https://ghostty.org/docs)，原载于 Hacker News。

## 什么是 Ghostty？

Ghostty 是一款**快速**、**功能丰富**且**跨平台**的终端模拟器，采用平台原生 UI（native UI）和 GPU 加速技术。

如果你是一名开发者，每天都要和终端打交道，那么选择一款好的终端模拟器至关重要。Ghostty 的设计理念是：**开箱即用，零配置即可运行**。

## 核心特性

### 1. 跨平台支持

Ghostty 目前支持 macOS 和 Linux，并且使用各平台的原生 UI 组件来提供符合系统习惯的体验。Windows 支持也在计划中。

### 2. GPU 加速渲染

- macOS 上使用 **Metal**
- Linux 上使用 **OpenGL**

这意味着终端渲染性能出色，即使处理大量文本输出也不会卡顿。

### 3. 窗口、标签页和分屏

Ghostty 支持多窗口，每个窗口可以有独立的标签页和分屏。这些都是使用原生 UI 组件渲染的，体验流畅自然。

### 4. 丰富的主题支持

Ghostty 内置了**数百个主题**，只需一行配置即可切换。主题还可以根据系统的深色/浅色模式自动切换。当然，你也可以自定义主题。

### 5. 高级排版特性

- **连字（Ligatures）**：支持带有连字的字体，如 Fira Code、JetBrains Mono 等
- **字形聚类（Grapheme clustering）**：正确渲染多码点 emoji（如旗帜、肤色等）以及阿拉伯语、希伯来语等从右到左的脚本

### 6. Kitty 图形协议

支持 Kitty 图形协议，允许终端应用程序直接在终端中渲染图像。

## macOS 原生功能

Ghostty 在 macOS 上有很多贴心设计：

- **Quick Terminal**：一个轻量级终端，可以从菜单栏下方滑出，随时调用而不打断工作流程
- **原生标签页和分屏**：使用 macOS 原生组件，而不是自定义绘制的文本
- **代理图标（Proxy Icon）**：可以拖动标题栏中的代理图标来移动或访问终端会话文件
- **快速查找（Quick Look）**：三指点击或强制触摸文本，使用 macOS Quick Look 查看定义、网络搜索等
- **安全键盘输入**：自动检测密码提示或手动启用安全键盘输入，防止密码被其他进程截取。激活时右上角会显示动画锁图标

## 配置系统

### 设计理念

Ghostty 的设计理念是**尽量减少必要配置**：

> 如果你发现需要配置某些东西（除了主题这种高度主观的设置），而且你认为它应该是默认值，请开一个讨论帖。

Ghostty 有合理的默认值，内置默认字体（JetBrains Mono），内置 Nerd Fonts，开箱即用。

### 配置文件位置

配置按以下顺序加载：

**Linux:**
- `$XDG_CONFIG_HOME/ghostty/config`
- 如果 `XDG_CONFIG_HOME` 未定义，则默认为 `$HOME/.config/ghostty/config`

**macOS:**
- `$HOME/Library/Application Support/com.mitchellh.ghostty/config`
- 也支持上述 XDG 配置路径

### 配置语法

使用简洁的 `key = value` 语法：

```
# 等号周围的空格不影响解析
background = 282c34
foreground = ffffff

# 注释以 # 开头，空行会被忽略
keybind = ctrl+z=close_surface
keybind = ctrl+d=new_split:right

# 空值将配置重置为默认值
font-family =
```

语法要点：

- 键名区分大小写，Ghostty 始终使用小写键名
- 值可以加引号也可以不加
- 每个配置键都可以作为 CLI 标志使用，例如：`ghostty --background=282c34`

### 配置重载

运行时可以通过快捷键重载配置：

- Linux: `Ctrl+Shift+,`
- macOS: `Cmd+Shift+,`

### 多文件配置

可以使用 `config-file` 键来拆分配置：

```
config-file = some/relative/sub/config
config-file = ?optional/config    # ? 前缀表示可选文件
config-file = /absolute/path/config
```

## 面向终端应用开发者

Ghostty 不仅对终端用户友好，对终端应用开发者来说也是最现代、最全面的终端模拟器之一。

Ghostty 遵循以下原则来确定功能行为：

1. **Xterm 兼容性**：xterm 是事实上的终端模拟标准
2. **协议源头兼容性**：如果定义协议的终端有某种行为，Ghostty 会遵循
3. **事实标准兼容性**：如果某种行为被广泛接受为标准，Ghostty 会遵循

## 如何查找配置文档

除了网站文档外，还可以通过以下方式查看配置选项：

1. 在 `$prefix/share/ghostty/docs` 目录中有 HTML 和 Markdown 格式的文档
2. 在 `$prefix/share/man` 目录中有 man 手册
3. 命令行运行：`ghostty +show-config --default --docs`
4. 在源代码中查看 Config 结构

## 小结

Ghostty 作为一款新一代终端模拟器，有以下值得关注的亮点：

- **性能优先**：GPU 加速渲染，启动快、响应迅速
- **原生体验**：使用平台原生 UI 组件，符合系统使用习惯
- **零配置开箱即用**：内置合理默认值，新手友好
- **功能丰富**：支持现代终端特性如 Kitty 图形协议、连字、多路复用等
- **高度可定制**：数百个配置选项满足个性化需求

如果你正在寻找一款现代化的终端模拟器，Ghostty 绝对值得一试。它正在快速开发中，社区活跃，未来可期。
