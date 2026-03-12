---
layout: post
title: "OneCLI：为 AI 智能体打造的密钥管理网关"
date: 2026-03-13 04:07:11 +0800
categories: tech-translation
description: "OneCLI 是一个开源的凭证管理网关，让你的 AI 智能体安全地访问各种服务，而无需直接暴露 API 密钥。"
original_url: https://github.com/onecli/onecli
source: Hacker News
---

本文翻译自 [OneCLI](https://github.com/onecli/onecli)，原载于 Hacker News。

## 什么是 OneCLI？

OneCLI 是一个开源网关，位于你的 AI 智能体（AI Agents）和它们调用的服务之间。与其把 API 密钥硬编码到每个智能体中，不如将凭证统一存储在 OneCLI，由网关透明地注入这些密钥。智能体永远看不到真正的密钥。

**为什么需要它？** AI 智能体需要调用大量 API，但直接给每个智能体原始凭证是一个巨大的安全风险。OneCLI 通过一个统一的网关来处理认证，让你可以在一个地方管理访问权限、轮换密钥，并监控每个智能体的行为。

**工作原理：** 你将真实的 API 凭证存储在 OneCLI 中，然后给智能体分配占位符密钥（例如 `FAKE_KEY`）。当智能体通过网关发起 HTTP 调用时，OneCLI 代理会将请求匹配到正确的凭证，将 `FAKE_KEY` 替换为 `REAL_KEY`，解密后注入到出站请求中。智能体永远接触不到真实密钥——它只需要发起普通的 HTTP 调用，代理负责完成密钥替换。

## 架构设计

OneCLI 的架构由三个核心组件构成：

- **Rust Gateway（Rust 网关）**：快速的 HTTP 网关，拦截出站请求并注入凭证。智能体通过 `Proxy-Authorization` 头使用访问令牌进行认证。
- **Web Dashboard（Web 控制面板）**：基于 Next.js 的应用，用于管理智能体、密钥和权限。提供 API 供网关解析每个请求应该注入哪些凭证。
- **Secret Store（密钥存储）**：采用 AES-256-GCM 加密的凭证存储。密钥仅在请求时解密，根据主机和路径模式匹配，由网关作为请求头注入。

## 快速开始

最快在本地运行 OneCLI 的方式（无需外部数据库或配置）：

```bash
docker run --pull always -p 10254:10254 -p 10255:10255 -v onecli-data:/app/data ghcr.io/onecli/onecli
```

打开 **http://localhost:10254**，创建一个智能体，添加你的密钥，然后将智能体的 HTTP 网关指向 `localhost:10255`。

### 使用 Docker Compose

```bash
git clone https://github.com/onecli/onecli.git
cd onecli/docker
docker compose up
```

## 核心特性

- **透明凭证注入**：智能体发起普通的 HTTP 调用，网关负责处理认证
- **加密密钥存储**：静态存储使用 AES-256-GCM 加密，仅在请求时解密
- **主机与路径匹配**：通过模式匹配将密钥路由到正确的 API 端点
- **多智能体支持**：每个智能体获得独立的访问令牌，拥有作用域权限
- **零外部依赖**：使用内嵌的 PGlite 运行（也可以自带 PostgreSQL）
- **两种认证模式**：单用户模式（无需登录）适合本地使用，或 Google OAuth 模式适合团队协作
- **Rust 网关**：快速、内存安全的 HTTP 网关，支持 HTTPS 的 MITM 拦截

## 项目结构

```
apps/
  web/            # Next.js 应用（控制面板 + API，端口 10254）
  proxy/          # Rust 网关（凭证注入，端口 10255）
packages/
  db/             # Prisma ORM + 迁移 + PGlite
  ui/             # 共享 UI 组件（shadcn/ui）
docker/
  Dockerfile      # 单容器构建（网关 + web + PGlite）
  docker-compose.yml
```

## 本地开发

### 前置要求

- **mise**（用于安装 Node.js、pnpm 和其他工具）
- **Rust**（用于编译网关）

### 配置步骤

```bash
mise install
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:init-dev
pnpm dev
```

控制面板运行在 **http://localhost:10254**，网关运行在 **http://localhost:10255**。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 以开发模式启动 web + 网关 |
| `pnpm build` | 生产环境构建 |
| `pnpm check` | 代码检查 + 类型检查 + 格式化 |
| `pnpm db:generate` | 生成 Prisma 客户端 |
| `pnpm db:migrate` | 运行数据库迁移 |
| `pnpm db:studio` | 打开 Prisma Studio |

## 配置选项

本地开发时，所有环境变量都是可选的：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接字符串 | 内嵌 PGlite |
| `NEXTAUTH_SECRET` | 启用 Google OAuth（多用户模式） | 单用户模式 |
| `GOOGLE_CLIENT_ID` | Google OAuth 客户端 ID | — |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 客户端密钥 | — |
| `SECRET_ENCRYPTION_KEY` | AES-256-GCM 加密密钥 | 自动生成 |

## 个人观点

随着 AI 智能体的广泛应用，密钥管理成为一个日益突出的问题。OneCLI 的设计理念非常务实——**将密钥与智能体解耦**。这种模式有几个明显优势：

1. **安全隔离**：即使智能体被攻击或泄露，攻击者也只能拿到占位符密钥
2. **集中管控**：所有 API 调用都经过一个网关，便于审计和监控
3. **灵活轮换**：密钥轮换不需要重新部署任何智能体

从技术选型来看，Rust 编写的网关保证了性能和安全性，Next.js 控制面板提供了良好的用户体验，而 PGlite 的引入使得本地部署极其简单。

## 总结

OneCLI 为 AI 智能体的密钥管理提供了一个优雅的解决方案。它的核心思想是：**一次存储，随处注入，智能体永不接触真实密钥**。如果你正在开发或部署 AI 智能体，并且需要调用多个外部 API，OneCLI 值得一试。

- GitHub: https://github.com/onecli/onecli
- 许可证: Apache-2.0
