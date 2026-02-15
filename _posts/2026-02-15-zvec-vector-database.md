---
layout: post
title: "Zvec：阿里巴巴开源的轻量级高性能向量数据库"
date: 2026-02-15 14:29:47 +0800
categories: tech-translation
description: "阿里开源的进程内向量数据库 Zvec，基于 Proxima 构建，支持毫秒级检索数十亿向量，安装即用无需服务器配置。"
original_url: https://github.com/alibaba/zvec
source: Hacker News
---

本文翻译自 [Zvec GitHub Repository](https://github.com/alibaba/zvec)，原载于 Hacker News。

## 什么是 Zvec？

**Zvec** 是阿里巴巴开源的一款进程内（in-process）向量数据库 —— 轻量、极速，专为直接嵌入应用程序而设计。它基于 **Proxima**（阿里巴巴久经沙场的向量搜索引擎）构建，能够以最少的配置提供生产级的低延迟、可扩展的相似性搜索能力。

简单来说，Zvec 就像 SQLite 之于关系型数据库，它是向量数据库领域的"嵌入式"选择。

## 核心特性

### 极速搜索

Zvec 可以在**毫秒级**内检索数十亿向量。这得益于 Proxima 引擎的深厚积累，阿里在内部大规模生产环境中已经验证了这套技术栈的可靠性。

### 开箱即用

安装只需要一行命令：

```bash
pip install zvec
```

不需要搭建服务器、不需要写配置文件、不需要运维。这对于快速原型开发、测试环境、甚至很多生产场景来说，简直是福音。

### 稠密向量 + 稀疏向量

Zvec 同时支持稠密向量（dense vectors）和稀疏向量（sparse embeddings），并且原生支持在单次调用中进行多向量查询。

这个特性很实用：
- **稠密向量**：适合语义搜索，比如使用 OpenAI embeddings 或 BGE
- **稀疏向量**：适合关键词匹配，比如 BM25 或 SPLADE

混合使用两者可以获得更好的检索效果。

### 混合搜索

可以结合语义相似性和结构化过滤器进行精确查询。比如"找出与这个向量最相似的文档，但只限类别为'技术'的"。

### 随处运行

作为进程内库，Zvec 可以运行在你的代码能运行的任何地方：
- Jupyter notebooks
- 服务器端应用
- CLI 工具
- 甚至边缘设备

## 快速上手

一个简单的示例，让你在一分钟内体验 Zvec：

```python
import zvec

# 定义集合 schema
schema = zvec.CollectionSchema(
    name="example",
    vectors=zvec.VectorSchema("embedding", zvec.DataType.VECTOR_FP32, 4),
)

# 创建集合
collection = zvec.create_and_open(path="./zvec_example", schema=schema)

# 插入文档
collection.insert([
    zvec.Doc(id="doc_1", vectors={"embedding": [0.1, 0.2, 0.3, 0.4]}),
    zvec.Doc(id="doc_2", vectors={"embedding": [0.2, 0.3, 0.4, 0.1]}),
])

# 向量相似性搜索
results = collection.query(
    zvec.VectorQuery("embedding", vector=[0.4, 0.3, 0.3, 0.1]),
    topk=10
)

# 结果格式：[{'id': str, 'score': float, ...}]，按相关性排序
print(results)
```

API 设计非常直观，如果你用过 Chroma 或 LanceDB，会觉得非常熟悉。

## 性能表现

根据官方的基准测试，Zvec 在处理千万级甚至亿级向量时表现出色：

![Zvec Performance Benchmarks](https://zvec.oss-cn-hongkong.aliyuncs.com/qps_10M.svg)

详细的测试方法论、配置和完整结果可以参考 [Benchmarks 文档](https://zvec.org/en/docs/benchmarks/)。

## 系统要求

- Python 3.10 - 3.12
- 支持平台：
  - Linux (x86_64)
  - macOS (ARM64)

如果你需要从源码构建，可以参考 [Building from Source](https://zvec.org/en/docs/build/) 指南。

## 一些思考

### 进程内数据库的价值

Zvec 选择进程内架构是一个有趣的决策。相比于需要独立部署的向量数据库（如 Milvus、Weaviate、Pinecone），这种架构有几个明显优势：

1. **零运维成本**：没有独立的服务器需要管理
2. **低延迟**：没有网络开销
3. **部署简单**：随应用一起打包分发
4. **测试友好**：单元测试可以轻松使用

当然，这种架构也有局限性，比如不适合需要跨服务共享数据的场景。

### Proxima 的基因

Proxima 是阿里巴巴内部使用多年的向量搜索引擎，支撑了淘宝、天猫等核心业务的推荐和搜索。Zvec 可以看作是 Proxima 能力的开源释放，这对于想要在本地或小规模场景使用类似能力的开发者来说是个好消息。

### 与其他嵌入式向量数据库的对比

目前市面上类似的嵌入式选择还有：
- **Chroma**：功能丰富，但性能一般
- **LanceDB**：基于 Lance 列式存储，支持多模态
- **SQLite-VSS**：SQLite 扩展，适合已有 SQLite 用户的增量需求

Zvec 的差异化在于其底层引擎的生产级性能积累。

## 资源链接

- 官网：[https://zvec.org/](https://zvec.org/)
- 文档：[https://zvec.org/en/docs/](https://zvec.org/en/docs/)
- 快速开始：[https://zvec.org/en/docs/quickstart/](https://zvec.org/en/docs/quickstart/)
- GitHub：[https://github.com/alibaba/zvec](https://github.com/alibaba/zvec)
- Discord：[https://discord.gg/rKddFBBu9z](https://discord.gg/rKddFBBu9z)

---

## 总结

Zvec 是一个值得关注的新选择，特别适合以下场景：

- 快速原型开发和 POC
- 嵌入式应用或边缘计算
- 不想折腾服务器配置的中小规模项目
- 需要阿里级性能但预算有限的团队

如果你正在寻找一个简单易用、性能出色的本地向量数据库，不妨试试 Zvec。
