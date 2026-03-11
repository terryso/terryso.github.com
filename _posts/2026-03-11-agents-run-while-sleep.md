---
layout: post
title: "构建在我睡觉时也能工作的 AI Agent"
date: 2026-03-11 20:23:07 +0800
categories: tech-translation
description: "作者分享了他构建自主 AI Agent 的经验，以及如何通过验收标准（Acceptance Criteria）和 Playwright 自动化测试来验证 AI 生成代码的正确性——这是 AI 编程时代的新 TDD 实践。"
original_url: https://www.claudecodecamp.com/p/i-m-building-agents-that-run-while-i-sleep
source: Hacker News
---

本文翻译自 [I'm Building Agents That Run While I Sleep](https://www.claudecodecamp.com/p/i-m-building-agents-that-run-while-i-sleep)，原载于 Hacker News。

---

我一直在构建能在夜间自动编写代码的 Agent。像 Gastown 这样的工具可以连续运行好几个小时，无需我盯着。代码变更直接合并到我甚至还没读过的分支里。

几周前我意识到一个严重问题：我没有可靠的方法知道这些代码是否正确——它们是否真的做到了我要求它们做的事情。

这个问题让我很在意。我不想推送垃圾代码，但我当时确实没有好的解决方案。

过去六个月里，我为超过 100 名工程师做过 Claude Code 工作坊。到处都是同样的问题，只是规模不同。使用 Claude 日常开发 PR 的团队，每周合并量从 10 个飙升到 40-50 个。团队花在代码审查上的时间大幅增加。

随着系统越来越自主，这个问题会越来越严重。到了某个节点，你根本不会再去审查 diff，只是盯着部署过程，祈祷别出问题。

所以我一直在思考一个核心问题：当你无法审查一切时，你到底能信任什么？

## 显而易见的答案行不通

**多雇审查人员？** 你招人的速度根本跟不上。而且让资深工程师整天读 AI 生成的代码，这种投入产出比太低了。

**让 AI 写测试？** 当 Claude 为自己刚写的代码写测试时，它是在自我检查。这些测试只能证明代码做到了 Claude 认为你想要的效果——而不是你真正想要的效果。它们能捕获回归问题，但发现不了最初的理解偏差。

当你用同一个 AI 既写代码又写测试时，你就造出了一台自我表扬机器。

这恰恰是代码审查本该解决的问题：一双不是原作者的眼睛。但一个 AI 写代码、另一个 AI 做检查，这不是新鲜的视角。它们来自同一个地方，会漏掉同样的东西。

## TDD 做对的事情

先写测试，再写代码，测试通过了就停。大多数团队不这么做，因为在写代码之前思考清楚它该做什么，需要花费他们没有的时间。

AI 消除了这个借口，因为 Claude 解决了速度问题。现在慢的部分变成了判断代码是否正确。这正是 TDD 诞生的目的：先写下"正确"长什么样，然后再去验证。

TDD 让你写单元测试，这意味着在写代码之前就要思考它的实现方式。这里说的方法更简单：用朴素的英语写下功能应该做什么，让机器去想办法验证它。

> "用户可以用邮箱和密码登录。凭证错误时显示'邮箱或密码错误'。成功后跳转到 /dashboard。会话 token 24 小时后过期。"

你可以在打开代码编辑器之前就写好这些。Agent 来构建它，别的东西来验证它。

## 实际操作长什么样

对于前端变更，我们根据规格文件生成验收标准：

```
# Task
添加邮箱/密码登录功能。

## Acceptance Criteria

### AC-1: 成功登录
- 用户在 /login 页面使用有效凭证登录后被重定向到 /dashboard
- Session cookie 被正确设置

### AC-2: 密码错误提示
- 用户看到精确的 "Invalid email or password" 文字
- 用户停留在 /login 页面

### AC-3: 空字段校验
- 任一字段为空时禁用提交按钮，或在空提交时显示内联错误

### AC-4: 速率限制
- 5 次失败尝试后，登录被阻止 60 秒
- 用户看到包含等待时间的提示信息
```

每条标准都足够具体，要么通过要么失败。一旦 Agent 构建完功能，验证系统就会运行 Playwright（浏览器自动化工具）对每条 AC 进行测试，截图并生成带有每条标准判定结果的报告。如果有失败，你能清楚看到是哪条标准失败了，以及浏览器看到了什么。

对于后端变更，同样的模式也适用，只是不需要浏览器。你指定可观察的 API 行为（状态码、响应头、错误消息），用 curl 命令就能检查。

有一点需要诚实承认：这不能发现规格本身的误解。如果你的规格一开始就是错的，检查还是会通过，即使功能是错的。Playwright 能捕获的是集成失败、渲染 bug，以及理论上可行但在真实浏览器中出问题的行为。这比"验证正确"的声明要窄，但比代码审查可靠捕获的要多得多。

工作流程变成：在写 prompt 之前先写验收标准，让 Agent 按标准构建，运行验证，只审查失败的部分。你审查的是失败，而不是 diff。

## 如何构建这套系统

我开始构建一个 Claude Skill（[github.com/opslane/verify](https://github.com/opslane/verify)），使用 **claude -p**（Claude Code 的无头模式）加上 Playwright MCP 运行。不需要自定义后端，除了现有的 Claude OAuth token 也不需要额外的 API key。四个阶段：

**1. 预检查（Pre-flight）**：纯 bash，不用 LLM。开发服务器在运行吗？认证会话有效吗？规格文件存在吗？在花任何 token 之前快速失败。

**2. 规划器（The planner）**：一次 Opus 调用。它读取你的规格和变更的文件，计算出每个检查需要什么以及如何运行。它还会读取你的代码来找到正确的选择器，而不是瞎猜 class 名。

**3. 浏览器 Agent（Browser agents）**：每个 AC 一次 Sonnet 调用，全部并行运行。五个 AC 就是五个 agent，各自独立导航和截图。Sonnet 在这里比 Opus 便宜 3-4 倍，而且点击导航这种活儿效果一样好。

**4. 判定器（The judge）**：最后一次 Opus 调用，阅读所有证据并对每条标准返回判定：通过、失败，或需要人工审查。

```bash
claude -p --model claude-opus-4-6 \
"Review this evidence and return a verdict for each AC.
Evidence: $(cat .verify/evidence/*/result.json)
Return JSON: {verdicts: [{id, passed, reasoning}]}"
```

作为 Claude Code 插件安装：

```bash
/plugin marketplace add opslane/opslane-v3
/plugin install opslane-verify@opslane-v3
```

或者克隆仓库自己改造。每个阶段都是一次单独的 **claude -p** 调用，有清晰的输入和结构化输出。你可以换模型、加阶段，或者用 **--dangerously-skip-permissions** 接入 CI。

## 核心洞见

我一直在思考的是：除非你在 Agent 开始之前就告诉它"完成"长什么样，否则你无法信任它产出的东西。

写验收标准比写 prompt 更难，因为它迫使你在看到边缘情况之前就思考清楚。工程师抗拒它，就像当初抗拒 TDD 一样，因为开始时感觉更慢。

但没有它们，你只能阅读输出然后祈祷它是对的。

---

## 要点总结

1. **自主 Agent 的信任危机**：当 AI 自主编写代码时，传统代码审查变得不切实际
2. **自我验证的陷阱**：同一个 AI 写代码又写测试，只是自我确认而非真正验证
3. **验收标准优先**：在让 Agent 开始工作前，先用朴素语言写下明确、可测试的标准
4. **Playwright 自动化验证**：用浏览器自动化工具验证实际行为，而非只看代码 diff
5. **多模型协作**：用 Opus 做规划和判定，用 Sonnet 做具体执行，平衡成本和效果

这套方法论本质上是 TDD 在 AI 编程时代的升级版——不再是你自己写单元测试，而是你定义业务标准，让 AI 去执行和验证。对于正在探索 AI 辅助开发的团队来说，这是一个值得认真思考的方向。
