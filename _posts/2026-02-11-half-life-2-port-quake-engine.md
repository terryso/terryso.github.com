---
layout: post
title: "Half-Life 2 移植到 Quake 引擎：Rad-Therapy II 项目介绍"
date: 2026-02-11 08:54:41 +0800
categories: tech-translation
description: "一个将 2004 年的经典游戏 Half-Life 2 移植到 Quake(World) 引擎的有趣技术项目，展示了游戏引擎移植的技术挑战。"
original_url: https://code.idtech.space/fn/hl2
source: code.idtech.space
---

本文翻译自 [Rad-Therapy II](https://code.idtech.space/fn/hl2)，原载于 code.idtech.space。

## Rad-Therapy II：将 Half-Life 2 移植到 Quake 引擎

这是一个令人着迷的技术实验——将 2004 年发布的经典游戏 **Half-Life 2** 移植到 **Quake(World)** 引擎上。

![Preview 1](https://code.idtech.space/fn/hl2/media/branch/main/img/preview1.jpg)
![Preview 2](https://code.idtech.space/fn/hl2/media/branch/main/img/preview2.jpg)
![Preview 3](https://code.idtech.space/fn/hl2/media/branch/main/img/preview3.jpg)
![Preview 4](https://code.idtech.space/fn/hl2/media/branch/main/img/preview4.jpg)

### 项目现状

需要明确的是，这个移植版本**无法从头到尾完成完整的单人战役**。目前只能玩死亡匹配（Deathmatch）和其他一些特殊的游戏模式。

尽管如此，这个项目依然极具技术价值——它展示了如何将基于现代引擎的游戏内容移植到经典的 Quake 引擎架构中。

### 系统要求

运行 Rad-Therapy II 需要同时准备 `hl2` 和 `hl2dm` 两个目录。任何合法的 Half-Life 2 副本都可以。

如果你使用的是不区分大小写的文件系统，并且运行的是 `.vpk` 之前的旧版数据文件，你可能需要将它们打包到一个 `.zip` 文件中，并命名为 `pak0.pk3`。

不过，直接使用 Steam 上的最新数据文件会更简单。

### 安装与运行

使用 FTE 引擎运行：

```bash
fteqw.exe -halflife2
```

当在 **Half-Life 2: Deathmatch** 目录下运行时，它会自动尝试安装 **Rad-Therapy II**。

### 从源码构建

如果你想自己构建这个项目，需要先克隆 Nuclide：

```bash
# 首先，克隆并准备 Nuclide SDK
git clone <Nuclide仓库地址>
cd Nuclide-SDK
make update
make fteqcc

# 然后，在 Nuclide-SDK 内克隆本仓库
git clone https://code.idtech.space/fn/hl2 hl2
make game GAME=hl2
make plugins GAME=hl2
```

**构建说明**：
- `make game GAME=hl2` —— 构建游戏逻辑（game-logic）
- `make plugins GAME=hl2` —— 构建引擎加载数据文件所需的插件

确保 Nuclide-SDK 中有 `fteqcc`（用于构建）和 `fteqw`（用于运行）。项目也会尊重通过包管理器安装的版本，只需确保保持最新即可。

### 社区与支持

如果你对这个项目感兴趣，可以通过以下方式与开发者和其他玩家交流：

**Matrix**
- 加入 Nuclide Space：https://matrix.to/#/#nuclide:matrix.org
- 可以在这里提问，或了解开发者的最新进展

**IRC**
- 服务器：irc.libera.chat
- 频道：#nuclide
- 与 Matrix 主房间已桥接

### 开源许可

本项目采用 **ISC License** 开源：

```
Copyright (c) 2019-2025 Marco "eukara" Cawthorne marco@icculus.org

Permission to use, copy, modify, and distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.
```

### 内容版权声明

**Half-Life 2** 和 **Half-Life 2: Deathmatch** 是 **Valve Corporation** 的财产。

要体验 **Rad-Therapy II**，你需要拥有来自 Steam 或光盘的原始授权资源文件。

---

## 技术观察

这个项目虽然看似"逆潮流"——将现代游戏移植到老引擎上，但实际上非常有意义：

1. **引擎架构研究**：通过移植可以深入理解不同游戏引擎的设计差异
2. **技术极限探索**：Quake 引擎能渲染到什么程度？现代资产如何在老引擎中表现？
3. **教育价值**：对于想了解游戏引擎底层原理的开发者来说，这是绝佳的学习材料
4. **怀旧情怀**：用经典引擎运行现代内容，带来独特的游戏体验

这种"反向移植"在游戏开发社区并不罕见，比如将 Doom 3 移植到原始 Doom 引擎，或者将现代 FPS 移植到 Build 引擎。它们更多是技术实验而非实用产品，但正是这些实验推动了我们对游戏引擎本质的理解。
