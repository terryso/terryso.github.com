---
layout: post
title: "Zed 编辑器移除 Blade，采用 wgpu 重构 Linux 渲染器"
date: 2026-02-14 00:02:58 +0800
categories: tech-translation
description: "Zed 编辑器的 GPUI 框架移除了问题重重的 Blade 图形库，改用 Rust 生态标准 wgpu 重新实现 Linux 渲染器，解决了 NVIDIA 显卡冻结等一系列问题"
original_url: https://github.com/zed-industries/zed/pull/46758
source: GitHub
---

本文翻译自 [gpui: Remove blade, reimplement linux renderer with wgpu](https://github.com/zed-industries/zed/pull/46758)，原载于 GitHub。

## 背景

Zed 是一款由 Zed Industries 开发的高性能代码编辑器，以其极快的启动速度和流畅的编辑体验著称。Zed 使用自研的 GPUI 框架来处理图形渲染，而 GPUI 在 Linux 平台上一直使用 Blade 图形库作为底层渲染器。

然而，Blade 图形库存在诸多问题，不仅影响 Zed 用户的使用体验，也影响了其他使用 GPUI 的第三方应用。社区贡献者 zortax 发起了这个 PR，将 Linux 平台的渲染器从 Blade 迁移到 wgpu。

## 为什么要切换到 wgpu？

wgpu 是 Rust 生态系统中事实上的图形标准，被众多重要项目采用：

- **Bevy 游戏引擎** - Rust 最流行的游戏引擎
- **Iced** - 跨平台 GUI 库
- **其他几乎所有相关的 Rust 图形项目**

这意味着：

1. **更好的维护性** - wgpu 由社区积极维护，问题修复及时
2. **生态红利** - 可以从其他项目的贡献中受益
3. **更广泛的兼容性** - 支持多种后端（Vulkan、DirectX 12、Metal、WebGPU）

相比之下，Blade 被其作者描述为"实验性的，不适合生产环境使用"，且存在长期未合并的 PR，影响下游应用的正常使用。

## 解决的问题

这个 PR 解决了多个长期困扰 Linux 用户的问题：

- **NVIDIA 显卡冻结问题** - 在使用 NVIDIA 显卡的 Smithay-based Wayland 合成器（如 niri）上，Zed 窗口会冻结
- **设置窗口无法点击** - 某些发行版上的交互问题
- **XWayland 兼容性** - 改善了在 XWayland 环境下的表现

## 性能对比

在 PR 的讨论中，开发者进行了详细的性能测试：

**内存使用**
- 新的 wgpu 实现内存使用比 Zed Stable 更低
- VRAM 使用与 Blade 实现相当或更优

**CPU 时间**
- 经过优化后，CPU 绘制时间减少约 20%
- GPU 时间基本持平

```
# 优化前 (b64007c)
frames 5400-5519: CPU draw median=301.45µs, GPU median=12.328ms

# 优化后 (f988a34)
frames 1320-1439: CPU draw median=238.82µs, GPU median=12.303ms
```

## 关于跨平台支持的讨论

PR 中也讨论了是否应该在 macOS 和 Windows 上也使用 wgpu：

**支持 wgpu 的观点：**
- wgpu 支持多种后端（Vulkan、DirectX 12、ANGLE）
- 可能实现更广泛的设备兼容性
- 理论上可以实现 Web 版本

**保持原生渲染器的观点：**
- 原生渲染器（macOS 的 Metal、Windows 的 DirectX 11）性能更好
- wgpu 在空窗口时内存占用较高（约 100MB vs 10MB）
- 原生 API 有特殊优化路径

最终，Zed 团队决定仅在 Linux 上使用 wgpu，保持其他平台的原生实现。

## 技术亮点

在合并过程中，Zed 团队的 reflectronic 进行了多项优化：

1. **单缓冲区复用** - 所有帧使用同一个缓冲区对象
2. **预创建绑定组** - 减少 GPU 状态切换开销
3. **简化全局变量处理** - 减少数据复制
4. **MSAA 采样优化** - 简化多重采样抗锯齿逻辑

## 启示

这个 PR 给我们带来几点思考：

1. **依赖选择很重要** - 选择社区活跃、维护良好的依赖库可以避免很多问题
2. **性能需要实测** - 很多人担心 wgpu 性能不如原生 API，但实际测试表明优化后的表现很好
3. **渐进式迁移** - 可以先在一个平台上验证新方案，再考虑推广到其他平台
4. **社区协作的价值** - wgpu 作为多个项目的共同依赖，任何改进都会惠及整个生态

## 总结

Zed 将 Linux 渲染器从 Blade 迁移到 wgpu 是一个明智的决定。它不仅解决了用户长期抱怨的冻结问题，还让项目与 Rust 图形生态更好地融合。对于那些在 Linux 上使用 NVIDIA 显卡或 Wayland 合成器的开发者来说，这是个好消息。

这个 PR 已于 2026 年 2 月 13 日合并到 Zed 的 main 分支，预计很快就会在正式版本中发布。
