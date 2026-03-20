---
layout: post
title: "Claude Code Channels：让 AI 助手实时响应外部事件"
date: 2026-03-20 17:26:08 +0800
categories: tech-translation
description: "Claude Code 的 Channels 功能让你可以通过 MCP 服务器将消息、警报和 webhook 推送到运行中的 Claude Code 会话，实现 CI 结果转发、聊天消息桥接和监控事件响应。"
original_url: https://code.claude.com/docs/en/channels
source: Hacker News
---

本文翻译自 [Push events into a running session with channels](https://code.claude.com/docs/en/channels)，原载于 Hacker News。

## 什么是 Channels？

**Channel（通道）** 是一种特殊的 MCP 服务器，它可以将事件推送到你正在运行的 Claude Code 会话中。这意味着即使你不在终端前，Claude 也能对发生的事情做出反应。

Channels 可以是双向的：Claude 读取事件后，可以通过同一个通道回复消息——就像一个聊天桥接器。需要注意的是，事件只有在会话打开时才能送达，所以如果你需要"永远在线"的设置，需要在后台进程或持久终端中运行 Claude。

你需要将 channel 作为插件安装，并使用自己的凭证进行配置。目前研究预览版已包含 **Telegram** 和 **Discord** 的支持。

> 💡 **小贴士**：当 Claude 通过 channel 回复时，你的终端会显示入站消息，但不会显示回复文本。终端只显示工具调用和确认信息（比如"已发送"），实际的回复会出现在另一个平台上。

## 支持的 Channels

每个支持的 channel 都是一个需要 [Bun](https://bun.sh/) 的插件。目前官方支持：

- **Telegram** - 通过 Telegram Bot 与 Claude 交互
- **Discord** - 通过 Discord Bot 与 Claude 交互

当然，你也可以为还没有插件的系统构建自己的 channel。

## 快速上手：Fakechat 演示

如果你想在连接真实平台之前先体验一下插件流程，可以试试 **fakechat** —— 这是一个在 localhost 上运行的官方演示 channel，无需认证，也无需配置外部服务。

安装并启用 fakechat 后，你可以在浏览器中输入文字，消息就会到达你的 Claude Code 会话。Claude 回复后，回复会显示回浏览器中。体验过 fakechat 后，再尝试 Telegram 或 Discord 就会轻松很多。

### 准备工作

要尝试 fakechat 演示，你需要：

- 已安装并使用 claude.ai 账户认证的 Claude Code
- 已安装 Bun（预构建的 channel 插件是 Bun 脚本）。用 `bun --version` 检查；如果失败，请安装 Bun
- **Team/Enterprise 用户**：你的组织管理员必须在托管设置中启用 channels

> ⚠️ **注意**：如果你离开终端时 Claude 遇到权限提示，会话会暂停直到你在本地批准。对于无人值守的使用，`--dangerously-skip-permissions` 可以跳过提示，但请只在可信环境中使用。

## 安全机制

每个批准的 channel 插件都会维护一个 **发送者白名单**：只有你添加的 ID 才能推送消息，其他人会被静默丢弃。

Telegram 和 Discord 通过 **配对（pairing）** 来初始化白名单：

1. 在 Telegram 或 Discord 中找到你的机器人，发送任意消息
2. 机器人会回复一个配对码
3. 在你的 Claude Code 会话中，收到提示时批准该配对码
4. 你的发送者 ID 就会被添加到白名单

除此之外，你还可以通过 `--channels` 参数控制每个会话启用哪些服务器。在 Team 和 Enterprise 计划中，你的组织可以通过 `channelsEnabled` 设置控制可用性。

仅仅在 `.mcp.json` 中配置是不够的：服务器还必须通过 `--channels` 参数指定才能推送消息。

## 企业级控制

Channels 由托管设置中的 `channelsEnabled` 设置控制：

| 计划类型 | 默认行为 |
| --- | --- |
| Pro / Max（无组织） | Channels 可用；用户通过 `--channels` 参数在每个会话中选择启用 |
| Team / Enterprise | Channels 默认禁用，直到管理员显式启用 |

### 为你的组织启用 Channels

管理员可以通过 **claude.ai → Admin settings → Claude Code → Channels** 启用 channels，或者在托管设置中将 `channelsEnabled` 设置为 `true`。

启用后，组织中的用户可以使用 `--channels` 参数在各个会话中选择启用 channel 服务器。如果设置被禁用或未设置，MCP 服务器仍然可以连接，其工具也能正常工作，但 channel 消息不会送达。启动时会有警告提示用户联系管理员启用该设置。

## 研究预览说明

Channels 目前是一个 **研究预览功能**。可用性正在逐步推出，`--channels` 参数语法和协议契约可能会根据反馈发生变化。

在预览期间，`--channels` 只接受来自 Anthropic 维护的白名单中的插件。`claude-plugins-official` 中的 channel 插件是经过批准的集合。如果你传递了不在白名单中的内容，Claude Code 会正常启动，但 channel 不会注册，启动通知会告诉你原因。

如果你要测试自己构建的 channel，可以使用 `--dangerously-load-development-channels` 参数。

如果遇到问题或有反馈，请在 [Claude Code GitHub 仓库](https://github.com/anthropics/claude-code) 上报告。

## 下一步

成功运行 channel 后，可以探索这些相关功能：

- **构建自己的 channel**：为还没有插件的系统创建自定义集成
- **Remote Control**：从手机驱动本地会话，而不是将事件转发到会话中
- **Scheduled tasks**：按计划轮询，而不是响应推送的事件

---

## 总结

Claude Code 的 Channels 功能为开发者提供了一种强大的方式，让 AI 助手能够实时响应外部事件。无论你是想：

- 在 CI/CD 流程完成时收到通知并让 Claude 分析结果
- 通过 Telegram 或 Discord 远程与 Claude 交互
- 构建自定义集成来监控和响应系统事件

Channels 都能让 Claude Code 从一个被动的编码助手变成一个主动的、能响应实时事件的智能代理。虽然目前还处于研究预览阶段，但这个功能展示了 AI 开发工具的一个有趣方向——让 AI 更深入地融入我们的工作流程中。
