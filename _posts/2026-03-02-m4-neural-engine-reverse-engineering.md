---
layout: post
title: "深入 M4 神经引擎：逆向工程实录"
date: 2026-03-02 23:20:58 +0800
categories: tech-translation
description: "本文揭秘了如何在 M4 芯片上绕过 CoreML，直接与 Apple Neural Engine 硬件通信，探索苹果神经网络加速器的真实架构与性能。"
original_url: https://maderix.substack.com/p/inside-the-m4-apple-neural-engine
source: Hacker News
---

本文翻译自 [Inside the M4 Apple Neural Engine, Part 1: Reverse Engineering](https://maderix.substack.com/p/inside-the-m4-apple-neural-engine)，原载于 Hacker News。

---

## 关于「我们」

在本系列文章中，「我们」指的是 **maderix**（人类）和 **Claude Opus 4.6**（Anthropic）的协作。逆向工程、基准测试和训练代码都是合作开发的——人类的直觉驱动探索，AI 则负责数据分析并撰写报告。我们认为这种人机协作是系统研究的新范式：一方是拥有直觉的**架构师**，另一方是编写代码和设计实验的**工程师**。

---

一切始于一個简单的问题：**你能在 Apple Neural Engine 上训练模型吗？**

苹果并不想让你知道答案。他们不公开 ANE 的指令集架构（ISA），不记录其内部架构，甚至不提供直接编程的方式——所有操作都必须通过 CoreML，这层抽象增加了优化通道和开销，让人几乎无法理解硬件到底在做什么。

所以，**我们逆向了它**。

在数天的时间里，我们从头到尾梳理了整个软件栈：从 CoreML 到 IOKit 内核驱动，发现如何绕过 CoreML 直接在 ANE 上编译执行程序，破解二进制格式，测量真实峰值性能（剧透：苹果宣称的「38 TOPS」有误导性），最终让一个神经网络在一块专为推理设计的芯片上**训练**了起来。

这是三部分系列的第一篇。本文聚焦逆向工程——我们如何层层剥离，理解 M4 Neural Engine 的本质，以及如何直接与它对话。

## ANE 不是 GPU，也不是 CPU

ANE（Apple Neural Engine）是一个**图执行引擎**——一个固定功能的加速器，接收编译好的神经网络图，并将其作为一个原子操作完整执行。

你不需要发出单独的乘累加指令。你提交的是一个描述整个计算图的编译程序，硬件端到端地执行它。

苹果在 A11（2017 年）引入了 Neural Engine，当时是 2 核设计。每一代都在扩展：

| 芯片 | 核心数 |
|------|--------|
| A11 (2017) | 2 |
| A12-A15 | 8 |
| M1 | 16 |
| M4 (H16G) | 16 |

M4 的 ANE（代号 **H16G**）是我们研究的对象：16 核心，127 的队列深度，独立的 DVFS（动态电压/频率调节），以及空闲时完全掉电的硬性电源门控（功耗精确降至 0 毫瓦）。

## 前人的工作

我们并非第一个探索 ANE 内部的人：

- **hollance/neural-engine** — Matthijs Hollemans 的社区文档，是关于 ANE 行为、性能特性和支持操作的最好资源
- **mdaiter/ane** — 早期逆向工程，包含可工作的 Python 和 Objective-C 示例
- **eiln/ane** — Asahi Linux 项目的逆向 Linux 驱动
- **apple/ml-ane-transformers** — 苹果官方的 ANE 优化 transformer 参考实现

但据我们所知，之前没有人： 在 M4 上实现绕过 CoreML 的直接 `_ANEClient` API 访问， 破解内存中的 MIL 编译路径， 绕过 CoreML 开销测量真实峰值吞吐量，或 在 ANE 上训练模型。

## 我们的逆向方法

我们结合了多种技术：

1. **类发现**：对 `AppleNeuralEngine.framework` 运行 `dyld_info -objc`，导出所有 Objective-C 类和方法
2. **方法调配（Method Swizzling）**：拦截 CoreML 对私有 ANE 框架的调用
3. **二进制分析**：分析编译后的 E5 bundles，理解神经程序格式
4. **规模分析**：通过变化矩阵大小、图深度和通道数，推断硬件拓扑

我们在 `AppleNeuralEngine.framework` 中发现了 40 多个私有类，包括 `_ANEClient`、`_ANEModel`、`_ANERequest`、`_ANEIOSurfaceObject`、`_ANEInMemoryModel` 等。

## ANE 软件栈全貌

从公开的 CoreML API 到硬件，完整的 ANE 软件栈如下：

```
┌─────────────────────────────────────┐
│           CoreML (公开 API)          │
├─────────────────────────────────────┤
│      ANECompiler.framework          │
│      (MIL → E5 二进制编译)           │
├─────────────────────────────────────┤
│    AppleNeuralEngine.framework      │
│    (_ANEClient, _ANEModel, etc.)    │
├─────────────────────────────────────┤
│         IOKit (内核驱动)             │
├─────────────────────────────────────┤
│            ANE 硬件                  │
└─────────────────────────────────────┘
```

**关键发现**：CoreML 并非唯一的入口。`AppleNeuralEngine.framework` 中的 `_ANEClient` 类提供直接访问「编译 → 加载 → 评估」管道的能力。CoreML 只是在其之上的便利层。

## 绕过 CoreML 的完整流程

以下是不使用 CoreML 在 ANE 上编译运行程序的完整序列：

```objc
// 1. 创建客户端
_ANEClient *client = [[_ANEClient alloc] init];

// 2. 编译 MIL 程序到 E5 二进制
_ANEInMemoryModelDescriptor *desc = [[_ANEInMemoryModelDescriptor alloc] init];
desc.milText = [milString dataUsingEncoding:NSUTF8StringEncoding];
desc.weights = @{@"weight": weightData};

_ANEModel *model = [client compileModelFromDescriptor:desc error:&error];

// 3. 加载模型到 ANE
[client loadModel:model options:nil error:&error];

// 4. 创建输入/输出 IOSurface
_ANEIOSurfaceObject *input = ...;
_ANEIOSurfaceObject *output = ...;

// 5. 执行推理
_ANERequest *request = [[_ANERequest alloc] init];
request.inputs = @[input];
request.outputs = @[output];
[client evaluateModel:model request:request error:&error];
```

I/O 使用 **IOSurfaces**——与 GPU 纹理相同的共享内存机制。这意味着如果共享同一个 IOSurfaceRef，GPU 和 ANE 之间理论上是零拷贝传输。

> **关键发现**：ANE 支持高达 127 的队列深度——你可以同时有 127 个评估请求在飞行中。这比大多数加速器队列深得多，说明硬件是为高吞吐量流式推理设计的。

## MIL：Machine Learning Intermediate Language

CoreML 不是用 ONNX 或 protobuf 格式发送神经网络到 ANE，而是使用 **MIL**——一种类型化的 SSA（静态单赋值）表示，看起来像这样：

```
func @main(%input: Float32[1, 1024, 1, 1024]) -> Float32[1, 1024, 1, 1024] {
  %weight = const[value=...]
  %result = matmul(x=%input, y=%weight, name="matmul")
  return %result
}
```

MIL 可读性很强。每个值都有精度和形状的类型标注。操作使用命名参数。函数签名声明输入张量的显式维度。

张量布局遵循 ANE 原生的 **NCDHW + Interleave** 格式：`[Batch, Channels, Depth, Height, Width]`。对于 1024×1024 的矩阵，4D 表示为 `[1, 1024, 1, 1024]`。

## E5 二进制格式

当 ANECompiler 处理 MIL 程序时，它产生一个 **E5 二进制**——一个 FlatBuffer 结构的文件，包含以下部分：

```
┌────────────────────┐
│    Header          │
├────────────────────┤
│    Tensor Descriptors  │
├────────────────────┤
│    Operation Graph  │
├────────────────────┤
│    Weight Data     │
├────────────────────┤
│    Metadata        │
└────────────────────┘
```

有趣的部分：1024×1024 的矩阵乘法编译成 **2,688 字节**。128×128 的矩阵乘法编译成 **2,680 字节**。几乎相同！

E5 二进制不是在编码矩阵乘法算法——它在编码一个**参数化程序**，其行为由运行时的张量描述符控制。这个「微码」更像配置而非传统机器码。

> **含义**：ANE 硬件可能有一小组固定的计算原语（卷积、矩阵乘法、逐元素运算），由张量形状描述符参数化。E5 二进制描述链接哪些原语以及如何连接，而非计算本身。

## 内存编译：绕过文件系统

基于文件的编译路径可行，但有个问题：需要将 MIL 文本写入磁盘，创建目录结构，然后让编译器指向它。对于训练——我们需要每几步就重新编译更新权重——这个文件系统往返是不可接受的。

我们发现了 `_ANEInMemoryModelDescriptor`，它直接在内存中接受 MIL 文本：

```objc
_ANEInMemoryModelDescriptor *desc = [[_ANEInMemoryModelDescriptor alloc] init];
desc.milText = [milString dataUsingEncoding:NSUTF8StringEncoding];
desc.weights = @{@"weight": weightData};
```

让它工作起来需要解决三个让我们调试了好几天的问题：

1. **NSData，不是 NSString**：`milText` 参数需要包含 UTF-8 字节的 `NSData*`，不是 `NSString*`。传入字符串会静默失败。
2. **NSDictionary，不是 NSData**：`weights` 参数是将权重名映射到 NSData blob 的字典，不是单个数据缓冲区。
3. **临时目录变通**：即使是「内存中」路径，内部也会写入临时目录。如果默认位置没有写权限，编译会失败并报一个晦涩的错误。我们需要确保有一个可写的临时路径。

还有一个有趣的发现：苹果的内部代码在某个类名中引用了 `Desctiptor`（原文如此）。即使是苹果工程师也会在私有 API 中打错字。:)

## M4 ANE 硬件画像

通过 IOKit 探测、规模分析和功耗测量，我们建立了 M4 ANE 的画像：

| 特性 | 值 |
|------|-----|
| 代号 | H16G |
| 核心数 | 16 |
| 队列深度 | 127 |
| 电源管理 | 独立 DVFS |
| 空闲功耗 | 0 mW（硬门控） |
| 数据类型 | FP16, Int8, Int4 |
| 原生精度 | FP16 |

IOKit 的 `IOReportLegend` 显示 ANE 有自己独立的电源管理，支持自适应时钟、抖动和多种硬件/软件触发器：

```
ANE Power Domain:
- Adaptive clocking: Enabled
- Voltage scaling: Independent
- Dithering: Supported
- Power gates: Hardware + Software controlled
```

这种 DVFS 复杂度表明 ANE 可以根据工作负载特性独立调节频率和电压，与 CPU 和 GPU 电源域分离。

## 原生支持的操作

从 `ANECompiler.framework` 导出符号来看，ANE 原生支持：

- Conv (卷积)
- MatMul (矩阵乘法)
- Elementwise operations (逐元素操作)
- Pooling (池化)
- Activation functions (激活函数)
- LSTM / RNN cells

值得注意的是，**Conv 似乎是 ANE 的主要计算原语**。正如我们将在第二部分展示的，将矩阵乘法表示为 1×1 卷积可以显著提升吞吐量。

## IOSurface 数据传输

所有进出 ANE 的数据传输都使用 IOSurfaces。协议很简单：

```objc
// 创建 IOSurface
IOSurfaceRef surface = IOSurfaceCreate(properties);

// 包装为 ANE 对象
_ANEIOSurfaceObject *obj = [[_ANEIOSurfaceObject alloc] init];
obj.surface = surface;

// 附加到请求
request.inputs = @[inputSurface];
request.outputs = @[outputSurface];
```

由于 IOSurfaces 与 GPU 纹理共享是同一机制，这开启了零拷贝 GPU↔ANE 管道的可能性，两个加速器可以在同一内存上操作。

## 编译缓存

ANE 编译器在磁盘上缓存 E5 二进制以避免重复编译：

```
~/Library/Caches/com.apple.ane/
├── compiled_models/
│   └── [hash].e5
└── ...
```

首次编译需要约 20-40ms。缓存命中基本免费。这对推理很重要（编译一次，永久运行），但对训练造成挑战，因为权重每步都在变化。

## 未探索的领域

我们发现的一些类仍未探索，暗示着我们尚未测试的能力：

- `_ANEChainingRequest` — 可能支持在单次派发中链接多个编译模型
- `_ANESharedEvents` / `_ANESharedSignalEvent` / `_ANESharedWaitEvent` — Metal 风格的 fence/signal 原语，用于 GPU↔ANE 同步
- `_ANEPerformanceStats` — 可能是硬件性能计数器
- `_ANEVirtualClient` — 虚拟化 ANE 访问，可能用于多进程共享

还有一些我们确实不知道的：

- ANE 核心的确切微架构和 ISA
- 核心如何在图内分配给操作
- ANE 时钟频率（DVFS 使其动态变化）
- 硬件性能计数器是否可访问
- 确切的 SRAM 拓扑（分 bank？统一？每核独立？）

## 接下来

现在我们有了对 ANE 的直接访问，我们可以实际测量它能做什么。

在 **第二部分**，我们将对所有东西进行基准测试：矩阵乘法扩展、SRAM 性能断崖、为什么卷积比矩阵乘法快 3 倍、为什么苹果的「38 TOPS」声明有误导性，以及绕过 CoreML 如何给你 2-4 倍的吞吐量。

在 **第三部分**，我们将做苹果说你不能做的事：**在 Neural Engine 上训练神经网络**。

> 所有代码可在 [github.com/maderix/ANE](https://github.com/maderix/ANE) 的 `ane/` 目录找到。在 M4 Mac Mini、macOS 15.x 上测试。

---

## 关键要点

1. **ANE 是图执行引擎**，不是传统意义上的 CPU 或 GPU——你提交整个计算图，硬件端到端执行
2. **CoreML 只是一个便利层**，可以通过 `_ANEClient` 私有 API 直接访问 ANE
3. **MIL 是 ANE 的中间语言**，E5 二进制是参数化程序描述而非传统机器码
4. **队列深度 127** 说明 ANE 设计用于高吞吐量流式推理
5. **IOSurface 共享**意味着 GPU↔ANE 零拷贝管道是可能的
6. **在 ANE 上训练是可行的**——虽然苹果官方不支持

这是一个精彩的逆向工程故事，也展示了人机协作在系统研究中的潜力。期待后续的性能测试和训练实现！
