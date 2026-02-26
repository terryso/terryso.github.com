---
layout: post
title: "BuildKit：Docker 生态中被低估的构建引擎"
date: 2026-02-27 02:00:18 +0800
categories: tech-translation
description: "大多数人每天都在使用 BuildKit 却不自知。本文深入解析 BuildKit 的架构设计——LLB 中间表示、可插拔前端、内容寻址缓存，以及如何用它构建任意制品，而不仅仅是 Docker 镜像。"
original_url: https://tuananh.net/2026/02/25/buildkit-docker-hidden-gem/
source: Hacker News
---

本文翻译自 [BuildKit: Docker's Hidden Gem](https://tuananh.net/2026/02/25/buildkit-docker-hidden-gem/)，原载于 Hacker News。

---

大多数开发者每天都在使用 BuildKit，却从未意识到它的存在。当你执行 `docker build` 时，幕后工作的正是 BuildKit。但如果把 BuildKit 仅仅理解为「构建 Dockerfile 的工具」，就像把 LLVM 说成「编译 C 语言的工具」一样——这严重低估了它的架构价值。

BuildKit 是一个**通用的、可插拔的构建框架**。它当然可以生成 OCI 镜像，但同样可以输出 tar 包、本地目录、APK 包、RPM 包，或者任何你能用有向无环图（DAG）描述的文件系统操作。Dockerfile 只是它的一个前端而已。你可以编写自己的前端。

## 架构解析

BuildKit 的设计简洁清晰，理解了它的分层结构后会发现其实相当直观。核心概念有三个。

### LLB：中间表示层

BuildKit 的核心是 **LLB**（Low-Level Build definition）。可以把它理解为构建系统领域的 LLVM IR。LLB 是一个二进制协议（基于 protobuf），描述了文件系统操作的 DAG：运行命令、复制文件、挂载文件系统。它是内容寻址的，意味着相同的操作产生相同的哈希值，从而实现激进的缓存策略。

当你编写 Dockerfile 时，Dockerfile 前端解析它并生成 LLB。但 BuildKit 并不要求输入必须是 Dockerfile——任何能产生有效 LLB 的程序都可以驱动 BuildKit。

### Frontend：自带语法

**Frontend（前端）** 是一个容器镜像，BuildKit 运行它来将你的构建定义（Dockerfile、YAML、JSON、HCL，任意格式）转换为 LLB。前端通过 BuildKit Gateway API 接收构建上下文和构建文件，然后返回序列化的 LLB 图。

关键洞察在于：**构建语言不是固化在 BuildKit 里的，而是一个可插拔层**。你可以编写一个读取 YAML 规范、TOML 配置或自定义 DSL 的前端，BuildKit 会像执行 Dockerfile 一样执行它。

你其实已经见过这个机制了。Dockerfile 顶部的 `# syntax=` 指令告诉 BuildKit 使用哪个前端镜像。`# syntax=docker/dockerfile:1` 只是默认值。你可以指向任意镜像。

### Solver 和 Cache：内容寻址执行

**Solver（求解器）** 接收 LLB 图并执行它。DAG 中的每个顶点都是内容寻址的，所以如果你之前已经用相同的输入构建过某个步骤，BuildKit 会直接跳过。这就是 BuildKit 快的原因：它不像旧的 Docker 构建器那样线性缓存层，而是在整个图的操作级别缓存，并且可以并行执行独立的分支。

缓存可以是本地的、内联的（嵌入到镜像中）或远程的（镜像仓库）。这使得 BuildKit 构建可重现，并且可以在 CI runner 之间共享。

## 不仅仅是镜像

BuildKit 的 `--output` 参数让这一切变得实用。你可以告诉 BuildKit 以以下方式导出结果：

* `type=image` — 推送到镜像仓库（`docker build` 的默认行为）
* `type=local,dest=./out` — 将最终文件系统导出到本地目录
* `type=tar,dest=./out.tar` — 导出为 tar 包
* `type=oci` — 导出为 OCI 镜像 tar 包

`type=local` 输出对于非镜像场景最为有趣。你的构建可以产出编译好的二进制文件、软件包、文档或其他任何东西，BuildKit 会把结果写入磁盘。不需要容器镜像。

Earthly、Dagger 和 Depot 等项目都构建在 BuildKit 的 LLB 之上。这是一个经过验证的模式。

## 实战：用自定义前端构建 APK 包

为了具体演示，我构建了 [apkbuild](https://github.com/tuananh/apkbuild)：一个自定义 BuildKit 前端，它读取 YAML 规范并生成 Alpine APK 包。不涉及 Dockerfile。整个构建流水线——从源码编译到 APK 打包——都在 BuildKit 内部通过 LLB 操作完成。可以把它想象成 Chainguard melange 的简化版本。

我选择 YAML 是因为它熟悉，但规范可以是任何你想要的格式（JSON、TOML、自定义 DSL），只要你的前端能解析它。

我的包 YAML 规范长这样：

```yaml
name: hello
version: "1.0.0"
epoch: "0"
url: https://example.com/hello
license: MIT
description: Minimal CMake APK demo
sources:
app:
context: {}
build:
source_dir: hello
```

就这样。没有 Dockerfile。没有 shell 脚本。BuildKit 通过自定义前端读取这个规范，然后生成 `.apk` 文件。

### 运行方式

构建前端镜像：

```bash
docker build -t tuananh/apkbuild -f Dockerfile .
```

然后用它构建 APK 包：

```bash
cd example
docker buildx build \
  -f spec.yml \
  --build-arg BUILDKIT_SYNTAX=tuananh/apkbuild \
  --output type=local,dest=./out \
  .
```

你应该能在 `out` 文件夹里看到生成的 APK 包。

`BUILDKIT_SYNTAX` 告诉 BuildKit 使用我们的自定义前端，而不是默认的 Dockerfile 解析器。`--output type=local` 把生成的 `.apk` 文件导出到 `./out`。没有镜像被创建。不涉及镜像仓库。

## 为什么这很重要

BuildKit 免费为你提供了一个内容寻址、并行化、可缓存的构建引擎。你不需要重新发明缓存、并行性或可重现性。你只需要编写一个将你的规范转换为 LLB 的前端，BuildKit 处理剩下的一切。

这不仅仅是玩具示例。Dagger 使用 LLB 作为其 CI/CD 流水线的执行引擎。Earthly 将 Earthfile 编译为 LLB。这个模式已经在生产规模上得到验证。

如果你正在构建一个需要编译代码、生成制品或编排多步骤构建的工具，考虑把 BuildKit 作为你的执行后端。Dockerfile 只是默认前端。真正的力量在于底层的引擎。

---

## 要点总结

1. **BuildKit ≠ Docker 构建器**：它是一个通用的构建框架，Dockerfile 只是众多前端之一
2. **LLB 是核心**：类似 LLVM IR 的中间表示，内容寻址，支持激进缓存
3. **前端可插拔**：可以用 YAML、TOML、自定义 DSL 作为构建定义语言
4. **输出多样化**：不仅限于镜像，可以输出本地目录、tar 包、软件包等
5. **实战项目**：Dagger、Earthly、Depot 都在用 LLB 作为执行引擎

对于需要构建复杂制品的场景，BuildKit 是一个值得深入学习的工具。
