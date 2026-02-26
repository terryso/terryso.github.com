---
layout: post
title: "Google API Key 本不是秘密，但 Gemini 改变了规则"
date: 2026-02-27 05:06:35 +0800
categories: tech-translation
description: "Truffle Security 发现了一个严重的安全隐患：原本用于公开服务（如 Google Maps）的 API Key，在启用 Gemini API 后可能被用于访问私有的 AI 数据，影响近 3000 个在线密钥。"
original_url: https://trufflesecurity.com/blog/google-api-keys-werent-secrets-but-then-gemini-changed-the-rules
source: Hacker News
---

本文翻译自 [Google API Keys Weren't Secrets. But then Gemini Changed the Rules](https://trufflesecurity.com/blog/google-api-keys-werent-secrets-but-then-gemini-changed-the-rules)，原载于 Hacker News。

---

## tl;dr

Google 花了十多年时间告诉开发者：Google API Key（用于 Maps、Firebase 等）**不是**秘密信息。但现在这不再成立了——**Gemini 接受同样的密钥来访问你的私有数据**。

Truffle Security 扫描了数百万个网站，发现近 **3,000 个** Google API Key，这些密钥原本是为 Google Maps 等公开服务部署的，现在却可以认证到 Gemini，尽管它们从未被设计用于此目的。攻击者拿到有效密钥后可以：

- 访问上传的文件和缓存数据
- 将 LLM 使用费用计入你的账户

就连 Google 自己也有旧的公开 API Key（他们原本认为非敏感），可以用来访问 Google 内部的 Gemini。

## 核心问题

Google Cloud 使用单一 API Key 格式（`AIza...`）来满足两种根本不同的用途：**公开标识** 和 **敏感认证**。

多年来，Google 明确告诉开发者 API Key 可以安全地嵌入到客户端代码中。

Firebase 的安全检查清单明确声明 API Key 不是秘密：

> 注意：这些与用于驱动 GCP 的 Service Account JSON 密钥截然不同。

Google Maps JavaScript 文档甚至指导开发者直接将密钥粘贴到 HTML 中：

```html
<script>
  (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",...
  })(document);
</script>
```

这在当时是合理的。这些密钥被设计为用于计费的项目标识符，可以通过 HTTP Referer 白名单等（可绕过的）控制进一步限制。它们**不是**被设计为身份验证凭据。

**然后 Gemini 来了。**

当你在 Google Cloud 项目上启用 Gemini API（Generative Language API）时，该项目中的**现有 API Key**（包括那些已经嵌入在网站公开 JavaScript 中的密钥）会**静默地**获得访问敏感 Gemini 端点的权限。

**没有警告。没有确认对话框。没有邮件通知。**

## 这造成了两个截然不同的问题

### 1. 追溯性权限扩展

三年前，你创建了一个 Maps 密钥并将其嵌入到网站源代码中——**完全按照 Google 的指示**。上个月，你的团队中有人为内部原型启用了 Gemini API。

**你的公开 Maps 密钥现在变成了 Gemini 凭据。**

任何爬取它的人都可以访问你上传的文件、缓存内容，并挥霍你的 AI 账单。没有人告诉过你。

### 2. 不安全的默认值

当你在 Google Cloud 中创建新的 API Key 时，它默认为"**无限制**"，意味着它**立即对项目中每个已启用的 API 有效**，包括 Gemini。

虽然 UI 会显示"未经授权使用"的警告，但架构默认值是完全开放的。

**结果：成千上万个被部署为无害计费令牌的 API Key，现在变成了互联网上的活跃 Gemini 凭据。**

## 为什么这是权限提升而不是配置错误

事件序列说明了问题：

1. 开发者创建 API Key 并将其嵌入网站用于 Maps。（此时，密钥是无害的。）
2. Gemini API 在同一项目上被启用。（现在该密钥可以访问敏感的 Gemini 端点。）
3. 开发者**从未被警告**密钥的权限在不知不觉中发生了变化。（密钥从公开标识符变成了秘密凭据。）

虽然用户**可以**限制 Google API Key（按 API 服务和应用程序），但漏洞在于：

- **CWE-1188：不安全的默认姿态**
- **CWE-269：不正确的权限分配**

具体来说：

- **隐式信任升级**：Google 追溯性地将敏感权限应用于已经合法部署在公开环境中的现有密钥
- **缺乏密钥分离**：安全的 API 设计需要为每个环境使用不同的密钥（可发布 vs. 秘密密钥）
- **安全默认值失败**：通过 GCP API 面板生成的密钥的默认状态允许访问敏感的 Gemini API

## 攻击者能做什么

攻击非常简单。攻击者访问你的网站，查看页面源代码，从 Maps 嵌入中复制你的 `AIza...` 密钥。然后运行：

```bash
curl "https://generativelanguage.googleapis.com/v1beta/files?key=$API_KEY"
```

**不是 `403 Forbidden`，而是 `200 OK`。**

从这里，攻击者可以：

1. **访问私有数据**：`/files/` 和 `/cachedContents/` 端点可能包含上传的数据集、文档和缓存上下文。项目所有者通过 Gemini API 存储的任何内容都是可访问的。

2. **挥霍你的账单**：Gemini API 使用不是免费的。根据模型和上下文窗口，威胁行为者最大化 API 调用可能在单个受害者账户上每天产生数千美元的费用。

3. **耗尽你的配额**：这可能完全关闭你的合法 Gemini 服务。

攻击者从未触及你的基础设施。他们只是从公开网页爬取了一个密钥。

## 公共互联网上的 2,863 个活跃密钥

为了了解这个问题的规模，Truffle Security 扫描了 **2025 年 11 月的 Common Crawl 数据集**，这是一个巨大的（~700 TiB）公开爬取网页档案，包含来自整个互联网的 HTML、JavaScript 和 CSS。

他们识别出 **2,863 个** 活跃的 Google API Key 容易受到这种权限提升向量的攻击。

> 前端源代码中的 Google API Key 示例，用于 Google Maps，但也可以访问 Gemini

**这些不仅仅是业余爱好者的副项目。** 受害者包括：

- 主要金融机构
- 安全公司
- 全球招聘公司
- **值得注意的是，Google 自己**

如果供应商自己的工程团队都无法避免这个陷阱，期望每个开发者都能正确应对是不现实的。

## 概念验证：Google 自己的密钥

Truffle Security 向 Google 提供了来自他们自己基础设施的具体示例来演示这个问题。

测试的密钥之一嵌入在 Google 产品面向公众网站的页面源代码中。通过检查 Internet Archive，确认这个密钥至少从 **2023 年 2 月** 就已经公开部署，**远早于 Gemini API 存在**。

页面上没有任何客户端逻辑试图访问任何 Gen AI 端点。它仅被用作公开项目标识符，这是 Google 服务的标准做法。

测试该密钥访问 Gemini API 的 `/models` 端点（Google 确认在范围内），得到了 `200 OK` 响应，列出了可用的模型。

**一个为完全无害的目的部署多年前的密钥，在没有任何开发者干预的情况下，静默地获得了对敏感 API 的完全访问权限。**

## 披露时间线

Truffle Security 于 2025 年 11 月 21 日通过 Google 的漏洞披露计划报告了此问题。

| 日期 | 事件 |
|------|------|
| 2025-11-21 | 向 Google VDP 提交报告 |
| 2025-11-25 | Google 最初确定此行为是预期的。我们进行了反驳。 |
| 2025-12-01 | 提供来自 Google 自己的基础设施示例后，问题在内部获得关注。 |
| 2025-12-02 | Google 将报告从"客户问题"重新分类为"Bug"，升级严重性，确认产品团队正在评估修复。 |
| 2025-12-12 | Google 分享修复计划，确认发现泄露密钥的内部管道，开始限制暴露的密钥访问 Gemini API。 |
| 2026-01-13 | Google 将漏洞分类为"单服务权限提升，读取"（Tier 1）。 |
| 2026-02-02 | Google 确认团队仍在处理根本原因修复。 |
| 2026-02-19 | 90 天披露窗口结束。 |

## Google 的改进方向

Google 公开记录了其路线图：

1. **范围默认值**：通过 AI Studio 创建的新密钥将默认为仅 Gemini 访问，防止意外的跨服务使用。

2. **泄露密钥阻止**：他们正在默认阻止被发现泄露并与 Gemini API 一起使用的 API Key。

3. **主动通知**：他们计划在发现泄露密钥时主动沟通，促使立即采取行动。

这些都是有意义的改进，一些显然已经在进行中。

## 你现在应该做什么

如果你使用 Google Cloud（或其任何服务，如 Maps、Firebase、YouTube 等），第一件事是弄清楚你是否暴露了。

### 步骤 1：检查每个 GCP 项目的 Generative Language API

进入 GCP 控制台，导航到 **APIs & Services > Enabled APIs & Services**，查找"**Generative Language API**"。

**为组织中的每个项目执行此操作。** 如果未启用，你不受此特定问题影响。

### 步骤 2：如果 Generative Language API 已启用，审核你的 API Key

导航到 **APIs & Services > Credentials**。检查每个 API Key 的配置。

你要找两类密钥：
- 带有警告图标的密钥，意味着它们设置为无限制
- 明确在其允许服务中列出 Generative Language API 的密钥

**任何一种配置都允许密钥访问 Gemini。**

### 步骤 3：验证这些密钥没有公开

这是关键步骤。

如果具有 Gemini 访问权限的密钥嵌入在：
- 客户端 JavaScript
- 公开代码仓库
- 或以其他方式暴露在互联网上

**你就有问题了。**

**从最旧的密钥开始检查。** 这些密钥最可能是在旧指南（API Key 可以安全共享）下公开部署的，然后在团队成员启用 API 时追溯性地获得了 Gemini 权限。

如果发现暴露的密钥，**轮换它**。

### 额外：使用 TruffleHog 扫描

你也可以使用 TruffleHog 扫描你的代码、CI/CD 管道和 Web 资产以查找泄露的 Google API Key。

TruffleHog 将验证发现的密钥是否**活跃且具有 Gemini 访问权限**，所以你会确切知道哪些密钥暴露且活跃，而不仅仅是哪些匹配正则表达式。

```bash
trufflehog filesystem /path/to/your/code --only-verified
```

---

## 关键要点

1. **架构假设会过时**：Google 的 API Key 管理架构是为 AI 时代之前构建的，当 Gemini 出现时，该架构的假设不再成立。

2. **权限静默升级是危险的**：当新服务启用时，现有凭据的权限不应该静默扩展。

3. **安全需要分层设计**：公开标识符和秘密凭据应该是不同的格式和系统。

4. **审计你的遗留密钥**：你最旧的 API Key 可能是你最大的安全债务。

5. **监控你的云服务启用**：任何团队成员启用新服务都可能改变现有凭据的安全边界。

---

> 这种模式（公开标识符静默获得敏感权限）并非 Google 独有。随着更多组织将 AI 能力"螺栓"到现有平台上，遗留凭据的攻击面以没有人预料到的方式扩展。
