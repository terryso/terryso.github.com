---
layout: post
title: "WebMCP 开放早期预览：让 AI Agent 更精准地操作你的网站"
date: 2026-03-02 12:57:02 +0800
categories: tech-translation
description: "Chrome 推出的 WebMCP 提供了一套标准化的 API，让 AI Agent 能够以更快、更可靠、更精准的方式在网站上执行操作，开启「智能体互联网」的新篇章。"
original_url: https://developer.chrome.com/blog/webmcp-epp
source: Hacker News
---

本文翻译自 [WebMCP is available for early preview](https://developer.chrome.com/blog/webmcp-epp)，原载于 Chrome Developers Blog。

---

随着 AI Agent（智能体）时代的到来，Chrome 团队正在推动一个新的开放标准——**WebMCP**。这个项目旨在为网站提供一种标准化的方式，让 AI Agent 能够以结构化的方式理解并操作你的网站。

## 为什么需要 WebMCP？

目前，AI Agent 与网站的交互主要依赖于 DOM 操作（模拟点击、填写表单等）。这种方式存在几个问题：

- **不可靠**：页面结构变化可能导致 Agent 操作失败
- **效率低**：Agent 需要反复"理解"页面结构
- **精度差**：复杂操作容易出错

WebMCP 的核心思路是：**让网站主动告诉 Agent 如何操作**，而不是让 Agent 猜测。

## 两种 API 设计

WebMCP 提供了两套互补的 API：

### 1. 声明式 API（Declarative API）

适用于标准化操作，可以直接在 HTML 中定义。比如表单提交、按钮点击等。这种方式简单直接，无需编写 JavaScript。

```html
<!-- 示例：声明式定义一个搜索操作 -->
<form action="/search" method="get" data-mcp-action="search">
  <input type="text" name="q" data-mcp-param="query" />
  <button type="submit">搜索</button>
</form>
```

### 2. 命令式 API（Imperative API）

适用于复杂的动态交互，需要 JavaScript 执行。比如购物车操作、多步骤表单、实时数据更新等。

```javascript
// 示例：注册一个复杂的购物操作
navigator.mcp.registerAction({
  name: 'add_to_cart',
  description: '将商品添加到购物车',
  parameters: {
    productId: { type: 'string', required: true },
    quantity: { type: 'number', default: 1 }
  },
  execute: async (params) => {
    // 自定义逻辑
    await addToCart(params.productId, params.quantity);
    return { success: true };
  }
});
```

## 典型应用场景

### 客户支持

Agent 可以自动收集技术细节，帮用户创建详细的工单。系统错误、环境信息、复现步骤——都能自动填充。

### 电商购物

用户说"找一款红色的大码羽绒服"，Agent 就能精准筛选、配置选项、完成结账流程。

### 旅行预订

复杂的航班搜索、多条件筛选、价格比较——Agent 都能基于结构化数据完成，确保结果准确无误。

## 如何参与早期预览

WebMCP 目前已开放早期预览计划（Early Preview Program）。参与后你可以：

- 获取完整文档和示例代码
- 体验演示应用
- 了解最新的 API 变更
- 参与标准制定讨论

感兴趣的开发者可以关注 [Chrome Developers](https://developer.chrome.com/) 获取更多信息。

## 我的思考

WebMCP 代表了一种重要的范式转变：从"Agent 适应网站"到"网站配合 Agent"。

这与 MCP（Model Context Protocol）的理念一脉相承——通过标准化接口，让 AI 系统能够更可靠地与外部世界交互。WebMCP 可以看作是 MCP 在 Web 领域的延伸。

对于国内开发者来说，这是一个值得关注的方向：

1. **国际化应用**：如果你的产品面向全球用户，WebMCP 可以让你的网站更容易被各种 AI 助手操作
2. **无障碍访问**：结构化的操作定义也能提升无障碍体验
3. **自动化测试**：WebMCP 定义的接口可以用于更可靠的 E2E 测试

不过目前 WebMCP 还在早期阶段，API 可能会有较大变化。建议先关注、学习，等标准更稳定后再投入生产环境。

---

**要点总结：**

- WebMCP 让网站能主动向 AI Agent 暴露结构化操作接口
- 提供声明式（HTML）和命令式（JS）两种 API
- 适用于客服、电商、旅行等复杂交互场景
- 目前处于早期预览阶段，适合关注学习
