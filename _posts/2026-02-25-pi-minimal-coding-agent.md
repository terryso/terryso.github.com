---
layout: post
title: "Pi：一个极简主义的终端 AI 编程助手"
date: 2026-02-25 18:07:49 +0800
categories: tech-translation
description: "Pi 是一个极简的终端编程工具，支持 15+ AI 提供商，通过 TypeScript 扩展、技能包和主题实现高度可定制化，让开发者按照自己的方式工作。"
original_url: https://pi.dev
source: Hacker News
---

本文翻译自 [Pi: Minimal Terminal Coding Agent](https://pi.dev)，原载于 Hacker News。

## 为什么选择 Pi？

Pi 是一个极简的终端编程工具（terminal coding harness）。它的设计理念是：**让你来适应 Pi，不如让 Pi 适应你的工作流**。

你可以通过 TypeScript 扩展、技能包（skills）、提示词模板和主题来定制 Pi。甚至可以将它们打包成 pi packages，通过 npm 或 git 分享给其他人。

Pi 自带了强大的默认配置，但故意省略了一些功能，比如子代理（sub-agents）和计划模式（plan mode）。你可以让 Pi 自己构建你需要的功能，或者安装别人做好的 package。

它支持四种模式：交互模式、打印/JSON 模式、RPC 模式和 SDK 模式。

```bash
$ npm install -g @mariozechner/pi-coding-agent
```

## 提供商与模型

Pi 支持超过 15 个 AI 提供商，涵盖数百个模型：

- **主流提供商**：Anthropic、OpenAI、Google、Azure、Bedrock、Mistral
- **高性能推理**：Groq、Cerebras、xAI
- **开源生态**：Hugging Face、Ollama、OpenRouter
- **其他**：Kimi For Coding、MiniMax 等

认证方式支持 API keys 或 OAuth。你可以在会话中随时切换模型（`/model` 或 `Ctrl+L`），也可以用 `Ctrl+P` 在收藏的模型间快速切换。

如果需要，还可以通过 `models.json` 或扩展添加自定义提供商和模型。

## 会话管理：树形结构

Pi 的会话以**树形结构**存储，这是一个很棒的设计：

- 使用 `/tree` 命令导航到任意历史节点，从那里继续对话
- 所有分支都保存在单个文件中
- 可以按消息类型过滤，给条目添加书签标签
- 使用 `/export` 导出到 HTML，或用 `/share` 上传到 GitHub gist 获得可分享的链接

这种设计让你可以自由探索不同的对话分支，而不必担心丢失上下文。

## 上下文工程（Context Engineering）

Pi 的系统提示词非常精简，这让你能够真正做上下文工程——控制什么内容进入上下文窗口，以及如何管理它们。

### AGENTS.md

项目指令文件，启动时从以下位置加载：
- `~/.pi/agent/`（全局）
- 父目录（继承）
- 当前目录（项目特定）

### SYSTEM.md

每个项目可以自定义系统提示词，替换或追加到默认提示词。

### 压缩（Compaction）

当接近上下文限制时，自动总结旧消息。这个功能完全可以通过扩展自定义：
- 实现基于主题的压缩
- 代码感知的摘要
- 使用不同的总结模型

### 技能包（Skills）

能力包，包含指令和工具，按需加载。这样可以逐步展示功能，而不会撑爆 prompt cache。

### 提示词模板

可复用的提示词，保存为 Markdown 文件。输入 `/name` 即可展开。

### 动态上下文

扩展可以在每次对话轮次前注入消息、过滤历史记录、实现 RAG，或构建长期记忆。

## 消息队列：引导或跟进

这是一个很实用的功能：你可以在 agent 工作时提交消息：

- **Enter**：发送引导消息（steering message），在当前工具执行后立即送达，打断剩余工具的执行
- **Alt+Enter**：发送跟进消息（follow-up），等待 agent 完成当前工作后再处理

这让你能够在 agent 走偏时及时纠正，或者在它完成后无缝追加任务。

## 扩展系统：原语而非功能

Pi 的哲学是：**其他 agent 内置的功能，你可以自己构建**。

扩展是 TypeScript 模块，可以访问：
- 工具（tools）
- 命令（commands）
- 键盘快捷键
- 事件
- 完整的 TUI 界面

你可以构建：
- 子代理
- 计划模式
- 权限确认
- 路径保护
- SSH 执行
- 沙箱
- MCP 集成
- 自定义编辑器
- 状态栏、覆盖层

官方有 50 多个示例，甚至有人让它跑起来了 Doom。

不想自己构建？让 Pi 帮你构建，或者安装别人做好的 package。

## 包管理

可以将扩展、技能包、提示词和主题打包，从 npm 或 git 安装：

```bash
$ pi install npm:@foo/pi-tools
$ pi install git:github.com/badlogic/pi-doom
```

支持版本锁定（`@1.2.3` 或 `@tag`），批量更新（`pi update`），列表查看（`pi list`），配置管理（`pi config`）。

测试时可以用 `pi -e git:github.com/user/repo` 直接运行而不安装。

在 npm 或 Discord 上可以找到社区分享的 package（关键词：`pi-package`）。

## 集成模式

Pi 支持四种模式：

1. **交互模式**：完整的 TUI 体验
2. **打印/JSON 模式**：`pi -p "query"` 用于脚本，`--mode json` 输出事件流
3. **RPC 模式**：通过 stdin/stdout 的 JSON 协议，适合非 Node 集成
4. **SDK 模式**：嵌入到你自己的应用中

## 哲学：我们没有构建什么

Pi 的核心是"激进的可扩展性"——通过扩展、技能包或第三方 package 来实现功能，而不是把它们烘焙进核心。这保持了核心的精简，同时让你按照自己的方式工作。

**没有 MCP 集成**：构建带 README 的 CLI 工具（见 Skills），或者自己写扩展添加 MCP 支持。

**没有子代理**：有很多方式实现。用 tmux 启动多个 pi 实例，或者自己写扩展，或者安装 package。

**没有权限弹窗**：在容器中运行，或者自己构建符合你环境和安全要求的确认流程。

**没有计划模式**：把计划写到文件，或者自己构建，或者安装 package。

**没有内置待办事项**：用 TODO.md 文件，或者自己构建。

**没有后台 bash**：用 tmux。完全可观测，直接交互。

这个设计哲学很有意思——**宁可少做，把选择权交给用户**。通过强大的扩展系统，用户可以按需添加功能，而不是被迫接受一个臃肿的默认配置。

---

## 总结

Pi 是一个设计哲学非常鲜明的 AI 编程助手：

1. **极简核心**：不内置子代理、计划模式、权限弹窗等功能
2. **强大扩展**：通过 TypeScript 扩展实现任何你需要的功能
3. **上下文工程**：精细控制进入上下文窗口的内容
4. **树形会话**：支持分支探索，所有历史可追溯
5. **多模型支持**：15+ 提供商，会话中随时切换

如果你厌倦了那些"什么功能都有但什么都不够好"的 AI 工具，Pi 的"少即是多"理念可能会让你眼前一亮。
