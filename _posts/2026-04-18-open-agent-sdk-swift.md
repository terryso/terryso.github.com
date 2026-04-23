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

- **LLMClient Protocol**：抽象了 LLM 提供商，目前支持 Anthropic (Claude) 和 OpenAI 兼容 API（GLM、Ollama、OpenRouter 等）。支持运行时动态切换模型，按模型分别计费。
- **Agent Loop**：自动管理多轮对话、工具调用、预算控制、自动压缩。
- **Tool System**：34 个内置工具，分 Core（10 个）、Advanced（11 个）、Specialist（13 个）三层。支持 `defineTool()` 自定义工具，输入走 Codable 自动解码。
- **MCP 集成**：支持 stdio、SSE、HTTP 和进程内四种传输方式，MCP 工具自动发现并合并到工具池。
- **多 Agent 协作**：通过 AgentTool 生成子 Agent（内置 Explore、Plan 两种类型），Task 系统追踪任务进度，Team + Mailbox 支持 Agent 间通信。
- **会话持久化**：对话历史保存、恢复、分叉，支持三种恢复策略。
- **权限与安全**：6 种权限模式 + 可组合的策略（白名单、黑名单、只读）+ 沙盒机制（路径和命令过滤）+ Hook 系统（24 个生命周期事件，支持拦截和修改工具输入）。
- **Skills 系统**：5 个内置 Skill（Commit、Review、Simplify、Debug、Test），支持文件系统自动发现自定义 Skill。
- **Thinking/Effort 配置**：控制 LLM 深度思考能力和 token 预算，支持运行时动态调节。

## 项目状态

SDK 附带 31 个示例项目，覆盖基本用法、流式输出、自定义工具、MCP 集成、会话管理、多 Agent 协作、权限控制、沙盒、模型切换等场景。代码分为 API、Core、Hooks、MCP、Skills、Stores、Tools、Types、Utils 九个模块，约 90 个 Swift 源文件，MIT 许可证。

本系列后续文章会逐一深入每个子系统的实现细节。

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
