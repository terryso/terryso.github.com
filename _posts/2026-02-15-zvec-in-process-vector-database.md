---
layout: post
title: "Zvec：阿里开源的轻量级高性能进程内向量数据库"
date: 2026-02-15 11:23:27 +0800
categories: tech-translation
description: "阿里开源的 Zvec 是一个轻量级、极速的进程内向量数据库，基于 Proxima 引擎构建，支持十亿级向量毫秒级检索，无需服务器配置即可开箱即用。"
original_url: https://github.com/alibaba/zvec
source: Hacker News
---

本文翻译自 [Zvec GitHub Repository](https://github.com/alibaba/zvec)，原载于 Hacker News。

## 什么是 Zvec？

Zvec 是阿里巴巴开源的进程内向量数据库——轻量、极速，设计上可以直接嵌入应用程序。它基于 **Proxima**（阿里经过大规模生产验证的向量搜索引擎）构建，提供生产级的低延迟、可扩展相似性搜索，且配置极简。

对于做 RAG（检索增强生成）、语义搜索、推荐系统的开发者来说，这是一个值得关注的新选择。

## 核心特性

### 1. 极速检索

Zvec 可以在毫秒级时间内搜索数十亿向量。其性能表现如下：

![Zvec Performance Benchmarks](https://zvec.oss-cn-hongkong.aliyuncs.com/qps_10M.svg)

### 2. 开箱即用

安装即用，无需服务器、无需配置、无需折腾。这对于快速原型开发和中小规模应用来说非常友好。

### 3. 稠密向量 + 稀疏向量

同时支持稠密向量和稀疏向量（sparse embeddings），原生支持单次调用中的多向量查询。这意味着你可以：

- 使用稠密向量做语义搜索
- 使用稀疏向量做关键词匹配（类似 BM25）
- 组合两者实现混合检索

### 4. 混合搜索

结合语义相似性与结构化过滤，实现精准的结果筛选。例如：先按向量相似度检索，再按时间、类别等属性过滤。

### 5. 随处运行

作为进程内库，Zvec 可以运行在你的代码能运行的任何地方——Jupyter notebooks、服务器、CLI 工具，甚至边缘设备。

## 安装方式

### Python

```bash
pip install zvec
```

**要求**: Python 3.10 - 3.12

### Node.js

```bash
npm install zvec
```

### 支持平台

- Linux (x86_64, ARM64)
- macOS (ARM64)

## 一分钟上手示例

```python
import zvec

# 定义 collection schema
schema = zvec.CollectionSchema(
    name="example",
    vectors=zvec.VectorSchema("embedding", zvec.DataType.VECTOR_FP32, 4),
)

# 创建 collection
collection = zvec.create_and_open(path="./zvec_example", schema=schema)

# 插入文档
collection.insert([
    zvec.Doc(id="doc_1", vectors={"embedding": [0.1, 0.2, 0.3, 0.4]}),
    zvec.Doc(id="doc_2", vectors={"embedding": [0.2, 0.3, 0.4, 0.1]}),
])

# 按向量相似度搜索
results = collection.query(
    zvec.VectorQuery("embedding", vector=[0.4, 0.3, 0.3, 0.1]),
    topk=10
)

# 结果格式: [{'id': str, 'score': float, ...}]，按相关度排序
print(results)
```

## 与其他向量数据库的对比

| 特性 | Zvec | Pinecone | Milvus | Chroma |
|------|------|----------|--------|--------|
| 部署方式 | 进程内 | 云服务 | 独立服务 | 进程内 |
| 配置复杂度 | 极低 | 低 | 中 | 低 |
| 稀疏向量支持 | 是 | 否 | 是 | 否 |
| 生产验证 | 阿里内部大规模 | 是 | 是 | 社区 |
| 适用场景 | 边缘/嵌入式 | 云原生 | 大规模集群 | 快速原型 |

## 适用场景

1. **边缘设备 AI 应用** - 无需网络连接的本地向量搜索
2. **快速原型开发** - 无需搭建复杂基础设施
3. **中小规模 RAG 应用** - 百万级文档的语义检索
4. **CLI 工具** - 命令行中的智能搜索功能
5. **嵌入式系统** - IoT 设备上的实时向量匹配

## 个人见解

Zvec 的出现填补了一个有趣的生态位：介于轻量级嵌入式向量库（如 Chroma）和企业级分布式向量数据库（如 Milvus）之间。

它的优势在于：

1. **基于 Proxima 的技术积累** - 阿里在电商、推荐等场景中积累了大量向量搜索经验
2. **进程内架构** - 对于不需要分布式部署的场景，避免了网络开销
3. **混合检索能力** - 同时支持稠密和稀疏向量，这在实际应用中非常实用

对于正在构建 AI 应用的开发者，如果你：
- 不想维护独立的向量数据库服务
- 需要在边缘设备或嵌入式环境运行
- 追求极致的查询延迟

那么 Zvec 值得一试。

## 总结

Zvec 是一个轻量级但功能完备的进程内向量数据库，具有以下亮点：

- 十亿级向量毫秒级检索
- 零配置开箱即用
- 同时支持稠密和稀疏向量
- 混合搜索能力
- 跨平台支持（Linux/macOS，x64/ARM64）

项目已在 GitHub 开源：[https://github.com/alibaba/zvec](https://github.com/alibaba/zvec)

如果你正在寻找一个简单高效的向量搜索方案，不妨给 Zvec 一个机会。
