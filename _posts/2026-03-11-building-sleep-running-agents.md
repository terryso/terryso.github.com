---
layout: post
title: "让 AI Agent 在你睡觉时自动写代码"
date: 2026-03-11 04:03:18 +0800
categories: tech-translation
description: "探讨如何构建能够自主运行的 AI 编程 Agent，以及如何通过验收标准（Acceptance Criteria）+ Playwright 的组合来解决 AI 生成代码的信任问题。"
original_url: https://www.claudecodecamp.com/p/i-m-building-agents-that-run-while-i-sleep
source: Hacker News
---

本文翻译自 [I'm Building Agents That Run While I Sleep](https://www.claudecodecamp.com/p/i-m-building-agents-that-run-while-i-sleep)，原载于 Hacker News。

## 当 Agent 在深夜独自工作

我一直在构建能够在睡梦中写代码的 Agent。像 Gastown 这样的工具可以连续运行数小时，无需我盯着。代码变更会自动提交到我从没读过的分支。

几周前我意识到一个严重问题：**我没有可靠的方式来验证这些代码是否正确**——它们是否真正实现了我要求的功能。

这很重要。我不想推送一堆垃圾代码，但我当时确实没有好的答案。

过去六个月里，我为超过 100 名工程师举办过 Claude Code 工作坊。到处都是同样的问题，只是规模不同。使用 Claude 进行日常 PR 的团队，每周合并量从 10 个飙升到 40-50 个。团队花费在代码审查上的时间大幅增加。

随着系统越来越自主，这个问题会越来越严重。到了某个节点，你根本不再审查 diff，只是盯着部署结果，祈祷不要出问题。

所以我一直在思考一个核心问题：**当你无法审查一切时，你到底在信任什么？**

## 那些看似显而易见的答案

### 雇佣更多审查者？

你可以雇佣更多审查人员，但招人的速度根本赶不上。而且让资深工程师整天阅读 AI 生成的代码，简直是人才浪费。

### 让 AI 写测试？

当 Claude 为自己刚写的代码编写测试时，它实际上是在自我检查。这些测试证明代码做了 **Claude 认为你想要的东西**，而不是**你真正想要的东西**。它们能捕获回归问题，但无法发现最初的理解偏差。

当同一个 AI 既写代码又写测试时，你实际上构建了一个**自我表扬机器**。

这正是代码审查原本要解决的问题：一双不属于原作者的眼睛。但一个 AI 写代码、另一个 AI 检查，并不是新鲜的视角。它们来自同一个地方，会错过同样的东西。

## TDD 的智慧

测试驱动开发（TDD）的核心流程：先写测试，再写代码，测试通过就停止。大多数团队没有这样做，因为在写代码之前思考清楚需求需要时间，而他们没有这个时间。

**AI 消除了这个借口**，因为 Claude 处理了速度问题。现在慢的部分变成了判断代码是否正确——这正是 TDD 要解决的：先把"正确"的样子写下来，然后再去验证。

传统 TDD 要求写单元测试，意味着你需要在写代码前思考它将如何工作。这里有一个更简单的方法：用**通俗的英语**写下功能应该做什么，让机器自己去 figuring out 如何检查它。

举个例子：

```
用户可以使用邮箱和密码登录。
输入错误凭据时，显示 "Invalid email or password"。
登录成功后跳转到 /dashboard。
会话令牌 24 小时后过期。
```

你可以在打开代码编辑器之前就写好这些。Agent 来构建它，其他东西来验证它。

## 实际落地长什么样

对于前端变更，我们根据规格文件生成验收标准（Acceptance Criteria）：

```markdown
# Task
添加邮箱/密码登录功能。

## Acceptance Criteria

### AC-1: 成功登录
- 用户在 /login 页面输入有效凭据后重定向到 /dashboard
- Session cookie 已设置

### AC-2: 密码错误提示
- 用户看到确切的 "Invalid email or password" 文本
- 用户停留在 /login 页面

### AC-3: 空字段验证
- 任一字段为空时禁用提交按钮，或提交时显示内联错误

### AC-4: 速率限制
- 5 次失败尝试后，登录被阻止 60 秒
- 用户看到包含等待时间的提示信息
```

每条标准都足够具体，要么通过要么失败。一旦 Agent 构建完功能，验证系统会针对每条 AC 运行 Playwright 浏览器 Agent，截图并生成包含每条标准判定结果的报告。如果有失败，你能清楚看到是哪条标准失败了，以及浏览器看到了什么。

对于后端变更，同样的模式无需浏览器即可工作。你指定可观察的 API 行为（状态码、响应头、错误消息），用 curl 命令就能检查。

**诚实地说**：这不能捕获规格本身的理解偏差。如果你的规格一开始就是错的，检查仍然会通过。Playwright 能捕获的是集成失败、渲染 bug、以及理论上可行但在真实浏览器中崩溃的行为。这比"验证正确"的声明要窄，但比代码审查可靠得多。

**核心工作流**：在写 prompt 之前先写验收标准 → 让 Agent 根据它们构建 → 运行验证 → 只审查失败项。你审查的是失败，而不是 diff。

## 如何构建这个系统

我开始构建一个 Claude Skill（[github.com/opslane/verify](https://github.com/opslane/verify)），使用 **claude -p**（Claude Code 的无头模式）加 Playwright MCP 运行。不需要自定义后端，除了现有的 Claude OAuth token 外不需要额外的 API key。

四个阶段：

### 1. 预检查（Pre-flight）
纯 bash 脚本，不涉及 LLM。开发服务器在运行吗？认证会话有效吗？规格文件存在吗？在花费任何 token 之前快速失败。

### 2. 规划器（The Planner）
一个 Opus 调用。读取你的规格和修改的文件，弄清楚每条检查需要什么以及如何运行。它还会读取你的代码找到正确的选择器，而不是瞎猜 class 名称。

### 3. 浏览器 Agent（Browser Agents）
每条 AC 一个 Sonnet 调用，全部并行运行。5 条 AC 就有 5 个 Agent，各自独立导航和截图。Sonnet 比 Opus 便宜 3-4 倍，但在点击浏览这件事上效果一样好。

### 4. 评判器（The Judge）
最后一个 Opus 调用，读取所有证据并返回每条标准的判定：通过、失败或需要人工审查。

```bash
claude -p --model claude-opus-4-6 \
"Review this evidence and return a verdict for each AC.
Evidence: $(cat .verify/evidence/*/result.json)
Return JSON: {verdicts: [{id, passed, reasoning}]}"
```

安装为 Claude Code 插件：

```bash
/plugin marketplace add opslane/opslane-v3
/plugin install opslane-verify@opslane-v3
```

或者克隆仓库自行改编。每个阶段就是一个单独的 **claude -p** 调用，有清晰的输入和结构化输出。你可以替换模型、添加阶段，或用 **--dangerously-skip-permissions** 接入 CI。

## 核心启示

我反复思考的一点是：**除非在 Agent 开始之前你就告诉它"完成"长什么样，否则你无法信任它产生的任何东西**。

写验收标准比写 prompt 更难，因为它强迫你在看到边界情况之前就思考清楚。工程师抵触它的原因和抵触 TDD 一样——一开始感觉更慢。

但如果没有它们，你所能做的只是阅读输出，然后祈祷它是对的。

---

## 译者总结

这篇文章触及了 AI 辅助编程的一个核心痛点：**当代码产出速度远超审查速度时，我们如何保持对代码质量的信心？**

作者提出的方案很务实：

1. **验收标准先行** - 在写 prompt 之前先定义清晰的验收标准
2. **Playwright 自动验证** - 用真实的浏览器行为来验证功能
3. **只审查失败项** - 大幅减少人工审查的工作量

这个思路其实是 TDD 在 AI 时代的自然延伸。传统 TDD 让我们在写代码前思考清楚需求，现在 AI 帮我们写代码，但"先定义预期行为"这个核心原则依然有效。

对于正在尝试 AI 编程工具的开发者来说，这是一个值得借鉴的模式。与其担心 AI 生成的代码是否正确，不如建立一套自动化的验证机制，让机器来帮我们检查机器的工作。