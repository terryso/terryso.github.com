---
layout: post
title: "深入 Open Agent SDK（三）：MCP 集成实战——让 Agent 连接万物"
date: 2026-04-24 10:00:00 +0800
categories: tech
description: "分析 Open Agent SDK 的 MCP 集成：五种传输配置、MCPClientManager 连接流程、运行时动态管理、MCP 资源系统、InProcessMCPServer 零开销模式，让 Agent 通过标准协议接入任意外部工具。"
tags: [AI, Swift, Agent, SDK, MCP, 开源]
---

> 本文是「深入 Open Agent SDK (Swift)」系列第三篇。[系列目录见这里](/blog/open-agent-sdk-swift)。

上一篇看了 SDK 内置的 34 个工具——文件读写、Bash 执行、代码搜索，覆盖了常见的开发场景。但 Agent 的能力不可能只靠内置工具撑满。你需要连接数据库、调用企业 API、操作内部系统——这些事情需要一个标准化的接入方式。

MCP（Model Context Protocol）就是干这个的。这篇文章看 Open Agent SDK 怎么通过 MCP 协议把外部工具接到 Agent Loop 里。

## MCP 协议是什么

MCP 是 Anthropic 提出的一个开放协议，定义了 LLM 应用和外部工具/数据源之间的通信标准。核心思路很简单：

- **工具端**（MCP Server）暴露一组工具，每个工具有名字、描述、输入 schema
- **调用端**（MCP Client）通过标准协议发现工具、调用工具、拿到结果
- 通信基于 JSON-RPC，传输层可以换

为什么 Agent 需要它？因为不可能把所有工具都写进 SDK。有了 MCP，任何人都可以写一个 MCP Server（比如 `@modelcontextprotocol/server-filesystem`），任何 Agent 都能对接——不需要改 SDK 代码，不需要写适配器，配一行就接上了。

Open Agent SDK 的 MCP 集成分两条路：

1. **外部 MCP 服务器**：通过 stdio/HTTP/SSE 连接第三方 MCP Server，走完整的 MCP 协议
2. **进程内 MCP 服务器**：用 `InProcessMCPServer` 把 SDK 工具包装成 MCP Server，零协议开销

下面逐个看。

## 五种传输配置

SDK 用 `McpServerConfig` 枚举统一了所有传输方式：

```swift
public enum McpServerConfig: Sendable, Equatable {
    case stdio(McpStdioConfig)       // 子进程 stdin/stdout
    case sse(McpTransportConfig)     // Server-Sent Events
    case http(McpTransportConfig)    // HTTP POST
    case sdk(McpSdkServerConfig)     // 进程内，零开销
    case claudeAIProxy(McpClaudeAIProxyConfig) // ClaudeAI 代理
}
```

### Stdio：启动子进程

最常用的方式。Agent 启动一个子进程，通过 stdin/stdout 交换 JSON-RPC 消息。适用于 Node.js/Python 写的 MCP Server：

```swift
let servers: [String: McpServerConfig] = [
    "filesystem": .stdio(McpStdioConfig(
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    )),
    "git": .stdio(McpStdioConfig(
        command: "uvx",
        args: ["mcp-server-git"],
        env: ["GIT_REPO_PATH": "/my/repo"]
    ))
]
```

`MCPStdioTransport` 内部用 Foundation 的 `Process` 启动子进程，用 `FileDescriptor` 做底层 I/O。有几点值得注意：

- **命令解析**：如果 command 不是绝对路径，会先 `which` 查找。找不到就当文件路径用
- **消息分隔**：每条 JSON-RPC 消息以换行符分隔，支持 CRLF
- **安全过滤**：`CODEANY_API_KEY` 默认不会传给子进程，除非你在 `env` 里显式指定
- **重连**：MCPClient 配置了最多 2 次自动重试，初始间隔 1 秒，指数退避到最大 10 秒

### SSE 和 HTTP：连接远程服务

远程 MCP Server 通过 HTTP 连接，区分两种模式：

```swift
// SSE 模式（长连接，服务端推送）
let sseServer: [String: McpServerConfig] = [
    "remote-tools": .sse(McpTransportConfig(
        url: "https://mcp.example.com/sse",
        headers: ["Authorization": "Bearer token123"]
    ))
]

// HTTP 模式（请求-响应）
let httpServer: [String: McpServerConfig] = [
    "api-tools": .http(McpTransportConfig(
        url: "https://mcp.example.com/api"
    ))
]
```

SSE 适合需要服务端主动推送的场景，HTTP 适合简单的请求-响应。两者底层都用 `HTTPClientTransport`，区别在 `streaming` 参数。`McpSseConfig` 和 `McpHttpConfig` 实际上是 `McpTransportConfig` 的别名：

```swift
public typealias McpSseConfig = McpTransportConfig
public typealias McpHttpConfig = McpTransportConfig
```

### SDK：进程内零开销

不走任何网络协议，直接在进程内把工具注册进去。后面第六部分单独讲。

### ClaudeAI Proxy

连接 ClaudeAI 的代理端点，用 server ID 做认证：

```swift
let proxyServer: [String: McpServerConfig] = [
    "claude-tools": .claudeAIProxy(McpClaudeAIProxyConfig(
        url: "https://claudeai.example.com/proxy",
        id: "server-abc-123"
    ))
]
```

内部实现就是 HTTP 传输加了一个 `X-ClaudeAI-Server-ID` header。

## 连接流程：从配置到工具池

Agent 怎么把 MCP 工具合并到自己的工具池里？从 `assembleFullToolPool()` 追踪：

```swift
func assembleFullToolPool() async -> ([ToolProtocol], MCPClientManager?) {
    let baseTools = options.tools ?? []

    guard let mcpServers = options.mcpServers, !mcpServers.isEmpty else {
        return (baseTools, nil)
    }

    // 第一步：分离 SDK 配置和外部配置
    let (sdkTools, externalServers) = await Self.processMcpConfigs(mcpServers)

    // 第二步：连接外部 MCP 服务器
    var externalTools: [ToolProtocol] = []
    var manager: MCPClientManager? = nil

    if !externalServers.isEmpty {
        let mcpManager = MCPClientManager()
        await mcpManager.connectAll(servers: externalServers)
        externalTools = await mcpManager.getMCPTools()
        manager = mcpManager
    }

    // 第三步：合并所有工具
    let allMCPTools = sdkTools + externalTools
    let pool = assembleToolPool(
        baseTools: getAllBaseTools(tier: .core) + getAllBaseTools(tier: .specialist),
        customTools: baseTools,
        mcpTools: allMCPTools,
        allowed: options.allowedTools,
        disallowed: options.disallowedTools
    )

    return (pool, manager)
}
```

三步走：

**1. 分离配置。** `processMcpConfigs()` 把 `.sdk` 配置和外部配置（stdio/sse/http）分开。SDK 配置直接从 `InProcessMCPServer` 提取工具，用 `SdkToolWrapper` 加上命名空间前缀；外部配置留给 `MCPClientManager` 处理。

**2. 连接外部服务器。** `MCPClientManager` 是一个 actor，用 `withTaskGroup` 并发连接所有服务器。每个连接经历四步：

```
创建 Transport → 启动连接 → MCP 握手 (initialize) → listTools() 发现工具
```

发现的工具被包装成 `MCPToolDefinition`——一个遵循 `ToolProtocol` 的结构体。工具名按 `mcp__{serverName}__{toolName}` 格式命名，避免跟内置工具冲突。比如 `filesystem` 服务器上的 `read_file` 工具，最终叫 `mcp__filesystem__read_file`。

**3. 组装工具池。** MCP 工具和内置工具、自定义工具合并，经过 `allowedTools` / `disallowedTools` 过滤，形成最终的工具池。LLM 看到的是过滤后的完整工具列表。

完整的端到端使用代码：

```swift
let agent = createAgent(options: AgentOptions(
    apiKey: "sk-...",
    model: "claude-sonnet-4-6",
    permissionMode: .bypassPermissions,
    mcpServers: [
        "filesystem": .stdio(McpStdioConfig(
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
        ))
    ]
))

// Agent Loop 启动时自动连接 MCP 服务器、发现工具、合并到工具池
let result = await agent.prompt("List all files in /tmp and read the first one")
```

## 运行时管理

MCP 服务器不是连上就完事了。运行过程中你可能需要查状态、重连、开关、甚至动态替换服务器集合。SDK 提供了四个方法。

### 查状态：mcpServerStatus()

```swift
let status = await agent.mcpServerStatus()
for (name, info) in status {
    print("\(name): \(info.status.rawValue)")  // connected / failed / pending / disabled / needsAuth
    print("  tools: \(info.tools)")             // ["read_file", "write_file", ...]
    if let error = info.error {
        print("  error: \(error)")
    }
}
```

`McpServerStatus` 有五个状态值（跟 TypeScript SDK 对齐）：

| 状态 | 含义 |
|---|---|
| `connected` | 已连接，工具可用 |
| `failed` | 连接失败 |
| `pending` | 正在连接 |
| `disabled` | 被用户禁用 |
| `needsAuth` | 需要认证 |

### 重连：reconnectMcpServer()

网络抖动或服务端重启后，手动重连某个服务器：

```swift
try await agent.reconnectMcpServer(name: "filesystem")
```

内部实现：断开旧连接 → 清理状态 → 用初始配置重新走一遍连接流程。`MCPClientManager` 在首次连接时保存了原始配置（`originalConfigs`），重连时直接用它。

### 开关：toggleMcpServer()

临时禁用某个服务器（断开连接但保留配置），之后还能再开：

```swift
// 禁用
try await agent.toggleMcpServer(name: "filesystem", enabled: false)

// 重新启用
try await agent.toggleMcpServer(name: "filesystem", enabled: true)
```

### 动态替换：setMcpServers()

运行时替换整个 MCP 服务器集合。SDK 做了 diff：新增的连接、删除的断开、配置变化的重新连接：

```swift
let result = try await agent.setMcpServers([
    "filesystem": .stdio(McpStdioConfig(
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/data"]
    )),
    "database": .stdio(McpStdioConfig(
        command: "python3",
        args: ["-m", "my_db_server"]
    ))
])

print("Added: \(result.added)")      // ["database"]
print("Removed: \(result.removed)")  // 之前有但现在没有的
print("Errors: \(result.errors)")    // 连接失败的
```

`MCPClientManager.setServers()` 的 diff 逻辑值得一看：

```swift
public func setServers(_ servers: [String: McpServerConfig]) async -> McpServerUpdateResult {
    let existingNames = Set(originalConfigs.keys)
    let newNames = Set(servers.keys)

    let addedNames = newNames.subtracting(existingNames)
    let removedNames = existingNames.subtracting(newNames)

    // 配置变化的视为 remove + add
    let changedNames = newNames.intersection(existingNames).filter { name in
        originalConfigs[name] != servers[name]
    }

    let effectiveAdded = addedNames.union(changedNames)
    // ...执行连接和断开
}
```

先删除不再需要的，再连接新增和变化的。变化的服务器会被完全重建，不是热更新。这对于长运行的 Agent 应用很重要——你可以在不重启 Agent 的情况下调整 MCP 配置。

## MCP 资源：不只是工具

MCP 协议除了工具（Tools）还有资源（Resources）。工具是"做事情"，资源是"读数据"——比如一个数据库 MCP Server 可以暴露一个 `query` 工具，同时暴露 `tables` 资源让 Agent 看有哪些表。

SDK 内置了两个资源相关工具：`ListMcpResources` 和 `ReadMcpResource`。

### ListMcpResources

列出所有已连接 MCP 服务器的可用资源：

```swift
// LLM 看到的工具描述：
// "List available resources from connected MCP servers.
//  Resources can include files, databases, and other data sources."

// 可选参数：server — 按服务器名过滤
```

内部实现通过 `MCPResourceProvider` 协议查询每个连接：

```swift
public protocol MCPResourceProvider: Sendable {
    func listResources() async -> [MCPResourceItem]?
    func readResource(uri: String) async throws -> MCPReadResult
}
```

资源用 `MCPResourceItem` 表示——有名字、描述、URI。

### ReadMcpResource

读取指定 URI 的资源内容：

```swift
// LLM 看到的工具：
// "Read a specific resource from an MCP server."
// 参数：server（服务器名）、uri（资源 URI）
```

两个工具都是只读的，通过 `ToolContext.mcpConnections` 拿到连接信息——不用全局变量，线程安全。

## 进程内 MCP：InProcessMCPServer

`InProcessMCPServer` 是 SDK 里一个独特的设计。它让你用 `defineTool()` 创建工具，然后包装成一个 MCP Server——但实际上不走 MCP 协议。

为什么？因为有些场景你只是想把自己的工具加到 Agent 的工具池里，不需要跨进程通信。直接调函数比走 JSON-RPC 序列化高效得多。

### 基本用法

```swift
// 用 defineTool 创建工具
struct WeatherInput: Codable {
    let city: String
}

let weatherTool = defineTool(
    name: "get_weather",
    description: "Get the current weather for a given city.",
    inputSchema: [
        "type": "object",
        "properties": [
            "city": ["type": "string", "description": "The city name"]
        ],
        "required": ["city"]
    ],
    isReadOnly: true
) { (input: WeatherInput, context: ToolContext) -> String in
    let data: [String: String] = [
        "Beijing": "Sunny, 22C",
        "Tokyo": "Cloudy, 18C",
    ]
    return data[input.city] ?? "No data for \(input.city)"
}

// 包装为 InProcessMCPServer
let server = InProcessMCPServer(
    name: "weather",       // 工具名将是 mcp__weather__get_weather
    version: "1.0.0",
    tools: [weatherTool],
    cwd: "/tmp"
)

// 通过 asConfig() 生成配置，注入 Agent
let agent = createAgent(options: AgentOptions(
    apiKey: "sk-...",
    model: "claude-sonnet-4-6",
    mcpServers: ["weather": await server.asConfig()]
))
```

### 内部实现

`InProcessMCPServer` 是一个 actor，有两种工作模式：

**SDK 内部模式（常用）：** `processMcpConfigs()` 检测到 `.sdk` 配置时，直接调用 `server.getTools()` 拿到工具列表，用 `SdkToolWrapper` 加上命名空间前缀。整个过程中工具的 `call()` 方法直接被调用，没有任何序列化开销：

```swift
private struct SdkToolWrapper: ToolProtocol, Sendable {
    let serverName: String
    let innerTool: ToolProtocol

    var name: String { "mcp__\(serverName)__\(innerTool.name)" }

    func call(input: Any, context: ToolContext) async -> ToolResult {
        return await innerTool.call(input: input, context: context)
    }
}
```

注意 `SdkToolWrapper` 的 `call()` 直接转发到 `innerTool`——没有 JSON-RPC，没有 Value 转换，就是直接调函数。

**外部客户端模式：** 如果有外部 MCP Client 想连进来，`createSession()` 创建一个 `InMemoryTransport` 对，跑完整的 MCP 握手。这种场景下才有协议开销：

```swift
public func createSession() async throws -> (Server, InMemoryTransport) {
    let mcpServer = await getOrCreateMCPServer()
    let session = await mcpServer.createSession()
    let (clientTransport, serverTransport) = await InMemoryTransport.createConnectedPair()
    try await session.start(transport: serverTransport)
    return (session, clientTransport)
}
```

`InProcessMCPServer` 内部维护了一个 `MCPServer` 实例（懒加载），注册工具时把每个 `ToolProtocol` 的 `call()` 包装成 MCP 的 handler closure——处理参数格式转换（`[String: Value]` 到 `[String: Any]`）、构建 `ToolContext`、处理错误结果。

### 注意事项

- **命名限制**：server name 不能包含 `__`（双下划线），因为会跟命名空间前缀 `mcp__{server}__{tool}` 冲突。构造器里有 `precondition` 检查
- **错误处理**：工具返回 `isError: true` 时，MCP 层面会抛出 `ToolExecutionError`，让 MCP 协议返回 `isError: true`
- **工具注册失败**：会触发 `assertionFailure`，说明是代码 bug（比如重复的工具名）

### 完整示例：多工具 MCP 服务器

这是 AdvancedMCPExample 示例的核心部分，展示了多工具注册和错误处理：

```swift
// 天气工具 — 返回 String
let weatherTool = defineTool(
    name: "get_weather",
    description: "Get the current weather for a given city.",
    inputSchema: [
        "type": "object",
        "properties": [
            "city": ["type": "string", "description": "The city name"]
        ],
        "required": ["city"]
    ],
    isReadOnly: true
) { (input: WeatherInput, context: ToolContext) -> String in
    let data: [String: String] = [
        "Beijing": "Sunny, 22C, humidity 45%",
        "Tokyo": "Cloudy, 18C, humidity 65%",
    ]
    return data[input.city] ?? "No data for \(input.city)"
}

// 邮箱验证 — 返回 ToolExecuteResult，包含错误处理
let validationTool = defineTool(
    name: "validate_email",
    description: "Validate an email address.",
    inputSchema: [
        "type": "object",
        "properties": [
            "email": ["type": "string", "description": "The email address"]
        ],
        "required": ["email"]
    ],
    isReadOnly: true
) { (input: ValidateInput, context: ToolContext) -> ToolExecuteResult in
    if !input.email.contains("@") {
        return ToolExecuteResult(
            content: "Invalid email: '\(input.email)' missing '@'",
            isError: true
        )
    }
    return ToolExecuteResult(content: "Email '\(input.email)' is valid.", isError: false)
}

// 打包为 MCP 服务器
let utilityServer = InProcessMCPServer(
    name: "utility",
    version: "1.0.0",
    tools: [weatherTool, validationTool],
    cwd: "/tmp"
)

// 创建 Agent
let agent = createAgent(options: AgentOptions(
    apiKey: apiKey,
    model: "claude-sonnet-4-6",
    systemPrompt: "You have weather and email validation tools.",
    permissionMode: .bypassPermissions,
    mcpServers: ["utility": await utilityServer.asConfig()]
))

// LLM 会自动调用 mcp__utility__get_weather 或 mcp__utility__validate_email
let result = await agent.prompt("Check weather in Tokyo and validate test@example.com")
print(result.text)
```

工具返回错误时，Agent 不会崩溃。错误信息喂回 LLM，LLM 看到后会调整策略——比如告诉用户邮箱格式不对。

## 实战建议

**选传输方式。** 进程内的工具用 `InProcessMCPServer`（SDK 模式），外部工具用 stdio（本地）或 HTTP/SSE（远程）。不要用 stdio 去连远程服务，也不要用 HTTP 去连本地命令行工具。

**命名要规范。** MCP 工具名是 `mcp__{server}__{tool}` 三段式。server name 简短有意义，不要用双下划线。`filesystem` 比 `fs-tools-v2` 好，因为 LLM 看到 `mcp__filesystem__read_file` 能直接猜出含义。

**错误要包容。** `MCPClientManager` 的连接失败不会炸掉 Agent——失败的服务器 status 标记为 `error`，贡献零工具。Agent Loop 照样跑，只是少了那些工具。设计你的系统时也应该遵循这个原则：外部服务不可用时降级运行，不要整体崩溃。

**运行时管理用好。** 长运行的 Agent 应用应该在启动后检查 `mcpServerStatus()`，失败的用 `reconnectMcpServer()` 重试。需要动态调整时用 `setMcpServers()` 而不是重建 Agent。

---

**系列文章**：

- **第 0 篇**：[Open Agent SDK (Swift)：用原生 Swift 并发构建 AI Agent 应用](/blog/open-agent-sdk-swift)
- **第 1 篇**：[Agent Loop 内核：从 prompt 到多轮对话的完整运转机制](/blog/open-agent-sdk-agent-loop)
- **第 2 篇**：[34 个工具的背后：工具协议、三层架构与自定义扩展](/blog/open-agent-sdk-tools)
- **第 3 篇**：MCP 集成实战：让 Agent 连接万物（本文）
- **第 4 篇**：[多 Agent 协作：子代理、团队与任务编排](/blog/open-agent-sdk-multi-agent)
- **第 5 篇**：[会话持久化与安全防线](/blog/open-agent-sdk-session-security)
- **第 6 篇**：[多 LLM 提供商与运行时控制](/blog/open-agent-sdk-multi-llm)

**GitHub**：[terryso/open-agent-sdk-swift](https://github.com/terryso/open-agent-sdk-swift)
