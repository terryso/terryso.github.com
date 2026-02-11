---
layout: post
title: "Rad-Therapy II：将 Half-Life 2 移植到 Quake 引擎的神奇项目"
date: 2026-02-11 11:03:42 +0800
categories: tech-translation
description: "探索 Rad-Therapy II 项目，它将 2004 年的经典游戏 Half-Life 2 移植到 Quake/QuakeWorld 引擎上，展现了游戏引擎移植的技术魅力。"
original_url: https://code.idtech.space/fn/hl2
source: Hacker News
---

本文翻译自 [Rad-Therapy II](https://code.idtech.space/fn/hl2)，原载于 Hacker News。

## Rad-Therapy II

这是将 **Half-Life 2**（2004 年发布）移植到 Quake/QuakeWorld 引擎的原始版本。

需要注意，游戏**无法**从头到尾完整通关。你可以玩死亡竞赛（deathmatch）和其他一些特殊模式。

![Preview 1](https://code.idtech.space/fn/hl2/media/branch/main/img/preview1.jpg)
![Preview 2](https://code.idtech.space/fn/hl2/media/branch/main/img/preview2.jpg)
![Preview 3](https://code.idtech.space/fn/hl2/media/branch/main/img/preview3.jpg)
![Preview 4](https://code.idtech.space/fn/hl2/media/branch/main/img/preview4.jpg)

运行需要同时拥有 `hl2` 和 `hl2dm` 目录。任何副本都可以正常工作。如果你使用的是不区分大小写的文件系统，并且运行的是旧版 .vpak 数据文件，你可能需要将它们放入 .zip 文件并命名为 'pak0.pk3'。一般来说，直接使用 Steam 上的最新数据会更简单。

## 安装与运行

使用以下命令运行 FTE：

```
fteqw.exe -halflife2
```

当从 **Half-Life 2: Deathmatch** 目录运行时，它会自动尝试安装 **Rad-Therapy II**。

## 构建项目

首先需要克隆 Nuclide，运行 `make update` 和 `make fteqcc`，然后在 Nuclide-SDK 内克隆本仓库：

```bash
git clone https://code.idtech.space/fn/hl2 hl2
make game GAME=hl2
make plugins GAME=hl2
```

最后一个命令将构建引擎加载数据文件所需的插件。前一个命令将构建游戏逻辑。确保 Nuclide-SDK 中有 `fteqcc` 和 `fteqw` 分别用于构建和运行。它也支持包管理器安装的版本，只要确保是最新版本即可。

## 社区

### Matrix

如果你也是 Matrix 用户，可以加入 Nuclide Space。在那里你可以提问，或者了解开发者们的最新动态。

https://matrix.to/#/#nuclide:matrix.org

### IRC

你也可以通过 irc.libera.chat 加入 #nuclide 频道。它与 Matrix 空间的主房间是桥接的。

## 许可证

ISC License

Copyright (c) 2019-2025 Marco "eukara" Cawthorne marco@icculus.org

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

## 内容版权声明

Half-Life 2 和 Half-Life 2: Deathmatch 归 Valve Corporation 所有。
要体验 **Rad-Therapy II**，需要拥有来自 Steam 或光盘的原始授权资源。

---

## 项目解析与思考

这个项目体现了游戏开发领域的一个有趣现象：**引擎移植（Engine Porting）**。开发者 Marco Cawthorne 将基于 Source 引擎的 Half-Life 2 移植到更古老的 Quake 引擎上，这背后有几个值得关注的点：

### 技术意义

1. **逆向工程的实践**：将一个现代游戏移植到老引擎上，需要深入理解两个引擎的架构差异
2. **Nuclide 平台**：这是一个基于 Quake 的现代游戏开发框架，展示了老引擎依然有生命力
3. **资源兼容**：项目保留了原始游戏的美术资源，只替换了底层引擎

### 学习价值

对于游戏开发者来说，这类项目提供了：
- 理解不同引擎架构的机会
- 学习如何处理游戏资产（assets）的跨平台兼容性
- 探索游戏引擎演化的历史脉络

### 限制与现状

项目目前只能运行死亡竞赛模式，说明完整的单机剧情移植仍有技术挑战。这也反映了现代游戏与经典游戏在复杂度上的巨大差异。

如果你对游戏引擎、逆向工程或游戏开发历史感兴趣，这是一个值得研究的有趣项目。加入他们的 Matrix 或 IRC 社区，可以与开发者和其他爱好者交流心得。
