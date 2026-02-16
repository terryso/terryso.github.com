---
layout: post
title: "WebMCP：让 Web 应用成为 AI Agent 的工具"
date: 2026-02-17 04:56:42 +0800
categories: tech-translation
description: "WebMCP 是一个新的 JavaScript API，允许 Web 开发者将应用功能暴露为 AI Agent 可调用的「工具」，实现用户与 Agent 在同一 Web 界面中的协作工作流。"
original_url: https://webmachinelearning.github.io/webmcp/
source: Hacker News
---

本文翻译自 [WebMCP](https://webmachinelearning.github.io/webmcp/)，原载于 Hacker News。

## 什么是 WebMCP？

WebMCP API 是一个全新的 JavaScript 接口，它允许 Web 开发者将自己的 Web 应用功能暴露为「工具（tools）」。这些工具本质上是带有自然语言描述和结构化 schema 的 JavaScript 函数，可以被 Agent、浏览器内置 Agent 以及辅助技术调用。

简单来说，使用 WebMCP 的 Web 页面可以被看作是实现了 Model Context Protocol (MCP) 的服务器，只不过这些工具是在客户端脚本中实现，而非后端。

WebMCP 的核心理念是实现**协作式工作流**——用户和 Agent 在同一个 Web 界面中协同工作，既利用了现有的应用逻辑，又保持了共享上下文和用户控制权。

## 核心概念

### Agent（智能体）

Agent 是一种自主助手，能够理解用户目标并代表用户采取行动来实现这些目标。目前，这些通常由基于大语言模型 (LLM) 的 AI 平台实现，通过基于文本的聊天界面与用户交互。

### Browser's Agent（浏览器智能体）

浏览器智能体是由浏览器提供或通过浏览器访问的 Agent。它可以直接内置在浏览器中，也可以通过扩展或插件托管。

### AI Platform（AI 平台）

AI 平台是提供智能体助手的服务提供商，例如 OpenAI 的 ChatGPT、Anthropic 的 Claude 或 Google 的 Gemini。

## API 详解

### Navigator 接口扩展

WebMCP 扩展了 `Navigator` 接口，提供对 `ModelContext` 的访问：

```javascript
partial interface Navigator {
  [SecureContext, SameObject] readonly attribute ModelContext modelContext;
};
```

### ModelContext 接口

`ModelContext` 接口提供了注册和管理工具的方法：

```javascript
[Exposed=Window, SecureContext]
interface ModelContext {
  undefined provideContext(optional ModelContextOptions options = {});
  undefined clearContext();
  undefined registerTool(ModelContextTool tool);
  undefined unregisterTool(DOMString name);
};
```

**主要方法说明：**

- `navigator.modelContext.provideContext(options)` — 向浏览器注册提供的上下文（工具）。此方法会先清除所有已存在的工具和其他上下文，然后注册新的。
- `navigator.modelContext.clearContext()` — 注销所有已注册的上下文（工具）。
- `navigator.modelContext.registerTool(tool)` — 注册单个工具而不清除现有工具集。如果同名工具已存在，或 `inputSchema` 无效，则会抛出错误。
- `navigator.modelContext.unregisterTool(name)` — 从已注册集合中移除指定名称的工具。

### ModelContextTool 字典

`ModelContextTool` 字典描述了可被 Agent 调用的工具：

```javascript
dictionary ModelContextTool {
  required DOMString name;
  required DOMString description;
  object inputSchema;
  required ToolExecuteCallback execute;
  ToolAnnotations annotations;
};

callback ToolExecuteCallback = Promise<any> (object input, ModelContextClient client);
```

**字段说明：**

- `name` — 工具的唯一标识符，Agent 在调用工具时使用此名称进行引用。
- `description` — 工具功能的自然语言描述，帮助 Agent 理解何时以及如何使用该工具。
- `inputSchema` — 描述工具期望输入参数的 JSON Schema 对象。
- `execute` — 当 Agent 调用工具时执行的回调函数，接收输入参数和 `ModelContextClient` 对象。该函数可以是异步的并返回 Promise。
- `annotations` — 可选的注解，提供关于工具行为的额外元数据。

### ToolAnnotations 字典

```javascript
dictionary ToolAnnotations {
  boolean readOnlyHint;
};
```

- `readOnlyHint` — 如果为 `true`，表示工具不修改任何状态，只读取数据。此提示可以帮助 Agent 决定何时可以安全地调用该工具。

### ModelContextClient 接口

`ModelContextClient` 接口表示通过 `ModelContext` API 执行工具的 Agent：

```javascript
[Exposed=Window, SecureContext]
interface ModelContextClient {
  Promise<any> requestUserInteraction(UserInteractionCallback callback);
};

callback UserInteractionCallback = Promise<any> ();
```

`client.requestUserInteraction(callback)` 方法允许在工具执行期间异步请求用户输入。回调函数会被调用来执行用户交互（例如显示确认对话框），Promise 会以回调结果 resolve。

## 实际应用场景

WebMCP 的设计为 Web 开发带来了全新的可能性：

1. **增强现有应用** — 无需重构后端，只需在前端添加工具描述，就能让 AI Agent 理解并操作你的应用。

2. **协作式 AI** — 用户和 AI 在同一界面中协作，用户保持完全控制权，AI 可以请求用户确认敏感操作。

3. **浏览器原生集成** — 未来浏览器可能内置 Agent，直接与支持 WebMCP 的网站交互。

4. **无障碍访问** — 辅助技术可以利用这些工具描述更好地理解页面功能。

## 安全与隐私考量

规范中安全与隐私部分仍在完善中（标记为 TODO），但设计上已经考虑了：

- **SecureContext 要求** — API 只能在安全上下文（HTTPS）中使用。
- **用户交互确认** — 敏感操作可以通过 `requestUserInteraction` 请求用户确认。
- **只读提示** — 通过 `readOnlyHint` 注解，Agent 可以识别哪些操作是安全的。

## 与 MCP 的关系

Model Context Protocol (MCP) 是 Anthropic 提出的协议标准，用于 AI 模型与外部工具/数据源的交互。WebMCP 可以看作是 MCP 在浏览器端的实现：

- 传统 MCP 服务器运行在后端
- WebMCP 让前端页面本身成为 MCP 服务器
- 工具逻辑在客户端 JavaScript 中执行

这种设计使得无需后端改动就能让现有 Web 应用具备 AI 可调用能力。

## 小结

WebMCP 代表了 Web 与 AI 深度融合的一个重要方向。它让 Web 开发者能够：

- 用简单的 API 将应用功能暴露给 AI Agent
- 保持用户控制权和隐私
- 实现人机协作的工作流
- 无需复杂后端改造

随着浏览器厂商和 AI 平台的支持，我们可能会看到越来越多支持 WebMCP 的 Web 应用，让 AI 助手能够真正理解并操作我们日常使用的网站。

对于前端开发者来说，这是一个值得关注的新 API。建议持续关注 [Web Machine Learning Community Group](https://www.w3.org/community/webmachinelearning/) 的进展，以及各浏览器的实现状态。
