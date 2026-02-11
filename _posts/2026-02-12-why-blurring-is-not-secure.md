---
layout: post
title: "为什么模糊处理不是安全的遮盖方式"
date: 2026-02-12 01:50:10 +0800
categories: tech-translation
description: "这篇文章深入探讨了为什么图像模糊处理不是一种安全的敏感信息遮盖方法，并演示了如何从模糊图像中恢复出原始内容。"
original_url: https://lcamtuf.substack.com/p/its-all-a-blur
source: Hacker News
---

本文翻译自 [It's all a blur](https://lcamtuf.substack.com/p/its-all-a-blur)，原载于 Hacker News。

如果你关注互联网上的信息安全讨论，你可能听说过：用模糊处理来遮盖图像内容并不是好主意。据说是因为模糊算法是可逆的。

但这让人感到困惑。模糊本质上就是对像素值求平均。如果你对两个数求平均，无法知道一开始是 1+5 还是 3+3——两种情况的算术平均值相同，原始信息似乎已经丢失了。所以，这个建议是错的吗？

答案是：既对也不对！确实存在使用确定性算法实现不可逆模糊的方法。但在很多情况下，算法保留的信息远比肉眼看到的要多——而且是以意想不到的方式。今天，我们就来构建一个基础的模糊算法，然后把它拆解得明明白白。

## 最简单的模糊算法：移动平均

如果模糊等同于求平均，那么最简单的算法就是移动平均（moving mean）。我们取一个固定大小的窗口，将每个像素值替换为其邻域内 n 个像素的算术平均值。当 n=5 时，过程如下图：

![移动平均作为简单模糊算法](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F0087865d-a763-4b28-b680-029eb525ae0e_2050x2650.jpeg)

注意对于前两个单元格，输入缓冲区中没有足够的像素。我们可以使用固定填充、"借用"选择区域外的可用像素，或者简单地在边界附近平均较少的值。无论哪种方式，分析都不会有太大变化。

## 逆向还原：数学的魔法

假设我们完成了模糊处理，不再有原始像素值。底层图像能被重建吗？答案是可以，而且比预期的更简单。我们不需要"反卷积"、"点扩散函数"、"核"这些大词，也不需要任何看起来吓人的数学。

我们从左边界（x=0）开始。回顾一下，我们通过平均原图中的以下像素来计算第一个模糊像素：

```
blur(0) = (img(-2) + img(-1) + img(0) + img(1) + img(2)) / 5
```

接下来，看看 x=1 处的模糊像素。它的值是以下内容的平均值：

```
blur(1) = (img(-1) + img(0) + img(1) + img(2) + img(3)) / 5
```

我们可以通过两边乘以平均元素的数量（5）来轻松将这些平均值转换为求和：

```
5 · blur(0) = img(-2) + img(-1) + img(0) + img(1) + img(2)
5 · blur(1) = img(-1) + img(0) + img(1) + img(2) + img(3)
```

注意下划线的项在两个表达式中重复出现；这意味着如果我们从一个表达式中减去另一个，最终得到：

```
5 · blur(1) - 5 · blur(0) = img(3) - img(-2)
```

img(-2) 的值对我们来说是已知的：它是算法使用的固定填充像素之一。让我们将其简记为 c。我们也知道 blur(0) 和 blur(1) 的值：这些是可以在输出图像中找到的模糊像素。这意味着我们可以重新排列方程来恢复对应于 img(3) 的原始输入像素：

```
img(3) = 5 · (blur(1) - blur(0)) + c
```

我们也可以对下一个像素应用相同的推理：

```
img(4) = 5 · (blur(2) - blur(1)) + c
```

## 更优雅的算法设计

使用右对齐窗口的移动平均，可以让数学更加简洁：

![右对齐窗口的移动平均](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fc02e3684-e59b-4eb0-8509-ceed61763140_2450x950.jpeg)

在这个模型中，第一个输出值是四个固定填充像素（c）和一个原始图像像素的平均值；因此，在 n=5 的情况下，可以计算底层像素值为：

```
img(0) = 5 · blur(0) - 4 · c
```

如果我们知道 img(0)，现在就有了组成 blur(1) 的所有但一个值，所以我们可以找到 img(1)：

```
img(1) = 5 · blur(1) - 3 · c - img(0)
```

这个过程可以迭代地继续，重建整个图像——这次没有任何不连续性，也不需要第二遍扫描。

## 实验证明：维纳斯的诞生与重生

下面的插图中，左图显示了桑德罗·波提切利的《维纳斯的诞生》的细节；右图是同一图像经过右对齐移动平均模糊算法处理的版本，使用了 151 像素的平均窗口，仅在 x 方向上移动：

![维纳斯，x轴移动平均](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F60f592ba-9697-46ff-abc9-d940ddc4fd8f_2850x1500.png)

现在，让我们对模糊图像应用上述重建方法——计算机，增强！

![维纳斯的重生](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F59e89266-7a4a-44f9-98aa-f7d3bbeb4920_1500x1500.png)

结果相当惊人。由于中间模糊图像中平均值的 8 位量化，图像比以前更嘈杂。尽管如此，即使使用大的平均窗口，仍然可以恢复精细的细节——包括单根头发——并且很容易辨别。

## 二维模糊的挑战与解决方案

我们的模糊算法的问题在于它只在 x 轴上平均像素值；这给人一种运动模糊或相机抖动的印象。

我们可以开发的方法可以扩展到具有方形或十字形平均窗口的 2D 滤波器。不过，一个更快的技巧是在 x 轴上应用现有的 1D 滤波器，然后在 y 轴上进行补充扫描。要撤销模糊，我们将以相反的顺序执行两次恢复扫描。

不幸的是，无论我们采用 1D+1D 还是真正的 2D 路线，我们都会发现每个像素的组合平均量会导致底层值被严重量化，以至于重建的图像被噪声淹没，除非模糊窗口相对较小。

![从 1D + 1D 移动平均模糊重建](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F1e90295d-a826-429e-968f-0422bb729af5_1500x1500.png)

## 对抗性模糊过滤器

如果我们想开发一个"对抗性"模糊过滤器，可以通过在计算平均值中对原始像素的权重稍微加重来解决问题。对于 x-then-y 变体，如果平均窗口的大小为 W，当前像素的偏置因子为 B，我们可以写出以下公式：

```
blur(n) = (img(n - W) + ... + img(n - 1) + B · img(n)) / (W + B)
```

这个滤波器仍然做它应该做的事情。以下是 W=200 和 B=30 的 x-then-y 模糊的输出：

![维纳斯，重度 X-Y 模糊](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F6e82cbe7-24a9-4094-82e8-1878d9fee1db_3000x1600.png)

这肯定无法恢复了吧——计算机，增强！

![从重度模糊中恢复的维纳斯](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F6b0482b6-88df-437b-98b0-d0e113e2e7fb_1600x1600.png)

作为对怀疑者的概念验证，我们还可以制作一个同时在两个维度上运行的对抗性滤波器。以下是使用简单十字形窗口的 2D 滤波器后的重建：

![从同时 2D 滤波器重建](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F24c414a7-db04-475f-91a1-9fe79e93fec9_4392x1600.png)

## JPEG 压缩也无法抹去信息

值得注意的是，模糊图像中"隐藏"的信息在以有损图像格式保存后仍然存在。上图显示的是从以 95%、85% 和 75% 质量设置保存为 JPEG 的中间图像重建的图像。

![从 JPEG 文件恢复](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fff134452-f7e7-4034-9bcc-f1aba56316d9_4394x2992.png)

底行显示的是不太合理的 50% 及以下的质量设置；此时，重建的图像开始 resemble 抽象艺术。

## 关键要点

这篇文章展示了几个重要的事实：

1. **模糊不是安全遮盖**：简单的移动平均模糊算法在数学上是完全可逆的，即使模糊程度很高

2. **信息隐藏比想象中难**：即使经过重度模糊和 JPEG 压缩，原始图像的许多细节仍然可以被恢复

3. **量化噪声是主要限制**：8 位色深的量化会引入噪声，但不足以完全保护敏感信息

4. **真正的安全需要不同的方法**：如果需要遮盖图像中的敏感信息，应该使用像素化、涂黑或其他确保信息丢失的方法

对于处理敏感数据的开发者来说，这篇文章提醒我们：永远不要依赖模糊处理来保护隐私。看似无法辨认的图像，可能在攻击者眼中仍然清晰可读。
