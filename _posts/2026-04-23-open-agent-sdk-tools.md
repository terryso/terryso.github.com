---
layout: post
title: "深入 Open Agent SDK（二）：34 个工具的背后——工具协议、三层架构与自定义扩展"
date: 2026-04-23 10:00:00 +0800
categories: tech
description: "分析 Open Agent SDK 的工具系统：ToolProtocol 协议设计、Core/Advanced/Specialist 三层架构、defineTool 工厂函数的 Codable 自动解码、工具池组装与过滤机制。"
tags: [AI, Swift, Agent, SDK, 工具系统, 开源]
---

> 本文是「深入 Open Agent SDK (Swift)」系列第二篇。[系列目录见这里](/blog/open-agent-sdk-swift)。

上一篇分析了 Agent Loop 的运转机制，其中有一个环节是"执行工具"——LLM 说"我要调 Bash"，SDK 就真的起一个进程跑命令。但这背后的工具系统远不止"调个函数"那么简单。34 个内置工具怎么组织？怎么从 LLM 的 JSON 输入安全地转成 Swift 类型？怎么控制哪些工具能用？

这篇文章从协议定义开始，一层一层看 Open Agent SDK 的工具系统。

## ToolProtocol：一个工具长什么样

SDK 里每个工具都遵循 `ToolProtocol` 协议：

```swift
public protocol ToolProtocol: Sendable {
    var name: String { get }
    var description: String { get }
    var inputSchema: ToolInputSchema { get }
    var isReadOnly: Bool { get }
    var annotations: ToolAnnotations? { get }

    func call(input: Any, context: ToolContext) async -> ToolResult
}
```

五个属性一个方法，逐个说。

**`name`** 是工具的唯一标识，LLM 在 tool_use block 里用这个名字指定要调哪个工具。所有内置工具用 PascalCase 命名：`Read`、`Bash`、`Glob`、`CronCreate`。

**`description`** 是给 LLM 看的工具说明。这段文字会作为 tool definition 的一部分发给 API，质量直接影响 LLM 什么时候会选择调用这个工具。

**`inputSchema`** 是一个 `[String: Any]` 类型的 JSON Schema 字典，描述工具接受的输入结构。API 调用时它被原样传给 `input_schema` 字段。

**`isReadOnly`** 是一个布尔标记，用来告诉 Agent Loop 这个工具有没有副作用。上一篇提到过，Agent Loop 用这个字段做分桶：只读工具并发执行，变更工具串行执行。

**`annotations`** 是可选的行为提示，包含四个布尔字段：

```swift
public struct ToolAnnotations: Sendable, Equatable {
    public let readOnlyHint: Bool       // 只读，无副作用
    public let destructiveHint: Bool    // 可能做不可逆操作
    public let idempotentHint: Bool     // 幂等，多次调用结果相同
    public let openWorldHint: Bool      // 会和外部世界交互
}
```

注意 `destructiveHint` 默认是 `true`——SDK 对工具采取"默认危险"策略，工具需要主动声明自己不危险。这些提示不会影响 SDK 自身的执行逻辑，但 LLM 会参考它们决定怎么使用工具。

### ToolResult 和 ToolExecuteResult

`call()` 方法返回 `ToolResult`，这是工具执行后喂回给 LLM 的内容：

```swift
public struct ToolResult: Sendable {
    public let toolUseId: String         // 对应 LLM 返回的 tool_use ID
    public let content: String           // 文本内容
    public let typedContent: [ToolContent]?  // 多模态内容（文本、图片、资源引用）
    public let isError: Bool             // 是否为错误结果
}
```

`content` 和 `typedContent` 之间有个兼容设计：当 `typedContent` 有值时，`content` 会从中提取所有 `.text` 类型拼接返回；否则直接返回存储的字符串。这样旧代码只用 `content` 也能正常工作，新代码可以用 `typedContent` 返回图片等非文本内容。

`ToolContent` 是一个枚举，支持三种内容类型：

```swift
public enum ToolContent: Sendable {
    case text(String)
    case image(data: Data, mimeType: String)
    case resource(uri: String, name: String?)
}
```

工具闭包内部用的是 `ToolExecuteResult`——结构和 `ToolResult` 几乎一样，只是少了 `toolUseId`（这个 ID 由调用层自动填充）。

### ToolContext：工具的运行环境

`ToolContext` 是每次工具执行时注入的上下文，字段很多：

| 字段 | 用途 |
|---|---|
| `cwd` | 当前工作目录 |
| `toolUseId` | 本次调用的 tool_use ID |
| `agentSpawner` | 子 Agent 生成器（AgentTool 用） |
| `cronStore` | 定时任务存储（CronTools 用） |
| `todoStore` | 待办事项存储（TodoWrite 用） |
| `worktreeStore` | 工作树存储（WorktreeTools 用） |
| `planStore` | 计划模式存储（PlanTools 用） |
| `taskStore` | 任务管理存储（Task*Tools 用） |
| `mailboxStore` | 邮箱存储（SendMessage 用） |
| `teamStore` | 团队存储（TeamCreate 用） |
| `hookRegistry` | Hook 事件注册表 |
| `permissionMode` | 权限模式 |
| `canUseTool` | 自定义权限检查回调 |
| `skillRegistry` | 技能注册表（SkillTool 用） |
| `restrictionStack` | 工具限制栈 |
| `sandbox` | 沙箱设置 |
| `mcpConnections` | MCP 连接信息 |
| `fileCache` | 文件缓存 |
| `env` | 自定义环境变量 |

这么多可选字段看起来复杂，实际上遵循一个简单的原则：**工具需要什么就注入什么，不需要的就是 nil**。Read 工具只看 `cwd`、`sandbox`、`fileCache`；AgentTool 只看 `agentSpawner`；CronTools 只看 `cronStore`。每个工具只依赖自己需要的那个 Store，不知道也不关心其他 Store 的存在。

`ToolContext` 还提供了两个 copy 方法：`withToolUseId()` 用于更新调用 ID（每次工具执行时由 ToolExecutor 调用），`withSkillContext()` 用于递增技能嵌套深度（SkillTool 调用子技能时使用）。

## 三层工具架构

SDK 把 34 个工具分成三个层级：Core（10 个）、Advanced（11 个）、Specialist（13 个）。

```
Core 层 (10)          Advanced 层 (11)        Specialist 层 (13)
┌──────────┐         ┌──────────────┐        ┌───────────────┐
│ Read      │         │ Agent        │        │ CronCreate    │
│ Write     │         │ Skill        │        │ CronDelete    │
│ Edit      │         │ TaskCreate   │        │ CronList      │
│ Glob      │         │ TaskGet      │        │ LSP           │
│ Grep      │         │ TaskList     │        │ Config        │
│ Bash      │         │ TaskOutput   │        │ TodoWrite     │
│ AskUser   │         │ TaskStop     │        │ EnterPlanMode │
│ ToolSearch│         │ TaskUpdate   │        │ ExitPlanMode  │
│ WebFetch  │         │ SendMessage  │        │ EnterWorktree │
│ WebSearch │         │ TeamCreate   │        │ ExitWorktree  │
└──────────┘         │ TeamDelete   │        │ RemoteTrigger │
                     │ NotebookEdit │        │ ListMcpRes    │
                     └──────────────┘        │ ReadMcpRes    │
                                              └───────────────┘
```

分层的依据不是技术实现难度，而是工具的**依赖复杂度和使用场景**。

### Core 层：文件系统和 shell

Core 层的 10 个工具是 Agent 的基础能力——读文件、写文件、搜索代码、跑命令。它们有一个共同特点：只依赖 `ToolContext` 的基础字段（`cwd`、`sandbox`、`fileCache`），不需要注入任何 Store。

拿 **Read** 工具来说。它的输入是文件路径、可选的 offset 和 limit：

```swift
private struct FileReadInput: Codable {
    let file_path: String
    let offset: Int?
    let limit: Int?
}
```

执行逻辑很直接：解析路径 → 检查沙箱 → 查缓存 → 读文件 → 分页 → 返回带行号的内容。一个值得注意的细节是文件缓存：如果 `context.fileCache` 有值，先查缓存，命中就跳过磁盘 I/O。

再看 **Bash** 工具。它比 Read 复杂得多，因为要处理超时、输出截断、后台进程等问题。Bash 的输入有 5 个字段：

```swift
private struct BashInput: Codable {
    let command: String
    let timeout: Int?
    let description: String?
    let runInBackground: Bool?
    let dangerouslyDisableSandbox: Bool?
}
```

几个关键实现细节：

1. **超时控制**。默认 120 秒，上限 600 秒。用 `DispatchQueue.global().asyncAfter` 设置超时，超时后 `process.terminate()` 杀掉进程。
2. **输出截断**。超过 100,000 字符的输出只保留前 50,000 + 后 50,000，中间用 `...(truncated)...` 连接。
3. **后台执行**。`run_in_background = true` 时，进程起起来就返回一个 task ID，不等待完成。
4. **进程输出用 `ProcessOutputAccumulator` 收集**，用 `@unchecked Sendable` 标注，因为 Pipe 的 readability handler 和 termination handler 都在同一个 run loop dispatch queue 上触发，不会产生数据竞争。

Bash 工具的 `annotations` 设置了 `destructiveHint: true`，明确告诉 LLM 这个工具有破坏性。

### Advanced 层：子 Agent 和任务编排

Advanced 层的工具开始需要外部依赖了——AgentTool 需要 `agentSpawner`，Task* 系列需要 `taskStore`，SendMessage 需要 `mailboxStore` 和 `teamStore`。

**Agent** 工具是这一层的代表。它的作用是让 LLM 能"派出一个子 Agent"去完成复杂任务：

```swift
public func createAgentTool() -> ToolProtocol {
    return defineTool(
        name: "Agent",
        description: "Launch a subagent to handle complex, multi-step tasks autonomously.",
        inputSchema: agentToolSchema,
        isReadOnly: false
    ) { (input: AgentToolInput, context: ToolContext) async throws -> ToolExecuteResult in
        guard let spawner = context.agentSpawner else {
            return ToolExecuteResult(
                content: "Error: Agent spawner not available.",
                isError: true
            )
        }
        // 解析内置 Agent 类型、权限模式，然后 spawn 子 Agent
        let result = await spawner.spawn(
            prompt: input.prompt,
            model: input.model ?? agentDef?.model,
            systemPrompt: agentDef?.systemPrompt,
            allowedTools: agentDef?.tools,
            ...
        )
        return ToolExecuteResult(content: result.text, isError: result.isError)
    }
}
```

AgentTool 的输入支持 11 个字段：`prompt`、`description`、`subagent_type`、`model`、`name`、`maxTurns`、`run_in_background`、`isolation`、`team_name`、`mode`、`resume`。其中 `subagent_type` 可以指定内置的 `Explore` 或 `Plan` 类型，也可以用自定义名称。

注意 `agentSpawner` 是通过 `ToolContext` 注入的协议类型——AgentTool 不知道子 Agent 是怎么创建的，它只调 `spawner.spawn()`，具体实现由 Core 层注入。这种依赖倒置让工具层完全不用 import Core 模块。

### Specialist 层：领域专用工具

Specialist 层的工具依赖更重——它们各自需要一个专属 Store，而且功能高度领域化。

**CronTools** 是一组三个工具：CronCreate、CronDelete、CronList，通过 `context.cronStore` 访问定时任务存储：

```swift
public func createCronCreateTool() -> ToolProtocol {
    return defineTool(
        name: "CronCreate",
        description: "Create a scheduled recurring task (cron job).",
        inputSchema: cronCreateSchema,
        isReadOnly: false
    ) { (input: CronCreateInput, context: ToolContext) async throws -> ToolExecuteResult in
        guard let cronStore = context.cronStore else {
            return ToolExecuteResult(content: "Error: CronStore not available.", isError: true)
        }
        let job = await cronStore.create(
            name: input.name,
            schedule: input.schedule,
            command: input.command
        )
        return ToolExecuteResult(
            content: "Cron job created: \(job.id) \"\(job.name)\"",
            isError: false
        )
    }
}
```

三个工具都用 `guard let cronStore = context.cronStore` 做前置检查——如果 Store 没注入，直接返回错误而不是崩溃。

**LSP** 工具是另一个有趣的例子。它用 grep 模拟 Language Server Protocol 的常见操作（跳转定义、查找引用、符号搜索），完全不依赖真正的语言服务器：

```swift
case "goToDefinition", "goToImplementation":
    // 1. 用正则提取光标位置的符号名
    guard let symbol = getSymbolAtPosition(
        filePath: filePath, line: line, character: character
    ) else { ... }

    // 2. grep 搜索定义模式
    let pattern = "(func|class|struct|enum|protocol|typealias|let|var|export)\\s+\(symbol)"
    let results = await runGrep(
        arguments: ["grep", "-rn", "-E", pattern, cwd],
        cwd: cwd
    )
```

LSP 工具只依赖 `context.cwd`，不需要任何 Store——属于 Specialist 层里最轻量的工具。

## defineTool：创建自定义工具的工厂函数

SDK 提供了 `defineTool` 工厂函数，让开发者用最少的代码创建符合 `ToolProtocol` 的工具。它有四个重载，覆盖不同的使用场景。

### 基本：Codable 输入 + String 输出

最常用的重载接受一个 `Codable` 输入类型和一个返回 `String` 的闭包：

```swift
let greetTool = defineTool(
    name: "Greet",
    description: "Generate a greeting message.",
    inputSchema: [
        "type": "object",
        "properties": [
            "name": ["type": "string", "description": "Person's name"]
        ],
        "required": ["name"]
    ],
    isReadOnly: true
) { (input: GreetInput, context: ToolContext) async throws -> String in
    return "Hello, \(input.name)!"
}

// 输入类型只需要遵循 Codable
struct GreetInput: Codable {
    let name: String
}
```

`defineTool` 内部做了四件事：

1. 把 LLM 传来的 `Any` 类型 cast 成 `[String: Any]`
2. 用 `JSONSerialization` 序列化成 `Data`
3. 用 `JSONDecoder` 解码成你定义的 `Input` 类型
4. 调用你的闭包

任何一步失败（输入不是字典、JSON 序列化失败、解码失败、闭包抛异常），都会返回 `isError: true` 的结果，不会炸掉 Agent Loop。这意味着你可以放心地用 `try` 在闭包里抛错误，它们会被妥善捕获。

### 结构化输出：ToolExecuteResult

如果工具需要显式标记错误（而不是用 try 抛异常），用返回 `ToolExecuteResult` 的重载：

```swift
let divideTool = defineTool(
    name: "Divide",
    description: "Divide two numbers.",
    inputSchema: [
        "type": "object",
        "properties": [
            "a": ["type": "number"],
            "b": ["type": "number"]
        ],
        "required": ["a", "b"]
    ]
) { (input: DivideInput, context: ToolContext) async throws -> ToolExecuteResult in
    guard input.b != 0 else {
        return ToolExecuteResult(content: "Error: Division by zero.", isError: true)
    }
    return ToolExecuteResult(content: "\(input.a / input.b)", isError: false)
}
```

内置工具大多用这个重载，因为很多错误是逻辑层面的（文件不存在、Store 没注入），不适合用异常表示。

### 无输入：NoInputTool

有些工具不需要输入参数（比如列表操作、健康检查），用无输入重载：

```swift
let listTool = defineTool(
    name: "ListItems",
    description: "List all items.",
    inputSchema: ["type": "object", "properties": [:]]
) { (context: ToolContext) async throws -> String in
    return "No items found."
}
```

闭包只接收 `ToolContext`，完全忽略输入。

### 原始字典输入：RawInputTool

最后一个重载跳过 Codable 解码，直接把原始 `[String: Any]` 字典传给闭包。适用于输入字段类型不固定的场景——比如 ConfigTool 的 `value` 字段可以是字符串、数字、布尔值、数组、对象或 null：

```swift
let configTool = defineTool(
    name: "Config",
    description: "Read or write configuration values.",
    inputSchema: configSchema
) { (input: [String: Any], context: ToolContext) async -> ToolExecuteResult in
    let key = input["key"] as? String ?? ""
    let value = input["value"]  // 任意类型
    // ...
}
```

### CodingKeys 处理 snake_case

LLM 发来的 JSON 字段名通常用 snake_case（比如 `file_path`、`run_in_background`），但 Swift 的惯用命名是 camelCase。输入类型通过 `CodingKeys` 枚举做映射：

```swift
private struct BashInput: Codable {
    let command: String
    let runInBackground: Bool?

    private enum CodingKeys: String, CodingKey {
        case command
        case runInBackground = "run_in_background"
    }
}
```

这是 Swift Codable 的标准做法——`defineTool` 内部的 `JSONDecoder` 会自动用 `CodingKeys` 做字段名转换。

## 工具池组装与过滤

工具不是直接一股脑丢给 LLM 的。SDK 有一套组装和过滤机制。

### assembleToolPool

`assembleToolPool` 把三类工具来源合并成一个去重后的工具池：

```swift
public func assembleToolPool(
    baseTools: [ToolProtocol],     // SDK 内置工具
    customTools: [ToolProtocol]?,  // 用户自定义工具
    mcpTools: [ToolProtocol]?,     // MCP 服务器提供的工具
    allowed: [String]?,
    disallowed: [String]?
) -> [ToolProtocol] {
    // 1. 合并所有来源：base + custom + MCP
    var combined = baseTools
    if let customTools { combined.append(contentsOf: customTools) }
    if let mcpTools { combined.append(contentsOf: mcpTools) }

    // 2. 按名称去重（后者覆盖前者）
    var byName = [String: ToolProtocol]()
    for tool in combined {
        byName[tool.name] = tool
    }

    // 3. 应用过滤规则
    return filterTools(
        tools: Array(byName.values),
        allowed: allowed,
        disallowed: disallowed
    )
}
```

去重用 Dictionary，遍历过程中同名的后者会覆盖前者。这意味着优先级是：**MCP > 自定义 > 内置**——用户可以用自定义工具或 MCP 工具替换同名内置工具。

### filterTools

`filterTools` 实现白名单/黑名单过滤：

```swift
public func filterTools(
    tools: [ToolProtocol],
    allowed: [String]?,       // 白名单，nil 或空表示不过滤
    disallowed: [String]?     // 黑名单，nil 或空表示不过滤
) -> [ToolProtocol] {
    var filtered = tools
    // 先应用白名单
    if let allowed, !allowed.isEmpty {
        let allowedSet = Set(allowed)
        filtered = filtered.filter { allowedSet.contains($0.name) }
    }
    // 再应用黑名单（黑名单优先于白名单）
    if let disallowed, !disallowed.isEmpty {
        let disallowedSet = Set(disallowed)
        filtered = filtered.filter { !disallowedSet.contains($0.name) }
    }
    return filtered
}
```

两个规则同时存在时，黑名单优先——即使一个工具在白名单里，只要出现在黑名单里也会被排除。

### ToolRestrictionStack：Skills 系统的工具限制

`ToolRestrictionStack` 是一个栈结构，用于 Skills 系统中控制工具可见范围。当一个 Skill 配置了 `toolRestrictions` 时，执行前 push 限制，执行后 pop 恢复：

```swift
let stack = ToolRestrictionStack()
stack.push([.bash, .read])     // Skill A：只能用 Bash 和 Read
stack.push([.grep, .glob])     // Skill B（嵌套）：只能用 Grep 和 Glob
// 此时 currentAllowedToolNames 只返回 Grep 和 Glob
stack.pop()                     // Skill B 完成 → 回到 Bash 和 Read
stack.pop()                     // Skill A 完成 → 恢复全部工具
```

栈的 LIFO 特性保证了嵌套 Skill 的正确行为——内层 Skill 的限制覆盖外层，退出后自动恢复。线程安全通过内部串行 `DispatchQueue` 保证。

`currentAllowedToolNames` 的逻辑很简单：栈空就返回全部工具，栈非空就只返回栈顶限制列表里的工具名。

### toApiTool：工具转 API 格式

最后一步是把工具转成 Anthropic API 要求的格式：

```swift
public func toApiTool(_ tool: ToolProtocol) -> [String: Any] {
    var result: [String: Any] = [
        "name": tool.name,
        "description": tool.description,
        "input_schema": tool.inputSchema
    ]
    if let annotations = tool.annotations {
        result["annotations"] = [
            "readOnlyHint": annotations.readOnlyHint,
            "destructiveHint": annotations.destructiveHint,
            "idempotentHint": annotations.idempotentHint,
            "openWorldHint": annotations.openWorldHint
        ]
    }
    return result
}
```

`annotations` 只在有值时才包含——省点 token。

## 一个完整的自定义工具示例

把上面说的一切串起来，写一个能直接跑的自定义工具——获取天气：

```swift
import Foundation
import OpenAgentSDK

// 1. 定义输入类型
struct WeatherInput: Codable {
    let city: String
    let unit: String?  // "celsius" or "fahrenheit"

    private enum CodingKeys: String, CodingKey {
        case city, unit
    }
}

// 2. 用 defineTool 创建工具
let weatherTool = defineTool(
    name: "Weather",
    description: "Get current weather for a city.",
    inputSchema: [
        "type": "object",
        "properties": [
            "city": [
                "type": "string",
                "description": "City name, e.g. 'Beijing'"
            ],
            "unit": [
                "type": "string",
                "enum": ["celsius", "fahrenheit"],
                "description": "Temperature unit, defaults to celsius"
            ]
        ],
        "required": ["city"]
    ],
    isReadOnly: true,
    annotations: ToolAnnotations(
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true  // 要访问外部 API
    )
) { (input: WeatherInput, context: ToolContext) async throws -> ToolExecuteResult in
    let unit = input.unit ?? "celsius"
    // 调用天气 API（这里省略具体实现）
    let weather = try await fetchWeather(city: input.city, unit: unit)
    return ToolExecuteResult(content: weather, isError: false)
}

// 3. 注册到 Agent
let agent = createAgent(options: AgentOptions(
    apiKey: "sk-...",
    model: "claude-sonnet-4-6",
    customTools: [weatherTool]  // 自定义工具自动加入工具池
))
```

这个工具会被 `assembleToolPool` 和内置工具合并、去重、过滤后发给 LLM。LLM 看到工具定义后，在需要查天气时会自动调用它。`defineTool` 内部的 Codable 桥接会把 LLM 返回的 JSON 自动解码成 `WeatherInput`，你不需要手动处理任何 JSON 解析。

## 小结

工具系统的设计思路可以概括为几个关键词：

**协议驱动**。`ToolProtocol` 只规定工具的形状（名字、描述、输入 schema、执行方法），不规定工具怎么实现。这让内置工具和自定义工具走完全一样的代码路径。

**依赖注入**。`ToolContext` 的 20+ 个可选字段不是为了复杂而复杂——每个工具只看自己需要的字段，其余全是 nil。AgentTool 不知道 CronStore 的存在，CronCreate 不知道 SubAgentSpawner 的存在。

**分层组织**。Core/Advanced/Specialist 三层不是代码分层（它们的代码结构完全一样），而是按依赖复杂度划分。Core 层的工具可以独立运行，Advanced 层需要 Store，Specialist 层需要更专业的领域设施。

**容错优先**。`defineTool` 内部把所有可能的失败点（类型转换、序列化、解码、执行）都包在 do/catch 里，任何环节出错都返回 `isError: true` 而不是 crash。Agent Loop 里工具错误不会传播，LLM 拿到错误信息后可以换策略。

下一篇来看 **MCP 集成**：SDK 怎么连接外部工具服务器、怎么把 MCP 工具转成 `ToolProtocol`、怎么在 Agent Loop 里和内置工具共存。

---

**系列文章**：

- **第 0 篇**：[Open Agent SDK (Swift)：用原生 Swift 并发构建 AI Agent 应用](/blog/open-agent-sdk-swift)
- **第 1 篇**：[Agent Loop 内核：从 prompt 到多轮对话的完整运转机制](/blog/open-agent-sdk-agent-loop)
- **第 2 篇**：34 个工具的背后：工具协议、三层架构与自定义扩展（本文）
- **第 3 篇**：[MCP 集成实战：让 Agent 连接万物](/blog/open-agent-sdk-mcp)
- **第 4 篇**：[多 Agent 协作：子代理、团队与任务编排](/blog/open-agent-sdk-multi-agent)
- **第 5 篇**：[会话持久化与安全防线](/blog/open-agent-sdk-session-security)
- **第 6 篇**：[多 LLM 提供商与运行时控制](/blog/open-agent-sdk-multi-llm)

**GitHub**：[terryso/open-agent-sdk-swift](https://github.com/terryso/open-agent-sdk-swift)
