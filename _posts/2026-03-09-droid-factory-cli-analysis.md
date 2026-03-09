---
layout: post
title: "Droid (Factory CLI) 沙盒分析报告：闭源 AI 编程 Agent 深度解析"
date: 2026-03-09 23:01:08 +0800
categories: tech-translation
description: "本文深入分析 Factory AI 的 Droid（原 Factory CLI）AI 编程代理，涵盖其架构设计、安全模型、权限系统、MCP 集成能力及企业级部署方案。"
original_url: https://agent-safehouse.dev/
source: Hacker News
---

本文翻译自 [Droid (Factory CLI) -- Sandbox Analysis Report](https://agent-safehouse.dev/)，原载于 Hacker News。

## 前言

在 AI 编程代理领域，Claude Code 和 Cursor 等产品已经广为人知。今天我们要深入分析另一个重要玩家——Factory AI 推出的 **Droid**（原名 Factory CLI）。这是一款闭源、模型无关的 AI 编程代理，具有独特的架构设计和安全机制。

这份沙盒分析报告来自 Agent Safehouse 项目，该项目专门对各类 AI 代理进行安全性和行为分析。报告详细揭示了 Droid 的内部工作原理、文件系统访问模式、网络端点、权限模型等关键信息。

## 1. 产品概述

**Droid** 是 Factory AI（factory.ai）推出的闭源 AI 编程代理，采用 CLI 二进制文件分发。它支持两种主要运行模式：

1. **交互式 TUI 模式**：全屏终端界面，包含聊天、差异查看器和审批工作流
2. **Headless 模式（`droid exec`）**：非交互式单次执行，适用于 CI/CD、脚本和批处理

### 技术架构

根据文档推断，Droid 基于 **Bun** 运行时构建（JavaScript/TypeScript），证据包括：
- Changelog 中提到 `bun 1.3.3` 升级
- Bun GC 内存泄漏修复提示
- Bun 虚拟文件系统路径提取
- SEA（Single Executable Application）二进制发布

### 模型支持

Droid 采用模型无关设计，支持多种 LLM 后端：

| 提供商 | 模型 |
|--------|------|
| Anthropic | Claude Opus 4.5, Opus 4.6, Sonnet 4.5, Haiku 4.5 |
| OpenAI | GPT-5.1, GPT-5.1-Codex, GPT-5.1-Codex-Max, GPT-5.2 |
| Google | Gemini 3 Pro, Gemini 3 Flash |
| 开源模型 | GLM-4.6 ("Droid Core"), GLM-4.7 |
| BYOK | Ollama, Groq, OpenRouter, Fireworks, DeepInfra, Baseten, HuggingFace |

### 安装方式

```bash
# macOS/Linux 安装脚本
curl -fsSL https://app.factory.ai/cli | sh

# Homebrew
brew install --cask droid

# npm
npm install -g droid

# Windows
irm https://app.factory.ai/cli/windows | iex
```

## 2. 命令体系

Droid 提供了丰富的命令行界面：

### 主要命令

| 命令 | 用途 |
|------|------|
| `droid` | 启动交互式 TUI REPL |
| `droid "query"` | 带初始提示启动 REPL |
| `droid exec "query"` | 非交互式单次执行 |
| `droid exec -f prompt.md` | 从文件执行 |
| `droid mcp add <server>` | 添加 MCP 服务器 |
| `droid plugin install <name>` | 安装插件 |
| `droid update` | 手动更新 CLI |

### 关键 CLI 参数

```bash
--auto <level>           # 设置自主级别
--skip-permissions-unsafe # 跳过所有权限检查（危险！）
-m, --model <model>      # 选择模型
-r, --reasoning-effort   # 设置推理努力程度
--use-spec               # 启动规格模式
-o, --output-format      # 输出格式：text, json, stream-json, stream-jsonrpc
--enabled-tools          # 强制启用特定工具
--disabled-tools         # 禁用特定工具
```

### 交互式斜杠命令（30+）

Droid 提供了丰富的交互命令：`/account`, `/billing`, `/bug`, `/clear`, `/compress`, `/cost`, `/create-skill`, `/droids`, `/fork`, `/help`, `/hooks`, `/login`, `/mcp`, `/model`, `/plugins`, `/review`, `/rewind-conversation`, `/sessions`, `/skills`, `/status` 等。

## 3. 文件系统访问模式

这是理解 AI 代理安全性的关键部分。Droid 访问的文件路径分为用户级、项目级和系统级：

### 用户级配置路径

| 路径 | 用途 |
|------|------|
| `~/.factory/settings.json` | 用户级设置（模型、自主性、声音、钩子等） |
| `~/.factory/mcp.json` | 用户级 MCP 服务器配置 |
| `~/.factory/AGENTS.md` | 个人代理指令覆盖 |
| `~/.factory/skills/<name>/SKILL.md` | 个人技能 |
| `~/.factory/droids/<name>.md` | 个人自定义子代理定义 |

### 项目级配置路径

| 路径 | 用途 |
|------|------|
| `.factory/settings.json` | 项目级设置（可提交到 git） |
| `.factory/settings.local.json` | 本地项目设置（不提交） |
| `.factory/mcp.json` | 项目级 MCP 服务器配置 |
| `./AGENTS.md` | 项目级代理指令 |
| `.factory/skills/<name>/SKILL.md` | 项目技能 |

### Claude Code 兼容性

有趣的是，Droid 明确支持导入 Claude Code 的配置：

| 路径 | 用途 |
|------|------|
| `~/.claude/agents/` | Claude Code 代理（可导入为自定义 droids） |
| `~/.claude/skills/` | Claude Code 技能（可导入） |
| `CLAUDE.md` | 与 AGENTS.md 一起识别 |

这种兼容性设计让 Claude Code 用户可以平滑迁移。

## 4. 权限与安全模型

这是报告中最关键的部分。Droid 实现了分层权限系统：

### 自主级别（Autonomy Levels）

| 级别 | 能力 | 限制 |
|------|------|------|
| **Default** | 只读：文件读取、git diff、ls、git status、环境检查 | 无修改权限 |
| **Auto Low** | + 文件创建/编辑、格式化、白名单只读命令 | 无系统修改、无包安装 |
| **Auto Medium** | + 包安装、构建/测试、本地 git commit | 无 git push、无 sudo、无生产环境变更 |
| **Auto High** | + git push、部署脚本、长时间运行操作、docker | 仍阻止破坏性模式 |
| **`--skip-permissions-unsafe`** | 所有操作无需确认 | **无护栏**——仅用于一次性容器 |

### 命令风险分类

每个 shell 命令都被分类：

- **低风险**：只读操作（`ls`, `cat`, `git status`）
- **中风险**：工作区修改（`npm install`, `go test`, 本地 git）
- **高风险**：破坏性/安全敏感（`rm -rf`, `kubectl delete`, 生产环境 psql）

### 安全机制

#### Droid Shield（密钥扫描）

**标准版（所有用户）：**
- 基于模式的 API 密钥、令牌、密码、私钥检测
- 扫描 `git commit` 和 `git push` 的差异（仅新增行）
- 检测到密钥时阻止 git 操作
- 默认启用（`enableDroidShield: true`）

**Shield Plus（企业版）：**
- 由 Palo Alto Networks Prisma AIRS 驱动
- AI 驱动的提示注入检测
- 高级密钥/DLP 扫描（PII、金融数据）
- 有害内容和恶意代码检测

#### 始终生效的安全联锁

即使在 Auto High 级别，以下操作仍需确认：
- 危险模式：`rm -rf /`, `dd of=/dev/*`
- 命令替换：`$(...)`, 反引号
- CLI 安全检查标记的命令

## 5. Hook 与生命周期系统

Droid 提供了强大的 Hook 系统用于扩展和自定义安全控制：

### 可用的 Hook 事件

| 事件 | 触发时机 | 可阻止？ |
|------|----------|----------|
| `PreToolUse` | 工具执行前 | 是（exit code 2 或 JSON deny） |
| `PostToolUse` | 工具完成后 | 仅反馈 |
| `UserPromptSubmit` | 提示处理前 | 是（擦除提示） |
| `Notification` | 发送通知时 | 否 |
| `Stop` | 响应完成时 | 是（强制继续） |
| `SubagentStop` | 子代理完成时 | 是（强制继续） |
| `SessionStart` | 会话开始/恢复 | 上下文注入 |
| `SessionEnd` | 会话终止 | 否（仅清理） |

### Hook 输入格式（stdin JSON）

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

这为企业提供了强大的可编程安全执行点，可以在文件读写前阻止敏感文件访问，或在 git 操作前阻止未授权推送。

## 6. MCP 集成

Droid 支持 Model Context Protocol（MCP），提供与 40+ 外部服务的集成能力：

### 传输类型

1. **HTTP**：远程 MCP 端点（推荐用于云服务）
2. **stdio**：本地进程（用于直接系统访问）

### 配置模式

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

### 内置 MCP 服务器（部分列表）

| 服务 | 端点 |
|------|------|
| Sentry | `mcp.sentry.dev/mcp` |
| Notion | `mcp.notion.com/mcp` |
| Linear | `mcp.linear.app/mcp` |
| Stripe | `mcp.stripe.com` |
| Figma | `mcp.figma.com/mcp` |
| Vercel | `mcp.vercel.com/` |

## 7. 企业级安全控制

Droid 提供了完整的企业级安全功能：

### 合规认证

- SOC 2 Type II 认证
- GDPR 合规
- SAML 2.0 / OIDC SSO 与 SCIM 配置
- 基于角色的访问控制（RBAC）
- 零数据保留模式
- 客户管理的加密密钥（BYOK）
- 私有云部署

### 部署模式

1. **云端管理**：Droid 在笔记本/CI 上运行，Factory 云负责编排
2. **混合模式**：Droid 在客户基础设施中运行，选择性访问 Factory 云
3. **完全隔离**：无互联网；模型本地部署；无 Factory 云依赖

### 分层设置模型

层级关系：**组织 > 项目 > 文件夹 > 用户**

关键原则：
- 扩展式策略模型（下层只能更严格，不能更宽松）
- 组织级拒绝/允许列表不能被项目或用户移除
- 企业插件注册表用于集中插件控制

## 8. 沙盒安全注意事项

报告指出了几个重要的安全考量：

### Agent 可以做的事（获得适当授权时）

1. 读取运行用户可访问的任何文件
2. 在项目目录内写入/创建文件
3. 执行任意 shell 命令（有风险分类）
4. 安装包（`npm install`, `pip install` 等）
5. 执行包括 push 在内的 git 操作
6. 发起 HTTP 请求
7. 生成后台进程（实验性）
8. 通过 CDP 自动化 Chrome
9. 通过 MCP 连接 40+ 外部服务
10. 委托给具有独立上下文窗口的子代理

### 沙盒缺口/注意事项

1. **无内置容器隔离**——文档明确建议但不强制在容器/VM 中运行
2. **本地执行模型**——所有 shell 命令和文件编辑以用户完整权限本地运行
3. **`--skip-permissions-unsafe`**——完全移除所有护栏
4. **Hook 以用户凭据运行**——恶意 hook 可能泄露数据
5. **MCP stdio 服务器**——以用户权限作为本地进程运行
6. **无文件系统 chroot**——"仅项目目录"限制由代理执行，非 OS 级沙盒

### 推荐的隔离策略

Factory 明确推荐容器/VM 沙盒：
- 使用 Docker/Podman devcontainers，限制文件系统挂载和网络出站
- 仅在无生产访问的容器/VM 中使用更高自主性
- 为沙盒和生产环境使用独立凭据
- CI/CD：使用短期凭据和最小权限的临时作业

## 9. 定价

| 计划 | 标准 Token/月 | 价格/月 |
|------|---------------|---------|
| Free | 仅 BYOK | $0 |
| Pro | 10M（+10M 奖励） | $20 |
| Max | 100M（+100M 奖励） | $200 |

超出部分：$2.70/百万标准 Token

## 个人见解

这份分析报告揭示了 AI 编程代理领域的几个重要趋势：

**1. 安全模型成熟度**：Droid 的分层权限系统和 Droid Shield 展示了 AI 代理安全性的最佳实践。特别是"扩展式策略模型"的设计——下层只能更严格——这在企业环境中至关重要。

**2. 生态系统兼容性**：Droid 主动支持导入 Claude Code 配置，这种兼容性策略有助于降低用户迁移成本，也反映出 AI 编程工具市场的竞争态势。

**3. MCP 标准化**：对 Model Context Protocol 的全面支持表明，AI 代理正在从封闭系统向开放生态演进。40+ 内置 MCP 服务器覆盖了从 Sentry 到 Stripe 的各种开发工具。

**4. 闭源与透明度权衡**：作为闭源产品，Droid 的安全分析完全依赖公开文档。这与开源方案形成对比——开源允许直接代码审计，但闭源产品可能在文档和安全设计上有更多投入。

**5. 本地执行风险**：报告指出的"无 OS 级沙盒"是许多 AI 代理的共同特点。开发者需要意识到，权限系统是建议性的，不是强制性的——在生产环境中使用时应遵循最小权限原则。

## 关键要点

1. **Droid 是基于 Bun 的闭源 AI 编程代理**，支持多种 LLM 后端
2. **分层权限系统**（Default → Auto Low → Auto Medium → Auto High）提供细粒度控制
3. **Droid Shield** 提供密钥扫描，企业版支持 AI 驱动的提示注入检测
4. **Hook 系统**允许自定义安全扩展和可编程执行点
5. **MCP 集成**支持 40+ 外部服务，扩展性强
6. **企业级功能**包括 SSO、RBAC、零数据保留、私有云部署
7. **安全建议**：在容器/VM 中运行，使用分离凭据，遵循最小权限原则

---

*本文翻译自 Agent Safehouse 的公开分析报告，旨在帮助中文开发者了解 AI 编程代理的安全设计。如需了解完整细节，请访问[原文](https://agent-safehouse.dev/)。*
