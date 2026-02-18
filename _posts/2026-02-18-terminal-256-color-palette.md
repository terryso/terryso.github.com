---
layout: post
title: "终端应该从 base16 主题自动生成 256 色调色板"
date: 2026-02-18 22:51:51 +0800
categories: tech-translation
description: "探讨终端模拟器如何从用户的 base16 主题自动生成 256 色调色板，解决默认调色板的可读性问题并保持主题一致性。"
original_url: https://gist.github.com/jake-stewart/0a8ea46159a7da2c808e5be2177e1783
source: Hacker News
---

本文翻译自 [Terminals should generate the 256-color palette](https://gist.github.com/jake-stewart/0a8ea46159a7da2c808e5be2177e1783)，原载于 Hacker News。

---

如果你经常在终端里工作，可能已经设置过自定义的 base16 主题。这套方案确实好用——只需在一个地方定义几种颜色，所有程序都能使用它们。

但 16 色的限制确实是个问题。那些复杂、色彩丰富的程序在如此有限的调色板下显得力不从心。

## 现有方案的困境

主流的解决方案是使用 **truecolor**（真彩色），获得 1600 万色的能力。但这也有明显的缺点：

- 每个 truecolor 程序都需要自己的主题配置
- 换配色方案意味着要编辑多个配置文件
- 亮/暗模式切换需要程序开发者明确支持
- Truecolor 转义码更长，解析更慢
- 支持真彩色的终端更少

**256 色调色板**位于两者之间——比 base16 有更大的范围，又比 truecolor 更轻量。但它有自己的问题：

- 默认主题与大多数 base16 主题冲突
- 默认主题可读性差，对比度不一致
- 没人想手动定义额外的 240 种颜色

**解决方案是：从现有的 base16 颜色生成扩展调色板。** 这样既保持了一处配置的简洁性，又能使用更多颜色。

如果终端能自动完成这个工作，终端程序开发者就会把 256 色调色板视为可行的选择，使用更丰富的色彩范围而无需增加复杂性或配置文件。

## 理解 256 色调色板的结构

256 色调色板有特定的布局：

### 基础 16 色（0-15）

前 16 种颜色构成 base16 调色板，包含黑、白以及所有主要和次要颜色，每种都有普通和高亮两种变体：

```
0.  黑色 (black)
1.  红色 (red)
2.  绿色 (green)
3.  黄色 (yellow)
4.  蓝色 (blue)
5.  品红 (magenta)
6.  青色 (cyan)
7.  白色 (white)
8.  高亮黑 (bright black)
9.  高亮红 (bright red)
10. 高亮绿 (bright green)
11. 高亮黄 (bright yellow)
12. 高亮蓝 (bright blue)
13. 高亮品红 (bright magenta)
14. 高亮青 (bright cyan)
15. 高亮白 (bright white)
```

### 216 色立方（16-231）

接下来的 216 种颜色构成一个 6x6x6 的颜色立方体。它的工作原理类似 24 位 RGB，但每个通道只有 6 个色阶而非 256 个。

计算特定索引的公式（R、G、B 取值范围 0-5）：

```
16 + (36 * R) + (6 * G) + B
```

### 灰度渐变（232-255）

最后 24 种颜色构成从黑到白的灰度渐变。纯黑和纯白本身被排除在外，因为它们可以在颜色立方体的 (0, 0, 0) 和 (5, 5, 5) 处找到。

计算特定索引的公式（S 取值范围 0-23）：

```
232 + S
```

## 256 色调色板的问题

### 问题一：与 base16 冲突

最明显的问题是 256 色调色板与用户的 base16 主题不一致：

![不一致的主题](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/inconsistent.png)

使用自定义的 256 色调色板能获得更悦目的效果：

![一致的主题](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/consistent.png)

### 问题二：错误的插值

默认的 216 色立方体在黑色和各颜色之间的插值是错误的。它偏向更浅的色调（第一个非黑色调的亮度是 37%，而非预期的 20%），导致在使用深色调作为背景时出现可读性问题：

![可读性差](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/poor-readability-1.png)

如果颜色立方体正确插值，可读性就能得到保证：

![可读性修复](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/fixed-readability-1.png)

### 问题三：不一致的对比度

默认的 256 色调色板使用完全饱和的颜色，导致在黑色背景上的亮度不一致。注意蓝色总是比绿色看起来更暗，尽管它们的色阶相同：

![亮度不一致](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/poor-readability-2.png)

如果使用饱和度较低的蓝色，就能保持一致的亮度：

![亮度一致](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/fixed-readability-2.png)

## 生成调色板的方案

这些问题可以通过从用户的 base16 颜色生成 256 色调色板来解决。

base16 调色板有 8 种普通颜色，它们映射到 216 色立方体的 8 个角。终端的前景色和背景色应该用来替代 base16 的黑色和白色。

这些颜色可以通过三线性插值来构建 216 色立方体，灰度渐变则通过简单的背景到前景插值来实现。

**关键点：应该使用 LAB 色彩空间**，以便在同一色阶的不同色调间实现一致的感知亮度。

**使用 RGB 插值的 Solarized：**

![RGB 插值](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/without-lab.png)

**使用 LAB 插值的 Solarized：**

![LAB 插值](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/with-lab.png)

多种生成主题的合集：

![生成主题示例](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/example.png)

使用默认颜色生成 256 调色板前后的对比：

![前后对比](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/before_after.png)

## 参考实现

这段代码属于公共领域，可以自由修改和使用：

```python
def lerp_lab(t, lab1, lab2):
    return (
        lab1[0] + t * (lab2[0] - lab1[0]),
        lab1[1] + t * (lab2[1] - lab1[1]),
        lab1[2] + t * (lab2[2] - lab1[2]),
    )

def generate_256_palette(base16, bg=None, fg=None):
    base8_lab = [rgb_to_lab(c) for c in base16[:8]]
    bg_lab = rgb_to_lab(bg) if bg else base8_lab[0]
    fg_lab = rgb_to_lab(fg) if fg else base8_lab[7]

    palette = [*base16]

    for r in range(6):
        c0 = lerp_lab(r / 5, bg_lab, base8_lab[1])
        c1 = lerp_lab(r / 5, base8_lab[2], base8_lab[3])
        c2 = lerp_lab(r / 5, base8_lab[4], base8_lab[5])
        c3 = lerp_lab(r / 5, base8_lab[6], fg_lab)
        for g in range(6):
            c4 = lerp_lab(g / 5, c0, c1)
            c5 = lerp_lab(g / 5, c2, c3)
            for b in range(6):
                c6 = lerp_lab(b / 5, c4, c5)
                palette.append(lab_to_rgb(c6))

    for i in range(24):
        t = (i + 1) / 25
        lab = lerp_lab(t, bg_lab, fg_lab)
        palette.append(lab_to_rgb(lab))

    return palette
```

## 我的思考

这个方案的设计思路非常优雅。它没有要求用户做额外的工作（手动定义 240 种颜色是不现实的），而是利用已有的配置（base16 主题）智能地扩展色彩空间。

**LAB 色彩空间的选择尤其值得称道**。很多开发者可能只知道 RGB，但 LAB 的设计目标是让颜色在感知上均匀——这意味着相同的数值变化会产生相同的视觉差异。这对于保持不同色调间的一致亮度至关重要。

另外，这个方案也体现了一个更广泛的原则：**好的工具应该减少而非增加用户的认知负担**。如果终端能自动从用户的主题偏好中推断出合理的扩展配置，用户就不需要在「有限但一致」和「丰富但混乱」之间做痛苦的权衡。

## 总结

默认的 256 色调色板确实有改进空间。考虑到它的可读性问题以及与用户主题的冲突，程序开发者往往避开它，转而选择表达能力更弱的 base16 或更复杂的 truecolor。

**终端应该从用户的 base16 主题自动生成 256 色调色板**。这会让调色板成为一个可行选项，尤其是考虑到它相比 truecolor 的优势：

- 无需配置文件即可访问丰富的调色板
- 无需开发者努力就能实现亮/暗模式切换
- 更广泛的终端支持，没有兼容性问题

这是一个对终端模拟器开发者来说值得考虑的功能增强，能够显著改善终端用户的视觉体验。
