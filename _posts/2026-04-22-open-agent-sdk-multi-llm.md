---
layout: post
title: "深入 Open Agent SDK（六）：多 LLM 提供商与运行时控制"
date: 2026-04-22 20:30:00 +0800
categories: tech
description: "分析 Open Agent SDK 的多 LLM 提供商支持（LLMClient 协议、AnthropicClient、OpenAIClient 适配层）、运行时模型切换与计费、Thinking/Effort 配置、Skills 系统与工具限制，以及预算控制、中断、动态权限等运行时控制机制。"
tags: [AI, Swift, Agent, SDK, LLM, 开源]
---

> 本文是「深入 Open Agent SDK (Swift)」系列第六篇（完结篇）。[系列目录见这里](/blog/open-agent-sdk-swift)。

一个 Agent 不应该绑定单一 LLM 提供商。不同任务适合不同模型——简单问题用便宜模型，复杂推理用贵模型，有些场景甚至需要本地模型。而且运行时的需求也在变化：用户可能中途要求更深度的思考，可能发现预算快用完了需要降级，可能想切换到本地模型省点钱。

Open Agent SDK 的做法是：定义一个统一的 `LLMClient` 协议，Anthropic 和 OpenAI 兼容提供商各有一个实现，Agent 内部全部用 Anthropic 格式处理。切换提供商只需要改一个配置参数，运行时还能动态切模型、调思考深度、控预算。

这篇文章分析 SDK 的多提供商适配机制和运行时控制能力。

## 一、LLMClient 协议——统一接口

先看协议定义：

```swift
public protocol LLMClient: Sendable {
    nonisolated func sendMessage(
        model: String,
        messages: [[String: Any]],
        maxTokens: Int,
        system: String?,
        tools: [[String: Any]]?,
        toolChoice: [String: Any]?,
        thinking: [String: Any]?,
        temperature: Double?
    ) async throws -> [String: Any]

    nonisolated func streamMessage(
        model: String,
        messages: [[String: Any]],
        maxTokens: Int,
        system: String?,
        tools: [[String: Any]]?,
        toolChoice: [String: Any]?,
        thinking: [String: Any]?,
        temperature: Double?
    ) async throws -> AsyncThrowingStream<SSEEvent, Error>
}
```

两个核心方法，一个阻塞一个流式。参数列表覆盖了主流 LLM API 的全部能力：模型选择、消息历史、token 上限、系统提示、工具定义、工具选择策略、思考配置、温度。

关键决策：**返回值统一用 Anthropic 格式的字典**。不管是 Anthropic 原生 API 还是 OpenAI 兼容 API，最终 Agent 内部拿到的都是同一种结构——`content` 数组里是 `{"type": "text", "text": "..."}` 或 `{"type": "tool_use", "name": "...", "input": {...}}`，`stop_reason` 是 `end_turn` / `tool_use` / `max_tokens`。这样 Agent Loop 的处理逻辑不需要关心底层是哪家 API。

流式返回用 `AsyncThrowingStream<SSEEvent, Error>`，`SSEEvent` 是枚举：

```swift
public enum SSEEvent: @unchecked Sendable {
    case messageStart(message: [String: Any])
    case contentBlockStart(index: Int, contentBlock: [String: Any])
    case contentBlockDelta(index: Int, delta: [String: Any])
    case contentBlockStop(index: Int)
    case messageDelta(delta: [String: Any], usage: [String: Any])
    case messageStop
    case ping
    case error(data: [String: Any])
}
```

7 种事件类型，覆盖了 Anthropic Messages API 流式响应的全部事件。OpenAI 兼容层的流式输出会被转换成同样的 SSEEvent 序列。

## 二、AnthropicClient——原生 Claude API

`AnthropicClient` 是 `LLMClient` 的 Anthropic 原生实现，用 `actor` 保证并发安全：

```swift
public actor AnthropicClient: LLMClient {
    private let apiKey: String
    private let baseURL: URL      // 默认 https://api.anthropic.com
    private let urlSession: URLSession

    public init(apiKey: String, baseURL: String? = nil, urlSession: URLSession? = nil) {
        self.apiKey = apiKey
        self.baseURL = URL(string: baseURL ?? "https://api.anthropic.com")!
        self.urlSession = urlSession ?? URLSession.shared
    }
}
```

请求就是 POST 到 `/v1/messages`，header 里放 `x-api-key` 和 `anthropic-version`：

```swift
private nonisolated func buildRequest(body: [String: Any]) throws -> URLRequest {
    var request = URLRequest(url: URL(string: baseURL.absoluteString + "/v1/messages")!)
    request.httpMethod = "POST"
    request.timeoutInterval = 300
    request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
    request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
    return request
}
```

因为用的是 Anthropic 原生 API，所以 `sendMessage` 的请求体和响应体不需要格式转换——请求参数直接拼成字典发出去，响应直接解析成字典返回。流式模式也是直接解析 Anthropic 的 SSE 文本。

安全方面有个细节：所有错误信息都会把 API Key 替换成 `***`，防止 key 泄露到日志里：

```swift
let safeMessage = errorMessage.replacingOccurrences(of: apiKey, with: "***")
```

AnthropicClient 直接支持 Extended Thinking。Agent 在配置了 `ThinkingConfig` 时，会把 thinking 参数传进来：

```swift
if let thinking {
    body["thinking"] = thinking
}
```

这个参数在 Anthropic API 里控制 Claude 是否进行深度思考以及思考的 token 预算。

## 三、OpenAI 兼容层——适配 GLM/Ollama/OpenRouter 等

`OpenAIClient` 是重头戏。它要做的事情是：接受 Anthropic 格式的参数，转换成 OpenAI Chat Completion API 格式发出去，再把 OpenAI 格式的响应转换回 Anthropic 格式。Agent 内部完全不知道底层是 OpenAI 兼容 API。

```swift
public actor OpenAIClient: LLMClient {
    private let apiKey: String
    private let baseURL: URL      // 默认 https://api.openai.com/v1

    public init(apiKey: String, baseURL: String? = nil, urlSession: URLSession? = nil) {
        self.apiKey = apiKey
        self.baseURL = URL(string: baseURL ?? "https://api.openai.com/v1")!
        self.urlSession = urlSession ?? URLSession.shared
    }
}
```

请求发到 `/chat/completions`，用 `Bearer` token 认证——这是 OpenAI 兼容 API 的标准做法。只要提供商支持 `/v1/chat/completions` 端点，就能用这个 Client 连接。

### 消息格式转换

Anthropic 和 OpenAI 的消息格式有几个关键差异，转换时都要处理：

**1. System 消息的位置**

Anthropic 把 system prompt 作为顶层参数传，OpenAI 把它作为第一条 `role: "system"` 消息：

```swift
if let system {
    result.append(["role": "system", "content": system])
}
```

**2. Tool Result 的表示方式**

Anthropic 把多个 tool_result 打包在一个 `role: "user"` 消息的 content 数组里，OpenAI 要求每个 tool result 是一条独立的 `role: "tool"` 消息：

```swift
let toolResults = blocks.filter { $0["type"] as? String == "tool_result" }
if !toolResults.isEmpty {
    return toolResults.map { block in
        [
            "role": "tool",
            "tool_call_id": block["tool_use_id"] as? String ?? "",
            "content": block["content"] ?? "",
        ]
    }
}
```

**3. Tool Use 的表示方式**

Anthropic 在 content 数组里用 `type: "tool_use"` 块，OpenAI 用 `tool_calls` 数组放在 message 顶层：

```swift
result["tool_calls"] = toolUseBlocks.enumerated().map { index, block in
    let inputDict = block["input"] as? [String: Any] ?? [:]
    let arguments = (try? JSONSerialization.data(withJSONObject: inputDict, options: []))
        .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    return [
        "id": block["id"] as? String ?? "call_\(index)",
        "type": "function",
        "function": [
            "name": block["name"] as? String ?? "",
            "arguments": arguments,  // OpenAI 要求 JSON 字符串，不是字典
        ],
    ]
}
```

注意 OpenAI 的 `arguments` 必须是 JSON 字符串而不是字典对象，这里做了序列化。

### 响应格式转换

OpenAI 的响应结构（`choices[0].message`）要转成 Anthropic 格式：

```swift
// stop_reason 映射
private static func mapStopReason(_ finishReason: String) -> String {
    switch finishReason {
    case "stop": return "end_turn"
    case "tool_calls": return "tool_use"
    case "length": return "max_tokens"
    default: return finishReason
    }
}

// usage 映射
usage = [
    "input_tokens": openAIUsage["prompt_tokens"] as? Int ?? 0,
    "output_tokens": openAIUsage["completion_tokens"] as? Int ?? 0,
]
```

### 流式转换

流式的转换更复杂。OpenAI 的流式格式（`data: {"choices":[{"delta":{...}}]}`）要逐块转成 Anthropic 的 SSEEvent 序列：

- 第一个 chunk → `messageStart`
- 文本 delta → `contentBlockDelta(type: "text_delta")`
- tool call 开始 → `contentBlockStart(type: "tool_use")`，参数 delta → `contentBlockDelta(type: "input_json_delta")`
- 结束 → `contentBlockStop` + `messageDelta` + `messageStop`

转换函数要跟踪当前有多少个 content block、文本块是否关闭、哪些 tool call 块还在打开状态，才能正确生成 `index`。代码里还加了一个安全检查——确保 `messageStop` 一定会被发出，即使原始流没有正常结束。

### 使用示例

连接不同的 OpenAI 兼容提供商只需要改 `baseURL` 和 `model`：

```swift
// DeepSeek
let agent = createAgent(options: AgentOptions(
    apiKey: "sk-...",
    model: "deepseek-chat",
    baseURL: "https://api.deepseek.com/v1",
    provider: .openai
))

// Ollama 本地
let localAgent = createAgent(options: AgentOptions(
    apiKey: "ollama",           // Ollama 不需要 key，随便填
    model: "qwen3:8b",
    baseURL: "http://localhost:11434/v1",
    provider: .openai
))

// GLM
let glmAgent = createAgent(options: AgentOptions(
    apiKey: "xxx.glm-xxx",
    model: "glm-4-plus",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    provider: .openai
))
```

## 四、运行时模型切换

SDK 支持在运行时动态切换模型，不需要重新创建 Agent：

```swift
let agent = createAgent(options: AgentOptions(
    apiKey: apiKey,
    model: "claude-sonnet-4-6",
    fallbackModel: "claude-haiku-4-5"  // 主模型挂了用这个
))

// 先用 sonnet 跑一个简单问题
let result1 = await agent.prompt("What is 2 + 3?")
print(result1.costBreakdown)
// [CostBreakdownEntry(model: "claude-sonnet-4-6", inputTokens: 45, outputTokens: 3, costUsd: 0.000180)]

// 切换到 opus 跑推理密集型问题
try agent.switchModel("claude-opus-4-6")
let result2 = await agent.prompt("Explain the difference between structs and classes in Swift.")
print(result2.costBreakdown)
// [CostBreakdownEntry(model: "claude-opus-4-6", inputTokens: 52, outputTokens: 156, costUsd: 0.011970)]
```

`switchModel()` 的实现：

```swift
public func switchModel(_ model: String) throws {
    let trimmed = model.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
        throw SDKError.invalidConfiguration("Model name cannot be empty")
    }
    let oldModel = self.model
    self.model = trimmed
    self.options.model = trimmed
    Logger.shared.info("Agent", "model_switch", data: ["from": oldModel, "to": trimmed])
}
```

不做白名单校验——传什么模型名就用什么，API 层面不支持的模型会在请求时报错。这样设计是因为 OpenAI 兼容提供商的模型名无法穷举。

`fallbackModel` 是在 AgentOptions 里配置的备用模型。主模型彻底失败（重试耗尽）后，SDK 会自动用 fallback model 重试一次：

```swift
if let fallbackModel = self.options.fallbackModel, fallbackModel != self.model {
    let fallbackResponse = try await retryClient.sendMessage(
        model: fallbackModel,
        messages: retryMessages, ...
    )
    // 临时切到 fallback model 跑 cost tracking
    let originalModel = self.model
    self.model = fallbackModel
    // ... 处理响应
}
```

### 按模型分别计费

`CostBreakdownEntry` 按模型名分组记录每次查询的费用：

```swift
public struct CostBreakdownEntry: Sendable, Equatable {
    public let model: String
    public let inputTokens: Int
    public let outputTokens: Int
    public let costUsd: Double
}
```

一次查询里如果中途切了模型（或触发了 fallback），`QueryResult.costBreakdown` 会包含多个条目，每个模型的花费分开算。费用根据内置的价格表计算：

```swift
public nonisolated(unsafe) var MODEL_PRICING: [String: ModelPricing] = [
    "claude-opus-4-6":   ModelPricing(input: 15.0 / 1_000_000, output: 75.0 / 1_000_000),
    "claude-sonnet-4-6": ModelPricing(input: 3.0 / 1_000_000, output: 15.0 / 1_000_000),
    "claude-haiku-4-5":  ModelPricing(input: 0.8 / 1_000_000, output: 4.0 / 1_000_000),
    // ...
]
```

自定义模型可以通过 `registerModel(_:pricing:)` 注册价格：

```swift
registerModel("glm-4-plus", pricing: ModelPricing(
    input: 0.1 / 1_000_000, output: 0.1 / 1_000_000
))
```

## 五、Thinking 与 Effort 配置

### ThinkingConfig

SDK 用 `ThinkingConfig` 枚举控制 LLM 的深度思考能力：

```swift
public enum ThinkingConfig: Sendable, Equatable {
    case adaptive                  // 模型自己决定要不要思考
    case enabled(budgetTokens: Int) // 指定思考的 token 预算
    case disabled                  // 关闭深度思考
}
```

三种模式各有用途：
- **adaptive**：让模型自己判断——简单问题不思考，复杂问题自动思考。日常使用最方便。
- **enabled(budgetTokens:)**：明确控制思考预算。比如你想要深度分析，给 10000 个 thinking token。
- **disabled**：完全关闭思考，追求最快速度。

### EffortLevel

`EffortLevel` 是更高层级的抽象，映射到具体的 thinking token 预算：

```swift
public enum EffortLevel: String, Sendable, CaseIterable {
    case low    // 1024 tokens
    case medium // 5120 tokens
    case high   // 10240 tokens
    case max    // 32768 tokens

    public var budgetTokens: Int {
        switch self {
        case .low: return 1024
        case .medium: return 5120
        case .high: return 10240
        case .max: return 32768
        }
    }
}
```

在 `AgentOptions` 里设置：

```swift
let agent = createAgent(options: AgentOptions(
    apiKey: apiKey,
    model: "claude-sonnet-4-6",
    effort: .high  // 10240 thinking tokens
))
```

### 运行时动态调节

`setMaxThinkingTokens()` 可以在查询之间调整思考预算：

```swift
// 普通问题，少给点思考 token
try agent.setMaxThinkingTokens(2048)
let r1 = await agent.prompt("Summarize this file.")

// 遇到复杂推理问题，加大预算
try agent.setMaxThinkingTokens(16000)
let r2 = await agent.prompt("Design a concurrent data structure for...")

// 关闭思考
try agent.setMaxThinkingTokens(nil)
```

传正整数就启用思考并设预算，传 `nil` 就关闭。传 0 或负数会抛 `SDKError.invalidConfiguration`。

`ModelInfo` 描述了每个模型支持哪些能力：

```swift
public struct ModelInfo: Sendable, Equatable {
    public let value: String
    public let displayName: String
    public let description: String
    public let supportsEffort: Bool
    public let supportedEffortLevels: [EffortLevel]?
    public let supportsAdaptiveThinking: Bool?
    public let supportsFastMode: Bool?
}
```

这样 UI 层可以根据模型能力动态展示可选项。

## 六、Skills 系统

Skills 是 SDK 里一种特殊的扩展机制——本质上是"带工具限制的 prompt 模板"。一个 Skill 定义了一组 prompt 指令、允许使用的工具子集、可选的模型覆盖。

### Skill 结构

```swift
public struct Skill: Sendable {
    public let name: String
    public let description: String
    public let aliases: [String]              // 别名，如 ["ci"] 代表 commit
    public let userInvocable: Bool            // 用户能否通过 /command 调用
    public let toolRestrictions: [ToolRestriction]?  // 限制可用工具，nil = 全部可用
    public let modelOverride: String?         // 执行时覆盖模型
    public let isAvailable: @Sendable () -> Bool     // 运行时可用性检查
    public let promptTemplate: String         // prompt 模板内容
    public let whenToUse: String?             // 告诉 LLM 什么时候该用这个 skill
    public let argumentHint: String?          // 参数提示，如 "[message]"
    public let baseDir: String?               // skill 目录的绝对路径
    public let supportingFiles: [String]      // 支撑文件（引用、脚本等）
}
```

### 5 个内置 Skill

SDK 预定义了 5 个常用 Skill，通过 `BuiltInSkills` 命名空间访问：

| Skill | 别名 | 允许的工具 | 功能 |
|-------|------|-----------|------|
| `commit` | `ci` | bash, read, glob, grep | 分析 git diff，生成 commit message |
| `review` | `review-pr`, `cr` | bash, read, glob, grep | 从 5 个维度审查代码变更 |
| `simplify` | — | bash, read, grep, glob | 审查代码的复用、质量、效率 |
| `debug` | `investigate`, `diagnose` | read, grep, glob, bash | 分析错误，定位根因 |
| `test` | `run-tests` | bash, read, write, glob, grep | 生成测试用例并执行 |

每个 Skill 都限制了工具范围。比如 `commit` 只允许 bash、read、glob、grep——不需要写文件。`debug` 也是只读的（read、grep、glob、bash），只做诊断不做修改。`test` 是唯一允许 write 的内置 Skill，因为要创建测试文件。

`test` Skill 还有一个运行时可用性检查：

```swift
isAvailable: {
    let cwd = FileManager.default.currentDirectoryPath
    let testIndicators = [
        "Package.swift", "pytest.ini", "jest.config",
        "vitest.config", "Cargo.toml", "go.mod",
    ]
    for indicator in testIndicators {
        if FileManager.default.fileExists(atPath: cwd + "/" + indicator) {
            return true
        }
    }
    return false
}
```

只有检测到测试框架配置文件时，`test` Skill 才对用户可见。

### SkillRegistry

`SkillRegistry` 是线程安全的 skill 管理器，用 `DispatchQueue` 保护并发访问：

```swift
public final class SkillRegistry: @unchecked Sendable {
    private var skills: [String: Skill] = [:]
    private var orderedNames: [String] = []
    private var aliases: [String: String] = [:]
    private let queue = DispatchQueue(label: "com.openagentsdk.skillregistry")

    public func register(_ skill: Skill) { ... }
    public func find(_ name: String) -> Skill? { ... }   // 按名称或别名查找
    public var allSkills: [Skill] { ... }
    public var userInvocableSkills: [Skill] { ... }
}
```

注册、查找、替换、删除都是 `queue.sync` 保护的操作。别名在注册时自动建立映射——注册 `BuiltInSkills.commit` 后，`registry.find("ci")` 也能找到它。

### SkillLoader：文件系统发现

Skills 不需要全部代码注册。`SkillLoader` 可以从文件系统自动发现 skill——只要一个目录里包含 `SKILL.md` 文件，就会被识别为一个 skill 包。

扫描目录按优先级从低到高：

```
~/.config/agents/skills      （最低优先级）
~/.agents/skills
~/.claude/skills
$PWD/.agents/skills
$PWD/.claude/skills           （最高优先级）
```

同名 skill 后发现的覆盖先发现的（last-wins）。

`SKILL.md` 用 YAML frontmatter 定义元数据：

```markdown
---
name: polyv-live-cli
description: 管理保利威直播服务
aliases: live, plv
allowed-tools: Bash, Read, Write, Glob
when-to-use: user asks about live streaming management
argument-hint: [action] [options]
---

# polyv-live-cli Skill

你是保利威直播服务的管理助手...
```

frontmatter 里的 `allowed-tools` 会被解析成 `ToolRestriction` 数组，限制这个 skill 执行时只能用指定的工具。

`SkillLoader` 采用"渐进式加载"策略：只加载 `SKILL.md` 的 Markdown body 作为 prompt 模板，支撑文件（references、scripts、templates）只记录路径不加载内容。Agent 需要时通过 Read/Bash 工具按需读取。

```swift
let registry = SkillRegistry()
registry.register(BuiltInSkills.commit)
registry.register(BuiltInSkills.review)
// 从文件系统发现自定义 skills
let count = registry.registerDiscoveredSkills()
// 或指定目录
registry.registerDiscoveredSkills(from: ["/opt/custom-skills"])
// 或只注册白名单里的
registry.registerDiscoveredSkills(skillNames: ["polyv-live-cli"])
```

### ToolRestriction

`ToolRestriction` 枚举定义了可以被限制的工具：

```swift
public enum ToolRestriction: String, Sendable, CaseIterable {
    case bash, read, write, edit, glob, grep
    case webFetch, webSearch, askUser, toolSearch
    case agent, sendMessage
    case taskCreate, taskList, taskUpdate, taskGet, taskStop, taskOutput
    case teamCreate, teamDelete
    case notebookEdit, skill
}
```

当一个 Skill 设了 `toolRestrictions: [.bash, .read, .glob]`，执行时 Agent 只能用这三个工具，其他工具调用会被拦截。

### 在 Agent 里使用 Skills

要让 Agent 能用 Skills，需要把 `SkillTool` 加到工具列表里：

```swift
var tools = getAllBaseTools(tier: .core)
tools.append(createSkillTool(registry: registry))

let agent = createAgent(options: AgentOptions(
    apiKey: apiKey,
    model: "claude-sonnet-4-6",
    permissionMode: .bypassPermissions,
    tools: tools
))

// Agent 会根据 system prompt 里的 skill 列表自动发现并调用
let result = await agent.prompt("Use the commit skill to analyze current changes")
```

`SkillRegistry.formatSkillsForPrompt()` 会生成一段 skill 列表注入到 system prompt 里，包含每个 skill 的名称、描述和触发条件。LLM 看到这个列表后就知道该在什么场景下调用哪个 skill。

## 七、其他运行时控制

### 预算控制

`maxBudgetUsd` 设置查询的费用上限：

```swift
let agent = createAgent(options: AgentOptions(
    apiKey: apiKey,
    model: "claude-sonnet-4-6",
    maxBudgetUsd: 0.05  // 最多花 5 美分
))
```

每个 turn 结束后检查累计费用：

```swift
if let budget = options.maxBudgetUsd, totalCostUsd > budget {
    status = .errorMaxBudgetUsd
    break
}
```

超出预算时立即退出循环。已产生的文本和 token 统计仍然保留在 `QueryResult` 里——你拿到的是部分结果，不是空白的。

### 查询中断

两种方式中断正在进行的查询：

```swift
// 方式 1：调用 interrupt()
agent.interrupt()

// 方式 2：取消 Task
let task = Task {
    await agent.prompt("Long running query...")
}
// 稍后
task.cancel()
```

`interrupt()` 内部设置了 `_interrupted` 标志并取消 stream task。Agent Loop 在多个检查点检查这个标志（循环入口、只读/变更工具之间、SSE 事件循环内部、工具执行前后），检测到后立即退出。

### 动态权限切换

运行时可以切换权限模式和工具授权回调：

```swift
// 切换权限模式
agent.setPermissionMode(.askForPermission)

// 设置自定义授权回调（优先级高于 permissionMode）
agent.setCanUseTool { toolName, input in
    if toolName == "Bash" {
        return .deny("Bash is disabled")
    }
    return .allow
}

// 恢复到 permissionMode 控制
agent.setCanUseTool(nil)
```

`setCanUseTool` 的回调优先于 `permissionMode`。调 `setPermissionMode()` 会清空之前设的回调。

### 环境变量配置

SDK 支持通过环境变量配置，优先级是：代码设置 > 环境变量 > 默认值。

| 环境变量 | 对应字段 | 默认值 |
|---------|---------|-------|
| `CODEANY_API_KEY` | `apiKey` | `nil` |
| `CODEANY_MODEL` | `model` | `claude-sonnet-4-6` |
| `CODEANY_BASE_URL` | `baseURL` | `nil`（用提供商默认） |

用 `SDKConfiguration.resolved()` 合并：

```swift
// 代码设置的值优先，没设的从环境变量读
let config = SDKConfiguration.resolved(overrides: SDKConfiguration(
    apiKey: "sk-...",           // 优先于 CODEANY_API_KEY
    model: "claude-sonnet-4-6"  // 优先于 CODEANY_MODEL
))

// 只用环境变量
let envConfig = SDKConfiguration.fromEnvironment()
```

### 重试机制

所有 LLM 请求经过 `withRetry` 包装：

```swift
public struct RetryConfig: Sendable {
    public let maxRetries: Int          // 最多重试次数，默认 3
    public let baseDelayMs: Int         // 基础延迟，默认 2000ms
    public let maxDelayMs: Int          // 最大延迟，默认 30000ms
    public let retryableStatusCodes: Set<Int>  // 默认 [429, 500, 502, 503, 529]
}
```

指数退避 + 25% 随机抖动，避免惊群效应。只有 `SDKError.apiError` 且状态码在可重试集合里才会重试，其他错误直接抛出。

```swift
let delay = config.baseDelayMs * (1 << attempt)
let jitterMs = Int(Double(delay) * 0.25 * (Double.random(in: -1...1)))
let totalMs = max(0, min(delay + jitterMs, config.maxDelayMs))
```

## 系列回顾

六篇文章写完了，覆盖了 Open Agent SDK (Swift) 的完整架构：

- **第 0 篇**：项目概述——SDK 做什么、整体架构、怎么用
- **第 1 篇**：Agent Loop 内核——从 prompt 到多轮对话的完整循环
- **第 2 篇**：34 个内置工具——ToolProtocol 协议、三层架构、自定义扩展
- **第 3 篇**：MCP 集成——外部工具服务器的连接、发现和通信
- **第 4 篇**：多 Agent 协作——Team/Task 模型、Agent 间通信
- **第 5 篇**：会话持久化与安全——Session 存储、权限控制、Hook 系统
- **第 6 篇**（本文）：多 LLM 提供商与运行时控制——LLMClient 协议、OpenAI 适配层、模型切换、Thinking/Effort、Skills 系统

从 Agent Loop 这个核心出发，工具系统是循环里的"执行"环节，MCP 是外部工具扩展，多 Agent 是协作模式，会话是状态持久化，安全和 Hook 是管控机制，而本文讲的多提供商和运行时控制是灵活性的保障——让同一个 Agent 能根据场景选择最合适的模型和控制策略。

---

**系列文章**：

- **第 0 篇**：[Open Agent SDK (Swift)：用原生 Swift 并发构建 AI Agent 应用](/blog/open-agent-sdk-swift)
- **第 1 篇**：[Agent Loop 内核：从 prompt 到多轮对话的完整运转机制](/blog/open-agent-sdk-agent-loop)
- **第 2 篇**：[34 个工具的背后：工具协议、三层架构与自定义扩展](/blog/open-agent-sdk-tools)
- **第 3 篇**：[MCP 集成实战：让 Agent 连接万物](/blog/open-agent-sdk-mcp)
- **第 4 篇**：[多 Agent 协作：子代理、团队与任务编排](/blog/open-agent-sdk-multi-agent)
- **第 5 篇**：[会话持久化与安全防线](/blog/open-agent-sdk-session-security)
- **第 6 篇**：多 LLM 提供商与运行时控制（本文）

**GitHub**：[terryso/open-agent-sdk-swift](https://github.com/terryso/open-agent-sdk-swift)
