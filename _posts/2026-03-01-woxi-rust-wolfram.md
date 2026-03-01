---
layout: post
title: "Woxi：用 Rust 重写 Wolfram 语言的全新尝试"
date: 2026-03-01 09:05:47 +0800
categories: tech-translation
description: "Woxi 是一个用 Rust 实现的 Wolfram 语言解释器，目标是提供更快、更轻量的 Mathematica 替代方案，特别适合 CLI 脚本和 Jupyter notebook 场景。"
original_url: https://github.com/ad-si/Woxi
source: Hacker News
---

本文翻译自 [Woxi - Wolfram Language / Mathematica reimplementation in Rust](https://github.com/ad-si/Woxi)，原载于 Hacker News。

## 什么是 Woxi？

如果你曾经使用过 Mathematica，一定对 Wolfram 语言（Wolfram Language）不陌生。这是一门在科学计算、符号运算领域非常强大的语言，但有一个问题——它需要昂贵的许可证，而且启动速度不够快。

[Woxi](https://github.com/ad-si/Woxi) 是一个用 Rust 编写的 Wolfram 语言子集解释器。名字很有意思，Woxi = Wolfram + Oxidized（氧化，Rust 的双关语），寓意"用 Rust 重写的 Wolfram"。

## 核心特性

Woxi 的初始目标是实现 Wolfram 语言的一个子集，让它能够用于：

- CLI 脚本编写
- Jupyter notebook 环境

来看一个简单的例子：

```wolfram
#!/usr/bin/env woxi

(* 打印 5 个 1 到 6 之间的随机整数 *)
Print[RandomInteger[{1, 6}, 5]]
```

## 为什么选择 Woxi？

### 1. 速度更快

Woxi 比 WolframScript 运行更快，原因很简单：

- 没有启动内核（kernel）的开销
- 没有许可证验证的过程

如果你经常需要在命令行执行 Mathematica 脚本，这个启动速度的差异会非常明显。

### 2. 完全开源

Woxi 是开源项目，你可以自由使用、修改和贡献代码。

### 3. Jupyter 支持

Woxi 可以集成到 Jupyter notebook 中，这对于数据分析和科学计算场景非常实用。

## 安装与使用

### 安装

首先确保你的系统已经安装了 Rust 的 cargo。然后从源码构建：

```bash
git clone https://github.com/ad-si/Woxi
cd Woxi
make install
```

### 命令行使用

直接在命令行执行表达式：

```bash
woxi eval 'StringJoin["Hello", " ", "World!"]'
# 输出: Hello World!
```

运行脚本文件：

```bash
woxi run tests/cli/hello_world.wls
```

启动 REPL 交互环境：

```bash
woxi repl
```

### Jupyter Notebook

Woxi 也支持在 Jupyter notebook 中使用：

```bash
cd examples && jupyter lab
```

## CLI 命令对比

这里有一个 Woxi 和 WolframScript 的命令对比表：

| Woxi | WolframScript |
|------|---------------|
| `woxi eval "1 + 2"` | `wolframscript -code "1 + 2"` |
| `woxi run script.wls` | `wolframscript script.wls` |
| `woxi repl` | `wolframscript` |

可以看到，Woxi 的命令更加简洁直观。

## 项目现状与参与贡献

Woxi 目前仍在积极开发中。你可以通过以下方式了解项目进度：

- **CLI tests 目录** - 查看所有当前支持的命令及其预期输出
- **functions.csv 文件** - 查看所有 Wolfram 语言函数的实现状态

项目欢迎社区贡献，如果你对编译器、解释器开发感兴趣，这是一个很好的学习项目。

## 相关项目

生态系统中还有其他一些值得关注的项目：

- **CodeParser** - 将 Wolfram 语言解析为 AST 或 CST
- **Mastika** - 另一个 Rust 实现的 Wolfram Mathematica
- **wolfram-expr** - 在 Rust 中表示 Wolfram 语言表达式
- **Wolfram Parser** - Rust 编写的 Wolfram 语言解析器

## 个人观点

Woxi 代表了一个有趣的趋势：用现代系统编程语言重新实现经典工具。Rust 的内存安全和性能特性，使它成为这类项目的理想选择。

对于中国开发者来说，如果你：

- 想学习 Mathematica/Wolfram 语言但不想购买许可证
- 需要在服务器或 CI/CD 环境中运行 Wolfram 脚本
- 对编译器和解释器开发感兴趣

Woxi 都是一个值得关注的项目。

当然，Woxi 目前还处于早期阶段，只实现了 Wolfram 语言的一个子集。如果你需要完整的 Mathematica 功能，还是需要使用官方产品。但作为学习工具和轻量级替代方案，Woxi 已经展现出不错的潜力。

## 小结

- Woxi 是用 Rust 实现的 Wolfram 语言解释器
- 启动速度快，无许可证开销
- 支持 CLI 脚本和 Jupyter notebook
- 开源项目，欢迎贡献
- 适合学习和轻量级使用场景

如果你对符号计算、科学计算感兴趣，不妨给 Woxi 一个 star，或者参与贡献代码！
