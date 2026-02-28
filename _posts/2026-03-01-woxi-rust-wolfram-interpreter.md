---
layout: post
title: "Woxi：用 Rust 重写的 Wolfram 语言解释器"
date: 2026-03-01 05:44:18 +0800
categories: tech-translation
description: "Woxi 是一个用 Rust 实现的 Wolfram 语言子集解释器，旨在提供更快的执行速度和更轻量的部署方式，适合 CLI 脚本和 Jupyter Notebook 使用。"
original_url: https://github.com/ad-si/Woxi
source: Hacker News
---

本文翻译自 [Woxi - Wolfram Language reimplementation in Rust](https://github.com/ad-si/Woxi)，原载于 Hacker News。

## 项目简介

Woxi 是一个基于 Rust 的 Wolfram Language（Wolfram 语言）解释器，目标是实现该语言的一个子集，使其可以用于命令行脚本和 Jupyter Notebook。

Mathematica 和 Wolfram Language 作为符号计算和数学建模的利器，长期以来一直是商业闭源软件。Woxi 的出现为开发者提供了一个开源替代方案，让你可以在不启动重量级 Mathematica 内核的情况下使用 Wolfram 语言的语法和功能。

## 功能特点

项目的初期目标是实现 Wolfram Language 的一个实用子集。来看一个简单的例子：

```bash
#!/usr/bin/env woxi

(* Print 5 random integers between 1 and 6 *)
Print[RandomInteger[{1, 6}, 5]]
```

![Jupyter Notebook 截图](https://github.com/ad-si/Woxi/raw/main/images/2025-05-18t1620_jupyter.png)

Woxi 的一大优势是**执行速度更快**——它不需要启动 Mathematica 内核，也无需验证许可证，因此启动延迟极低。对于需要频繁调用 Wolfram 语法的脚本场景，这意味着显著的性能提升。

项目维护了一个 [functions.csv](https://github.com/ad-si/Woxi/blob/main/functions.csv) 文件，记录了所有 Wolfram Language 函数的实现状态。你可以通过查看 [CLI 测试目录](https://github.com/ad-si/Woxi/tree/main/tests/cli) 来了解目前支持的所有命令及其预期输出。

## 安装方法

Woxi 需要 Rust 的 cargo 工具链。从源码构建非常简单：

```bash
git clone https://github.com/ad-si/Woxi
cd Woxi
make install
```

## 使用方式

### 命令行直接执行

```bash
woxi eval 'StringJoin["Hello", " ", "World!"]'
# 输出: Hello World!
```

### 运行脚本文件

```bash
woxi run tests/cli/hello_world.wls
```

### Jupyter Notebook

Woxi 还支持在 Jupyter Notebook 中使用。安装内核后，在 examples 目录启动 Jupyter Lab：

```bash
cd examples && jupyter lab
```

## CLI 对比：Woxi vs WolframScript

| Woxi | WolframScript |
| --- | --- |
| `woxi eval "1 + 2"` | `wolframscript -code "1 + 2"` |
| `woxi run script.wls` | `wolframscript script.wls` |
| `woxi repl` | `wolframscript` |

语法几乎完全兼容，迁移成本极低。

## 相关项目

如果你对 Wolfram Language 的开源实现感兴趣，这些项目也值得关注：

- **CodeParser** - 将 Wolfram Language 解析为 AST 或 CST
- **Mastika** - 另一个 Rust 实现的 Wolfram Mathematica
- **MMA Clone** - Haskell 实现的简单 Wolfram Language 克隆
- **TS Wolfram** - TypeScript 实现的玩具级 Wolfram 解释器
- **Wolfram JS Frontend** - Wolfram Language 的开源 Notebook 界面
- **Wolfram Parser** - Rust 实现的 Wolfram Language 解析器
- **wolfram-ast** - 纯 Rust 编写的 Wolfram Language 解析器
- **wolfram-expr** - 在 Rust 中表示 Wolfram Language 表达式

## 个人思考

Woxi 这类项目的意义不仅仅在于「复刻」一个商业软件的功能。更重要的是：

1. **降低使用门槛**：Mathematica 的许可证费用不菲，对于学生、独立开发者或初创公司来说，开源替代品能大大降低探索成本。

2. **轻量化部署**：在 CI/CD 流水线或服务器环境中，安装几百 MB 的 Mathematica 并不现实。一个编译后的 Rust 二进制文件则轻量得多。

3. **可定制性**：开源意味着你可以根据需要修改和扩展解释器，这在商业软件中是不可能的。

当然，Woxi 目前还处于早期阶段，只实现了 Wolfram Language 的一个子集。如果你需要完整的符号计算功能，暂时还是需要依赖 Mathematica。但作为脚本语言和教学工具，Woxi 已经展现出很大的潜力。

项目地址：[https://github.com/ad-si/Woxi](https://github.com/ad-si/Woxi)

---

**要点总结：**

- Woxi 用 Rust 重写了 Wolfram Language 解释器，启动快、无需许可证验证
- 支持 CLI 脚本和 Jupyter Notebook，语法与 WolframScript 高度兼容
- 开源、轻量，适合 CI/CD 和自动化场景
- 项目还在早期，只实现了语言子集，但已可满足基础脚本需求
