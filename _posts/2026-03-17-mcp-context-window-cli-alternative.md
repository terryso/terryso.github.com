---
layout: post
title: "MCP Server 正在吞噬你的上下文窗口，CLI 是更简单的替代方案"
date: 2026-03-17 03:35:51 +0800
categories: tech-translation
description: "本文探讨 MCP Server 在实际使用中面临的上下文窗口膨胀问题，分析三种主流解决方案的利弊，并提出 CLI 作为 Agent 接口的实用优势。"
original_url: https://www.apideck.com/blog/mcp-server-eating-context-window-cli-alternative
source: Hacker News
---

本文翻译自 [Your MCP Server Is Eating Your Context Window. There's a Simpler Way](https://www.apideck.com/blog/mcp-server-eating-context-window-cli-alternative)，原载于 Hacker News。

---

## Demo 规模下没人谈论的问题

如果你曾为非演示场景配置过 MCP Server，这个场景一定很熟悉：

你连接了 GitHub、Slack 和 Sentry。三个服务，大概 40 个工具。在你的 Agent 还没读取任何用户消息之前，55,000 个 token 的工具定义就已经占据了上下文窗口。这已经超过了 Claude 200k 限制的四分之一。就这样没了。

更糟的是。每个 MCP 工具仅名称、描述、JSON Schema、字段描述、枚举值和系统指令就需要 550-1,400 个 token。连接一个真正的 API 接口（比如一个拥有 50+ 端点的 SaaS 平台），你将面临 50,000+ 个 token 仅仅用来描述 Agent「可以做什么」，几乎没有空间留给它「应该做什么」。

有一个团队报告称，三个 MCP Server 消耗了 200,000 token 中的 143,000 个。也就是说 72% 的上下文窗口被工具定义烧掉了。Agent 只剩下 57,000 个 token 用于实际的对话、检索文档、推理和响应。在这种空间里构建有用的东西？祝你好运。

这不是理论上的担忧。David Zhang（@dzhng）在开发 Duet 时描述了他完全移除 MCP 集成的经历，即使在搞定 OAuth 和动态客户端注册之后。这个权衡是不可能的：

- **预先加载所有内容** → 失去用于推理和历史的可用内存
- **限制集成数量** → Agent 只能与少数服务交互
- **构建动态工具加载** → 增加延迟和中间件复杂性

他称之为「三难困境（trilemma）」。这个描述很准确。

在受控测试中，这些数据得到了验证。Scalekit 最近进行的一项基准测试运行了 75 次直接对比（相同模型 Claude Sonnet 4、相同任务、相同提示词），发现 MCP 在相同操作中消耗的 token 是 CLI 的 **4 到 32 倍**。他们最简单的任务——检查仓库的语言——通过 CLI 消耗 1,365 个 token，而通过 MCP 消耗 44,026 个。开销几乎完全来自 Schema：每次对话都注入 43 个工具定义，而 Agent 只使用其中一两个。

## 解决同一问题的三种方案

业界对这个上下文膨胀问题正在形成三种应对策略。每种都有其适用场景。

### MCP + 压缩技巧

第一种方案是保留 MCP 但对抗膨胀。团队压缩 Schema、使用工具搜索按需加载定义，或构建中间件将 OpenAPI 规范切成更小的块。

这对小型、定义良好的交互很有效，比如查询 issue、创建工单或获取文档。当你有一组 Agent 频繁使用的紧密操作集时，MCP 的结构化工具调用和类型化 Schema 确实很有用。

但这增加了基础设施。你需要工具注册表、搜索逻辑、缓存和路由。你本质上是在构建一个管理服务的服务。而且每次 Agent 决定需要新能力时，你仍然要支付按工具计算的 token 成本。

### 代码执行（Duet 的方案）

Duet 的答案是将 Agent 视为拥有持久工作空间的开发者。当 Agent 需要新的集成时，它会阅读 API 文档、针对 SDK 编写代码、运行它，并保存脚本供复用。

这对于跨会话维护状态的长期工作空间 Agent 以及需要复杂工作流（循环、条件、轮询、批处理操作）的场景非常强大。那些作为单独工具调用表达起来很别扭的事情，在代码中变得自然。

缺点是：你的 Agent 现在正在针对生产 API 编写和执行任意代码。安全边界非常庞大。你需要沙箱、审查机制，以及对 Agent 判断力的高度信任。

### CLI 作为 Agent 接口

第三种方案是我们采用的。与其将 Schema 加载到上下文窗口或让 Agent 编写集成代码，不如给它一个 CLI。

设计良好的 CLI 天然就是一个渐进式信息披露系统。当人类开发者需要使用一个之前没接触过的工具时，他们不会阅读整个 API 参考文档。他们运行 `tool --help`，找到需要的子命令，运行 `tool subcommand --help`，获取该操作的具体标志。他们付出的注意力成本与实际需求成正比。

Agent 可以做完全相同的事情。而且 token 经济效益截然不同。

## 为什么 CLI 是务实的最佳选择

### 渐进式信息披露节省 Token

这是 Apideck CLI Agent 提示词的样子。这就是 AI Agent 在系统提示词中需要的全部内容：

```
Use `apideck` to interact with the Apideck Unified API.
Available APIs: `apideck --list`
List resources: `apideck <api> --list`
Operation help: `apideck <api> <resource> <operation> --help`
APIs: accounting, ats, crm, ecommerce, hris, ...
Auth is pre-configured. GET auto-approved. POST/PUT/PATCH prompt (use --yes). DELETE blocked (use --force).
Use --service-id <id> to target a specific integration.
For clean output: -q -o json
```

大约 80 个 token。与替代方案对比：

| 方案 | Token 消耗 | 时机 |
|------|-----------|------|
| 完整 OpenAPI 规范加载到上下文 | 30,000–100,000+ | 第一条消息之前 |
| MCP 工具（每个 API 约 3,600 token） | 10,000–50,000+ | 第一条消息之前 |
| CLI Agent 提示词 | ~80 | 第一条消息之前 |
| CLI `--help` 调用 | ~50–200 | 仅在需要时 |

Agent 以 80 个 token 的指导开始，按需发现能力：

```bash
# Level 1: 有哪些 API 可用？（输出约 20 token）
$ apideck --list
accounting ats connector crm ecommerce hris ...

# Level 2: accounting API 能做什么？（输出约 200 token）
$ apideck accounting --list
Resources in accounting API:
invoices
  list    GET /accounting/invoices
  get     GET /accounting/invoices/{id}
  create  POST /accounting/invoices
  delete  DELETE /accounting/invoices/{id}
customers
  list    GET /accounting/customers
  ...

# Level 3: 如何创建发票？（输出约 150 token）
$ apideck accounting invoices create --help
Usage: apideck accounting invoices create [flags]

Flags:
  --data string        JSON request body (or @file.json)
  --service-id string  Target a specific connector
  --yes                Skip write confirmation
  -o, --output string  Output format (json|table|yaml|csv)
  ...
```

每步成本 50-200 个 token，仅在 Agent 决定需要该信息时加载。处理会计查询的 Agent 可能总共消耗 400 个 token，分布在三次 `--help` 调用中。同样的功能通过 MCP 需要 10,000+ 个 token 预先加载，无论 Agent 是否使用。

这与 Claude Agent Skills 的工作方式类似。先提供元数据，选中时才显示完整详情，需要时才展示参考材料。CLI 通过不同的机制做着同样的事情。

Scalekit 的基准测试独立验证了这一模式。他们发现，即使是一个最小的约 800 token 的「技能文件」（包含 CLI 技巧和常见工作流的文档），与裸 CLI 相比也能减少三分之一的工具调用和三分之一的延迟。我们的方法更进一步：约 80 token 的 Agent 提示词以十分之一的成本提供相同的渐进式发现。原理相同。关于如何导航工具的小型预先提示，比数千 token 的详尽 Schema 更有价值。

### 可靠性：本地胜过远程

MCP 问题有一个维度没有得到足够关注：**可用性**。

Scalekit 的基准测试记录了对 GitHub Copilot Server 的 MCP 调用有 **28% 的失败率**。在 25 次运行中，7 次因 TCP 级别的连接超时而失败。远程服务器根本没有及时响应。不是协议错误，不是错误的工具调用。连接根本没完成。

CLI Agent 没有这种失败模式。二进制文件在本地运行。没有会超时的远程服务器，没有会耗尽的连接池，没有会宕机的中介。当你的 Agent 运行 `apideck accounting invoices list` 时，它直接向 Apideck API 发出 HTTPS 调用。一跳，不是两跳。

这在规模上很重要。在每月 10,000 次操作的规模下，28% 的失败率意味着大约 2,800 次重试，每次都消耗额外的 token 和延迟。Scalekit 估计每月成本差异为 **CLI 3.20 美元 vs 直接 MCP 55.20 美元**，17 倍的成本乘数，还有可靠性税。

远程 MCP Server 会改进。连接池、更好的基础设施和网关层将缩小差距。但「二进制文件在你机器上」是一个可靠性保证，服务器端再多的基础设施工程也无法匹配。

### 结构化安全胜过基于提示词的安全

在系统提示词中告诉 Agent「永远不要删除生产数据」，就像在核发射按钮上贴便利贴。可能有用。大概吧。直到一个创造性的提示注入把便利贴撕掉。

对 CI/CD 中 AI Agent 的安全研究表明，提示注入可以操纵拥有高权限 Token 的 Agent 泄露机密或修改基础设施。模式总是相同的：不受信任的输入被注入到提示词中，Agent 拥有广泛的工具访问权限，然后坏事发生。

Apideck CLI 采用结构化方法。权限分类基于 HTTP 方法内置到二进制文件中：

```go
// From internal/permission/engine.go
switch op.Permission {
case spec.PermissionRead:
    return ActionAllow     // GET → 自动批准
case spec.PermissionWrite:
    return ActionPrompt    // POST/PUT/PATCH → 需要确认
case spec.PermissionDangerous:
    return ActionBlock     // DELETE → 默认阻止
}
```

没有任何提示词可以覆盖这个。`DELETE` 操作被阻止，除非调用者显式传递 `--force`。`POST` 需要 `--yes` 或交互式确认。`GET` 操作自由运行，因为它们不能修改状态。

Agent 框架强化了这一点。Claude Code、Cursor 和 GitHub Copilot 都有权限系统来控制 shell 命令执行。所以你获得两层结构化安全：Agent 框架问「我应该运行这个命令吗？」，CLI 本身执行「这个操作被允许吗？」

你还可以按操作自定义策略：

```yaml
# ~/.apideck-cli/permissions.yaml
defaults:
  read: allow
  write: prompt
  dangerous: block

overrides:
  accounting.payments.create: block   # 支付敏感
  crm.contacts.delete: prompt         # 联系人可以软删除
```

这与 Duda 阻止破坏性 MCP 操作的原则相同，但在二进制文件中结构化执行，而不是通过与其他内容竞争上下文窗口的提示指令。

### 通用兼容性，零协议开销

每个严肃的 Agent 框架都将「运行 shell 命令」作为原语。Claude Code 有 `Bash`。Cursor 有终端访问。GitHub Copilot SDK 暴露 shell 执行。Gemini CLI 原生运行命令。

MCP 需要专门的客户端支持、连接管道和服务器生命周期管理。CLI 只需要 PATH 上有一个二进制文件。

这比听起来更重要。当你构建需要与 API 交互的 Agent 时，CLI 的集成路径是：

1. 安装二进制文件
2. 设置环境变量用于认证
3. 在系统提示词中添加约 80 个 token
4. 完成

MCP 的集成路径是：

1. 实现或配置 MCP 客户端
2. 设置服务器连接（传输、认证、生命周期）
3. 处理工具注册和 Schema 加载
4. 管理连接状态和重连
5. 处理工具定义的 token 预算

CLI 方案还意味着你的 Agent 集成不会锁定到任何特定框架。同一个 `apideck` 二进制文件可以从 Claude Code、Cursor、自定义 Python Agent、bash 脚本或 CI/CD 管道中使用。

## 我们是如何构建的

Apideck CLI 是一个单一的静态二进制文件，在启动时解析我们的 OpenAPI 规范并动态生成整个命令树。

**OpenAPI 原生，无代码生成。** 二进制文件嵌入最新的 Apideck Unified API 规范。启动时，它用 libopenapi 解析规范，为每个 API 组、资源和操作构建命令。当 API 添加新端点时，`apideck sync` 拉取最新规范。无需 SDK 重新生成，无需版本升级。

**智能输出默认值。** 在终端运行时，输出默认为带颜色的格式化表格。当管道传输或从非 TTY 调用时（这是 Agent 调用它的方式），输出默认为 JSON。Agent 无需记住 `--output json` 就能获得机器可解析的输出。

```bash
# Agent 调用此命令（非 TTY）→ 自动获得 JSON
$ apideck accounting invoices list -q
[{"id": "inv_12345", "number": "INV-001", "total": 1500.00, ...}]

# 人类在终端运行相同命令 → 获得表格
$ apideck accounting invoices list
┌──────────┬─────────┬──────────┐
│ ID       │ Number  │ Total    │
├──────────┼─────────┼──────────┤
│ inv_12345│ INV-001 │ 1,500.00 │
└──────────┴─────────┴──────────┘
```

**认证透明。** 凭证从环境变量（`APIDECK_API_KEY`、`APIDECK_APP_ID`、`APIDECK_CONSUMER_ID`）或配置文件解析，并自动注入每个请求。Agent 永远不处理 Token，永远看不到认证头，永远不需要管理会话。

**连接器定向。** `--service-id` 标志让 Agent 定向特定集成。`apideck accounting invoices list --service-id quickbooks` 访问 QuickBooks。换成 `--service-id xero`，同样命令访问 Xero。相同接口，不同后端。这就是统一 API 发挥作用的地方。

## CLI 不适用的情况

CLI 并非普遍更好。以下是其他方案仍然胜出的场景。

**MCP 更适合紧密范围、高频使用的工具。** 如果你的 Agent 每个会话数百次调用相同的 5-10 个工具，预先的 Schema 成本摊销效果很好。只查询工单、更新状态和发送回复的客户支持 Agent 不需要渐进式信息披露。它需要那些工具立即可用。

**代码执行更适合复杂的有状态工作流。** 如果你的 Agent 需要每 30 秒轮询一次 API、跨分页端点聚合结果，或编排带回滚逻辑的多步事务，编写代码比链接 CLI 调用更自然。Duet 的方案对于本质上是自主开发者的 Agent 很有意义。

**当你的 Agent 代表其他人的用户行动时，MCP 更好。** 这是大多数 CLI vs MCP 比较中忽略的维度，值得直接讨论。当你的 Agent 自动化你自己的工作流时，环境凭证没问题。你是用户，唯一承担风险的人是你自己。但如果你在构建 B2B 产品，Agent 代表你的客户的员工行动，跨越客户控制的组织，身份问题变成三层：哪个 Agent 在调用、哪个用户授权了它、哪个租户的数据边界适用。按用户 OAuth 配合范围访问、同意流程和结构化审计跟踪是该边界的真正要求，原始 CLI 认证（`gh auth login`、环境变量）没有被设计来解决这些问题。无论效率成本如何，MCP 的授权模型原生地解决了这个问题。

话虽如此，对于统一 API 架构，差距比看起来要小。Apideck 已经通过 Vault 集中认证：凭证按消费者、按连接管理，并按服务限定范围。`--service-id` 标志定向特定消费者保险库中的特定集成。结构化权限系统在二进制文件中强制执行读/写/删除边界。缺少的是按用户 OAuth 同意流程和租户范围审计跟踪——真正的差距，但位于平台层而非 Agent 接口层。CLI 可以是接口而后端处理委托授权。这些不是互斥的。

值得注意的是，MCP 的认证故事不如看起来那么成熟。正如 Speakeasy 的 MCP OAuth 指南所阐明，面向用户的 OAuth 交换实际上不是 MCP 规范要求的。直接传递访问 Token 或 API 密钥完全有效。真正的复杂性在于 MCP 客户端需要动态处理 OAuth 流程时，这需要动态客户端注册（DCR），这是大多数 API 提供商今天不支持的能力。像 Stripe 和 Asana 这样的公司已经开始添加 DCR 以适应 MCP，但它仍然是高摩擦的集成。MCP 相对 CLI 的认证优势在理论上是真实的，但在实践中，生态系统仍在追赶规范。

**CLI 在流式和双向通信方面较弱。** CLI 调用是请求-响应模式。如果你需要服务器发送事件、WebSocket 流或长连接，你需要能保持连接开放的 SDK 或 MCP Server。

**分发有摩擦。** MCP Server 理论上可以存在于 URL 之后。CLI 需要每个平台一个二进制文件、更新和 PATH 管理。对于 Apideck CLI，我们发布一个随处运行无依赖的静态 Go 二进制文件，但它仍然是一个你需要安装的二进制文件。

诚实的框架：MCP、代码执行和 CLI 是互补的工具。错误在于把 MCP 当作通用答案，而实际上对于许多集成模式，CLI 以两个数量级更低的上下文开销完成工作。

## 这对 API 提供商意味着什么

如果你在 2026 年构建开发者工具，AI Agent 正在成为你 API 接口的主要消费者。不是唯一消费者（人类开发者仍然重要），而是快速增长的那一类。

几件事值得考虑：

**你的 OpenAPI 规范对上下文窗口来说太大了。** 如果你有 50+ 个端点，将规范转换为 MCP 工具将烧掉大多数 Agent 交互的预算。思考最小入口点应该是什么样子。

**渐进式信息披露不再只是 UX 模式。** 它是 token 优化策略。给 Agent 一种增量发现能力的方式，而不是预先倾倒所有内容。

**结构化安全是不可协商的。** 基于提示词的护栏在安全上等同于诚信停车。将权限模型构建到工具中，而不是提示词中。按风险级别对操作分类，并在代码中执行该分类。

**发布机器友好的输出格式。** 非交互上下文中默认 JSON。稳定的退出码。确定性的输出。这些是 Agent CLI 设计的文档化原则，它们很重要，因为你的下一个超级用户可能没有双手。

---

## 总结

这篇文章提出了一个非常务实的观点：**MCP 虽然是当前 AI Agent 集成的热门方案，但其上下文膨胀问题在生产环境中不可忽视**。

核心要点：

1. **Token 消耗惊人**：MCP 的工具定义可能消耗 50-70% 的上下文窗口，留给实际推理和响应的空间极少
2. **渐进式发现是关键**：CLI 的 `--help` 模式让 Agent 按需获取信息，而不是预先加载所有 Schema
3. **本地可靠性优势**：CLI 不依赖远程服务器，避免了 MCP 的连接失败问题
4. **结构化安全更可靠**：基于 HTTP 方法的权限控制在二进制中执行，比提示词约束更安全
5. **不同场景适用不同方案**：紧密范围高频调用的工具适合 MCP，复杂工作流适合代码执行，广泛 API 探索适合 CLI

个人认为，这篇文章的价值在于打破了对 MCP 的盲目崇拜。MCP 作为标准有其价值，但在实际工程中，CLI 这种「老派」的方案反而可能更实用。对于国内开发者来说，如果你的 Agent 需要对接大量 API，不妨先考虑 CLI 方案，它在成本、可靠性和安全性上都有明显优势。

当然，随着 MCP 生态的成熟，这些问题可能会逐步解决。但在当下，务实的选择是：根据具体场景选择最合适的工具，而不是追求最新的技术栈。
