---
layout: post
title: "构建可信的自主 AI 代理：当 AI 写代码时，谁来验证？"
date: 2026-03-11 17:15:10 +0800
categories: tech-translation
description: "探讨如何在 AI 代理自主编写代码时建立可信的验证机制，通过验收标准驱动的方式确保代码质量，而非依赖传统的代码审查。"
original_url: https://www.claudecodecamp.com/p/i-m-building-agents-that-run-while-i-sleep
source: Hacker News
---

本文翻译自 [I'm Building Agents That Run While I Sleep](https://www.claudecodecamp.com/p/i-m-building-agents-that-run-while-i-sleep)，原载于 Hacker News。

---

我一直在构建能够在我睡觉时写代码的 AI 代理。像 Gastown 这样的工具可以连续运行数小时，无需我盯着。代码变更会进入我从未读过的分支。几周前我意识到，我没有任何可靠的方式来知道这些代码是否正确——它是否真的做到了我要求它做的事情。

我在意这件事。我不想推送垃圾代码，但我没有真正的解决方案。

过去六个月里，我为超过 100 名工程师举办了 Claude Code 工作坊。到处都是同样的问题，只是规模不同。使用 Claude 处理日常 PR 的团队，每周合并 40-50 个 PR 而不是 10 个。团队在代码审查上花费了大量时间。

随着系统变得越来越自主，这个问题会变得更加严重。在某个时刻，你根本不再审查 diff，只是盯着部署，祈祷别出问题。

所以我一直在思考一个问题：当你无法审查一切时，你真正信任的是什么？

## 显而易见的答案行不通

**多雇审查者？** 你雇不了那么快。而且让高级工程师整天阅读 AI 生成的代码并不值得。

**让 AI 写测试？** 当 Claude 为刚写的代码编写测试时，它是在检查自己的工作。测试证明代码做了 Claude 认为你想要的事情——而不是你真正想要的事情。它们能捕获回归问题，但无法发现最初的误解。

**用另一个 AI 来检查？** 当你用同一个 AI 来写和检查时，你就建立了一个自我表扬的机器。这恰恰是代码审查本来要解决的问题：一双不是原作者的眼睛。但一个 AI 写，另一个 AI 检查，这不是新鲜的眼睛。它们来自同一个地方，会漏掉同样的东西。

## TDD 做对的事情

先写测试，再写代码，测试通过就停止。大多数团队不这样做，因为在写代码之前思考代码应该做什么需要他们没有的时间。

AI 消除了这个借口，因为 Claude 处理了速度问题。现在慢的部分变成了判断代码是否正确。这正是 TDD 的目的：先写下什么是正确的，然后检查它。

TDD 要求你写单元测试，这意味着在写代码之前要思考代码将如何工作。这更简单：用简单的英语写下功能应该做什么，机器会弄清楚如何检查它。

> "用户可以用邮箱和密码登录。凭证错误时显示'Invalid email or password'。成功后跳转到 /dashboard。会话令牌在 24 小时后过期。"

你可以在打开代码编辑器之前就写下这些。代理构建它，别的东西检查它。

## 实际操作中的样子

对于前端变更，我们根据规格文件生成验收标准：

```markdown
# Task
Add email/password login.

## Acceptance Criteria

### AC-1: Successful login
- User at /login with valid credentials gets redirected to /dashboard
- Session cookie is set

### AC-2: Wrong password error
- User sees exactly "Invalid email or password"
- User stays on /login

### AC-3: Empty field validation
- Submit disabled when either field is empty, or inline error on empty submit

### AC-4: Rate limiting
- After 5 failed attempts, login blocked for 60 seconds
- User sees a message with the wait time
```

每个标准都足够具体，要么通过要么失败。一旦代理构建了功能，验证过程会针对每个 AC 运行 Playwright 浏览器代理，截取屏幕截图，并生成带有每个标准判定结果的报告。如果有什么失败了，你能准确看到哪个标准失败了，以及浏览器看到了什么。

对于后端变更，同样的模式无需浏览器即可工作。你指定可观察的 API 行为（状态码、响应头、错误消息），curl 命令可以检查这些。

需要诚实的一点：这不能捕获规格误解。如果你的规格一开始就是错的，检查会通过，即使功能是错的。Playwright 能捕获的是集成失败、渲染 bug，以及在理论上可行但在真实浏览器中出错的行为。这是一个比"验证正确"更窄的声明，但它比代码审查能可靠捕获的要多得多。

**工作流程：在提示之前写验收标准，让代理根据它们构建，运行验证，只审查失败的部分。你审查的是失败，而不是 diff。**

## 如何构建它

我开始构建一个 Claude Skill（[github.com/opslane/verify](https://github.com/opslane/verify)），它使用 **claude -p**（Claude Code 的无头模式）加上 Playwright MCP 运行。不需要自定义后端，除了现有的 Claude OAuth token 外不需要额外的 API 密钥。四个阶段：

1. **预检（Pre-flight）**：纯 bash，无需 LLM。开发服务器在运行吗？认证会话有效吗？规格文件存在吗？在花费任何 token 之前快速失败。

2. **规划器（The planner）**：一次 Opus 调用。它读取你的规格和修改的文件，弄清楚每个检查需要什么以及如何运行它。它还读取你的代码以找到正确的选择器，所以不是在猜测类名。

3. **浏览器代理（Browser agents）**：每个 AC 一次 Sonnet 调用，全部并行运行。五个 AC，五个代理，各自独立导航和截图。Sonnet 在这里的成本比 Opus 低 3-4 倍，而且对于点击操作来说效果一样好。

4. **评判器（The judge）**：最后一次 Opus 调用，读取所有证据并返回每个标准的判定：通过、失败，或需要人工审查。

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

或者克隆仓库并适配它。每个阶段都是一个带有明确输入和结构化输出的单次 **claude -p** 调用。你可以更换模型、添加阶段，或用 **--dangerously-skip-permissions** 将其接入 CI。

## 核心洞见

我一直在思考的是：除非你在代理开始之前就告诉它"完成"是什么样子，否则你不能信任它产生的东西。写验收标准比写提示更难，因为它迫使你在看到边缘情况之前就思考它们。工程师抵制它的原因和抵制 TDD 的原因一样——因为在开始时感觉更慢。

没有它们，你所能做的就是阅读输出并希望它是正确的。

---

## 总结

这篇文章提出了一个在 AI 辅助编程时代非常关键的问题：**当代码是 AI 写的，我们如何确信它是正确的？**

几个关键洞见：

1. **自我验证的悖论**：让同一个 AI 既写代码又写测试，相当于让学生自己批改作业。需要独立的验证机制。

2. **验收标准优先**：在让 AI 写代码之前，先用自然语言明确写出功能应该做什么。这比写单元测试更简单，但同样有效。

3. **工具链整合**：利用 Claude Code 的无头模式和 Playwright MCP，可以构建一个自动化的验收测试流水线，无需额外基础设施。

4. **审查失败而非 diff**：将注意力从"代码长什么样"转移到"功能是否按预期工作"，这在 AI 生成代码的场景下更加高效。

对于正在使用 AI 编程工具的团队来说，这种思路值得借鉴：不要只依赖 AI 生成的测试，而要建立一套独立的、基于行为规格的验证机制。
