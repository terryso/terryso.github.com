---
layout: post
title: "Rad-Therapy II：将 Half-Life 2 移植到 Quake 引擎"
date: 2026-02-11 13:12:58 +0800
categories: tech-translation
description: "一个将 2004 年发布的经典游戏 Half-Life 2 移植到 Quake/QuakeWorld 引擎的开源项目，虽然无法完整通关，但支持死亡竞赛等多人模式。"
original_url: https://code.idtech.space/fn/hl2
source: Hacker News
---

本文翻译自 [Rad-Therapy II - port of Half-Life 2 to Nuclide](https://code.idtech.space/fn/hl2)，原载于 code.idtech.space。

## 什么是 Rad-Therapy II？

这是一个将 2004 年发布的经典游戏 **Half-Life 2**（半条命 2）移植到 **Quake/QuakeWorld** 引擎的开源项目。

需要注意的是，这个移植版本**无法从头到尾完整体验单人战役**。目前你可以玩死亡竞赛（Deathmatch）和其他一些奇特的多人模式。

![Rad-Therapy II 预览图](https://code.idtech.space/fn/hl2/media/branch/main/img/preview1.jpg)

![Rad-Therapy II 预览图 2](https://code.idtech.space/fn/hl2/media/branch/main/img/preview2.jpg)

![Rad-Therapy II 预览图 3](https://code.idtech.space/fn/hl2/media/branch/main/img/preview3.jpg)

![Rad-Therapy II 预览图 4](https://code.idtech.space/fn/hl2/media/branch/main/img/preview4.jpg)

## 运行要求

为了让 Rad-Therapy II 正常运行，你需要同时拥有 `hl2` 和 `hl2dm`（Half-Life 2: Deathmatch）目录。任何版本的副本都可以使用。

如果你使用的是不区分大小写的文件系统（比如 macOS 的默认 APFS 或 Windows 的 NTFS），并且运行的是 `.vpk` 之前的数据文件格式，你可能需要将这些文件打包成 `.zip` 并重命名为 `pak0.pk3`。

不过，更简单的方式是直接使用 Steam 上的最新版本数据文件。

## 如何安装和运行

使用 FTE 引擎运行，命令如下：

```bash
fteqw.exe -halflife2
```

当你在 **Half-Life 2: Deathmatch** 的游戏目录下运行时，它会自动尝试安装 **Rad-Therapy II**。

## 构建方法

如果你想自己构建这个项目，步骤如下：

1. 首先 clone Nuclide 项目
2. 运行 `make update` 和 `make fteqcc`
3. 然后在 Nuclide-SDK 目录下 clone 这个仓库：

```bash
git clone https://code.idtech.space/fn/hl2 hl2
make game GAME=hl2
make plugins GAME=hl2
```

其中：
- 最后一条命令会构建引擎加载数据文件所需的插件
- 倒数第二条命令会构建游戏逻辑

确保 Nuclide-SDK 中有 `fteqcc`（用于编译）和 `fteqw`（用于运行）。同时也支持通过包管理器安装的版本，只要确保版本是最新的即可。

## 社区与支持

### Matrix

如果你是 Matrix 用户，可以加入 Nuclide Space，在那里可以提问或与开发者交流。

https://matrix.to/#/#nuclide:matrix.org

### IRC

也可以通过 irc.libera.chat 的 #nuclide 频道加入我们。该频道与 Matrix 的主房间是桥接的。

## 许可证

本项目采用 **ISC License** 开源。

版权所有 (c) 2019-2025 Marco "eukara" Cawthorne marco@icculus.org

特此授予免费使用、复制、修改和分发本软件的权限，无论是否收取费用，前提是上述版权声明和本许可声明出现在所有副本中。

**软件按"原样"提供，作者不承担任何明示或默示的保证，包括但不限于适销性和适用性的保证。** 在任何情况下，作者都不对任何索赔、损害或其他责任负责，无论是合同、侵权或其他方式的诉讼。

## 内容版权声明

Half-Life 2 和 Half-Life 2: Deathmatch 归 Valve Corporation 所有。

要体验 **Rad-Therapy II**，必须拥有来自 Steam 或正版光盘的原始授权资源。

---

## 技术解读与个人思考

这个项目虽然听起来有点"折腾"——用 1996 年的 Quake 引擎来跑 2004 年的 Half-Life 2，但实际上展示了游戏引擎技术的一个有趣方向。

### 为什么这样做？

1. **技术挑战**：将现代游戏的资源加载到经典引擎上，本身就是一种技术探索
2. **开源学习**：通过逆向工程和重新实现，可以学习游戏引擎的设计原理
3. **怀旧情怀**：QuakeWorld 引擎在 mod 社区中仍然有活跃的生态

### Nuclide 引擎

Nuclide 是一个基于 FTEQW（FTE QuakeWorld）的现代游戏引擎框架，支持：
- 多种经典游戏格式（Quake、Half-Life 等）
- 现代图形 API（OpenGL、Vulkan）
- 跨平台支持

这种"老瓶装新酒"的项目，既是对经典技术的致敬，也是对现代引擎架构的实践。

### 给开发者的启发

- **向后兼容性的价值**：良好的抽象层可以让老引擎"焕发青春"
- **社区驱动开发**：Matrix 和 IRC 的活跃社区说明兴趣驱动项目也能持续多年
- **法律边界意识**：项目明确要求用户拥有正版游戏资源，规避了版权风险

## 总结

Rad-Therapy II 是一个技术上有趣但实用性有限的项目。它不会让你在 Quake 引擎上完整体验 Half-Life 2 的剧情，但它：

1. 展示了游戏引擎移植的可能性
2. 为 mod 社区提供了新的玩法
3. 体现了开源社区的技术热情

对于想深入了解游戏引擎底层原理的开发者，这类项目是很好的学习材料。对于普通玩家，可能还是等待《半条命 3》比较现实。
