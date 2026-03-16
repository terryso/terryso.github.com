---
layout: post
title: "基础设施投资：Meta 对 jemalloc 的重新承诺"
date: 2026-03-17 04:40:07 +0800
categories: tech-translation
description: "Meta 宣布重新聚焦 jemalloc 高性能内存分配器，承诺减少技术债务、现代化代码库，并继续与开源社区合作推进项目发展。"
original_url: https://engineering.fb.com/2026/03/02/data-infrastructure/investing-in-infrastructure-metas-renewed-commitment-to-jemalloc/
source: Hacker News
---

本文翻译自 [Investing in Infrastructure: Meta's Renewed Commitment to jemalloc](https://engineering.fb.com/2026/03/02/data-infrastructure/investing-in-infrastructure-metas-renewed-commitment-to-jemalloc/)，原载于 Hacker News。

---

构建软件系统就像建造摩天大楼：用户看到的是顶层的华丽外观，但真正支撑整座建筑的，是埋在地下的地基和隐藏的脚手架。

**jemalloc**，这个高性能内存分配器（memory allocator），一直是 Meta 软件技术栈中杠杆效应极高的组件。多年来，它不断适应底层硬件和上层软件的变化。与 Linux 内核和编译器一样，jemalloc 为 Meta 带来了长期的收益，为构建可靠、高性能的基础设施奠定了基础。

## 倾听、反思与改变

高杠杆意味着高风险。在实用主义与原则性工程实践的博弈中，jemalloc 这类基础软件组件需要最高标准的严谨性。然而，面对 jemalloc 带来的巨大杠杆效应，组织内部有时会难以抵挡短期利益的诱惑。这需要极强的自律，才能坚守核心工程原则。

近年来，jemalloc 的开发逐渐偏离了长期以来的核心工程原则。虽然某些决策带来了立竿见影的好处，但积累的技术债务最终拖慢了进步的步伐。

Meta 认真对待社区的反馈。本着协作精神，他们对自身的管理方式及其对 jemalloc 长期健康的影响进行了深刻反思。Meta 与社区成员（包括项目创始人 **Jason Evans**）进行了深入交流，分享了他们的内省和改变方向的决心。目前，Meta 已经启动了一项计划，旨在消除技术债务并重建 jemalloc 的长期路线图。

## jemalloc 的新篇章

在与社区沟通后，**原始的 jemalloc 开源仓库已经解除归档状态**。Meta 感谢有机会继续作为项目的管理者，并正在重新聚焦于 jemalloc，目标是减少维护负担、现代化代码库，同时继续演进这个分配器以适应最新和新兴的硬件与工作负载。

展望未来，Meta 对 jemalloc 的规划集中在以下几个关键改进领域：

### 技术债务消减
专注于清理技术债务、重构代码，并增强 jemalloc，确保它对所有用户保持高效、可靠且易于使用。

### 大页分配器（Huge-Page Allocator）
持续改进 jemalloc 的大页分配器（HPA），以更好地利用透明大页（Transparent Hugepages, THP），从而提升 CPU 效率。

### 内存效率
计划在内存打包（packing）、缓存（caching）和清理（purging）机制方面进行优化，提升内存使用效率。

### AArch64 优化
确保 jemalloc 在 AArch64（ARM64）平台上开箱即用，具备良好的性能表现。

---

## 个人思考

这篇文章值得关注的有几点：

1. **基础软件的价值**：jemalloc 作为内存分配器，虽然用户无感，但对系统性能至关重要。Meta 每年节省的计算资源成本可能是天文数字。

2. **技术债务的代价**：即使是 Meta 这样的大厂，追求短期利益带来的技术债务也会反噬。这给所有技术团队一个警示——在核心基础设施上，必须坚守工程原则。

3. **开源社区的力量**：Meta 能主动反思并改变方向，很大程度上是因为社区的反馈和压力。这说明健康的开源生态需要维护者和用户的良性互动。

4. **ARM 架构的崛起**：Meta 专门提到 AArch64 优化，说明 ARM 服务器在数据中心的应用越来越广泛，这可能是未来的重要趋势。

信任需要通过行动来赢取。希望 Meta 这次对 jemalloc 的重新承诺能够落到实处，也期待看到更多来自社区的贡献和协作。

---

**关键要点：**
- Meta 重新聚焦 jemalloc，承诺消除技术债务
- 原始 jemalloc 仓库已解除归档，恢复活跃开发
- 未来重点：大页分配器优化、内存效率提升、ARM64 平台支持
