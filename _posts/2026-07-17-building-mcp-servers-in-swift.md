---
layout: post
title: "用 Swift 构建 MCP Server：从零到接入 Claude 的完整教程"
date: 2026-07-17 10:00:00 +0800
categories: tech
description: "手把手用 Swift 实现 Model Context Protocol (MCP) Server，涵盖协议原理、stdio/SSE 传输、工具注册、Claude Desktop 接入、安全与常见坑，附完整可运行代码。"
tags: [Swift, MCP, Model Context Protocol, AI, Agent, 教程]
---

如果你是 Swift 开发者，又想把自己 Mac 上的能力（本地文件、Shortcuts、Xcode 项目、Core Data 数据……）暴露给 Claude、ChatGPT 这类 AI 助手，那么 **MCP Server** 就是你要的东西。而目前主流的 MCP 教程几乎都是 Python 或 TypeScript，Swift 版本极少——这也让 “swift mcp server” 成为一个几乎无人竞争的关键词。

本文用一个能跑通的最小示例，带你从零构建一个 Swift MCP Server，并接入 Claude Desktop。

## 什么是 MCP Server？

**Model Context Protocol (MCP)** 是 Anthropic 在 2024 年底提出的开放协议，用来标准化 “LLM 应用 ↔ 外部工具/数据源” 之间的通信。你可以把它理解成 **“AI 应用的 USB-C”**：

- **MCP Host**：AI 应用（Claude Desktop、Cursor、Codex CLI……）
- **MCP Client**：Host 内部为每个连接建立的会话客户端
- **MCP Server**：你写的进程，向 Host 暴露 `tools`、`resources`、`prompts`

协议本体是基于 **JSON-RPC 2.0** 的双向消息，通过两种传输承载：

| 传输 | 场景 | 特点 |
| --- | --- | --- |
| **stdio** | 本地进程，Host 直接 spawn | 简单、零配置、无网络暴露 |
| **Streamable HTTP / SSE** | 远程或跨机器 | 需 `Accept: application/json, text/event-stream` |

对本地 Mac 工具来说，**stdio 是默认选择**。

## 为什么用 Swift 写 MCP Server？

多数教程默认 Python/Node，但用 Swift 有几个独特优势：

1. **原生调用 macOS API**：EventKit、Contacts、AppKit、Core Data、Shortcuts、ScreenCaptureKit……不需要 shell 桥。
2. **单文件可执行**：`swift build -c release` 产出一个静态二进制，Claude Desktop 直接 spawn，无 Python 环境依赖。
3. **强类型 + async/await**：JSON-RPC 消息用 `Codable` + `enum` 建模，工具 handler 天然并发安全。
4. **和 Xcode / SwiftUI 项目共享代码**：同一份 `Package` 里既能被 App target 用，也能被 MCP server target 用。

## 架构总览

一个最小可用的 Swift MCP Server 包含四层：

```text
┌─────────────────────────────┐
│  Claude Desktop (Host)      │
└──────────────┬──────────────┘
        stdio  │  JSON-RPC 2.0
┌──────────────▼──────────────┐
│  Transport  (stdin/stdout)  │  按行读、按行写
├─────────────────────────────┤
│  JSON-RPC Dispatcher        │  method → handler
├─────────────────────────────┤
│  MCP Protocol Layer         │  initialize / tools/list / tools/call
├─────────────────────────────┤
│  Your Tools                 │  echo / read_notes / run_shortcut ...
└─────────────────────────────┘
```

## 项目搭建

新建一个 Swift Package：

```bash
mkdir SwiftMCPDemo && cd SwiftMCPDemo
swift package init --type executable
```

编辑 `Package.swift`（macOS 13+，用到 `AsyncStream` 与 `Foundation` 的 JSON 编解码）：

```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "SwiftMCPDemo",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "SwiftMCPDemo", path: "Sources/SwiftMCPDemo")
    ]
)
```

## 第一步：JSON-RPC 消息建模

MCP 的每条消息都是 JSON-RPC 2.0。用 `Codable` 把请求 / 响应 / 错误建模一次，后面所有 handler 都复用：

```swift
import Foundation

struct RPCRequest: Decodable {
    let jsonrpc: String
    let id: JSONValue?      // 可能是 number / string / null（通知无 id）
    let method: String
    let params: JSONValue?
}

struct RPCResponse: Encodable {
    let jsonrpc = "2.0"
    let id: JSONValue?
    var result: JSONValue?
    var error: RPCError?
}

struct RPCError: Encodable {
    let code: Int
    let message: String
    var data: JSONValue?
}

/// 一个能表达任意 JSON 的枚举，避免到处写 [String: Any]
enum JSONValue: Codable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let v = try? c.decode(Bool.self) { self = .bool(v); return }
        if let v = try? c.decode(Int.self) { self = .int(v); return }
        if let v = try? c.decode(Double.self) { self = .double(v); return }
        if let v = try? c.decode(String.self) { self = .string(v); return }
        if let v = try? c.decode([JSONValue].self) { self = .array(v); return }
        if let v = try? c.decode([String: JSONValue].self) { self = .object(v); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .int(let v): try c.encode(v)
        case .double(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
}
```

## 第二步：stdio 传输层

MCP over stdio 用 **换行分隔的 JSON**（每条消息一行）。关键点：

- **所有日志必须写 stderr**，不能污染 stdout；
- 读取用行缓冲，避免半条 JSON。

```swift
actor StdioTransport {
    private let stdin = FileHandle.standardInput
    private let stdout = FileHandle.standardOutput

    func readLines() -> AsyncStream<Data> {
        AsyncStream { continuation in
            Task.detached {
                var buffer = Data()
                while let chunk = try? self.stdin.read(upToCount: 4096), !chunk.isEmpty {
                    buffer.append(chunk)
                    while let nl = buffer.firstIndex(of: 0x0A) {
                        let line = buffer.subdata(in: 0..<nl)
                        buffer.removeSubrange(0...nl)
                        if !line.isEmpty { continuation.yield(line) }
                    }
                }
                continuation.finish()
            }
        }
    }

    func send(_ response: RPCResponse) throws {
        var data = try JSONEncoder().encode(response)
        data.append(0x0A) // '\n'
        try stdout.write(contentsOf: data)
    }
}

func log(_ msg: String) {
    FileHandle.standardError.write(Data("[mcp] \(msg)\n".utf8))
}
```

## 第三步：注册工具

定义一个 `Tool` 协议，让每个工具自描述 schema 并处理调用：

```swift
protocol Tool: Sendable {
    var name: String { get }
    var description: String { get }
    var inputSchema: JSONValue { get }   // JSON Schema
    func call(arguments: JSONValue) async throws -> JSONValue
}

struct EchoTool: Tool {
    let name = "echo"
    let description = "Echo the input text back to the caller."
    let inputSchema: JSONValue = .object([
        "type": .string("object"),
        "properties": .object([
            "text": .object([
                "type": .string("string"),
                "description": .string("Text to echo back.")
            ])
        ]),
        "required": .array([.string("text")])
    ])

    func call(arguments: JSONValue) async throws -> JSONValue {
        guard case .object(let obj) = arguments,
              case .string(let text) = obj["text"] ?? .null else {
            throw NSError(domain: "echo", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "missing `text`"])
        }
        // MCP tool 返回的是 content 数组
        return .object([
            "content": .array([
                .object([
                    "type": .string("text"),
                    "text": .string(text)
                ])
            ])
        ])
    }
}
```

## 第四步：Dispatcher 与 MCP 生命周期

MCP 一次会话至少要处理三个方法：`initialize`、`tools/list`、`tools/call`。

```swift
final class Server {
    let transport = StdioTransport()
    var tools: [String: any Tool] = [:]

    func register(_ tool: any Tool) { tools[tool.name] = tool }

    func run() async {
        for await line in await transport.readLines() {
            await handleLine(line)
        }
    }

    private func handleLine(_ data: Data) async {
        guard let req = try? JSONDecoder().decode(RPCRequest.self, from: data) else {
            log("bad json: \(String(data: data, encoding: .utf8) ?? "?")")
            return
        }

        var resp = RPCResponse(id: req.id)
        do {
            switch req.method {
            case "initialize":
                resp.result = .object([
                    "protocolVersion": .string("2025-06-18"),
                    "capabilities": .object([
                        "tools": .object([:])
                    ]),
                    "serverInfo": .object([
                        "name": .string("swift-mcp-demo"),
                        "version": .string("0.1.0")
                    ])
                ])

            case "tools/list":
                let list = tools.values.map { t in
                    JSONValue.object([
                        "name": .string(t.name),
                        "description": .string(t.description),
                        "inputSchema": t.inputSchema
                    ])
                }
                resp.result = .object(["tools": .array(list)])

            case "tools/call":
                guard case .object(let p) = req.params ?? .null,
                      case .string(let name) = p["name"] ?? .null,
                      let tool = tools[name] else {
                    throw NSError(domain: "mcp", code: -32601,
                                  userInfo: [NSLocalizedDescriptionKey: "tool not found"])
                }
                let args = p["arguments"] ?? .object([:])
                resp.result = try await tool.call(arguments: args)

            case "notifications/initialized":
                return   // 通知无需回复

            default:
                resp.error = RPCError(code: -32601, message: "method not found: \(req.method)")
            }
        } catch {
            resp.error = RPCError(code: -32000, message: "\(error)")
        }

        if req.id != nil {
            try? await transport.send(resp)
        }
    }
}
```

`main.swift` 里把它跑起来：

```swift
@main
struct App {
    static func main() async {
        let server = Server()
        server.register(EchoTool())
        log("swift-mcp-demo starting on stdio")
        await server.run()
    }
}
```

编译：

```bash
swift build -c release
# 产物路径
echo "$(pwd)/.build/release/SwiftMCPDemo"
```

## 接入 Claude Desktop

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "swift-demo": {
      "command": "/绝对路径/SwiftMCPDemo/.build/release/SwiftMCPDemo"
    }
  }
}
```

重启 Claude Desktop。在对话框输入框左下角的 🔌 图标里应能看到 `echo` 工具。让 Claude 调用：

> 用 echo 工具回显 “Hello from Swift MCP”。

如果一切正常，Claude 会把返回内容展示回来。

## 常见坑

1. **stdout 被日志污染**：任何 `print` 都会破坏 JSON-RPC 帧。所有日志一律走 stderr。
2. **忘记 `notifications/initialized`**：Host 发来的通知没有 `id`，如果你也回一个响应会让客户端报协议错。判断 `req.id != nil` 再发送。
3. **schema 与 arguments 不一致**：`inputSchema` 里声明的 `required` 字段必须真的能从 `arguments` 里拿到，否则 Host 会跳过工具或报错。
4. **权限提示卡住**：如果工具触及通讯录、日历、屏幕录制等，第一次运行会弹系统授权；Claude Desktop 是无窗口 spawn，用户可能看不到——先在终端里手动跑一次触发授权。
5. **remote / SSE 传输**：Streamable HTTP 的 POST **必须**带 `Accept: application/json, text/event-stream`，否则官方 SDK 直接 406。stdio 走不通再考虑升级到 HTTP。

## 常见问题（FAQ）

**Q：Swift MCP Server 能跨平台跑吗？**
可以。核心代码只依赖 `Foundation`，Linux 上的 Swift 5.9+ 也能编译；要触达 macOS 专属 API（EventKit 等）时才会被平台绑定。

**Q：需不需要自己实现 JSON-RPC，社区有没有现成库？**
有官方 [Swift SDK](https://github.com/modelcontextprotocol/swift-sdk)（`modelcontextprotocol/swift-sdk`）。生产项目直接用它；本文手写是为了把协议讲透。

**Q：MCP Server 支持流式返回吗？**
支持。工具可以在长任务里通过 `notifications/progress` 推进度，但要小心：客户端普遍有 30~60 秒左右的调用超时，超长任务应拆成 “创建 job → 查询结果” 两个工具。

**Q：怎样调试？**
最简单的办法：用 `mcp-inspector`（`npx @modelcontextprotocol/inspector /path/to/SwiftMCPDemo`）在浏览器里逐条查看请求与响应。

**Q：MCP 会不会被 CLI 工具替代？**
围绕 CLI vs MCP 有过[一场讨论](/blog/mcp-is-dead-long-live-cli)，但对于强类型、需要 schema 的 macOS 原生能力，MCP 仍然是最合适的封装。

## 结论

Swift + MCP 是被严重低估的组合：一份 Swift Package 就能把 macOS 原生能力干净地暴露给任何符合 MCP 的 AI 客户端，无 Python、无网络、类型安全。这篇教程的完整代码可以直接复制运行；下一步建议：

- 把 `EchoTool` 换成 `RunShortcutTool`，用 `Process` 调 `shortcuts run`；
- 加一个 `read_notes` 工具走 AppleScript / EventKit；
- 打包成 `.pkg` 或 Homebrew tap，让别人一键装。

如果你在做类似方向的实验，欢迎订阅本站 [RSS](/feed.xml) 或看看姊妹项目 [Open Agent SDK (Swift)](/blog/open-agent-sdk-swift)，那边把 “Agent Loop + MCP 集成” 完整跑通了。
