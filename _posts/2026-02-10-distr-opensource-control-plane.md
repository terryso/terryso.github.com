---
layout: post
title: "Distr：开源的软件分发控制平面，轻松管理自托管和 BYOC 部署"
date: 2026-02-10 22:21:13 +0800
categories: tech-translation
description: "Distr 是一个开源的软件分发平台，为需要向客户提供自托管、BYOC 或本地部署的软件和 AI 公司提供开箱即用的解决方案。"
original_url: https://github.com/distr-sh/distr
source: GitHub
---

本文翻译自 [Distr GitHub 项目](https://github.com/distr-sh/distr)。

## 什么是 Distr？

Distr 是一个开源的软件分发平台，它提供了预构建组件的即用型设置，帮助软件和 AI 公司将应用程序分发到复杂的自托管环境中。

对于任何需要向客户提供自托管部署、BYOC（Bring Your Own Cloud）自动化或边缘管理的团队来说，这个工具都值得关注。

## 核心特性

### 集中化管理
通过直观的 Web UI 查看和管理所有部署、制品、连接的代理，以及自托管和 BYOC 客户。

### 部署自动化
提供预构建的 Helm 和 Docker 代理，可选地管理部署、收集日志和指标，并允许远程故障排除。

### 白标客户门户
让你的客户能够控制自己的部署或下载你的制品——完全使用你的品牌。

### 许可证管理
将应用程序的特定版本分发到特定客户，实现精细化的版本控制。

### 容器镜像仓库
分发 OCI 兼容的制品（Docker 镜像、Helm charts、Terraform 模块），内置细粒度的访问控制和分析功能。

### 丰富的 SDK
通过官方 SDK 直接在应用代码中与 Distr 交互。目前提供 JavaScript 版本，更多语言和框架已在路线图中。

### 完全开源和自托管
整个平台完全开源，可以自行部署。

## 应用场景

- **本地部署（On-premises）**：向客户的数据中心或私有云部署软件
- **VPC 部署**：在客户的虚拟私有云中部署应用
- **BYOC 自动化**：让客户使用自己的云账户部署你的软件
- **边缘和设备群管理**：管理分布式边缘设备和节点

## 架构概览

Distr 的架构设计非常清晰：

```
┌─────────────────────────────────────┐
│     Distr SaaS or Your Cloud        │
│  ┌──────────────────────────────┐  │
│  │  Distr Hub                   │  │
│  │  PostgreSQL                  │  │
│  │  Distr OCI Registry          │  │
│  │  Object Storage              │  │
│  └──────────────────────────────┘  │
└───────────────┬─────────────────────┘
                │
        ┌───────┴────────┐
        │                │
┌───────▼────────┐  ┌────▼──────────┐
│ Customer Cloud │  │ Fully Self-   │
│  Distr Agent   │  │   Managed     │
│  Your App      │  │  OCI Client   │
└────────────────┘  └───────────────┘
```

**核心组件：**

- **Distr Hub**：控制平面核心，管理所有部署和配置
- **PostgreSQL**：存储元数据、配置和状态信息
- **Distr OCI Registry**：兼容 OCI 标准的镜像仓库
- **Object Storage**：存储制品和日志
- **Distr Agent**：运行在客户环境中的代理，负责实际部署
- **OCI Client**：用于完全自托管场景的轻量级客户端

## 快速开始

### Docker 部署

最简单的方式是使用 Docker Compose：

```bash
mkdir distr && cd distr && \
curl -fsSL https://github.com/distr-sh/distr/releases/latest/download/deploy-docker.tar.bz2 | tar -jx

# 修改 .env 文件中的必要配置
docker-compose up -d
```

### Kubernetes 部署

如果使用 Kubernetes，可以通过 Helm Chart 安装：

```bash
helm upgrade --install --wait --namespace distr --create-namespace \
  distr oci://ghcr.io/distr-sh/charts/distr \
  --set postgresql.enabled=true --set minio.enabled=true
```

部署完成后，访问 `http://localhost:8080/register` 注册第一个账户。

### 从源码构建

如果需要从源码构建，需要以下依赖：

- Node.js 22+
- Go 1.25+
- Docker（构建 Docker 镜像时）

推荐使用 mise 来管理这些工具：

```bash
# 构建控制平面
mise run build:hub

# 构建所有 Docker 镜像
mise run "docker-build:**"
```

## Distr SDK

Distr 提供了官方 JavaScript SDK，可以直接在应用代码中集成：

```bash
npm install --save @distr-sh/distr-sdk
```

通过 SDK，你可以：
- 编程方式创建和管理部署
- 集成到现有的 CI/CD 流程
- 自动化许可证分发
- 构建自定义的客户门户

## Distr MCP Server

这是一个很有意思的功能——Distr 提供了 MCP (Model Context Protocol) 服务器，可以将部署、应用、制品和许可证连接到 AI Agent 工作流，或在 LLM 客户端中与 Distr 平台交互。

配置示例（Claude Code）：

```bash
claude mcp add --transport http distr \
  https://glasskube.hyprmcp.cloud/distr/mcp \
  --header "Authorization: AccessToken distr-bc46..."
```

MCP 服务器需要通过个人访问令牌（PAT）进行认证。

## 个人见解

Distr 解决了一个很实际的问题：当你的软件需要部署到客户的环境中时，管理复杂度会呈指数级增长。

传统的解决方案通常是拼凑各种工具：
- 用 Helm 管理部署
- 用私有镜像仓库存储制品
- 用自建门户管理许可证
- 用各种脚本收集日志

Distr 将这些功能整合到一个统一的平台中，特别是对于 B2B SaaS 公司来说，可以显著降低运营成本。

**亮点：**
1. **完整的开箱即用体验**：不需要自己拼凑工具链
2. **白标支持**：客户看到的是你的品牌，不是第三方平台
3. **MCP 集成**：紧跟 AI Agent 趋势，为未来的自动化运维做准备
4. **完全开源**：可以自行部署，数据完全掌控

**适合考虑的场景：**
- 你的 B2B 产品有企业级客户要求私有部署
- 你需要支持 BYOC 模式
- 你在管理多个客户的边缘节点或设备群
- 你想构建自己的应用分发平台，但不想从零开始

## 总结

Distr 是一个值得关注的开源项目，它填补了软件分发控制平面这个细分市场的空白。如果你正在为管理客户的自托管部署而烦恼，不妨试试 Distr。

项目地址：https://github.com/distr-sh/distr

官方文档：https://distr.sh/docs/getting-started/about/
