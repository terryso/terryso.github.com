---
layout: post
title: "Clinejection：当你的 AI 工具悄然安装另一个 AI"
date: 2026-03-06 20:39:17 +0800
categories: tech-translation
description: "一次从 GitHub issue 标题到 4000 台开发者机器被攻陷的供应链攻击。攻击入口竟然是一个 AI 机器人读取了一条包含恶意指令的 issue 标题。"
original_url: https://grith.ai/blog/clinejection-when-your-ai-tool-installs-another
source: Hacker News
---

本文翻译自 [Clinejection: When Your AI Tool Installs Another](https://grith.ai/blog/clinejection-when-your-ai-tool-installs-another)，原载于 Hacker News。

---

从 GitHub issue 标题到 4000 台开发者机器被攻陷，只需要五步。攻击的入口是一段自然语言。

2026 年 2 月 17 日，有人向 npm 发布了 `cline@2.3.0`。这个 CLI 二进制文件与前一个版本字节完全相同。唯一的变化是 `package.json` 中的一行：

```json
"postinstall": "npm install -g openclaw@latest"
```

在接下来的八小时里，每个安装或更新 Cline 的开发者都会在不知情的情况下，全局安装 OpenClaw —— 一个具有完整系统访问权限的独立 AI 代理。在该包被下架前，大约有 4000 次下载。

有趣的部分不在于 payload 本身，而在于攻击者是如何获得 npm token 的：通过向 GitHub issue 标题注入 prompt，被 AI 分诊机器人读取、解释为指令并执行。

## 完整攻击链

这个被 Snyk 命名为 "Clinejection" 的攻击，将五个已知的漏洞串联成一个单一的漏洞利用，只需要打开一个 GitHub issue。

**第一步：通过 issue 标题注入 prompt。**

Cline 部署了一个使用 Anthropic `claude-code-action` 的 AI issue 分诊工作流。该工作流配置为 `allowed_non_write_users: "*"`，意味着任何 GitHub 用户都可以通过创建 issue 来触发它。issue 标题通过 `${{ github.event.issue.title }}` 直接插入到 Claude 的 prompt 中，没有经过任何清洗。

1 月 28 日，攻击者创建了 Issue #8904，标题伪装成性能报告，但包含嵌入的指令：从特定 GitHub 仓库安装包。

**第二步：AI 机器人执行任意代码。**

Claude 将注入的指令解释为合法指令，并运行 `npm install` 指向攻击者的 fork —— 一个 typosquat 仓库（`glthub-actions/cline`，注意 'github' 中少了 'i'）。该 fork 的 `package.json` 包含一个 preinstall 脚本，用于获取并执行远程 shell 脚本。

**第三步：缓存投毒。**

shell 脚本部署了 Cacheract，一个 GitHub Actions 缓存投毒工具。它向缓存注入超过 10GB 的垃圾数据，触发 GitHub 的 LRU 驱逐策略，清除合法的缓存条目。投毒条目被设计为匹配 Cline 夜间发布工作流使用的缓存键模式。

**第四步：凭证窃取。**

当夜间发布工作流运行并从缓存恢复 `node_modules` 时，它得到了被篡改的版本。发布工作流持有 `NPM_RELEASE_TOKEN`、`VSCE_PAT`（VS Code Marketplace）和 `OVSX_PAT`（OpenVSX）。三个凭证都被窃取。

**第五步：恶意发布。**

使用窃取的 npm token，攻击者发布了带有 OpenClaw postinstall hook 的 `cline@2.3.0`。被篡改的版本上线了八小时，直到 StepSecurity 的自动监控标记它 —— 大约在发布后 14 分钟。

## 糟糕的轮换让情况更糟

安全研究员 Adnan Khan 实际上在 2025 年 12 月下旬就发现了这个漏洞链，并于 2026 年 1 月 1 日通过 GitHub Security Advisory 报告。他在五周内发送了多次跟进，但没有收到任何回复。

当 Khan 在 2 月 9 日公开披露时，Cline 在 30 分钟内通过移除 AI 分诊工作流进行了修补。第二天他们开始轮换凭证。

但轮换是不完整的。团队删除了错误的 token，留下暴露的 token 仍然活跃。他们在 2 月 11 日发现错误并重新轮换。但攻击者已经窃取了凭证，npm token 保持有效的时间足够长，可以在六天后发布被篡改的包。

Khan 不是攻击者。另一个未知的攻击者发现了 Khan 在他测试仓库中的概念验证，并将其武器化直接攻击 Cline。

## 新模式：AI 安装 AI

这个特定的漏洞链很有趣但并非前所未有。Prompt 注入、缓存投毒和凭证窃取都是已记录的攻击类别。Clinejection 的独特之处在于结果：一个 AI 工具在开发者机器上静默引导第二个 AI 代理。

这在供应链中创造了一个递归问题。开发者信任工具 A（Cline）。工具 A 被篡改以安装工具 B（OpenClaw）。工具 B 有自己的能力 —— shell 执行、凭证访问、持久化守护进程安装 —— 这些独立于工具 A，对开发者最初的信任决策是透明的。

安装的 OpenClaw 可以从 `~/.openclaw/` 读取凭证，通过其 Gateway API 执行 shell 命令，并将自己安装为重启后仍然存活的持久系统守护进程。严重性有争议 —— Endor Labs 认为这个 payload 更像概念验证而非武器化攻击 —— 但机制才是关键。下一个 payload 不会是概念验证。

这是供应链中的"混淆代理人"（confused deputy）问题：开发者授权 Cline 代表他们行动，而 Cline（通过篡改）将该权限委托给一个开发者从未评估、从未配置、从未同意的完全独立的代理。

## 为什么现有的控制措施没有捕获它

**npm audit**：postinstall 脚本安装的是合法的、非恶意的包（OpenClaw）。没有恶意软件可供检测。

**代码审查**：CLI 二进制文件与前一个版本字节完全相同。只有 `package.json` 改变了，而且只改了一行。专注于二进制变更的自动 diff 检查会漏掉它。

**来源证明（Provenance attestations）**：Cline 当时没有使用基于 OIDC 的 npm provenance。被窃取的 token 可以在没有 provenance 元数据的情况下发布，StepSecurity 将其标记为异常。

**权限提示**：安装发生在 `npm install` 期间的 postinstall hook 中。没有 AI 编码工具会在依赖项的生命周期脚本运行之前提示用户。操作是不可见的。

攻击利用了开发者认为他们正在安装的东西（Cline 的特定版本）与实际执行的东西（来自包的任意生命周期脚本及其传递安装的所有内容）之间的差距。

## Cline 之后的改变

Cline 的事后分析概述了几项补救措施：

- 从处理凭证的工作流中消除 GitHub Actions 缓存使用
- 采用 npm 发布的 OIDC 来源证明，消除长期有效的 token
- 添加凭证轮换的验证要求
- 开始制定带有 SLA 的正式漏洞披露流程
- 委托第三方对 CI/CD 基础设施进行安全审计

这些是有意义的改进。仅 OIDC 迁移就可以防止攻击 —— 当 provenance 需要来自特定 GitHub Actions 工作流的加密证明时，被窃取的 token 无法发布包。

## 架构问题

Clinejection 是一个供应链攻击，但它也是一个 agent 安全问题。入口点是 GitHub issue 标题中的自然语言。链条的第一环是一个 AI 机器人，它将不可信文本解释为指令，并以 CI 环境的权限执行它。

这是我们在 MCP 工具投毒和 agent skill 注册表的背景下写过的相同结构模式 —— 不可信输入到达 agent，agent 对其采取行动，在执行之前没有任何东西评估产生的操作。

这里的区别在于 agent 不是开发者的本地编码助手。它是一个在每个新 issue 上运行的自动 CI 工作流，具有 shell 访问权限和缓存的凭证。影响范围不是一台开发者的机器 —— 而是整个项目的发布管道。

每个在 CI/CD 中部署 AI agent 的团队 —— 用于 issue 分诊、代码审查、自动化测试或任何其他工作流 —— 都有相同的暴露。agent 处理不可信输入（issue、PR、评论）并有权访问机密（token、密钥、凭证）。问题在于是否有任何东西评估 agent 如何使用该访问权限。

## 关键启示

1. **AI agent 是攻击面**：任何处理不可信输入的 AI agent 都可能被 prompt 注入攻击，尤其是当它有权限执行 shell 命令或访问凭证时。

2. **供应链信任链脆弱**：开发者信任的工具可能被篡改来安装其他工具，这种"AI 安装 AI"的模式创造了新的攻击向量。

3. **凭证轮换要彻底**：Cline 的教训是凭证轮换如果不彻底，暴露的 token 仍然可能被利用。

4. **OIDC provenance 是关键**：采用 OIDC 来源证明可以防止被窃取的 token 被用于发布恶意包。

5. **监控和快速响应**：StepSecurity 在发布后 14 分钟就检测到了异常，说明自动化监控的重要性。

对于中国开发者来说，这个事件提醒我们：在使用 AI 辅助工具时要保持警惕，关注供应链安全，并确保自己的开发环境有适当的隔离和监控措施。
