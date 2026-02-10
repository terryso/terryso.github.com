---
layout: post
title: "Rad-Therapy II：将 Half-Life 2 移植到 Quake 引擎"
date: 2026-02-11 02:36:42 +0800
categories: tech-translation
description: "一个将 2004 年的经典游戏 Half-Life 2 移植到 Quake/QuakeWorld 引擎的开源项目，展示了游戏引擎移植的技术挑战与可能性。"
original_url: https://code.idtech.space/fn/hl2
source: Code.idtech.space
---

本文翻译自 [Rad-Therapy II](https://code.idtech.space/fn/hl2)，原载于 Code.idtech.space。

## 什么是 Rad-Therapy II？

Rad-Therapy II 是一个将 __Half-Life 2__（2004 年发布）移植到 Quake/QuakeWorld 引擎的开源项目。

这个项目最早由 Marco "eukara" Cawthorne 发起，采用了 ISC 许可证。需要注意的是，这个移植版本**无法**从头到尾完整体验原版游戏流程，但你可以进行 deathmatch（死亡竞技）和其他一些有趣的模式。

![预览图 1](https://code.idtech.space/fn/hl2/media/branch/main/img/preview1.jpg)
![预览图 2](https://code.idtech.space/fn/hl2/media/branch/main/img/preview2.jpg)
![预览图 3](https://code.idtech.space/fn/hl2/media/branch/main/img/preview3.jpg)
![预览图 4](https://code.idtech.space/fn/hl2/media/branch/main/img/preview4.jpg)

## 技术背景与意义

这个项目的技术价值在于它展示了如何将基于 Source 引擎的现代 3D 游戏内容移植到基于 Quake 引擎的 Nuclide 框架上。对于游戏开发者和引擎爱好者来说，这是一个研究不同引擎架构之间数据格式转换和渲染管线适配的绝佳案例。

## 安装与运行

### 前置要求

项目需要同时拥有 `hl2` 和 `hl2dm` 目录才能正常运行。任何版本的 Half-Life 2 和 Half-Life 2: Deathmatch 数据文件都可以。

如果你使用的是不区分大小写的文件系统，并且运行的是 `.vpk` 之前版本的数据文件，你可能需要将它们放入 `.zip` 文件中，并命名为 `pak0.pk3`。一般来说，直接使用 Steam 上的最新数据文件会更简单。

### 启动游戏

使用 FTE 引擎运行以下命令：

```
fteqw.exe -halflife2
```

当从 **Half-Life 2: Deathmatch** 目录中运行时，程序会自动尝试安装 **Rad-Therapy II**。

## 编译指南

如果你想自己编译这个项目，步骤如下：

首先克隆 Nuclide 仓库，运行 `make update` 和 `make fteqcc`，然后在 Nuclide-SDK 目录内克隆本项目仓库：

```bash
git clone https://code.idtech.space/fn/hl2 hl2
make game GAME=hl2
make plugins GAME=hl2
```

- `make game GAME=hl2` - 编译游戏逻辑
- `make plugins GAME=hl2` - 编译引擎加载数据文件所需的插件

确保 Nuclide-SDK 中存在 `fteqcc`（用于编译）和 `fteqw`（用于运行）。项目也支持包管理器安装的版本，但需要确保版本足够新。

## 社区与支持

### Matrix

如果你使用 Matrix，可以加入 Nuclide Space，在那里提问或了解开发者的最新进展：

https://matrix.to/#/#nuclide:matrix.org

### IRC

你也可以通过 irc.libera.chat 加入 #nuclide 频道。该频道与 Matrix 空间的主房间是互通的。

## 许可证

本项目采用 ISC License：

```
Copyright (c) 2019-2025 Marco "eukara" Cawthorne marco@icculus.org

Permission to use, copy, modify, and distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF MIND, USE, DATA OR PROFITS, WHETHER
IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING
OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## 内容版权声明

Half-Life 2 和 Half-Life 2: Deathmatch 归 Valve Corporation 所有。体验 **Rad-Therapy II** 需要来自 Steam 或光盘的原始授权资源。

## 总结与思考

Rad-Therapy II 这个项目虽然无法完整重现原版游戏体验，但它展示了游戏引擎移植的几个有趣特点：

1. **引擎架构的差异** - 从 Source 引擎移植到 Quake 引擎需要处理不同的渲染管线、物理系统和脚本语言
2. **数据格式转换** - 如何将现代游戏资源转换为老式引擎可识别的格式
3. **功能子集实现** - 即使无法完整移植，专注于 multiplayer 模式也能提供有价值的技术探索

对于想要学习游戏引擎架构的开发者来说，这类项目是理解不同引擎设计理念的宝贵资源。
