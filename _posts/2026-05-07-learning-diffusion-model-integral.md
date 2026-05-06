---
layout: post
title: "学习扩散模型的积分：Flow Maps 全景指南"
date: 2026-05-07 07:17:05 +0800
categories: tech-translation
description: "本文深入解读 Flow Maps——扩散模型的自然推广，它能够直接预测路径上任意两点之间的映射，从而实现少步甚至单步采样。文章系统梳理了三种一致性规则、训练策略和实际应用。"
original_url: https://sander.ai/2026/05/06/flow-maps.html
source: Hacker News
---

本文翻译自 [Learning the integral of a diffusion model](https://sander.ai/2026/05/06/flow-maps.html)，原载于 Hacker News。

## 从扩散模型到 Flow Maps

扩散模型（Diffusion Model）的采样是一个迭代过程：在每一步中，去噪器（denoiser）估计穿过输入空间的路径的切线方向。我们沿这个方向反复迈出小步，本质上是在计算一个**跨噪声水平的积分**。这个过程逐渐将简单噪声分布中的样本转换为目标分布中的样本。

那么，我们能否训练神经网络直接预测这个积分，从而加速采样？答案是可以的——这就是 **Flow Maps（流映射）** 的世界。

自从扩散模型兴起以来，人们一直在寻找更快、更经济的采样方法。大约两年前，Sander Dieleman 就曾写过关于扩散蒸馏（diffusion distillation）的博文，这是减少采样步数的主要工具之一。而 Flow Maps 提供了一种更根本的思路转变：与其预测路径上每一点的切线方向，Flow Maps 能够**从路径上的任意一点直接预测同一路径上另一点的位置**。

## 路径、双射与导航

理解 Flow Maps 的关键在于将扩散模型视为噪声和数据之间的**双射映射（bijection）**。在这个映射中，每对噪声样本和数据样本之间有唯一的路径连接，且这些路径永远不会交叉。

扩散模型的采样算法分为两大类：**随机采样**和**确定性采样**。

- 随机采样（如 DDPM）：每一步从条件分布中采样，轨迹呈锯齿状
- 确定性采样（如 DDIM、Flow Matching）：给定起始点，终点唯一确定，轨迹平滑

两种截然不同的微观行为，产生了完全相同的宏观分布——这本身就是一个非常深刻的观察。

使用去噪器来遍历这些路径是**无记忆的**（memoryless）且**近视的**（myopic）：去噪器只接收当前位置和噪声水平作为输入，预测下一步的方向，无法预见最终目的地，也不利用任何历史信息。这就像航海中的**航位推算（dead reckoning）**——只能根据当前位置推断方向，一步步前进。

由于路径不能交叉，这意味着从一个特定的噪声样本出发，确定性地只能到达一个特定的数据样本。这是 Flow Maps 能够工作的基础。

## Flow Maps：直接绘制地图

如果说用去噪器遍历路径是"航位推算"，那么 Flow Maps 就是直接"绘制地图"。

去噪器用 $f(\mathbf{x}_t, t)$ 表示，而 Flow Map 用 $F(\mathbf{x}_s, s, t)$ 表示，其中 $s$ 是源噪声水平，$t$ 是目标噪声水平。它接受**两个时间步**作为输入，能够直接跳转到路径上的任意位置：

$$F(\mathbf{x}_s, s, t) = \mathbf{x}_s + \int_s^t v(\mathbf{x}_\tau, \tau) \, d\tau$$

这个积分表示沿路径累积速度场——如果我们能把起点加上这个积分，就直接到达终点。

几个值得注意的特殊情况：

- **设 $t = 0$**：可以直接从路径上任何位置跳到数据端，这就是**一步采样**。一致性模型（Consistency Models）正是这个思路。
- **设 $s = t$**：积分区间长度为零，结果就是起点本身。
- **$t > s$**：可以反向操作，从数据预测对应的噪声。

显然，学习预测 $F(\mathbf{x}_s, s, t)$ 比学习 $f(\mathbf{x}_t, t)$ 更难——它有两个时间步输入而非一个。但它提供了路径的**全局视角**，而非仅仅局部信息。一旦有了足够好的 Flow Map，采样就是一步到位的事情。

Flow Maps 有两种等价的参数化方式：预测目标位置 $F$，或预测**平均速度（mean flow）** $V$：

$$V(\mathbf{x}_s, s, t) = \frac{1}{t - s} \int_s^t v(\mathbf{x}_\tau, \tau) \, d\tau$$

当 $s = t$ 时，$V$ 退化为瞬时速度 $v$——这意味着 Flow Map 内部天然包含了一个去噪器。

## 三种一致性规则

训练 Flow Maps 的各种算法，归根结底都基于以下三种一致性规则之一：**组合性（Compositionality）**、**拉格朗日一致性（Lagrangian Consistency）** 和 **欧拉一致性（Eulerian Consistency）**。

### 组合性

Flow Maps 是可组合的：从 $s$ 到 $t$，再从 $t$ 到 $u$，应该和直接从 $s$ 到 $u$ 的结果相同：

$$F(F(\mathbf{x}_s, s, t), t, u) = F(\mathbf{x}_s, s, u)$$

推论：Flow Map 是自身的逆运算（关于第一个参数）：

$$F(F(\mathbf{x}_s, s, t), t, s) = \mathbf{x}_s$$

利用组合性，我们可以从扩散模型引导（bootstrap）Flow Map 的训练：用扩散模型预测路径上的下一个点，然后训练 Flow Map 使得从不同起点出发都能到达相同的终点。

### 拉格朗日视角：移动球门

拉格朗日一致性关注的是：当我们逐渐改变目标时间步 $t$ 时，Flow Map 的输出如何变化？答案很直觉——输出应该沿路径移动：

$$\frac{\partial}{\partial t} F(\mathbf{x}_s, s, t) = v(F(\mathbf{x}_s, s, t), t)$$

即 Flow Map 输出的瞬时变化率就是速度。这可以用来从扩散模型的速度场 $v$ 引导 Flow Map 的训练。

### 欧拉视角：盯着终点

欧拉一致性则关注：改变起始点 $s$ 但保持目标 $t$ 不变时，输出应该不变：

$$\frac{\partial}{\partial s} F(\mathbf{x}_s, s, t) + \nabla_{\mathbf{x}_s} F(\mathbf{x}_s, s, t) \, v(\mathbf{x}_s, s) = 0$$

看起来简单，但因为 $s$ 同时影响两个输入（时间步和空间位置），需要使用多元链式法则。这再次提供了一种从扩散模型引导 Flow Map 训练的方式。

两种视角的区别就像物理学中的参考系选择：拉格朗日视角是你坐在独木舟上随波逐流（跟踪单个粒子），欧拉视角是你站在桥上俯瞰河流（固定观察点）。

### 从等式构造损失函数

这三个一致性规则都是等式，构造损失函数很直接：将所有项移到等式一边，使另一边为零，然后对残差取平方：

$$\mathcal{L}_{compositional} = \mathbb{E}\left[\left(F(F(\mathbf{x}_s, s, t), t, u) - F(\mathbf{x}_s, s, u)\right)^2\right]$$

$$\mathcal{L}_{Lagrangian} = \mathbb{E}\left[\left(\frac{\partial}{\partial t} F(\mathbf{x}_s, s, t) - v(F(\mathbf{x}_s, s, t), t)\right)^2\right]$$

$$\mathcal{L}_{Eulerian} = \mathbb{E}\left[\left(\frac{\partial}{\partial s} F(\mathbf{x}_s, s, t) + \nabla_{\mathbf{x}_s} F(\mathbf{x}_s, s, t) \, v(\mathbf{x}_s, s)\right)^2\right]$$

任何一个损失函数的最小值都能保证一致性。只要我们能足够好地最小化这些函数，Flow Map 就能正常工作。

## 要不要反向传播？

这些损失函数有几个不同寻常的特点：

- 拉格朗日和欧拉变体包含 $F$ 的**导数**，意味着梯度学习可能涉及高阶导数
- 组合性变体涉及 $F$ 的**多次串行应用**，可能需要串行的前向和反向传播

### 止梯度（Stop-Gradient）操作

受表示学习（representation learning）启发，我们可以将损失的部分内容包裹在**止梯度操作**中。这会阻止反向传播时的梯度流动，其他行为不变：

$$\mathcal{L}_{compositional} = \mathbb{E}\left[\left(sg[F(F(\mathbf{x}_s, s, t), t, u)] - F(\mathbf{x}_s, s, u)\right)^2\right]$$

其中 $sg[\cdot]$ 表示止梯度操作。

这有一个优雅的解释：用两步 Flow Map 计算一个目标，将其视为"真值"并冻结，然后训练 Flow Map 学会一步到达。

### 平均速度参数化的妙用

利用平均速度参数化，可以巧妙地避免高阶微分。例如，拉格朗日一致性可以改写为：

$$V(\mathbf{x}_s, s, t) = v(F(\mathbf{x}_s, s, t), t) - (t - s)\frac{\partial}{\partial t} V(\mathbf{x}_s, s, t)$$

等式右边可以完全包裹在止梯度操作中，这样就不需要通过时间导数进行反向传播了。

MeanFlow 方法正是利用了这个技巧，基于欧拉一致性：

$$\mathcal{L}_{MF} = \mathbb{E}\left[\left(V(\mathbf{x}_s, s, t) - sg\left[v(\mathbf{x}_s, s) + (t - s)\left(\frac{\partial}{\partial s} V + \nabla_{\mathbf{x}_s} V \cdot v(\mathbf{x}_s, s)\right)\right]\right)^2\right]$$

### 前向模式微分

在欧拉一致性规则中出现的雅可比向量积（Jacobian-Vector Product, JVP），可以通过**前向模式微分**高效计算。在 JAX 中可以用 `jax.jvp` 实现，避免了显式构建完整的雅可比矩阵——对于高维输入空间来说，这是一个巨大的内存节省。

### 有限差分近似

另一种避免处理导数的方法是用**有限差分**替代：

$$\frac{d}{dx} f(x) \approx \frac{f(x + \Delta x) - f(x)}{\Delta x}$$

只要 $\Delta x$ 足够小，近似就足够好。不过小数值容易受浮点精度问题影响，在当今低精度训练盛行的时代尤其需要注意。

## 从零开始训练 Flow Maps

训练 Flow Maps 通常需要从扩散模型引导（bootstrap），这实际上是一种蒸馏形式。但如果想要**从零训练** Flow Map 呢？

### 自蒸馏（Self-Distillation）

由于 Flow Map 的平均速度参数化在 $s = t$ 时退化为瞬时速度，我们可以在训练中偶尔采样 $s = t$ 的情况，将基于一致性的损失函数与标准扩散损失结合。模型同时学习瞬时速度和其在有限时间区间上的积分。这就是一种**自蒸馏**——模型同时充当教师和学生的角色。

实践经验表明，这种教师训练和学生蒸馏同时进行的方案，效果通常与两阶段顺序训练相当或略差，但避免了顺序依赖带来的复杂性。

### 边际-条件学习（Marginal-from-Conditional Learning）

MeanFlow 提供了一种只需要单一一致性损失就能从零训练的方法。其核心思想与扩散训练中的"边际化技巧"相同：虽然训练时使用的是条件样本，但因为模型被迫对所有样本做出单一预测，最小化整体误差自然导向条件期望。

关键在于四个条件的共同作用：
1. 使用 **MSE 损失**
2. 速度在**当前噪声输入**处评估
3. 预测目标关于速度是**线性的**
4. **止梯度操作**确保更新方向保持线性

**Improved MeanFlow（iMF）** 在此基础上做了一个巧妙的翻转：将瞬时速度和平均速度交换位置，使得 $V$ 完全通过参数化来学习 Flow Map，无需蒸馏或辅助损失。更优雅，方差也更低。

## 实际方法概览

### 拉格朗日方法

- **Lagrangian Map Distillation (LMD)**：基于拉格朗日一致性，使用前向模式微分，没有止梯度，需要高阶微分
- **Terminal Velocity Matching (TVM)**：自蒸馏变体，需要自定义 FlashAttention 内核
- **FreeFlow**：完全无需训练数据的蒸馏，仅从噪声分布采样
- **Physics Informed Distillation (PID)**：受 PINNs 启发的无数据蒸馏变体

### 欧拉方法

- **Eulerian Map Distillation (EMD)**：直接基于欧拉一致性
- **MeanFlow (MF)**：基于边际-条件学习，无需蒸馏
- **Improved MeanFlow (iMF)**：MF 的改进版，更优雅的参数化
- **Decoupled MeanFlow (DMF)**：将网络的前层和后层分别条件化于源和目标时间步
- **SoFlow**：用有限差分近似替代 JVP

### 组合性方法

- **Shortcut Models**：通过将步长翻倍来引导，类似渐进式蒸馏
- **Flow Map Matching (FMM)**：利用 Flow Map 是自身逆运算的性质

### 一致性模型的位置

一致性模型（Consistency Models）可以看作 Flow Map 的特例——目标时间步固定为 $t = 0$ 的部分 Flow Map。一致性蒸馏（CD）和一致性训练（CT）的基本机制都可以在这个框架下理解。一致性轨迹模型（CTM）则是第一个推广到任意 $t$ 的工作。

## 应用与扩展

### 大规模快速采样

TVM 已应用于超过 100 亿参数的图像生成模型；FACM 用于蒸馏 140 亿参数的 Wan 2.2 视频生成模型，2-8 步即可生成样本；Align Your Flow 蒸馏了 FLUX.1-dev 模型，4 步采样。在音频领域，字节跳动使用 SplitMeanFlow 进行语音合成。

### 高效引导与后训练

Flow Maps 提供了一种高效的**可微分前瞻（look-ahead）机制**：用 Flow Map 的一步采样结果来估计奖励信号，比传统的单步扩散采样（Tweedie 公式）产生更清晰、更符合分布的样本。这被称为 **Flow Map Trajectory Tilting (FMTT)**。

### 离散数据

Flow Maps 正在推动连续扩散语言模型的复兴。2026 年上半年出现了多篇关于**分类数据 Flow Map** 的工作，通过约束预测始终在输出空间内，可以使用交叉熵损失替代 MSE，带来显著的稳定性提升。

### 其他方向

- **非欧几里得空间**（黎曼流形）上的 Flow Map，对科学应用尤为重要
- **快速似然估计**：Flow Map 加速采样的机制同样可用于加速似然计算

## 替代策略

Flow Maps 代表了**基于轨迹**的蒸馏方法。对于许多应用，精确保持噪声和数据之间的路径其实是多余的——我们真正关心的只是数据端的分布。

**分布蒸馏（Distributional Distillation）** 方法放松了轨迹保持的约束，通过得分匹配、矩匹配、对抗训练等方式最小化生成分布与目标分布之间的距离。这通常能在少步采样下产生更高质量的结果，代价是放弃了双射的平滑拓扑、似然估计能力、以及数据到噪声的映射能力。

## 个人思考

这篇文章是迄今为止关于 Flow Maps 最系统、最清晰的综述。几个关键洞察值得中国开发者特别关注：

1. **Flow Maps 不是银弹**：它们依赖从去噪器的引导，随着跳跃的时间区间增大，可靠性会下降。本质上我们仍然在计算积分——只是在训练时预计算了，而非采样时才计算。

2. **"天下没有免费的午餐"**：采样更快意味着训练更复杂。MeanFlow/iMF 虽然可以从零训练，但训练过程的工程复杂度远高于标准扩散模型。

3. **实践中的工程权衡**：不同的 Flow Map 方法在前向/反向传播次数、是否需要高阶微分、训练稳定性等方面差异很大。选择方法时需要仔细考虑计算预算和团队工程能力。

4. **Flow Maps 正在重塑生成式 AI 的效率边界**：从图像到视频到音频到语言，少步甚至单步生成正在成为现实。对于资源有限的中国 AI 创业公司来说，这些技术的实用价值尤为突出。

---

> 原文作者 Sander Dieleman 是 Google DeepMind 的研究科学家，在扩散模型和生成式 AI 领域有深入研究。这篇文章是他"手工制作（artisanal intelligence）"的写作风格的典范——所有文字均为人工撰写，AI 仅用于辅助理解论文和创建图表。
