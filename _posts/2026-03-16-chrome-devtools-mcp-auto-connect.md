---
layout: post
title: "让 AI 编程助手调试你的浏览器会话——Chrome DevTools MCP 新功能"
date: 2026-03-16 05:38:53 +0800
categories: tech-translation
description: "Chrome DevTools MCP 服务器新增 autoConnect 功能，让 AI 编程助手可以直接连接到你正在使用的浏览器会话，实现人工与 AI 辅助调试的无缝切换。"
original_url: https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session
source: Hacker News
---

本文翻译自 [Let your Coding Agent debug your browser session with Chrome DevTools MCP](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session)，原载于 Hacker News。

---

## 引言

Chrome DevTools MCP（Model Context Protocol）服务器迎来了一项备受期待的新功能：**让 AI 编程助手（Coding Agent）直接连接到你正在使用的浏览器会话**。

这意味着什么？简单来说，你不再需要在"手动调试"和"AI 辅助调试"之间做选择了。两者可以无缝切换，协同工作。

## 新功能的核心能力

这次更新主要带来了两大能力：

### 1. 复用现有浏览器会话

想象一下这个场景：你遇到一个需要登录后才能复现的 bug。以前，AI 助手需要单独启动一个浏览器实例，还得重新登录——这个过程往往很麻烦，甚至可能因为二次验证等原因完全无法完成。

现在，AI 助手可以直接访问你当前的浏览器会话，无需额外登录。这对于调试需要身份验证的页面来说，简直是救星。

### 2. 访问活跃的调试会话

更酷的是，AI 助手现在可以访问你在 DevTools 中的调试状态：

- **Network 面板**：当你在网络面板中发现一个失败的请求，选中它，然后直接让 AI 助手帮你分析原因
- **Elements 面板**：同样，选中有问题的 DOM 元素，让 AI 助手来调查

这种"我先看看，搞不定再交给 AI"的工作流程，让调试变得更加自然。

## 技术实现原理

这个功能基于 Chrome M144（目前处于 Beta 阶段）新增的远程调试连接请求机制。

出于安全考虑，远程调试连接在 Chrome 中默认是关闭的。你需要：

1. 前往 `chrome://inspect#remote-debugging` 显式启用该功能
2. 每次 MCP 服务器请求连接时，Chrome 都会弹出对话框请求用户确认
3. 调试会话活跃期间，Chrome 顶部会显示"Chrome 正在被自动化测试软件控制"的横幅

![远程调试流程示意](https://developer.chrome.com/static/blog/chrome-devtools-mcp-debug-your-browser-session/image/devtools-mcp-auto-connection-diagram.png)

这套安全机制确保了只有用户明确授权的连接才能建立，防止恶意软件滥用。

## 快速上手指南

### 第一步：在 Chrome 中启用远程调试

1. 确保你的 Chrome 版本 >= 144（Beta 或更新版本）
2. 地址栏输入 `chrome://inspect/#remote-debugging`
3. 按照界面提示启用远程调试功能

![Chrome 远程调试设置](https://developer.chrome.com/static/blog/chrome-devtools-mcp-debug-your-browser-session/image/chrome-remote-debugging.png)

### 第二步：配置 Chrome DevTools MCP 服务器

在你的 MCP 客户端配置中添加 `--autoConnect` 参数。以下是以 `gemini-cli` 为例的配置：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--autoConnect",
        "--channel=beta"
      ]
    }
  }
}
```

> **小贴士**：`--channel=beta` 参数是因为该功能目前需要 Chrome Beta 版本。等稳定版发布后，可以移除此参数。

### 第三步：测试配置

打开你的 AI 助手（如 gemini-cli），试试这个 prompt：

```
Check the performance of https://developers.chrome.com
```

首次连接时，Chrome 会弹出权限请求对话框：

![Chrome 请求远程调试权限](https://developer.chrome.com/static/blog/chrome-devtools-mcp-debug-your-browser-session/image/chrome-enable-remote-debugging.png)

点击"允许"后，MCP 服务器就会自动打开 developers.chrome.com 并开始性能分析。

完整的配置说明可以参考 [GitHub 上的 README](https://github.com/nicholasrenz/chrome-devtools-mcp)。

## 实战场景

### 场景一：让 AI 接手你的调试工作

你正在用 DevTools 排查网站问题，发现某个元素显示异常。你可以在 Elements 面板中选中该元素，然后告诉 AI 助手："帮我调查这个元素的样式问题"。

AI 助手可以直接读取你选中的元素上下文，进行深入分析。

### 场景二：分析失败的网络请求

在 Network 面板中，你发现一个返回 500 错误的 API 请求。选中它，然后让 AI 助手帮你分析请求头、响应内容，甚至可以根据错误信息建议修复方案。

![选择网络请求进行分析](https://developer.chrome.com/static/blog/chrome-devtools-mcp-debug-your-browser-session/image/select-network-request-poster.png)

## 其他连接方式

除了新的 autoConnect 功能，Chrome DevTools MCP 仍然支持以下连接方式：

- 使用 MCP 服务器专用的用户配置文件启动 Chrome（当前默认方式）
- 通过远程调试端口连接到正在运行的 Chrome 实例
- 在隔离环境中运行多个 Chrome 实例，每个使用临时配置文件

这些方式各有适用场景，autoConnect 只是增加了一个更便捷的选项。

## 未来展望

这只是第一步。Chrome 团队计划逐步将更多 DevTools 面板的数据暴露给 AI 助手，包括 Console、Sources、Performance 等面板。可以期待未来 AI 助手能够更深入地参与调试流程。

## 总结

这次更新解决了一个痛点：**AI 辅助开发工具与人工调试之间的隔阂**。

以前，你要么自己调试，要么让 AI 从头开始。现在，你可以先手动排查到某个具体点，然后无缝地交给 AI 继续深入——这种混合模式更符合实际开发工作流。

对于中国开发者来说，这个功能特别适合处理那些需要登录态、有多重验证的内网系统调试场景。值得尝试！

---

**关键要点：**

- Chrome DevTools MCP 新增 `--autoConnect` 功能
- AI 助手可直接连接当前浏览器会话，无需重新登录
- 支持读取 DevTools 中的选中状态（Elements/Network 面板）
- 需要 Chrome M144+ 并手动启用远程调试
- 完善的权限确认机制确保安全
