---
layout: post
title: "Claude Code Channels：让你的 AI 助手实时响应外部事件"
date: 2026-03-20 19:33:01 +0800
categories: tech-translation
description: "介绍 Claude Code 的 Channels 功能，它允许通过 MCP 服务器将消息、告警和 Webhook 推送到运行中的 Claude Code 会话，实现 AI 对外部事件的实时响应。"
original_url: https://code.claude.com/docs/en/channels
source: Hacker News
---

本文翻译自 [Push events into a running session with channels](https://code.claude.com/docs/en/channels)，原载于 Hacker News。

## 什么是 Channels？

如果你曾希望在离开终端时，Claude 依然能够响应外部事件——比如 CI/CD 构建完成的通知、团队聊天中的消息，或者监控系统的告警——那么 **Channels** 正是为你准备的功能。

Channels 是一种 MCP（Model Context Protocol）服务器，它可以将事件**推送到你正在运行的 Claude Code 会话**中。这样，即使你不在终端前，Claude 也能对这些事件做出反应。

更有趣的是，Channels 支持双向通信：Claude 不仅能够读取事件，还能通过同一个 channel 进行回复。这就像是搭建了一座桥梁，让 Claude 可以与 Telegram、Discord 等平台直接交互。

> **注意**：事件只有在会话开启时才能送达。如果你需要一个"始终在线"的设置，可以在后台进程或持久化终端中运行 Claude。

## 支持的 Channel 类型

目前官方支持的 Channels 插件需要 [Bun](https://bun.sh/) 运行时：

- **Telegram** - 与 Telegram Bot 集成
- **Discord** - 与 Discord Bot 集成
- **Fakechat** - 本地演示用的 channel，无需任何认证配置

对于没有现成插件的系统，你也可以**构建自己的 channel**。

## 快速上手：Fakechat 演示

Fakechat 是官方提供的一个演示 channel，它会在本地启动一个聊天界面，无需认证，也无需配置外部服务。

### 前置条件

- 已安装并登录 Claude Code（使用 claude.ai 账户）
- 已安装 Bun（可用 `bun --version` 检查）
- **团队/企业用户**：需要组织管理员在托管设置中启用 channels

### 工作流程

1. 安装并启用 fakechat 后，在浏览器中打开其界面
2. 在浏览器中输入消息，消息会实时传送到你的 Claude Code 会话
3. Claude 回复后，回复内容会显示回浏览器

这是一个很好的方式来熟悉 channel 的工作原理，然后再连接到 Telegram 或 Discord 等真实平台。

### 关于无人值守运行

如果在你离开终端期间，Claude 遇到权限提示，会话会暂停直到你在本地批准。对于无人值守的使用场景，可以使用 `--dangerously-skip-permissions` 标志来跳过提示，但**请确保只在可信环境中使用此选项**。

## 安全机制

安全性是 Channels 设计的核心考虑。每个批准的 channel 插件都维护一个**发送者白名单**：只有你添加的 ID 才能推送消息，其他人的消息会被静默丢弃。

### Telegram 和 Discord 的配对流程

这两个平台通过"配对"机制来初始化白名单：

1. 在 Telegram 或 Discord 中找到你的 bot，发送任意消息
2. Bot 会回复一个配对码
3. 在 Claude Code 会话中，当收到提示时批准该配对码
4. 你的发送者 ID 会被添加到白名单中

### 多层安全控制

除了白名单机制，还有以下安全层：

- **会话级别**：使用 `--channels` 参数控制每个会话启用哪些服务器
- **组织级别**：在 Team 和 Enterprise 计划中，组织可以控制 channel 的可用性

> 重要：仅仅在 `.mcp.json` 中配置是不够的——服务器还必须通过 `--channels` 参数显式指定。

## 企业级控制

对于 Team 和 Enterprise 用户，channels 功能由托管设置中的 `channelsEnabled` 设置控制：

| 计划类型 | 默认行为 |
|---------|---------|
| Pro / Max（无组织） | Channels 可用；用户需在每个会话中使用 `--channels` 参数启用 |
| Team / Enterprise | Channels 默认禁用，直到管理员显式启用 |

### 为组织启用 Channels

管理员可以通过以下方式启用：

- 在 **claude.ai → Admin settings → Claude Code → Channels** 中设置
- 或在托管设置中将 `channelsEnabled` 设为 `true`

启用后，组织中的用户可以使用 `--channels` 参数在各个会话中启用 channel 服务器。

## 研究预览状态

Channels 目前处于**研究预览**阶段，需要注意以下几点：

- 功能可用性正在逐步推出
- `--channels` 标志语法和协议可能会根据反馈进行更改
- 在预览期间，`--channels` 只接受来自 Anthropic 维护的白名单中的插件
- 如需测试自定义 channel，可使用 `--dangerously-load-development-channels` 标志

如果你遇到问题或有反馈，可以在 [Claude Code GitHub 仓库](https://github.com/anthropics/claude-code)中报告。

## 相关功能

一旦你让 channel 运行起来，可以探索以下相关功能：

- **构建自己的 channel** - 为尚未支持的系统创建插件
- **Remote Control** - 通过手机控制本地会话，而不是转发事件
- **Scheduled tasks** - 按时间轮询，而不是响应推送的事件

---

## 小结

Claude Code 的 Channels 功能为 AI 助手打开了实时事件响应的大门：

1. **实时性**：Claude 可以在你离开时响应外部事件
2. **双向通信**：不仅接收，还能回复
3. **安全可控**：多层安全机制确保只有授权来源能推送消息
4. **企业友好**：支持组织级别的权限控制

这个功能对于需要 Claude 监控 CI/CD 流水线、响应团队消息、或处理系统告警的场景尤其有用。虽然目前还处于研究预览阶段，但已经展现出了巨大的潜力。

作为开发者，我们可以期待 Channels 未来支持更多平台和更丰富的用例。如果你有自动化工作流的需求，不妨现在就试试 fakechat 演示，体验一下这个功能的魅力！
