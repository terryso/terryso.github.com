---
layout: post
title: "深度解析 Factory AI 的 Droid：AI 编程代理的安全沙箱机制"
date: 2026-03-09 19:54:23 +0800
categories: tech-translation
description: "本文深入分析 Factory AI 的 Droid AI 编程代理的安全架构，包括权限分级系统、工具访问控制、MCP 集成、企业级安全特性以及沙箱隔离建议。"
original_url: https://agent-safehouse.dev/
source: Hacker News
---

本文翻译自 [Droid (Factory CLI) -- Sandbox Analysis Report](https://agent-safehouse.dev/)，原载于 Hacker News。

## 概述

**Droid**（原名 Factory CLI）是 Factory AI 推出的闭源、模型无关的 AI 编程代理。它作为 CLI 二进制文件分发，支持两种主要运行模式：交互式全屏 TUI（`droid`）和无头非交互模式（`droid exec`），后者专门用于 CI/CD、脚本和批处理场景。

从技术栈推断，Droid 基于 **Bun**（JavaScript/TypeScript 运行时）构建，这一点从更新日志中的 `bun 1.3.3` 升级记录、Bun GC 内存泄漏修复、以及 SEA（单可执行应用）二进制发布可以推断出来。

### 支持的 LLM 后端

Droid 是模型无关的，支持多种 LLM 后端：

| 提供商 | 支持的模型 |
|--------|-----------|
| **Anthropic** | Claude Opus 4.5, Claude Opus 4.6, Sonnet 4.5, Haiku 4.5 |
| **OpenAI** | GPT-5.1, GPT-5.1-Codex, GPT-5.1-Codex-Max, GPT-5.2 |
| **Google** | Gemini 3 Pro, Gemini 3 Flash |
| **开源模型** | GLM-4.6 ("Droid Core"), GLM-4.7 |
| **BYOK** | Ollama, Groq, OpenRouter, Fireworks, DeepInfra, Baseten, HuggingFace |

### 安装方式

```bash
# macOS/Linux
curl -fsSL https://app.factory.ai/cli | sh

# Homebrew
brew install --cask droid

# npm
npm install -g droid

# Windows
irm https://app.factory.ai/cli/windows | iex
```

## 执行模式与主要命令

### 执行模式

1. **交互式 TUI (`droid`)** - 全屏终端界面，包含聊天、差异查看器、审批工作流
2. **无头模式 (`droid exec`)** - 单次执行，适合 CI/CD 和脚本
   - 支持输出格式：`text`, `json`, `stream-json`, `stream-jsonrpc`
   - 支持输入格式：`stream-json`, `stream-jsonrpc`
3. **ACP 守护模式** - 持久化后台会话（v0.56.0 新增）

### 主要命令

| 命令 | 用途 |
|------|------|
| `droid` | 启动交互式 TUI REPL |
| `droid exec "query"` | 非交互式单次执行 |
| `droid exec -f prompt.md` | 从文件执行 |
| `droid exec --list-tools` | 列出可用工具 |
| `droid mcp add <url>` | 添加 MCP 服务器 |
| `droid plugin install <name>` | 安装插件 |

### 重要 CLI 参数

| 参数 | 用途 |
|------|------|
| `--auto <level>` | 设置自主级别 |
| `--skip-permissions-unsafe` | **危险** - 绕过所有权限检查 |
| `-m, --model <name>` | 选择模型 |
| `--enabled-tools <tools>` | 强制启用特定工具 |
| `--disabled-tools <tools>` | 禁用特定工具 |

### IDE 集成

Droid 支持主流 IDE：VS Code（专用扩展）、Cursor、Windsurf、IntelliJ IDEA、PyCharm、Zed 等。

## 配置与文件系统

### 用户级配置路径

| 路径 | 用途 |
|------|------|
| `~/.factory/settings.json` | 用户级设置（模型、自主性、钩子等） |
| `~/.factory/mcp.json` | 用户级 MCP 服务器配置 |
| `~/.factory/AGENTS.md` | 个人代理指令覆盖 |
| `~/.factory/skills/<name>/SKILL.md` | 个人技能 |

### 项目级配置路径

| 路径 | 用途 |
|------|------|
| `.factory/settings.json` | 项目级设置（可提交到 git） |
| `.factory/settings.local.json` | 本地项目设置（不提交） |
| `.factory/mcp.json` | 项目级 MCP 配置 |
| `./AGENTS.md` | 项目级代理指令 |

### Claude Code 兼容性

有趣的是，Droid 明确扫描并可以导入 Claude Code 目录：

| 路径 | 用途 |
|------|------|
| `~/.claude/agents/` | 个人 Claude Code 代理（可导入为自定义 droids） |
| `~/.claude/skills/` | Claude Code 技能（可导入） |
| `CLAUDE.md` | 与 AGENTS.md 一起识别为系统提醒 |

## 工具系统

Droid 为 LLM 提供以下工具类别：

| 工具 | 用途 |
|------|------|
| `Read` / `Edit` / `Write` | 文件操作 |
| `Bash` / `Execute` | Shell 命令执行 |
| `Grep` / `Glob` / `LS` | 搜索和目录操作 |
| `WebSearch` / `WebFetch` | 网络请求 |
| `Task` | 子代理/子 droid 委托 |
| `TodoWrite` | 任务跟踪 |
| `Skill` | 技能调用 |
| MCP 工具 | 通过 `mcp__<server>__<tool>` 命名的外部工具 |

**安全限制**：只能修改项目目录及其子目录中的文件。

## 权限系统 - 自主级别（风险分级）

这是 Droid 安全模型的核心：

| 级别 | 能力 | 限制 |
|------|------|------|
| **Default**（无标志） | 只读：文件读取、git diff、ls、git status | 不能修改任何内容 |
| **Auto Low** | + 文件创建/编辑、格式化工具、白名单只读命令 | 无系统修改，无包安装 |
| **Auto Medium** | + 包安装、构建/测试、本地 git commit、npm install | 无 git push，无 sudo，无生产变更 |
| **Auto High** | + git push、部署脚本、长时间运行操作、docker、迁移 | 仍阻止破坏性模式 |
| **`--skip-permissions-unsafe`** | 所有操作无需确认 | **无护栏** - 仅用于一次性容器 |

### 命令风险分类

每个 shell 命令都按风险级别分类：

- **低风险**：只读操作（`ls`, `cat`, `git status`）
- **中风险**：工作区修改（`npm install`, `go test`, 本地 git）
- **高风险**：破坏性/安全敏感（`rm -rf`, `kubectl delete`, 生产环境 psql）

### 安全联锁（始终激活）

即使在 Auto High 级别，这些操作仍需确认：

- 危险模式：`rm -rf /`, `dd of=/dev/*`
- 命令替换：`$(...)`, 反引号
- CLI 安全检查标记的命令

### Droid Shield（密钥扫描）

**标准版（所有用户）**：

- 基于模式检测 API 密钥、令牌、密码、私钥
- 扫描 `git commit` 和 `git push` 差异（仅新增行）
- 检测到密钥时阻止 git 操作
- 默认启用（`enableDroidShield: true`）

**Shield Plus（企业版）**：

- 由 Palo Alto Networks Prisma AIRS 驱动
- AI 驱动的提示注入检测
- 高级密钥/DLP 扫描（PII、财务数据）
- 有害内容和恶意代码检测
- 在提示到达 LLM 之前进行扫描

## 扩展机制

### 钩子/生命周期系统

| 事件 | 触发时机 | 可阻止？ |
|------|----------|----------|
| `PreToolUse` | 工具执行前 | 是（退出码 2 或 JSON 拒绝） |
| `PostToolUse` | 工具完成后 | 仅反馈 |
| `UserPromptSubmit` | 提示处理前 | 是（擦除提示） |
| `Notification` | droid 发送通知时 | 否 |
| `Stop` | droid 完成响应时 | 是（强制继续） |
| `SessionStart` | 会话开始/恢复 | 上下文注入 |

钩子输入示例（通过 stdin JSON）：

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

### MCP 集成

**传输类型**：

1. **HTTP** - 远程 MCP 端点（云服务推荐）
2. **stdio** - 本地进程（直接系统访问）

配置示例：

```json
{
  "mcpServers": {
    "server-name": {
      "type": "http|stdio",
      "url": "https://...",
      "command": "npx ...",
      "args": [],
      "env": {}
    }
  }
}
```

**内置 MCP 服务器注册表包含 40+ 服务器**：Sentry、Notion、Linear、Stripe、Figma、Vercel、Netlify、PayPal、Canva、HuggingFace 等。

## 网络端点

### Factory 云端点

| 端点 | 用途 |
|------|------|
| `app.factory.ai` | 主 Web 应用、安装脚本、API 密钥 |
| `api.factory.ai` | Factory API |
| `docs.factory.ai` | 文档站点 |
| `trust.factory.ai` | 信任中心/合规文档 |

### MCP 服务器端点（内置注册表中 40+ 服务器）

| 服务器 | 端点 |
|--------|------|
| Sentry | `mcp.sentry.dev/mcp` |
| Notion | `mcp.notion.com/mcp` |
| Linear | `mcp.linear.app/mcp` |
| Stripe | `mcp.stripe.com` |
| Figma | `mcp.figma.com/mcp` |
| Vercel | `mcp.vercel.com/` |

### 代理支持

支持标准环境变量：`HTTPS_PROXY`、`HTTP_PROXY`、`NO_PROXY`、`NODE_EXTRA_CA_CERTS`

## 企业级安全控制

- SOC 2 Type II 认证
- GDPR 合规
- SAML 2.0 / OIDC SSO 与 SCIM 配置
- 基于角色的访问控制（RBAC）
- 零数据保留模式
- 客户管理加密密钥（BYOK）
- 私有云部署
- AES-256 静态加密（AWS KMS）
- TLS 1.3 传输加密

### 部署模式

1. **云管理**：Droid 在笔记本/CI 上，Factory 云用于编排
2. **混合**：Droid 在客户基础设施中，选择性 Factory 云访问
3. **完全隔离**：无互联网；模型本地部署；无 Factory 云依赖

### 策略层级

**扩展型策略模型**：较低层级无法削弱较高层级的策略

```
组织 > 项目 > 文件夹 > 用户
```

## 沙箱建议

### 代理能做什么（获得适当自主权时）

1. 读取运行用户可访问的任何文件
2. 在项目目录内写入/创建文件
3. 执行任意 shell 命令（带风险分类）
4. 安装包（`npm install`, `pip install` 等）
5. 执行 git 操作，包括 push
6. 发出 HTTP 请求（Web 搜索、URL 获取、MCP 连接）
7. 生成后台进程（实验性）
8. 通过 CDP 自动化 Chrome
9. 通过 MCP 连接到 40+ 外部服务
10. 委托给具有独立上下文窗口的子代理

### 代理不能做什么（强制执行）

1. 覆盖组织级拒绝列表或安全策略
2. 修改项目目录外的文件（文档记录的限制）
3. 执行被安全联锁阻止的命令（即使在 Auto High）
4. 在组织策略强制执行的地方禁用 Droid Shield
5. 削弱任何更高层级设置的策略

### 沙箱差距/注意事项

1. **无内置容器隔离** - 文档明确建议但不强制在容器/VM 中运行
2. **本地执行模型** - 所有 shell 命令和文件编辑以用户完整权限在本地运行
3. **`--skip-permissions-unsafe`** - 完全移除所有护栏
4. **钩子以用户凭证运行** - 钩子在用户环境中执行，具有完整访问权限
5. **MCP stdio 服务器** - 作为本地进程以用户权限运行
6. **文件内容包含在 LLM 请求中** - 选定用于上下文的代码部分发送到配置的模型提供商

### 推荐的隔离策略

Factory 明确推荐容器/VM 沙箱：

```yaml
# Docker 示例
docker run --rm -it \
  -v $(pwd):/workspace \
  --network none \
  droid-image
```

- 使用 Docker/Podman 开发容器，限制文件系统挂载和网络出口
- 仅在没有生产访问权限的容器/VM 内使用更高自主性
- 为沙箱和生产环境使用单独的凭证
- CI/CD：使用短期凭证和最小权限的临时作业

## 环境变量

| 变量 | 用途 |
|------|------|
| `FACTORY_API_KEY` | API 密钥认证 |
| `FACTORY_TOKEN` | CI/CD 令牌认证 |
| `FACTORY_PROJECT_DIR` | 项目根目录 |
| `FACTORY_LOG_FILE` | 自定义日志文件输出 |
| `FACTORY_DISABLE_KEYRING` | 禁用密钥环令牌存储 |
| `DROID_PLUGIN_ROOT` | 插件根目录 |
| `HTTPS_PROXY` / `HTTP_PROXY` | 代理配置 |

## 定价

| 计划 | 标准 Token/月 | 价格/月 |
|------|---------------|---------|
| Free | 仅 BYOK | $0 |
| Pro | 10M（+10M 奖励） | $20 |
| Max | 100M（+100M 奖励） | $200 |

超额费用：每百万标准 Token $2.70

## 总结

Droid 是一个功能强大的 AI 编程代理，其安全架构设计精良，但仍需注意：

**优点**：
- 分层权限系统（Default → Auto Low → Auto Medium → Auto High）提供了细粒度控制
- Droid Shield 密钥扫描默认启用
- 支持企业级安全特性（SSO、RBAC、私有云部署）
- 丰富的 MCP 集成生态

**注意事项**：
- 无内置 OS 级容器隔离
- 权限系统是建议性/提示性的，而非 OS 强制执行
- `--skip-permissions-unsafe` 完全移除所有保护
- MCP stdio 服务器以用户完整权限运行

对于生产环境使用，强烈建议在容器或 VM 中运行 Droid，特别是当使用较高自主级别时。

---

本文涵盖了 Droid (Factory CLI) 的主要安全特性和沙箱机制。如果你正在考虑在生产环境中使用 AI 编程代理，这份分析应该能帮助你做出更明智的决策。
