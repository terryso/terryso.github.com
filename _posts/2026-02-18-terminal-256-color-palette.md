---
layout: post
title: "终端应该根据用户的 base16 主题生成 256 色调色板"
date: 2026-02-18 18:44:32 +0800
categories: tech-translation
description: "探讨如何从 base16 主题自动生成 256 色调色板，解决终端配色不一致和可读性问题，同时避免 truecolor 的复杂性。"
original_url: https://gist.github.com/jake-stewart/0a8ea46159a7da2c808e5be2177e1783
source: Hacker News
---

本文翻译自 [Terminals should generate the 256-color palette](https://gist.github.com/jake-stewart/0a8ea46159a7da2c808e5be2177e1783)，原载于 Hacker News。

---

如果你经常在终端里工作，大概率设置过自定义的 base16 主题。这套方案很优雅——你在一个地方定义好几种颜色，所有程序都能统一使用。

但问题来了：16 种颜色实在不够用。那些色彩丰富的复杂程序面对这么小的调色板会很吃力。

## 主流方案：Truecolor 及其代价

主流解决方案是使用 truecolor，获得 1600 万种颜色。但这有几个明显的缺点：

- 每个 truecolor 程序都需要单独配置主题
- 想换配色？得改一堆配置文件
- 明暗主题切换需要程序作者专门支持
- Truecolor 转义序列更长，解析更慢
- 支持的终端更少

256 色调色板正好卡在中间——比 base16 颜色多，又比 truecolor 开销小。但它也有自己的问题：

- 默认配色和大多数 base16 主题冲突
- 默认配色可读性差，对比度不一致
- 没人想手动定义 240 个额外颜色

**解决方案**：从现有的 base16 颜色生成扩展调色板。这样你既保持了一处配置的简洁性，又能使用更多的颜色。

如果终端能自动完成这个工作，程序开发者们就会把 256 色调色板当成一个可行的选择，用更丰富的色彩范围，同时不需要额外的复杂性或配置文件。

## 理解 256 色调色板

256 色调色板有特定的布局结构。

### 基础 16 色

前 16 种颜色构成 base16 调色板，包含黑、白，以及所有原色和次色，每种都有普通和高亮两种变体：

```
0.  黑色
1.  红色
2.  绿色
3.  黄色
4.  蓝色
5.  品红
6.  青色
7.  白色
8.  高亮黑
9.  高亮红
10. 高亮绿
11. 高亮黄
12. 高亮蓝
13. 高亮品红
14. 高亮青
15. 高亮白
```

### 216 色立方体

接下来的 216 种颜色构成一个 6x6x6 的颜色立方体。它类似于 24 位 RGB，但每个通道只有 6 个色阶而不是 256 个。

计算特定索引的公式如下（R、G、B 范围为 0-5）：

```
16 + (36 * R) + (6 * G) + B
```

### 灰度渐变

最后 24 种颜色构成从黑到白的灰度渐变。纯黑和纯白被排除在外，因为它们可以在颜色立方体的 (0, 0, 0) 和 (5, 5, 5) 找到。

计算公式（S 为 0-23 的色阶值）：

```
232 + S
```

## 默认 256 色调色板的问题

### 与 Base16 主题冲突

最明显的问题是 256 色调色板与用户的 base16 主题不一致：

![主题不一致示例](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/inconsistent.png)

使用自定义的 256 色调色板效果更好：

![主题一致示例](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/consistent.png)

### 插值算法错误

默认的 216 色立方体在黑色和各颜色之间的插值有问题。它偏向较亮的色阶（第一个非黑色色阶的亮度是 37%，而不是预期的 20%），导致使用深色背景时可读性差：

![可读性差示例](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/poor-readability-1.png)

如果正确插值，可读性就能保持：

![修复后示例](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/fixed-readability-1.png)

### 对比度不一致

默认 256 色调色板使用完全饱和的颜色，导致在黑色背景上亮度不一致。注意蓝色总是比绿色看起来更暗，尽管它们是同一个色阶：

![对比度问题](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/poor-readability-2.png)

如果使用饱和度较低的蓝色，就能保持一致的亮度：

![修复对比度](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/fixed-readability-2.png)

## 生成调色板

从用户的 base16 颜色生成 256 色调色板可以解决这些问题。

Base16 调色板有 8 种普通颜色，对应 216 色立方体的 8 个角。终端的前景色和背景色应该用来替代 base16 的黑和白。

通过三线性插值（trilinear interpolation）构建 216 色立方体，灰度渐变则通过简单的背景到前景插值生成。

**关键点**：应该在 LAB 色彩空间中进行插值，以实现相同色阶的不同色调具有一致的感知亮度。

Solarized 主题的对比：

**RGB 插值：**

![RGB 插值](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/without-lab.png)

**LAB 插值：**

![LAB 插值](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/with-lab.png)

多种生成主题的示例：

![生成主题示例](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/example.png)

使用默认颜色的前后对比：

![前后对比](https://raw.githubusercontent.com/jake-stewart/color256/refs/heads/main/writeup/before_after.png)

### 参考实现

这段代码是公共领域的，可以随意修改和使用：

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

## 总结

默认的 256 色调色板还有改进空间。考虑到它糟糕的可读性和与用户主题的冲突，程序作者往往避开它，转而选择表现力较差的 base16 或更复杂的 truecolor。

**终端应该从用户的 base16 主题生成 256 色调色板**。这会让 256 色成为一个可行的选择，尤其是考虑到它相比 truecolor 的优势：

- 无需配置文件就能使用丰富的调色板
- 明暗主题切换不需要开发者额外支持
- 更广泛的终端兼容性

---

**个人感想**：这篇文章提出了一个很实用的观点。作为一名长期使用终端的开发者，我一直觉得 256 色模式是个"鸡肋"——比 16 色强但又不够好用，最终只能选择 truecolor。如果终端模拟器能原生支持从 base16 主题自动生成 256 色调色板，确实能解决很多痛点。文章中提到的 LAB 色彩空间插值也很专业，保证了感知亮度的一致性，这是 RGB 插值做不到的。希望未来能有更多终端实现这个功能。
