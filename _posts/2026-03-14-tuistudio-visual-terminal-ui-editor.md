---
layout: post
title: "TUIStudio：像用 Figma 一样设计终端 UI"
date: 2026-03-14 00:56:06 +0800
categories: tech-translation
description: "一款类似 Figma 的可视化编辑器，让你通过拖拽组件的方式设计终端用户界面（TUI），并支持导出到多种主流框架。"
original_url: https://tui.studio/
source: Hacker News
---

本文翻译自 [TUIStudio — Design Terminal UIs. Visually.](https://tui.studio/)，原载于 Hacker News。

## 什么是 TUIStudio？

如果你曾经开发过终端应用，一定体会过手写布局代码的痛苦。`htop`、`lazygit`、`k9s` 这些优秀的 TUI（Text User Interface）应用背后，是开发者们一行行调整坐标和样式的艰辛。

**TUIStudio** 应运而生——它是一款类似 Figma 的可视化编辑器，专门用于设计终端用户界面。你可以通过拖拽组件、实时编辑属性的方式构建 TUI，最终一键导出到 6 种主流框架。

## 核心特性

### 可视化画布

拖拽组件到实时画布上，支持可配置的缩放级别，提供真实的 ANSI 预览效果。所见即所得，不再需要反复编译运行来查看效果。

### 20+ 内置组件

涵盖了构建完整终端应用所需的所有基础组件：

- **基础控件**：Screen、Box、Button、TextInput
- **选择器**：Checkbox、Radio、Select、Toggle
- **展示类**：Text、Spinner、ProgressBar
- **数据展示**：Table、List、Tree、Menu
- **导航类**：Tabs、Breadcrumb
- **弹出层**：Modal、Popover、Tooltip
- **布局辅助**：Spacer

### 强大的布局引擎

支持三种布局模式，完全模拟浏览器中的 CSS 布局：

- **Absolute**：绝对定位
- **Flexbox**：弹性盒子布局
- **Grid**：网格布局

属性控制全面，就像在 Chrome DevTools 中调整样式一样直观。

### 8 种配色主题

内置流行配色方案，实时预览切换：

Dracula、Nord、Solarized、Monokai、Gruvbox、Tokyo Night、Nightfox、Sonokai

### 多框架导出

设计一次，导出多种框架的生产级代码：

| 框架 | 语言 | 特点 |
|------|------|------|
| Ink | TypeScript | React 风格的终端应用开发 |
| BubbleTea | Go | Elm 架构的优雅 TUI 框架 |
| Blessed | JavaScript | Node.js 经典 TUI 库 |
| Textual | Python | 现代化的 Python TUI 框架 |
| OpenTUI | TypeScript | 跨平台 TUI 解决方案 |
| Tview | Go | 基于组件的 Go TUI 库 |

⚠️ **注意**：目前处于 Alpha 阶段，代码导出功能还在开发中。

### 项目保存与加载

项目保存为便携式的 `.tui` JSON 文件。可以：
- 从任何位置打开
- 提交到 Git 仓库
- 与团队成员共享

无需账户，无需云端依赖。

## 平台支持

目前支持 **Apple Silicon (M1/M2/M3/M4)** 原生应用。下载即用，无需复杂安装。

由于没有代码签名，首次打开时可能会遇到系统安全提示：

**macOS**：右键点击 .app → 打开 → 仍然打开（或前往系统设置 → 隐私与安全性 → "仍要打开"）

**Windows**：SmartScreen 会显示警告，点击"更多信息"→"仍要运行"

**Linux**：直接 `dpkg -i TUIStudio-amd64.deb` 或双击安装

## 定价

目前处于早期访问阶段，核心编辑器**免费下载使用**。未来计划推出 Pro 版本，包含团队协作、云端同步和优先支持等功能。

## 个人观点

作为开发者，我非常期待这类工具的成熟。TUI 开发一直是个小众但实用的领域，尤其是在服务器管理、DevOps 工具链中。TUIStudio 如果能把导出功能做好，将大大降低 TUI 开发的门槛。

不过目前 Alpha 版本的功能还不完整，建议持续关注项目进展。对于想尝试 TUI 开发的朋友，可以先用它来学习和设计界面原型。

项目地址：[GitHub](https://github.com/tuistudio/tuistudio)

---

**要点总结**：

1. TUIStudio 是一款可视化 TUI 设计工具，类似 Figma 的设计理念
2. 支持 20+ 组件、Flexbox/Grid 布局、8 种配色主题
3. 计划支持 6 种主流框架的代码导出（目前 Alpha 版本导出功能尚未完成）
4. 项目文件为 JSON 格式，便于版本控制和团队协作
5. 免费使用，适合 TUI 开发学习和原型设计
