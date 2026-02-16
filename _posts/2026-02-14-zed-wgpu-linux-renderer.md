---
layout: post
title: "Zed 编辑器移除 Blade，改用 wgpu 实现 Linux 渲染器"
date: 2026-02-14 04:11:40 +0800
categories: tech-translation
description: "Zed 编辑器的 GPUI 框架移除了 Blade 图形库，改用 Rust 生态标准的 wgpu 重新实现 Linux 平台渲染器，解决了 NVIDIA 显卡冻结等长期存在的问题。"
original_url: https://github.com/zed-industries/zed/pull/46758
source: Hacker News
---

本文翻译自 [gpui: Remove blade, reimplement linux renderer with wgpu](https://github.com/zed-industries/zed/pull/46758)，原载于 Hacker News。

## 背景介绍

Zed 是一款由 Zed Industries 开发的高性能代码编辑器，其底层使用自研的 GPUI 框架来处理图形渲染。在 Linux 平台上，GPUI 之前使用的是 Blade 图形库，但这个库存在诸多问题，给用户带来了不少困扰。

社区开发者 zortax 提交了一个重大 PR：移除 Blade，改用 wgpu 重新实现 Linux 渲染器。这个改动不仅修复了现有问题，还为未来的优化奠定了基础。

## 为什么要替换 Blade？

根据 PR 描述，Blade 图形库存在以下问题：

1. **维护状态不佳**：Blade 被标记为实验性项目，不适合生产环境使用
2. **关键 Bug 未修复**：一些影响下游应用的 PR 长期未被合并（超过半年）
3. **导致 Zed 冻结**：在 NVIDIA 显卡和 Smithay-based Wayland 合成器上会出现冻结问题

这个 PR 将解决以下相关 issue：

- [#39097](https://github.com/zed-industries/zed/issues/39097)
- [#44814](https://github.com/zed-industries/zed/issues/44814)
- [#45836](https://github.com/zed-industries/zed/issues/45836)
- [#40481](https://github.com/zed-industries/zed/issues/40481)
- [#38497](https://github.com/zed-industries/zed/issues/38497)

## 为什么选择 wgpu？

wgpu 是 Rust 图形生态中的事实标准，具有以下优势：

- **社区支持强大**：被 Bevy 游戏引擎、Iced GUI 框架等主流项目使用
- **持续维护**：活跃的社区确保问题能被及时修复
- **跨平台兼容**：支持 Vulkan、DirectX 12、Metal、WebGPU 等多种后端
- **未来可期**：可以从其他项目的贡献中受益

## 技术讨论

### Windows 和 macOS 会跟进吗？

有人询问是否计划在 Windows 和 macOS 上也使用 wgpu。Zed 团队表示目前没有这个计划，原因是：

> "我们的原生渲染器在这些平台上可能有更好的性能和更广泛的兼容性。"

以 Windows 为例，GPUI 的 DirectX 实现支持一些不支持 DirectX 12 的 GPU。而且 wgpu 的内存占用相对较高——一个空的 wgpu 窗口大约需要 100MB 内存，而 GPUI 的自定义渲染器只需要约 10MB。

### VRAM 占用优化

PR 作者在实现过程中遇到并解决了 VRAM 占用过高的问题。通过设置 `MemoryHints::MemoryUsage`，成功将 VRAM 占用降低到比原有 Blade 实现更低的水平。

最终的优化方案包括：
- 使用内存使用优先的分配策略
- 复用同一缓冲区对象进行帧渲染

### 关于依赖数量的讨论

有人担心 wgpu 的依赖数量是 Blade 的两倍。对此，PR 作者回应：

> "依赖数量本身不是关键问题。Blade 导致的问题无法在 GPUI 层面修复，而其维护状态令人担忧。wgpu 是社区标准，被众多大型项目依赖。"

实际上，对于 Zed 这样规模的项目，wgpu 的编译时间差异几乎可以忽略不计，而且增量编译使得这主要是一次性的成本。

## 合并后的影响

这个 PR 已于 2026 年 2 月 13 日合并。对于 Linux 用户来说，这意味着：

1. **更稳定的体验**：NVIDIA 显卡冻结问题得到解决
2. **更好的 Wayland 支持**：Smithay-based 合成器兼容性提升
3. **更低的 VRAM 占用**：优化后的实现比之前更高效
4. **更好的未来发展**：可能支持自定义着色器、直接缓冲区访问、嵌入到其他 wgpu 应用中等高级功能

## 个人思考

这个改动体现了开源社区的一个重要原则：**选择维护良好的依赖比追求"轻量级"更重要**。

Blade 可能在某些方面更简洁，但如果维护者无法持续投入，再简洁的代码也会成为负担。相比之下，wgpu 虽然依赖更多，但有着活跃的社区和明确的发展路线，这对于生产环境来说更为重要。

另外，这个 PR 也展示了性能优化的正确方法：不是凭直觉判断，而是实际测量、对比、迭代。从最初 VRAM 占用过高到最终优于原实现，就是通过不断调整和验证实现的。

## 总结

Zed 用 wgpu 替换 Blade 的决定是明智的：
- 解决了长期存在的平台兼容性问题
- 选择了一个有社区支持的、可持续发展的技术方案
- 通过优化实现了更好的资源使用效率

对于正在选择图形库的 Rust 开发者来说，这是一个很好的参考案例：技术选型不仅要看功能和性能，更要考虑生态和长期维护。
