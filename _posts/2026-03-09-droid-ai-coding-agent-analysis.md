---
layout: post
title: "Droid AI 编程助手沙箱安全深度分析"
date: 2026-03-09 11:42:12 +0800
categories: tech-translation
description: "本文深入分析 Factory AI 的 Droid 编程助手的安全架构、权限模型和沙箱机制，帮助开发者了解 AI Agent 在生产环境中的安全边界和最佳实践。"
original_url: https://agent-safehouse.dev/
source: Hacker News
---

本文翻译自 [Droid (Factory CLI) -- Sandbox Analysis Report](https://agent-safehouse.dev/)，原载于 Hacker News。

## 引言

随着 AI 编程助手（AI Coding Agent）的快速发展，越来越多的开发者开始在日常工作中使用这类工具。然而，当 AI Agent 获得读写文件、执行命令、访问网络的权限时，安全问题就变得至关重要。本文是对 Factory AI 公司开发的 **Droid**（原名 Factory CLI）进行的安全沙箱分析报告，深入剖析其架构设计、权限模型和安全机制。

> 这是一份基于公开文档的分析报告，Droid 本身是闭源产品。分析日期为 2026-02-12，版本 v0.57.10。

## 1. 产品概述

**Droid** 是由 Factory AI 公司开发的闭源、模型无关的 AI 编程助手，以 CLI 二进制文件形式分发。它支持两种主要运行模式：

- **交互式 TUI 模式**（`droid`）：全屏终端界面，支持聊天、差异查看器和审批流程
- **无头/非交互模式**（`droid exec`）：适用于 CI/CD、脚本和批处理

### 1.1 技术架构

根据文档推断，Droid 的运行时基于 **Bun**（JavaScript/TypeScript 运行时），证据包括：
- 更新日志中提到 `bun 1.3.3` 升级
- Bun GC 内存泄漏修复
- Bun 虚拟文件系统相关内容
- SEA（单可执行应用）二进制发布

### 1.2 模型支持

Droid 支持多种 LLM 后端：

| 提供商 | 模型 |
|--------|------|
| **Anthropic** | Claude Opus 4.5/4.6, Sonnet 4.5, Haiku 4.5 |
| **OpenAI** | GPT-5.1, GPT-5.1-Codex, GPT-5.2 |
| **Google** | Gemini 3 Pro, Gemini 3 Flash |
| **开源模型** | GLM-4.6 ("Droid Core"), GLM-4.7 |
| **BYOK** | Ollama, Groq, OpenRouter, Fireworks 等 |

### 1.3 安装方式

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

## 2. 执行模式与命令

### 2.1 主要命令

| 命令 | 用途 |
|------|------|
| `droid` | 启动交互式 TUI REPL |
| `droid "query"` | 带初始提示启动 REPL |
| `droid exec "query"` | 非交互式单次执行 |
| `droid exec -f prompt.md` | 从文件执行 |
| `droid exec -s <session-id>` | 恢复已有会话 |
| `droid mcp add <name> <url>` | 添加 MCP 服务器 |
| `droid plugin install <name>` | 安装插件 |

### 2.2 关键 CLI 参数

```bash
--auto <level>              # 设置自主级别
--skip-permissions-unsafe   # 跳过所有权限检查（危险！）
-m, --model <name>          # 选择模型
-o, --output-format <fmt>   # 输出格式：text, json, stream-json
--enabled-tools <list>      # 强制启用特定工具
--disabled-tools <list>     # 禁用特定工具
```

### 2.3 交互式斜杠命令（30+ 个）

包括 `/help`、`/model`、`/mcp`、`/skills`、`/hooks`、`/status`、`/cost`、`/review` 等，覆盖账户管理、模型切换、插件管理等功能。

## 3. 认证与凭据管理

### 3.1 认证方式

1. **浏览器 OAuth 登录**（交互式）
   - 首次运行显示 URL 和认证码
   - OAuth 令牌存储在系统密钥环（带文件回退）
   - 令牌每 30 天自动轮换
   - 支持 SSO：SAML 2.0 / OIDC（Okta, Azure AD, Google Workspace）

2. **API Key 认证**（非交互式/CI/CD）
   - 在 `https://app.factory.ai/settings/api-keys` 生成
   - 密钥格式：`fk-...` 前缀
   - 通过环境变量设置：`FACTORY_API_KEY=fk-...`

3. **机器身份**
   - CI/CD 运行器的长期令牌或工作负载身份
   - 使用 `FACTORY_TOKEN` 环境变量

### 3.2 凭据存储

- OAuth 令牌存储在系统密钥环（带文件回退）
- MCP OAuth 令牌全局存储在系统密钥环（非项目级别）
- 认证写入使用原子操作防止损坏
- 可通过 `FACTORY_DISABLE_KEYRING` 禁用密钥环

## 4. 配置与文件系统

### 4.1 用户级配置路径

| 路径 | 用途 |
|------|------|
| `~/.factory/settings.json` | 用户级设置（模型、自主级别、声音、hooks 等） |
| `~/.factory/mcp.json` | 用户级 MCP 服务器配置 |
| `~/.factory/AGENTS.md` | 个人 Agent 指令覆盖 |
| `~/.factory/skills/<name>/SKILL.md` | 个人技能 |

### 4.2 项目级配置路径

| 路径 | 用途 |
|------|------|
| `.factory/settings.json` | 项目级设置（提交到 git） |
| `.factory/settings.local.json` | 本地项目设置（不提交） |
| `.factory/mcp.json` | 项目级 MCP 配置 |
| `./AGENTS.md` | 项目级 Agent 指令 |

### 4.3 Claude Code 兼容性

有趣的是，Droid 明确支持导入 Claude Code 的配置：

| 路径 | 用途 |
|------|------|
| `~/.claude/agents/` | 个人 Claude Code agents（可作为自定义 droids 导入） |
| `~/.claude/skills/` | Claude Code 技能（可导入） |
| `CLAUDE.md` | 与 AGENTS.md 一起识别为系统提醒 |

这种兼容性设计让从 Claude Code 迁移的用户能够平滑过渡。

## 5. 工具集

Agent 可访问以下工具类别：

| 工具 | 用途 |
|------|------|
| `Read` | 文件读取 |
| `Edit` | 文件编辑 |
| `Write`/`Create` | 文件写入/创建 |
| `ApplyPatch` | 应用代码补丁 |
| `Bash`/`Execute` | Shell 命令执行 |
| `Grep` | 内容搜索（使用 ripgrep） |
| `Glob` | 文件模式匹配 |
| `WebSearch` | 网络搜索 |
| `WebFetch` | URL 内容获取 |
| `Task` | 子 Agent/子 droid 委派 |
| `TodoWrite` | 任务跟踪 |
| `Skill` | 技能调用 |
| `NotebookEdit` | Jupyter notebook 编辑 |
| **MCP 工具** | 外部工具（`mcp__<server>__<tool>` 命名） |

### 关键限制

- **写入访问限制**：只能修改项目目录及子目录中的文件
- **Shell 命令**：本地执行，带风险分类
- **Git 操作**：完整支持（status、diff、commit、push，根据自主级别）
- 打包 ripgrep 二进制文件用于搜索（代码签名）
- 大于 500KB 的未保存缓冲区文件会被跳过（性能考虑）

## 6. 主机系统交互

### 6.1 Factory 云端点

| 端点 | 用途 |
|------|------|
| `app.factory.ai` | 主 Web 应用、安装脚本、API 密钥 |
| `api.factory.ai` | Factory API |
| `docs.factory.ai` | 文档站点 |
| `trust.factory.ai` | 信任中心/合规文档 |

### 6.2 LLM 提供商端点（可配置）

支持 Anthropic、OpenAI、Google、AWS Bedrock、GCP Vertex AI、Azure OpenAI、Groq、OpenRouter 等多种提供商。

### 6.3 内置 MCP 服务器注册表（40+ 服务器）

包括 Sentry、Notion、Linear、Stripe、Figma、Vercel、Netlify、PayPal、Canva、HuggingFace 等热门服务的 MCP 集成。

### 6.4 代理支持

支持标准环境变量：`HTTPS_PROXY`、`HTTP_PROXY`、`NO_PROXY`、`NODE_EXTRA_CA_CERTS`（用于自定义 CA）。

### 6.5 GitHub Actions 集成

```yaml
# 官方 Action
uses: Factory-AI/droid-action@v1

# 需要的权限
permissions:
  contents: write        # 读/写仓库文件
  pull-requests: write   # 发布审查评论
  issues: write          # 写入 issues
  id-token: write        # OIDC 认证
  actions: read          # 读取工作流信息
```

## 7. 扩展点

### 7.1 Hook/生命周期系统

#### 可用的 Hook 事件

| 事件 | 触发时机 | 可阻止？ |
|------|----------|----------|
| `PreToolUse` | 工具执行前 | 是（退出码 2 或 JSON 拒绝） |
| `PostToolUse` | 工具完成后 | 仅反馈 |
| `UserPromptSubmit` | 提示处理前 | 是（擦除提示） |
| `Notification` | Agent 发送通知时 | 否 |
| `Stop` | Agent 完成响应时 | 是（强制继续） |
| `SubagentStop` | 子 Agent 完成时 | 是（强制继续） |
| `PreCompact` | 上下文压缩前 | 否 |
| `SessionStart` | 会话开始/恢复 | 上下文注入 |
| `SessionEnd` | 会话终止 | 否（仅清理） |

#### Hook 输入（通过 stdin JSON）

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

#### Hook 执行细节

- **超时**：默认 60 秒，可按命令配置
- **并行化**：所有匹配的 hooks 并行运行
- **去重**：相同命令会被去重
- **安全性**：启动时捕获 hooks 快照；外部修改需要审查

### 7.2 插件架构

插件通过市场或直接安装管理：

```bash
droid plugin marketplace add <url>   # 添加插件市场
droid plugin install <name>          # 安装插件
```

插件结构：

| 路径 | 用途 |
|------|------|
| `<root>/.factory-plugin/plugin.json` | 插件清单 |
| `<root>/commands/` | 插件斜杠命令 |
| `<root>/skills/` | 插件技能 |
| `<root>/droids/` | 插件子 Agent 定义 |
| `<root>/hooks/hooks.json` | 插件 hook 配置 |
| `<root>/mcp.json` | 插件 MCP 配置 |

### 7.3 MCP 集成

#### 传输类型

1. **HTTP** — 远程 MCP 端点（云服务推荐）
2. **stdio** — 本地进程（直接系统访问）

#### 配置模式

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

### 7.4 自定义命令/技能/Agents

- **技能**：`~/.factory/skills/<name>/SKILL.md`（个人）和 `.factory/skills/<name>/SKILL.md`（项目）
- **自定义 Droids**：`~/.factory/droids/<name>.md`（个人）和 `.factory/droids/<name>.md`（项目）
- **`/create-skill` 命令**：交互式创建技能

## 8. 沙箱与安全模型

这是本文的核心内容，也是使用 AI Agent 时最需要关注的部分。

### 8.1 内置沙箱

> **重要**：Droid **没有内置的 OS 级容器隔离**。文档明确建议但不强制在容器/VM 中运行。Agent 本身直接在主机上运行。"仅限项目目录"的写入限制由 Agent 强制执行，而非 OS 级沙箱。

### 8.2 权限系统 — 自主级别（风险分层）

| 级别 | 能力 | 限制 |
|------|------|------|
| **默认（无参数）** | 只读：文件读取、git diff、`ls`、`git status`、环境检查 | 无修改 |
| **Auto Low** | + 文件创建/编辑、格式化工具、允许列表中的只读命令 | 无系统修改、无包安装 |
| **Auto Medium** | + 包安装、构建/测试、本地 git commit、`npm install`、`mv`、`cp` | 无 `git push`、无 `sudo`、无生产环境更改 |
| **Auto High** | + git push、部署脚本、长时间运行操作、docker、迁移 | 仍阻止破坏性模式 |
| **`--skip-permissions-unsafe`** | 所有操作无需确认 | **无护栏** — 仅用于一次性容器 |

### 8.3 命令风险分类

每个 shell 命令都按风险级别分类：

- **低风险**：只读操作（`ls`、`cat`、`git status`）
- **中风险**：工作区修改（`npm install`、`go test`、本地 git）
- **高风险**：破坏性/安全敏感（`rm -rf`、`kubectl delete`、针对生产的 `psql`）

### 8.4 安全机制

#### 安全联锁（始终激活）

即使在 Auto High 级别，这些操作仍需要确认：

- 危险模式：`rm -rf /`、`dd of=/dev/*`
- 命令替换：`$(...)`、反引号
- CLI 安全检查标记的命令

#### 命令允许列表和拒绝列表

在 `settings.json` 中配置：

```json
{
  "commandAllowlist": ["ls", "pwd", "dir"],
  "commandDenylist": ["rm -rf /", "mkfs", "shutdown"]
}
```

- 组织级别的拒绝/允许列表不能被项目或用户移除
- 同时出现在两个列表中的命令默认使用拒绝列表行为
- 仅扩展策略层次结构（只能更严格，不能更宽松）

#### Droid Shield（密钥扫描）

**标准版（所有用户）：**

- 基于模式的 API 密钥、令牌、密码、私钥检测
- 扫描 `git commit` 和 `git push` 的差异（仅新增的行）
- 检测到密钥时阻止 git 操作
- 默认启用（`enableDroidShield: true`）
- 随机性验证以减少误报

**Shield Plus（企业版）：**

- 由 Palo Alto Networks Prisma AIRS 驱动
- AI 驱动的提示注入检测
- 高级密钥/DLP 扫描（PII、财务数据）
- 有害内容和恶意代码检测
- 在提示到达 LLM 之前扫描
- 使用 AI 分析扫描 git 操作

#### 内置保护

- **写入访问限制**：只能修改项目目录及子目录中的文件
- **命令审批**：风险操作需要显式用户确认
- **提示注入检测**：分析请求中潜在的有害指令
- **网络请求控制**：Web 获取工具默认需要审批
- **输入清理**：防止命令注入攻击
- **会话隔离**：每个会话维护独立、安全的上下文

### 8.5 企业/托管安全控制

- SOC 2 Type II 认证
- GDPR 合规
- SAML 2.0 / OIDC SSO 与 SCIM 配置
- 基于角色的访问控制（RBAC）
- 零数据保留模式
- 客户管理的加密密钥（BYOK）
- 私有云部署
- AES-256 静态加密（AWS KMS）
- TLS 1.3 传输加密
- 完整的会话日志
- OpenTelemetry 指标/追踪/日志
- 分层设置（org > project > folder > user）
- 仅扩展策略模型（较低级别不能削弱较高级别的策略）
- 企业插件注册表用于集中插件控制
- 每环境最大自主级别强制执行

#### 部署模式

1. **云端托管**：Droid 在笔记本/CI 上，Factory 云端用于编排
2. **混合**：Droid 在客户基础设施中，选择性访问 Factory 云
3. **完全离线**：无互联网；模型在本地服务；不依赖 Factory 云

## 9. 环境变量

| 变量 | 用途 |
|------|------|
| `FACTORY_API_KEY` | API 密钥认证 |
| `FACTORY_TOKEN` | CI/CD 令牌认证 |
| `FACTORY_PROJECT_DIR` | 项目根目录（由 droid 为 hooks 设置） |
| `FACTORY_LOG_FILE` | 自定义日志文件输出 |
| `FACTORY_DISABLE_KEYRING` | 禁用密钥环存储令牌 |
| `DROID_PLUGIN_ROOT` | 插件根目录（用于插件 hooks） |
| `DROID_CWD` | 当前工作目录（hook 上下文） |
| `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` | 代理配置 |
| `NODE_EXTRA_CA_CERTS` | 自定义 CA 证书 |
| `GH_TOKEN` | GitHub Actions 集成的 GitHub 令牌 |

## 10. 沙箱建议

### Agent 能做什么（被授予适当自主级别时）

1. 读取运行用户可访问的任何文件
2. 在项目目录内写入/创建文件
3. 执行任意 shell 命令（带风险分类）
4. 安装包（`npm install`、`pip install` 等）
5. 执行 git 操作，包括 push
6. 发出 HTTP 请求（网络搜索、URL 获取、MCP 连接）
7. 生成后台进程（实验性）
8. 通过 CDP 自动化 Chrome
9. 通过 MCP 连接到 40+ 外部服务
10. 委派给具有独立上下文窗口的子 Agent

### Agent 不能做什么（强制执行）

1. 覆盖组织级别的拒绝列表或安全策略
2. 修改项目目录外的文件（文档限制）
3. 执行被安全联锁阻止的命令（即使在 Auto High）
4. 在组织策略强制执行时禁用 Droid Shield
5. 削弱任何在更高级别层次设置的策略

### 沙箱差距/注意事项

1. **无内置容器隔离** — 文档明确建议但不强制在容器/VM 中运行。Agent 本身直接在主机上运行。
2. **本地执行模型** — 所有 shell 命令和文件编辑以用户完整权限在本地运行。自主系统是建议/提示式的，而非 OS 强制执行。
3. **`--skip-permissions-unsafe`** — 完全移除所有护栏；文档声明仅用于"一次性容器"。
4. **Hooks 以用户凭据运行** — Hooks 在用户环境中以完整访问权限执行；恶意 hooks 可能泄露数据。
5. **MCP stdio 服务器** — 作为本地进程以用户权限运行（例如 `npx -y <package>` 可以安装和执行任意代码）。
6. **文件内容包含在 LLM 请求中** — 选中用于上下文的代码部分被发送到配置的模型提供商。
7. **BYOK 自定义模型** — 启用 BYOK 时，用户可以将流量路由到任意 HTTP 端点。
8. **无文件系统 chroot** — "仅限项目目录"限制由 Agent 强制执行，而非 OS 级沙箱。

### 推荐的隔离策略（来自企业文档）

Factory 明确推荐容器/VM 沙箱：

- Docker/Podman 开发容器，具有受限的文件系统挂载和网络出口
- 仅在无生产访问的容器/VM 中使用更高自主级别
- 为沙箱和生产环境使用分开的凭据
- CI/CD：具有短期凭据和最小权限的临时作业
- 通过 OTEL 环境标记：`environment.type=local|ci|sandbox`

## 11. 定价

| 计划 | 标准令牌/月 | 价格/月 |
|------|-------------|---------|
| Free | 仅 BYOK | $0 |
| Pro | 10M（+10M 奖励） | $20 |
| Max | 100M（+100M 奖励） | $200 |

超额：每百万标准令牌 $2.70。

## 总结

Droid 是一款功能强大且设计深思熟虑的 AI 编程助手。它的安全模型有几个值得称赞的设计：

**优点：**
- 分层自主级别设计合理，从只读到完全自动化有清晰的边界
- 内置的 Droid Shield 密钥扫描能有效防止敏感信息泄露
- 支持 Hook 系统让企业可以自定义安全策略
- 企业级安全控制完善（SSO、RBAC、审计日志等）
- 兼容 Claude Code 配置，迁移成本低

**需要注意的点：**
- **没有内置容器隔离**，Agent 直接在主机上运行
- 自主系统是"建议式"的，不是 OS 强制执行的
- `--skip-permissions-unsafe` 参数完全移除护栏，需要严格管控
- MCP stdio 服务器以用户完整权限运行
- Hooks 机制本身也需要安全审查

**最佳实践建议：**

1. **永远不要在生产环境主机上直接运行** — 使用 Docker/Podman 容器隔离
2. **为沙箱环境使用独立的凭据** — 与生产凭据完全分离
3. **审慎评估 `--skip-permissions-unsafe` 的使用场景** — 仅限一次性容器
4. **审查所有安装的插件和 MCP 服务器** — 特别是 stdio 类型的
5. **在企业环境使用组织级别的策略控制** — 防止用户绕过安全设置

随着 AI Agent 在软件开发中的应用越来越广泛，理解其安全边界至关重要。Droid 的设计提供了一个很好的参考案例，但最终的安全保障还是需要开发者和企业在部署时采取适当的隔离措施。

---

**相关链接：**
- [Droid 官网](https://factory.ai)
- [GitHub Actions 集成示例](https://github.com/Factory-AI/factory)
