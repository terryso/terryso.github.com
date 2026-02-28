---
layout: post
title: "Manim-Web：用 TypeScript 在浏览器中创建数学动画"
date: 2026-02-28 18:08:52 +0800
categories: tech-translation
description: "Manim-Web 是 3Blue1Brown 著名数学动画库 Manim 的 TypeScript 移植版本，让你无需 Python 即可在浏览器中创建精美的数学动画。"
original_url: https://github.com/maloyan/manim-web
source: Hacker News
---

本文翻译自 [Manim-Web: Mathematical animations for the web](https://github.com/maloyan/manim-web)，原载于 Hacker News。

## 前言

如果你在 YouTube 上看过 3Blue1Brown 的数学视频，一定会被那些流畅优雅的动画所震撼。Grant Sanderson 用 Python 编写的 Manim 库，让无数数学概念变得生动直观。但一直以来，要在网页上展示类似的动画，你需要导出视频文件或 GIF，这既笨重又不灵活。

**Manim-Web** 的出现改变了这一切。这是一个用 TypeScript 重写的 Manim，专门为 Web 而生。

## 什么是 Manim-Web？

Manim-Web 是 Manim 的完整 TypeScript 实现，让你能够：

- 在浏览器中原生渲染数学动画
- 无需 Python 环境
- 与 React、Vue 等现代前端框架无缝集成
- 支持交互式动画（拖拽、悬停、点击）

简单来说，它把"写代码生成数学视频"变成了"写代码生成可交互的网页动画"。

## 快速上手

安装非常简单：

```bash
npm install manim-web
```

然后写你的第一个动画：

```typescript
import { Scene, Circle, Square, Create, Transform, FadeOut } from 'manim-web';

async function squareToCircle(scene: Scene) {
  const square = new Square({ sideLength: 3 });
  const circle = new Circle({ radius: 1.5 });

  await scene.play(new Create(square));
  await scene.play(new Transform(square, circle));
  await scene.play(new FadeOut(square));
}
```

这段代码做了三件事：
1. 创建一个正方形
2. 把正方形变换成圆形
3. 让圆形淡出消失

就这么简单！整个过程在浏览器中实时渲染，不需要任何视频处理。

## 核心功能一览

Manim-Web 提供了丰富的组件和动画类型：

### 几何图形

Circle、Rectangle、Polygon、Arrow、Arc、Star、Brace 等基本图形应有尽有。你可以轻松创建复杂的几何构造。

### 文本与 LaTeX

支持 Text、MathTex、Tex、Paragraph，通过 KaTeX 渲染数学公式。这意味着你可以直接在网页上展示那些漂亮的数学符号。

### 坐标系与函数图像

Axes、NumberPlane、FunctionGraph、ParametricFunction、VectorField、BarChart 等，让你可以可视化各种数学函数和数据。

### 3D 图形

Sphere、Cube、Cylinder、Torus、Surface3D、ThreeDAxes，配合轨道控制，可以创建真正的 3D 动画。这对于讲解空间几何、向量分析等内容非常有用。

### 动画效果

FadeIn/Out、Create、Transform、Write、GrowFromCenter、AnimationGroup、LaggedStart 等，这些 Manim 经典动画都被完整移植了过来。

### 交互能力

这是原版 Manim 不具备的特性。Manim-Web 支持 Draggable（可拖拽）、Hoverable（悬停响应）、Clickable（可点击）的 mobjects（mathematical objects）。

### 导出功能

虽然主要面向 Web，但你仍然可以导出为 GIF 或视频文件，方便在离线场景使用。

## 框架集成

### React 集成

```tsx
import { ManimScene } from 'manim-web/react';

function App() {
  return <ManimScene construct={squareToCircle} width={800} height={450} />;
}
```

### Vue 集成

```vue
<script setup>
import { ManimScene } from 'manim-web/vue';
</script>

<template>
  <ManimScene :construct="squareToCircle" :width="800" :height="450" />
</template>
```

无论你用 React 还是 Vue，都能轻松将数学动画嵌入到现有项目中。

## Python 脚本迁移工具

如果你手头有现成的 Python Manim 脚本，Manim-Web 提供了一个转换工具：

```bash
node tools/py2ts.cjs input.py -o output.ts
```

虽然可能需要一些手动调整，但这个工具能大大减少迁移成本。

## 我的看法

Manim-Web 填补了一个重要的空白。之前，Web 开发者想要在页面上展示动态数学内容，要么嵌入 YouTube 视频，要么用 D3.js 从零开始写，要么用一些功能有限的数学可视化库。

现在，我们有了一个专门为数学教育、科学可视化设计的工具。它的 API 设计延续了 Manim 的优雅，同时充分利用了 TypeScript 的类型安全和现代前端生态。

几个我认为特别有价值的场景：

1. **在线教育平台** - 可以为每个知识点创建可交互的动画演示
2. **技术博客** - 用动画解释算法、数据结构、数学概念
3. **产品文档** - 可视化复杂的业务逻辑或数据处理流程
4. **演示文稿** - 制作比 Keynote/PowerPoint 更生动的技术演示

## 项目状态

目前 Manim-Web 已经相当成熟，最新版本 v0.3.5 发布于 2026 年 2 月 18 日。项目在 GitHub 上获得了 200+ star，采用 MIT 开源协议。

项目主要使用 TypeScript（97.1%）和少量 JavaScript（2.9%），代码质量较高，有完善的 CI/CD 和测试覆盖。

## 如何贡献

```bash
git clone https://github.com/maloyan/manim-web.git
cd manim-web
npm install
npm run dev
```

项目结构清晰，文档齐全，是一个很好的开源贡献入门项目。

## 总结

Manim-Web 把 3Blue1Brown 的魔法带到了 Web 前端。如果你是一名：

- 数学或科学教育工作者
- 前端开发者
- 技术内容创作者
- 或只是对数学可视化感兴趣

这个项目值得你花时间探索。浏览器中原生的数学动画，终于变得触手可及。

---

**关键要点：**

- Manim-Web 是 Manim 的 TypeScript 移植，无需 Python 即可在浏览器中创建数学动画
- 支持 2D/3D 几何图形、LaTeX 公式、函数图像、丰富动画效果
- 原生支持 React 和 Vue 框架集成
- 提供交互能力（拖拽、悬停、点击），这是原版 Manim 不具备的
- 提供 Python 脚本到 TypeScript 的转换工具，方便迁移现有代码
