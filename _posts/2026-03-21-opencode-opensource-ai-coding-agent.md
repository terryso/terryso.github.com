---
layout: post
title: "OpenCode：开源 AI 编程代理新秀"
date: 2026-03-21 22:25:59 +0800
categories: tech-translation
description: "OpenCode 是一款功能强大的开源 AI 编程代理，支持 75+ LLM 提供商，拥有终端、桌面和 IDE 多种使用方式，已获得超过 12 万 GitHub Star。"
original_url: https://opencode.ai/
source: Hacker News
---

本文翻译自 [OpenCode - The Open Source AI Coding Agent](https://opencode.ai/)，原载于 Hacker News。

## 什么是 OpenCode？

在 AI 编程工具百花齐放的今天，OpenCode 作为一款开源的 AI 编程代理（AI Coding Agent）脱颖而出。它不仅提供了终端界面、桌面应用和 IDE 扩展等多种使用方式，更重要的是——它是完全开源的。

OpenCode 的核心优势在于其灵活性：你可以使用内置的免费模型，也可以连接任意 LLM 提供商，包括 Claude、GPT、Gemini 等 75+ 种模型选择。

## 令人瞩目的社区增长

OpenCode 的增长速度令人惊叹：

- **120,000+** GitHub Star
- **800+** 位贡献者
- **10,000+** 次提交
- **5M+** 月活跃开发者

在短短一年内获得近 10 万 Star，这在开源社区实属罕见。MorphLLM 的评测甚至称其为"如果你想要一个拥有强大社区势头的开源终端代理，这是最佳选择"。

## 核心功能特性

### 1. LSP 支持

OpenCode 能够为 LLM（Large Language Model）自动加载合适的 Language Server Protocol，这意味着它能更好地理解你的代码上下文，提供更精准的代码建议和修改。

### 2. 多会话并行

在同一个项目中，你可以并行启动多个代理实例。这对于需要同时处理多个任务的场景非常有用——比如一边修复 bug，一边开发新功能。

### 3. 会话分享

你可以生成任意会话的分享链接，方便团队成员参考或调试。这在团队协作中是一个非常实用的功能。

### 4. 灵活的模型选择

- **GitHub Copilot**：使用 GitHub 登录即可使用你的 Copilot 账户
- **ChatGPT Plus/Pro**：使用 OpenAI 登录即可使用你的 ChatGPT 订阅
- **任意模型**：通过 Models.dev 支持 75+ LLM 提供商，包括本地部署的模型

### 5. 多平台支持

- 终端界面（TUI）
- 桌面应用（macOS、Windows、Linux）
- IDE 扩展

## 隐私优先的设计

对于企业用户和注重隐私的开发者来说，OpenCode 的设计理念非常友好：**它不存储你的任何代码或上下文数据**。这意味着你可以在对隐私敏感的环境中放心使用，无需担心代码泄露到第三方服务器。

## 快速上手

安装 OpenCode 非常简单，只需一行命令：

```bash
curl -fsSL https://opencode.ai/install | bash
```

你也可以通过 npm、Homebrew、Docker 等多种方式安装：

```bash
# npm
npm install -g opencode-ai

# Homebrew (推荐使用官方 tap)
brew install anomalyco/tap/opencode

# Docker
docker run -it --rm ghcr.io/anomalyco/opencode
```

## 使用技巧

### 提问模式

你可以让 OpenCode 为你讲解代码库：

```
How is authentication handled in @packages/functions/src/api/index.ts
```

### 计划模式

对于复杂的功能开发，建议先使用计划模式（按 Tab 键切换）。OpenCode 会分析需求并给出实施方案，而不是直接修改代码。这让你有机会在实施前审查和调整计划。

### 撤销与重做

如果修改不符合预期，可以使用 `/undo` 命令撤销。OpenCode 会还原修改并重新显示之前的对话，让你调整提示词后重试。

## OpenCode Zen：精选模型服务

OpenCode 还提供了 Zen 服务——一组经过团队测试和基准测试的精选 AI 模型。这些模型专门针对编程代理场景优化，免去了在不同提供商之间比较性能的麻烦。

## 个人看法

OpenCode 的出现为 AI 编程工具市场带来了一个真正开放的选择。与闭源的竞争对手相比，开源意味着：

1. **透明度**：你可以审计代码，了解工具的真实行为
2. **可定制性**：可以根据团队需求进行二次开发
3. **社区驱动**：800+ 贡献者意味着更快的问题修复和功能迭代

不过，作为一款相对年轻的工具，OpenCode 在某些方面的成熟度可能还不如 Cursor 等老牌选手。但考虑到其惊人的增长速度和活跃的社区，这只是一个时间问题。

如果你正在寻找一款开源、灵活且注重隐私的 AI 编程助手，OpenCode 绝对值得一试。

## 总结

- OpenCode 是一款完全开源的 AI 编程代理，支持终端、桌面、IDE 多种使用方式
- 已获得 12 万+ GitHub Star，增长势头强劲
- 支持 75+ LLM 提供商，模型选择极其灵活
- 隐私优先设计，不存储用户代码和上下文
- 多会话、LSP 支持、会话分享等功能提升开发效率

---

**参考资料：**
- [OpenCode 官网](https://opencode.ai/)
- [GitHub 仓库](https://github.com/anomalyco/opencode)
- [OpenCode 文档](https://opencode.ai/docs/)
