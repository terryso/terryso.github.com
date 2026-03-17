---
layout: post
title: "Meta 重申对 jemalloc 的承诺：基础设施投资的回归"
date: 2026-03-17 09:47:44 +0800
categories: tech-translation
description: "Meta 宣布重新聚焦于高性能内存分配器 jemalloc，承认近年来偏离了核心工程原则，现在致力于消除技术债务并与开源社区共同推进项目发展。"
original_url: https://engineering.fb.com/2026/03/02/data-infrastructure/investing-in-infrastructure-metas-renewed-commitment-to-jemalloc/
source: Hacker News
---

本文翻译自 [Investing in Infrastructure: Meta's Renewed Commitment to jemalloc](https://engineering.fb.com/2026/03/02/data-infrastructure/investing-in-infrastructure-metas-renewed-commitment-to-jemalloc/)，原载于 Hacker News。

---

构建软件系统就像建造摩天大楼：用户看到的是顶层的产物，但真正支撑它不倒塌的，是埋在地下的地基和隐藏在视线之外的脚手架。

**jemalloc**，这个高性能内存分配器，一直是 Meta 软件栈中极具杠杆效应的组件。它随底层硬件和上层软件的演进不断适应变化。与 Linux 内核和编译器一样，jemalloc 为 Meta 带来了长期价值，为可靠且高性能的基础设施做出了重要贡献。

## 倾听、反思与改变

高杠杆意味着高风险。在实用主义与原则性工程实践的谱系中，jemalloc 这样的基础软件组件需要最高标准的严谨性。然而，jemalloc 带来的巨大杠杆效应，有时会让人难以抵挡追求短期利益的诱惑。作为组织，需要强大的自律来抵制这种诱惑，坚守核心工程原则。

近年来，jemalloc 的开发逐渐偏离了长期以来指导其发展的核心工程原则。虽然一些决策带来了即时收益，但积累的技术债务最终拖慢了进步的步伐。

Meta 认真对待社区的反馈。本着协作精神，我们深刻反思了自己的管理方式及其对 jemalloc 长期健康的影响。我们与社区成员（包括项目创始人 **Jason Evans**）进行了交流，分享了我们的内省和改变方向的决心。我们已经启动了消除技术债务的工作，并为 jemalloc 重建长期路线图。

## jemalloc 的新篇章

在与社区沟通后，原始的 jemalloc 开源仓库已经**解封**（unarchived）。我们感谢有机会继续作为项目的管理者。Meta 正在重新聚焦于 jemalloc，目标是：

- 减少维护负担
- 现代化代码库
- 持续演进分配器以适应最新和新兴的硬件与工作负载

展望未来，我们目前对 jemalloc 的改进计划聚焦于几个关键领域：

### 1. 技术债务清理

我们将专注于清理技术债务、重构和增强 jemalloc，确保它对所有用户保持高效、可靠且易于使用。

### 2. 大页分配器（Huge-Page Allocator）

我们将继续改进 jemalloc 的大页分配器（HPA），以更好地利用透明大页（Transparent Hugepages, THP），提升 CPU 效率。

> **背景知识**：大页（Hugepages）是一种内存管理技术，通过使用更大的内存页（通常是 2MB 或 1GB，而非标准的 4KB），可以减少 TLB（Translation Lookaside Buffer）缺失，从而提高内存密集型应用的性能。

### 3. 内存效率

我们计划改进内存打包（packing）、缓存（caching）和清理（purging）机制，优化内存使用效率。

### 4. AArch64 优化

我们将确保 jemalloc 在 **AArch64（ARM64）** 平台上开箱即具有良好的性能。

> **个人观点**：ARM 架构在服务器领域的崛起已成趋势，AWS Graviton、Ampere 等处理器正在改变数据中心格局。Meta 对 AArch64 的关注表明他们正在为这一转变做准备。

## 信任需要行动来赢取

我们深知，信任是通过行动赢取的。我们希望通过持续的努力，让 jemalloc 的健康发展和进步能够证明我们重申的承诺。

我们邀请社区加入这个新篇章——分享你的反馈，帮助塑造 jemalloc 的未来。我们期待与社区协作，共同推动 jemalloc 向前发展。

---

## 关键要点

1. **承认问题**：Meta 公开承认近年来在 jemalloc 维护上偏离了核心工程原则，这种坦诚值得肯定
2. **技术债务需要偿还**：短期收益带来的技术债务最终会拖慢进度，这是所有技术团队都需要警惕的
3. **开源需要持续投入**：作为高杠杆的基础设施组件，需要组织层面的自律和长期投入
4. **ARM 架构的重要性**：AArch64 优化被列为重点方向，反映了 ARM 在服务器领域的战略地位

对于依赖 jemalloc 的开发者来说，这是个好消息。Meta 的重新承诺意味着这个重要的内存分配器将得到更好的维护和发展。
