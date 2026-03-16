---
layout: post
title: "更快的 asin() 近在咫尺：Estrin 方法的魔法"
date: 2026-03-17 01:29:29 +0800
categories: tech-translation
description: "本文介绍了如何通过多项式展开和 Estrin 方法优化 arcsine 函数的近似计算，利用指令级并行性在现代 CPU 上获得显著的性能提升。"
original_url: https://16bpp.net/blog/post/even-faster-asin-was-staring-right-at-me/
source: Hacker News
---

本文翻译自 [Even Faster asin() Was Staring Right At Me](https://16bpp.net/blog/post/even-faster-asin-was-staring-right-at-me/)，原载于 Hacker News。

---

我通常不会这么快就写续篇。上一篇发布后，Reddit 和 Hacker News 上的评论纷至沓来，读起来颇有意思。我甚至发现了其他地方的讨论。但我忍不住想：**"我还能让它更快吗？"** 于是回家后我决定再研究一下。

答案是肯定的。

## 追求极致速度

先来看看上一篇中 Cg `asin()` 近似函数的实现：

```cpp
double asin_cg(const double x)
{
    // 原始 Minimax 系数
    constexpr double a0 = 1.5707288;
    constexpr double a1 = -0.2121144;
    constexpr double a2 = 0.0742610;
    constexpr double a3 = -0.0187293;

    // 去除符号
    const double abs_x = abs(x);

    // 使用 Horner 方法计算多项式
    double p = a3 * abs_x + a2;
    p = p * abs_x + a1;
    p = p * abs_x + a0;

    // 应用 sqrt 项和 pi/2 偏移
    const auto x_diff = sqrt(1.0 - abs_x);
    const double result = (Pi / 2.0) - (x_diff * p);

    // 恢复符号
    return copysign(result, x);
}
```

有没有注意到 `p` 的计算方式有点奇怪？它可以被改写成完全 `const` 的形式。虽然这不是硬性要求，但通常这是你应该追求的编码风格。第一版中我忽略了这个细节。

```cpp
const double p = ((a3 * abs_x + a2) * abs_x + a1) * abs_x + a0;
```

从这里，我们可以进行**多项式展开和因式分解**。奇迹就在这里发生。让我们一步步推导：

```
p = ((a3 * abs_x + a2) * abs_x + a1) * abs_x + a0
p = (a3 * abs_x * abs_x + a2 * abs_x + a1) * abs_x + a0
p = (a3 * abs_x^2 + a2 * abs_x + a1) * abs_x + a0
p = a3 * abs_x^3 + a2 * abs_x^2 + a1 * abs_x + a0
p = (a3 * abs_x^3 + a2 * abs_x^2) + (a1 * abs_x + a0)
p = (a3 * abs_x + a2) * abs_x^2 + (a1 * abs_x + a0)
```

将最后的结果写成代码：

```cpp
const double x2 = abs_x * abs_x;
const double p = (a3 * abs_x + a2) * x2 + (a1 * abs_x + a0);
```

`p` 的计算结果数值完全相同，但评估方式略有不同。现在我们运用了一种叫做 **Estrin 方法（Estrin's Scheme）** 的技术来重写这个等式。

通过这种方式，编译器（和 CPU）可以**独立地**计算 `a3 * abs_x + a2` 和 `a1 * abs_x + a0`。这将依赖链长度从三减少到二，使得现代乱序执行 CPU 可以并行执行这些操作。

这就是 **指令级并行性（Instruction-level parallelism，ILP）** 的威力。

## 基准测试数据

完整的基准测试代码可在[这里](https://github.com/RayTracing/PSRayTracing)找到。这涉及到微基准测试，其实相当棘手。

每次完整"运行"基准测试会对各自的 arcsine 函数进行 10,000,000 次调用，每个芯片/操作系统/编译器组合总共进行 250 次运行。

测试环境包括：

- **Intel i7-10750H**
  - Ubuntu 24.04 LTS: GCC & clang
  - Windows 11: GCC & MSVC

- **AMD Ryzen 9 6900HX**
  - Ubuntu 24.04 LTS: GCC & clang
  - Windows 11: GCC & MSVC

- **Apple M4**
  - macOS Tahoe: GCC & clang

我很想在移动芯片和更新的 Intel 处理器上测试，但目前只有这些设备。欢迎赞助硬件 😄

### Intel Core i7

**Linux**

| 编译器 | std::asin() | asin_cg() | asin_cg_estrin() |
|--------|-------------|-----------|------------------|
| GCC 14.2 (-O3) | 74385 ms | 48374 ms (1.54x) | **41388 ms (1.80x)** |
| Clang 20.1 (-O3) | 73504 ms | 47211 ms (1.56x) | **41350 ms (1.78x)** |

**Windows**

| 编译器 | std::asin() | asin_cg() | asin_cg_estrin() |
|--------|-------------|-----------|------------------|
| GCC 14.2 (-O3) | 113396 ms | 91925 ms (1.23x) | **90925 ms (1.25x)** |
| MSVC VS 2022 (/O2) | 84733 ms | 53592 ms (1.58x) | **45014 ms (1.88x)** |

### AMD Ryzen 9

**Linux**

| 编译器 | std::asin() | asin_cg() | asin_cg_estrin() |
|--------|-------------|-----------|------------------|
| GCC 14.2 (-O3) | 74986 ms | 53129 ms (1.41x) | **52166 ms (1.44x)** |
| Clang 20.1 (-O3) | 75188 ms | 52837 ms (1.42x) | **51856 ms (1.45x)** |

**Windows**

| 编译器 | std::asin() | asin_cg() | asin_cg_estrin() |
|--------|-------------|-----------|------------------|
| GCC 14.2 (-O3) | 136393 ms | 122071 ms (1.12x) | **120953 ms (1.13x)** |
| MSVC VS 2022 (/O2) | 121639 ms | 92612 ms (1.31x) | **92290 ms (1.32x)** |

### Apple M4

**macOS**

| 编译器 | std::asin() | asin_cg() | asin_cg_estrin() |
|--------|-------------|-----------|------------------|
| GCC 15.1.0 (-O3) | 26176 ms | 25764 ms (1.02x) | **25668 ms (1.02x)** |
| Apple Clang 17.0.0 (-O3) | 33626 ms | 32755 ms (1.03x) | **30245 ms (1.11x)** |

### 数据总结

- **AMD** 几乎没有加速。虽然没帮助，但也没坏处
- **较老的 Intel 芯片** 使用 Estrin 方法的 Cg 版本获得了巨大的性能提升（Windows/GCC 除外）
- **Apple 芯片** 的加速只在 clang 编译时体现
- 但 **GCC 生成的代码整体更快**

## 光线追踪器实测

使用与上一篇相同的测试场景。以下是一些渲染的中位数结果：

在 **Intel i7** 上，使用旧的 `asin_cg()` 方法：

```
ben@linux:~/Projects/PSRayTracing/build_gcc_14$ ./PSRayTracing -n 250 -j 4 -s 1920x1080
Scene: book2::final_scene
Render size: 1920x1080
...
Render took 212.311 seconds
```

启用新的 Estrin 优化后：

```
ben@linux:~/Projects/PSRayTracing/build_gcc_14$ ./PSRayTracing -n 250 -j 4 -s 1920x1080
...
Render took 205.99 seconds
```

相比之前的 `asin_cg()` 方法获得了约 **3% 的加速**。我们不会看到像微基准测试那样巨大的提升，因为调用 arcsine 只是这个程序中很小的一部分。

在 **Apple M4 Mac Mini** 上，使用旧的 `asin_cg()`：

```
ben@Mac build_clang_17 % ./PSRayTracing -j 4 -n 250 -s 1920x1080
...
Render took 101.747 seconds
```

使用新版本：

```
ben@Mac build_clang_17_asin_cg_estrin % ./PSRayTracing -n 250 -s 1920x1080 -j 4
Render took 101.817 seconds
```

表面上看这像是性能退步，但实际上什么都不是。尽管光线追踪器是完全确定性的，但每次渲染时间可能会有上下两秒的波动。我通常把这归结为"电脑里的小妖精"——也就是操作系统上下文切换和 CPU 动态时钟之类的因素。

最严谨的做法应该是进行 250 次运行取平均，但我觉得不值得。从启发式角度看，102 秒中的 0.1 秒可以忽略不计。而且 M4 上 clang 的 `asin_cg_estrin()` 相比普通 `asin_cg()` 本身加速就不明显。

## 最后的思考（和一点个人观点）

当我开始开发 PSRayTracing 项目时，我想展示的是：**你可以通过重写代码让编译器进行更好的优化**——这就是另一个例子。

在这个系列中，我希望我已经强调了**基准测试（即实际测量）的重要性**。**这是我不常看到其他人做的事情**。

我简单研究过使用查找表（LUT），虽然理论上可能更快，但实际测试中并非如此，而且误差更大。有兴趣的话可以邮件联系我获取图表。**坚持使用数学公式吧，更简单。**

由于 PSRayTracing 原始代码的架构限制，使用 SIMD 加速也不是可行选项。虽然我*想*做这件事——因为有时性能瓶颈在于架构——但我人生中还有许多其他想做的事情。

最后，请记住这只是 arcsine 的**近似**，不是精确实现。大多数情况下（尤其是计算机图形学），近似值就足够了，但也有些场景是不能使用近似的。

## 关键要点

1. **Estrin 方法** 可以减少多项式计算的依赖链，提高指令级并行性
2. 永远要**实际测量**，不要想当然——不同硬件/编译器组合的结果可能大相径庭
3. 代码重构有时能让编译器生成更优的机器码
4. 微基准测试的巨大提升不一定能转化为实际应用的显著收益
5. 退一步思考问题、与他人协作、重新评估——你会找到更好的解决方案

---

*Always step back from the problem, collaborate, and then reevaluate. You'll find something better.*
