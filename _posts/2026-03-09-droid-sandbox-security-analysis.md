---
layout: post
title: "深度解析 Factory Droid AI 编程助手的安全沙箱机制"
date: 2026-03-09 07:36:51 +0800
categories: tech-translation
description: "这是一篇关于 Factory AI 的 Droid 编程助手的完整安全沙箱分析报告，涵盖其权限系统、MCP 集成、企业级安全控制以及沙箱隔离策略。"
original_url: https://agent-safehouse.dev/
source: Hacker News
---

本文翻译自 [Droid (Factory CLI) -- Sandbox Analysis Report](https://agent-safehouse.dev/)，原载于 Hacker News。

## 引言

随着 AI 编程助手（AI coding agent）的普及，安全性和沙箱隔离成为了开发者关注的焦点。Factory AI 推出的 Droid 是一款闭源、模型无关的 AI 编程代理，以 CLI 工具形式分发。本文将深入分析 Droid 的安全架构、权限模型以及企业级控制机制。

## 产品概览

**Droid**（原名 Factory CLI）是一个模型无关的 AI 编程代理，支持多种 LLM 后端：

- **Anthropic**: Claude Opus 4.5/4.6, Sonnet 4.5, Haiku 4.5
- **OpenAI**: GPT-5.1, GPT-5.1-Codex, GPT-5.2
- **Google**: Gemini 3 Pro, Gemini 3 Flash
- **开源模型**: GLM-4.6, GLM-4.7
- **自定义模型（BYOK）**: Ollama, Groq, OpenRouter, Fireworks 等

Droid 运行在 **Bun** 运行时上，提供两种执行模式：

1. **交互式 TUI 模式** (`droid`)：全屏终端界面，支持聊天、diff 查看器、审批工作流
2. **无头模式** (`droid exec`)：用于 CI/CD、脚本和批处理

## 权限系统：分层自治级别

Droid 的核心安全机制是**分层自治级别（Autonomy Levels）**，这是一种风险分级的权限控制系统：

| 级别 | 能力 | 限制 |
|------|------|------|
| **Default** | 只读操作：文件读取、git diff、ls、git status | 无修改权限 |
| **Auto Low** | + 文件创建/编辑、格式化、只读命令 | 无系统修改、无包安装 |
| **Auto Medium** | + 包安装、构建/测试、本地 git commit | 无 git push、无 sudo、无生产环境修改 |
| **Auto High** | + git push、部署脚本、长时间运行操作、docker | 仍阻止破坏性模式 |
| **`--skip-permissions-unsafe`** | 所有操作无需确认 | **无任何护栏**——仅用于一次性容器 |

### 命令风险分类

每个 shell 命令都会被分类：

- **低风险**：只读操作（`ls`、`cat`、`git status`）
- **中风险**：工作区修改（`npm install`、`go test`、本地 git）
- **高风险**：破坏性/安全敏感操作（`rm -rf`、`kubectl delete`、生产数据库操作）

### 安全联锁机制

即使在 Auto High 级别，以下操作也始终需要确认：

- 危险模式：`rm -rf /`、`dd of=/dev/*`
- 命令替换：`$(...)`、反引号
- CLI 安全检查标记的命令

## Droid Shield：密钥扫描

### 标准版（所有用户）

- 基于**模式检测**识别 API keys、tokens、密码、私钥
- 扫描 `git commit` 和 `git push` 的 diff（仅新增行）
- 检测到密钥时阻止 git 操作
- 默认启用（`enableDroidShield: true`）

### Shield Plus（企业版）

- 由 **Palo Alto Networks Prisma AIRS** 驱动
- AI 驱动的**提示词注入检测**
- 高级密钥/DLP 扫描（PII、财务数据）
- 有害内容和恶意代码检测
- 在提示词到达 LLM 之前进行扫描

## 扩展点与集成

### MCP 集成

Droid 支持 **Model Context Protocol (MCP)**，内置 40+ 服务器注册表：

| 服务 | 端点 |
|------|------|
| Sentry | `mcp.sentry.dev/mcp` |
| Notion | `mcp.notion.com/mcp` |
| Linear | `mcp.linear.app/mcp` |
| Stripe | `mcp.stripe.com` |
| Figma | `mcp.figma.com/mcp` |
| Vercel | `mcp.vercel.com/` |

配置示例：

```json
{
  "mcpServers": {
    "server-name": {
      "type": "http|stdio",
      "url": "https://...",
      "headers": {},
      "command": "npx ...",
      "args": [],
      "env": {},
      "disabled": false
    }
  }
}
```

### Hook 系统

Droid 提供了强大的 Hook 系统，支持以下事件：

| 事件 | 触发时机 | 可阻止？ |
|------|----------|----------|
| `PreToolUse` | 工具执行前 | 是 |
| `PostToolUse` | 工具完成后 | 仅反馈 |
| `UserPromptSubmit` | 提示词处理前 | 是 |
| `Notification` | 通知发送时 | 否 |
| `SessionStart` | 会话开始/恢复 | 注入上下文 |

Hook 输入格式：

```json
{
  "session_id": "string",
  "transcript_path": "path/to/session.jsonl",
  "cwd": "string",
  "permission_mode": "default|plan|acceptEdits|bypassPermissions",
  "hook_event_name": "string",
  "tool_name": "string",
  "tool_input": {},
  "tool_response": {}
}
```

## 企业级安全控制

Droid 提供完整的企业级安全特性：

- **SOC 2 Type II** 认证
- **GDPR** 合规
- **SAML 2.0 / OIDC SSO** + SCIM 配置
- 基于角色的访问控制（RBAC）
- 零数据保留模式
- 客户管理的加密密钥（BYOK）
- 私有云部署
- AES-256 静态加密（AWS KMS）
- TLS 1.3 传输加密

### 分层设置模型

```
组织 > 项目 > 文件夹 > 用户
```

**关键原则**：扩展型策略模型——下层无法削弱上层策略。

## 沙箱隔离考量

### Agent 能做什么

1. 读取用户可访问的任何文件
2. 在项目目录内写入/创建文件
3. 执行任意 shell 命令（带风险分类）
4. 安装包（`npm install`、`pip install` 等）
5. 执行 git 操作，包括 push
6. 发起 HTTP 请求
7. 生成后台进程（实验性）
8. 通过 CDP 自动化 Chrome
9. 通过 MCP 连接 40+ 外部服务
10. 委派给具有独立上下文窗口的子代理

### 沙箱差距

1. **无内置容器隔离**——文档明确建议但**不强制**在容器/VM 中运行
2. **本地执行模型**——所有 shell 命令和文件编辑以用户完整权限本地运行
3. **`--skip-permissions-unsafe`**——完全移除所有护栏，仅用于"一次性容器"
4. **Hook 以用户凭据运行**——恶意 Hook 可能泄露数据
5. **MCP stdio 服务器**——以用户权限作为本地进程运行
6. **无文件系统 chroot**——"仅项目目录"限制由 Agent 强制执行，非 OS 级沙箱

### 推荐隔离策略

Factory 官方推荐：

- **Docker/Podman devcontainers**，限制文件系统挂载和网络出口
- **仅在容器/VM 内使用高自治级别**，无生产环境访问
- **分离凭据**：沙箱环境 vs 生产环境
- **CI/CD**：临时作业、短期凭据、最小权限
- **环境标记**（OTEL）：`environment.type=local|ci|sandbox`

## IDE 集成

| IDE | 集成方式 |
|-----|----------|
| VS Code | 专用扩展 |
| Cursor | 兼容 VS Code 扩展 |
| Windsurf | 兼容 VS Code 扩展 |
| IntelliJ IDEA | 插件或终端 |
| PyCharm | 插件或终端 |
| Zed | 自定义 Agent 配置 |

## GitHub Actions 集成

Droid 提供官方 GitHub Action：`Factory-AI/droid-action@v1`

触发条件：
- Issue 评论中的 `@droid` 提及
- PR review 评论
- PR reviews
- Issues

所需权限：

```yaml
permissions:
  contents: write      # 读写仓库文件
  pull-requests: write # 发布审查评论
  issues: write        # 写入 issues
  id-token: write      # OIDC 认证
  actions: read        # 读取工作流信息
```

## 定价

| 计划 | 标准 Token/月 | 价格/月 |
|------|---------------|---------|
| Free | 仅 BYOK | $0 |
| Pro | 10M (+10M 奖励) | $20 |
| Max | 100M (+100M 奖励) | $200 |

超量：每百万标准 Token $2.70

## 总结

Droid 是一款功能强大的 AI 编程助手，其安全架构设计体现了以下特点：

1. **分层权限模型**：通过 Autonomy Levels 实现风险分级控制
2. **多层防护**：从命令分类到密钥扫描再到 Hook 系统
3. **企业就绪**：完整的 SSO、RBAC、审计日志支持
4. **但非绝对安全**：依赖用户自觉遵守最佳实践，无 OS 级沙箱

**关键建议**：在生产环境中使用时，务必在隔离的容器/VM 中运行 Droid，并严格限制自治级别。`--skip-permissions-unsafe` 仅应在完全一次性环境中使用。

对于关注安全的团队来说，Droid 提供了相当完善的控制机制，但最终的安全性仍取决于部署策略和操作规范。正如文档所言，"扩展型策略模型"确保了下层无法削弱上层的安全策略，这是企业级工具的重要特性。
