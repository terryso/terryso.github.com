---
layout: post
title: "Open Agent SDK (Swift)：用原生 Swift 并发构建 AI Agent 应用"
date: 2026-04-18 15:00:00 +0800
categories: tech
description: "Open Agent SDK 是一个开源的 Swift Agent SDK，支持完整的 Agent Loop、34 个内置工具、多 LLM 提供商、MCP 集成、子 Agent 协作和会话持久化，让你用原生 Swift 并发在进程内构建 AI 驱动的应用。"
tags: [AI, Swift, Agent, SDK, MCP, 开源]
---

如果你是一名 Swift 开发者，想要在自己的 macOS 应用中集成 AI Agent 能力，选择并不多。大多数 Agent 框架都是 Python 或 TypeScript 的，Swift 生态几乎没有成熟的解决方案。[Open Agent SDK (Swift)](https://github.com/terryso/open-agent-sdk-swift) 正是为了填补这个空白而生的。

## 它是什么？

Open Agent SDK 用 Swift 6.1 编写，要求 macOS 13+。它在进程内跑完整个 Agent Loop：发送提示、解析响应、执行工具调用、把结果喂回 LLM，循环往复直到拿到最终答案。全程用原生 Swift 并发（async/await、AsyncStream）驱动。

项目灵感来自 [open-agent-sdk-typescript](https://github.com/codeany-ai/open-agent-sdk-typescript)，把同样的 Agent 架构搬到了 Swift 生态。同系列还有 Go 版本。

## 快速上手

安装只需在 `Package.swift` 中添加依赖：

```swift
dependencies: [
    .package(url: "https://github.com/terryso/open-agent-sdk-swift.git", from: "0.1.0")
]
```

几行代码就能跑起一个 Agent：

```swift
import OpenAgentSDK

let agent = createAgent(options: AgentOptions(
    apiKey: "sk-...",
    model: "claude-sonnet-4-6",
    systemPrompt: "You are a helpful assistant.",
    maxTurns: 10
))

let result = await agent.prompt("Explain Swift concurrency in one paragraph.")
print(result.text)
print("Used \(result.usage.inputTokens) input + \(result.usage.outputTokens) output tokens")
```

`prompt()` 是阻塞式的，一次调用完成整个 Agent Loop。如果需要流式输出，用 `stream()`：

```swift
for await message in agent.stream("Read Package.swift and summarize it.") {
    switch message {
    case .partialMessage(let data):
        print(data.text, terminator: "")
    case .toolUse(let data):
        print("Using tool: \(data.toolName)")
    case .result(let data):
        print("\nDone (\(data.numTurns) turns, $\(String(format: "%.4f", data.totalCostUsd)))")
    default:
        break
    }
}
```

## 核心架构

SDK 的架构分了几层：

```
你的应用 (import OpenAgentSDK)
  └── Agent (prompt() / stream())
        └── Agentic Loop (API 调用 → 工具执行 → 重复)
              ├── LLMClient Protocol (AnthropicClient / OpenAIClient)
              ├── 34 个内置工具
              ├── MCP 服务器集成
              ├── Session Store (JSON 持久化)
              └── Hook Registry (20+ 生命周期事件)
```

- **LLMClient Protocol**：抽象了 LLM 提供商，目前支持 Anthropic (Claude) 和 OpenAI 兼容 API（GLM、Ollama、OpenRouter 等）
- **Agent Loop**：自动管理多轮对话、工具调用、预算控制、自动压缩
- **Tool System**：34 个内置工具，分为 Core（10 个）、Advanced（11 个）、Specialist（13 个）三个层级

## 34 个内置工具

SDK 不只是封装了一层 LLM 调用，还内置了一整套 Agent 工具：

**Core 工具（10 个）**：Bash、Read、Write、Edit、Glob、Grep、WebFetch、WebSearch、AskUser、ToolSearch

**Advanced 工具（11 个）**：Agent（子代理）、SendMessage、TaskCreate/List/Update/Get/Stop/Output、TeamCreate/Delete、NotebookEdit

**Specialist 工具（13 个）**：WorktreeEnter/Exit、PlanEnter/Exit、CronCreate/Delete/List、RemoteTrigger、LSP、Config、TodoWrite、ListMcpResources、ReadMcpResource

代码读写、文件搜索、网页抓取、任务管理、团队协作、定时任务、LSP 集成，基本上 Agent 需要的能力都覆盖了。

## 自定义工具

内置工具不够用？自定义一个也不麻烦：

```swift
struct WeatherInput: Codable {
    let city: String
}

let weatherTool = defineTool(
    name: "get_weather",
    description: "Get current weather for a city",
    inputSchema: [
        "type": "object",
        "properties": [
            "city": ["type": "string", "description": "City name"]
        ],
        "required": ["city"]
    ]
) { (input: WeatherInput, context: ToolContext) in
    return "Weather in \(input.city): 22C, sunny"
}

let agent = createAgent(options: AgentOptions(
    apiKey: "sk-...",
    tools: [weatherTool]
))
```

工具定义走标准 JSON Schema 格式，输入会自动解码为 Swift 结构体。

## 多 LLM 提供商

除了默认的 Anthropic Claude，可以切换到任何 OpenAI 兼容的 API：

```swift
let agent = createAgent(options: AgentOptions(
    provider: .openai,
    apiKey: "sk-...",
    model: "gpt-4o",
    baseURL: "https://api.openai.com/v1"
))
```

甚至能在运行时动态切换模型：

```swift
// 简单问题用快速模型
let result1 = await agent.prompt("Quick question...")

// 复杂任务切换到更强模型
try agent.switchModel("claude-opus-4-6")
let result2 = await agent.prompt("Analyze this complex codebase...")
```

每次切换都有独立的成本追踪，`result2.usage.costBreakdown` 会包含每个模型的单独消耗记录。

## MCP 集成

Model Context Protocol (MCP) 是连接外部工具的标准协议。SDK 支持 stdio、SSE、HTTP 和进程内四种传输方式：

```swift
let agent = createAgent(options: AgentOptions(
    apiKey: "sk-...",
    mcpServers: [
        "filesystem": .stdio(McpStdioConfig(
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
        )),
        "remote": .sse(McpSseConfig(
            url: "http://localhost:3001/sse"
        ))
    ]
))
```

MCP 工具会被自动发现并合并到 Agent 的工具池中，LLM 可以像调用内置工具一样调用它们。

## 子 Agent 协作

更进一步的用法——让一个 Agent 生成子 Agent 来并行处理任务：

```swift
// Agent 工具会被自动注册，LLM 可以自主决定何时生成子 Agent
let agent = createAgent(options: AgentOptions(
    apiKey: "sk-...",
    tools: getAllBaseTools(tier: .core) + [AgentTool()]
))
```

内置的子 Agent 类型包括：
- **Explore**：快速探索代码库的专用 Agent
- **Plan**：软件架构设计 Agent

还可以创建团队（Team），管理任务（Task），实现 Agent 间的消息传递（SendMessage）。

## 会话持久化

对话历史可以保存、恢复、分叉：

```swift
let sessionStore = SessionStore()

let agent = createAgent(options: AgentOptions(
    apiKey: "sk-...",
    sessionStore: sessionStore,
    sessionId: "my-session"
))

// 第一次对话会自动保存
let result = await agent.prompt("Remember: my favorite color is blue.")

// 在新进程中恢复——历史自动加载
let agent2 = createAgent(options: AgentOptions(
    apiKey: "sk-...",
    sessionStore: sessionStore,
    sessionId: "my-session"
))
let result2 = await agent2.prompt("What is my favorite color?")
```

## 权限与安全

SDK 提供了 6 种权限模式（从默认到完全绕过），支持自定义授权回调：

```swift
// 自定义策略：只读 + 禁用特定工具
let policy = CompositePolicy(policies: [
    ReadOnlyPolicy(),
    ToolNameDenylistPolicy(deniedToolNames: ["WebFetch"])
])
agent.setCanUseTool(canUseTool(policy: policy))
```

还有沙盒机制，限制 Agent 的文件读写路径和可执行命令：

```swift
let agent = createAgent(options: AgentOptions(
    apiKey: "sk-...",
    sandbox: SandboxSettings(
        allowedReadPaths: ["/project/"],
        allowedWritePaths: ["/project/src/"],
        deniedCommands: ["rm", "sudo"]
    )
))
```

## Hook 系统

20 多个生命周期事件可以在关键节点插入自定义逻辑：

```swift
let hookRegistry = HookRegistry()

// 工具执行后记录日志
await hookRegistry.register(.postToolUse, definition: HookDefinition(
    handler: { input in
        if let toolName = input.toolName {
            print("Tool completed: \(toolName)")
        }
        return nil
    }
))

// 阻止 Bash 命令
await hookRegistry.register(.preToolUse, definition: HookDefinition(
    matcher: "Bash",
    handler: { input in
        return HookOutput(message: "Bash command blocked", block: true)
    }
))
```

## 其他亮点

- **自动压缩**：对话过长时自动压缩，避免超出上下文窗口
- **预算控制**：设置 `maxBudgetUsd` 限制单次查询的最大花费
- **Skills 系统**：5 个内置 Skill（Commit、Review、Simplify、Debug、Test）+ 自定义 Skill 注册
- **文件缓存**：LRU 文件缓存，避免重复读取
- **Git 上下文自动注入**：系统提示中自动包含 Git 状态
- **项目文档发现**：自动读取 CLAUDE.md / AGENT.md 等项目指令
- **结构化日志**：JSON 格式日志，方便对接 ELK、Datadog 等
- **查询中断**：支持中途取消查询并获取部分结果

## 31 个示例项目

SDK 附带了 31 个完整的示例项目，覆盖了几乎所有使用场景：BasicAgent、StreamingAgent、CustomTools、MCPIntegration、SessionsAndHooks、MultiToolExample、SubagentExample、PermissionsExample、SkillsExample、SandboxExample、LoggerExample、ModelSwitchingExample、QueryAbortExample、PolyvLiveExample、AdvancedMCPExample、ContextInjectionExample 等等（19 个功能演示 + 12 个兼容性验证）。

## 项目状态

项目使用 Swift 6.1，通过 BMAD 方法论进行开发管理，拥有完整的测试套件和 E2E 测试。代码结构分为 API、Core、Hooks、MCP、Skills、Stores、Tools、Types、Utils 九个模块，约 90 个 Swift 源文件。

## 总结

Open Agent SDK (Swift) 提供的不只是 LLM API 的一层封装。完整的工具系统、多轮对话管理、会话持久化、权限控制、MCP 集成、子 Agent 协作——这些是构建真正能用的 AI Agent 应用时绕不开的基础设施。如果你在做 macOS 应用，想加入 AI Agent 能力，或者单纯对 Swift 写 Agent 系统感兴趣，可以 clone 下来跑跑看。

---

**深入 Open Agent SDK 系列文章**：

- **第 0 篇**：Open Agent SDK (Swift)：用原生 Swift 并发构建 AI Agent 应用（本文）
- **第 1 篇**：[Agent Loop 内核：从 prompt 到多轮对话的完整运转机制](/blog/open-agent-sdk-agent-loop)
- **第 2 篇**：[34 个工具的背后：工具协议、三层架构与自定义扩展](/blog/open-agent-sdk-tools)
- **第 3 篇**：[MCP 集成实战：让 Agent 连接万物](/blog/open-agent-sdk-mcp)
- **第 4 篇**：[多 Agent 协作：子代理、团队与任务编排](/blog/open-agent-sdk-multi-agent)
- **第 5 篇**：[会话持久化与安全防线](/blog/open-agent-sdk-session-security)
- **第 6 篇**：[多 LLM 提供商与运行时控制](/blog/open-agent-sdk-multi-llm)

**GitHub**：[terryso/open-agent-sdk-swift](https://github.com/terryso/open-agent-sdk-swift)
**许可证**：MIT
**要求**：Swift 6.1+、macOS 13+
