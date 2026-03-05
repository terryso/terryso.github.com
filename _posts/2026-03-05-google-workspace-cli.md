---
layout: post
title: "Google Workspace CLI：为人类和 AI Agent 打造的统一命令行工具"
date: 2026-03-05 22:34:41 +0800
categories: tech-translation
description: "Google Workspace CLI（gws）是一个统一的命令行工具，支持 Drive、Gmail、Calendar、Sheets、Docs 等 Google 服务，通过 Discovery Service 动态构建，内置 40+ AI Agent 技能，同时支持 MCP 协议。"
original_url: https://github.com/googleworkspace/cli
source: Hacker News
---

本文翻译自 [Google Workspace CLI](https://github.com/googleworkspace/cli)，原载于 Hacker News。

## 一个 CLI 统领 Google Workspace

如果你曾经在终端里写过 `curl` 调用 Google API，或者为了调用不同的 Google Workspace 服务翻阅过大量文档，那么 `gws`（Google Workspace CLI）绝对值得一试。

这是一个统一入口的命令行工具——**一个命令行搞定 Drive、Gmail、Calendar、Sheets、Docs、Chat、Admin 等所有 Google Workspace API**。它的命令列表不是静态写死的，而是运行时从 Google Discovery Service 动态构建。当 Google 新增 API 端点或方法时，`gws` 会自动获取。

更重要的是，它**同时为人类和 AI Agent 设计**：零样板代码、结构化 JSON 输出、内置 40+ Agent Skills。

```bash
npm install -g @googleworkspace/cli
```

## 快速上手

```bash
# 一次性设置：创建 GCP 项目、启用 API、登录
gws auth setup

# 后续登录
gws auth login

# 列出最近 5 个文件
gws drive files list --params '{"pageSize": 5}'
```

## 为什么选择 gws？

**对于人类开发者**：告别手写 `curl` 调用。每个资源都有 `--help`，支持 `--dry-run` 预览请求，还有自动分页。

**对于 AI Agent**：所有响应都是结构化 JSON。配合内置的 Agent Skills，你的 LLM 无需额外开发工具就能管理 Google Workspace。

```bash
# 列出最近 10 个文件
gws drive files list --params '{"pageSize": 10}'

# 创建电子表格
gws sheets spreadsheets create --json '{"properties": {"title": "Q1 Budget"}}'

# 发送 Chat 消息（dry-run 模式预览）
gws chat spaces.messages create \
  --params '{"parent": "spaces/xyz"}' \
  --json '{"text": "Deploy complete."}' \
  --dry-run

# 查看任意方法的请求/响应 schema
gws schema drive.files.list

# 分页结果流式输出为 NDJSON
gws drive files list --params '{"pageSize": 100}' --page-all | jq -r '.files[].name'
```

## 灵活的认证方式

CLI 支持多种认证流程，无论是本地开发、CI 环境还是服务器部署都能胜任。

### 交互式认证（本地桌面）

凭证使用 AES-256-GCM 加密存储，密钥保存在系统 keyring 中。

```bash
gws auth setup   # 一次性设置
gws auth login   # 后续登录
```

### 多账户支持

```bash
gws auth login --account work@corp.com
gws auth login --account personal@gmail.com

gws auth list  # 列出已注册账户
gws auth default work@corp.com  # 设置默认账户

# 临时切换
gws --account personal@gmail.com drive files list
```

### 无头/CI 环境

先在有浏览器的机器上完成交互式认证，然后导出：

```bash
gws auth export --unmasked > credentials.json
```

在无头机器上：

```bash
export GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=/path/to/credentials.json
gws drive files list
```

### 服务账号（Server-to-Server）

```bash
export GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=/path/to/service-account.json
gws drive files list
```

如需域级委派（Domain-Wide Delegation）：

```bash
export GOOGLE_WORKSPACE_CLI_IMPERSONATED_USER=admin@example.com
```

## AI Agent Skills

项目自带 100+ Agent Skills（`SKILL.md` 文件）——每个支持的 API 都有对应的 Skill，还有常用工作流的高级 helper，以及 50 个精选的 Gmail、Drive、Docs、Calendar、Sheets 食谱。

```bash
# 一次性安装所有 skills
npx skills add https://github.com/googleworkspace/cli

# 或按需选择
npx skills add https://github.com/googleworkspace/cli/tree/main/skills/gws-drive
npx skills add https://github.com/googleworkspace/cli/tree/main/skills/gws-gmail
```

## MCP Server

`gws mcp` 启动一个 Model Context Protocol（MCP）服务器，将 Google Workspace API 暴露为结构化工具，任何 MCP 兼容客户端（Claude Desktop、Gemini CLI、VS Code 等）都可以调用。

```bash
gws mcp -s drive                  # 暴露 Drive 工具
gws mcp -s drive,gmail,calendar   # 暴露多个服务
gws mcp -s all                    # 暴露所有服务
```

在你的 MCP 客户端配置：

```json
{
  "mcpServers": {
    "gws": {
      "command": "gws",
      "args": ["mcp", "-s", "drive,gmail,calendar"]
    }
  }
}
```

**提示**：每个服务大约添加 10-80 个工具。保持在实际需要的范围内，以避免超出客户端的工具限制（通常是 50-100 个）。

## 高级用法

### 分页控制

| 标志 | 描述 | 默认值 |
| --- | --- | --- |
| `--page-all` | 自动分页，每页一行 JSON（NDJSON） | 关闭 |
| `--page-limit <N>` | 最大页数 | 10 |
| `--page-delay <MS>` | 页间延迟 | 100 ms |

### Google Sheets — Shell 转义

Sheets 范围使用 `!`，bash 会将其解释为历史展开。始终用**单引号**包裹值：

```bash
# 从 "Sheet1" 读取 A1:C10
gws sheets spreadsheets.values get \
  --params '{"spreadsheetId": "SPREADSHEET_ID", "range": "Sheet1!A1:C10"}'

# 追加行
gws sheets spreadsheets.values.append \
  --params '{"spreadsheetId": "ID", "range": "Sheet1!A1", "valueInputOption": "USER_ENTERED"}' \
  --json '{"values": [["Name", "Score"], ["Alice", 95]]}'
```

### Model Armor（响应净化）

集成 Google Cloud Model Armor，在 API 响应到达你的 Agent 之前扫描提示注入：

```bash
gws gmail users.messages get --params '...' \
  --sanitize "projects/P/locations/L/templates/T"
```

## 架构设计

`gws` 采用**两阶段解析**策略：

1. 读取 `argv[1]` 识别服务（如 `drive`）
2. 获取服务的 Discovery Document（缓存 24 小时）
3. 从文档的 resources 和 methods 构建 `clap::Command` 树
4. 重新解析剩余参数
5. 认证、构建 HTTP 请求、执行

所有输出——成功、错误、下载元数据——都是结构化 JSON。

## 常见问题排查

### 登录时 "Access blocked" 或 403

你的 OAuth 应用处于**测试模式**，且你的账户未列为测试用户。

**解决方法**：在 GCP 项目的 OAuth 同意屏幕 → Test users → Add users → 输入你的 Google 账户邮箱，然后重试 `gws auth login`。

### "Google hasn't verified this app"

当应用处于测试模式时这是正常的。点击 **Advanced** → **Go to <app name> (unsafe)** 继续。个人使用是安全的；只有发布给其他用户时才需要验证。

### Scope 过多 / 同意屏幕错误

未验证（测试模式）应用限制约 25 个 OAuth scope。`recommended` scope 预设包含很多 scope，会超出此限制。

**解决方法**：只选择你需要的 scope：

```bash
gws auth login --scopes drive,gmail,calendar
```

### `redirect_uri_mismatch`

OAuth 客户端不是 **Desktop app** 类型。在 Credentials 页面删除现有客户端，创建 **Desktop app** 类型的新客户端，下载新 JSON。

### API 未启用 — `accessNotConfigured`

如果 GCP 项目未启用所需的 Google API，会看到 403 错误：

```json
{
  "error": {
    "code": 403,
    "message": "Gmail API has not been used in project ...",
    "reason": "accessNotConfigured",
    "enable_url": "https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=..."
  }
}
```

**解决步骤**：
1. 点击 `enable_url` 链接
2. 在 GCP Console 中点击 **Enable**
3. 等待约 10 秒，然后重试命令

## 一些思考

这个项目的几个设计亮点值得学习：

1. **动态构建** - 不是静态枚举所有命令，而是从 Discovery Service 运行时生成，这意味着新增 API 自动支持，无需更新代码。

2. **人机两用** - 既给人类开发者用（有 help、dry-run），也给 AI Agent 用（结构化 JSON、MCP 协议），一个工具覆盖两种场景。

3. **MCP 原生支持** - Model Context Protocol 正在成为 AI Agent 工具调用的标准协议，直接内置 MCP Server 是很有前瞻性的设计。

4. **安全优先** - 凭证加密存储、支持 Model Armor 净化响应，这些安全考量对于接触敏感数据（邮件、文档）的工具至关重要。

## 小结

`gws` 是一个设计精良的 Google Workspace CLI 工具，核心特点：

- **统一入口** - 一个命令行管理所有 Google Workspace 服务
- **动态构建** - 基于 Discovery Service，自动支持新 API
- **AI 友好** - 结构化输出、100+ Agent Skills、MCP 支持
- **认证灵活** - 支持交互式、CI/CD、服务账号等多种场景
- **安全可靠** - 凭证加密、响应净化、域级委派

如果你经常需要通过命令行操作 Google Workspace，或者在构建需要集成 Google 服务的 AI Agent，`gws` 值得一试。

> 注意：这不是 Google 官方支持的产品，但仍处于活跃开发中，向 v1.0 迈进时可能会有 breaking changes。

---

*项目地址：[https://github.com/googleworkspace/cli](https://github.com/googleworkspace/cli)*
*许可：Apache-2.0*
