---
layout: post
title: "Google API Key 本不是秘密，但 Gemini 改变了规则"
date: 2026-02-26 18:53:17 +0800
categories: tech-translation
description: "Google 十多年来告诉开发者 API Key 不是机密，但 Gemini 的出现改变了一切：原本用于公开服务（如 Google Maps）的 API Key 现在可以访问你的 Gemini 私有数据。"
original_url: https://trufflesecurity.com/blog/google-api-keys-werent-secrets-but-then-gemini-changed-the-rules
source: Hacker News
---

本文翻译自 [Google API Keys Weren't Secrets. But then Gemini Changed the Rules](https://trufflesecurity.com/blog/google-api-keys-werent-secrets-but-then-gemini-changed-the-rules)，原载于 Hacker News。

---

## TL;DR

Google 花了十多年时间告诉开发者：Google API Key（比如用于 Maps、Firebase 等服务的）不是机密。但这一切已经不再成立——**Gemini 接受同样的 Key 来访问你的私有数据**。

Truffle Security 扫描了数百万个网站，发现了近 **3,000 个 Google API Key**。这些 Key 原本部署用于 Google Maps 等公共服务，但现在也可以认证 Gemini——尽管它们从未被设计用于此目的。

拿到有效的 Key，攻击者可以：
- 访问上传的文件和缓存数据
- 把 LLM 使用费记到你的账户上

更有意思的是，**连 Google 自己都有一些旧的公开 API Key**，他们原本认为这些 Key 不敏感，但实际上可以用来访问 Google 内部的 Gemini。

---

## 核心问题

Google Cloud 使用单一的 API Key 格式（`AIza...`）来服务于两个根本不同的目的：**公开标识**和**敏感认证**。

多年来，Google 明确告诉开发者 API Key 可以安全地嵌入客户端代码。Firebase 自己的安全检查清单就声明 API Key 不是机密：

> **注意**：这些与用于驱动 GCP 的 Service Account JSON Key 是完全不同的东西。

Google 的 Maps JavaScript 文档甚至指导开发者直接把 Key 粘贴到 HTML 中：

这本来是合理的。这些 Key 被设计为用于计费的项目标识符，并且可以通过 HTTP referer 白名单等（可绑过的）控制进一步限制。它们**不是**被设计为认证凭证。

**然后 Gemini 来了。**

当你在 Google Cloud 项目上启用 Gemini API（Generative Language API）时，该项目中现有的 API Key（包括那些位于你网站公开 JavaScript 中的 Key）可以**静默地**获得对敏感 Gemini 端点的访问权限。没有警告。没有确认对话框。没有邮件通知。

---

## 这创造了两个截然不同的问题

### 1. 追溯性权限扩展（Retroactive Privilege Expansion）

三年前你创建了一个 Maps Key，按照 Google 的指示把它嵌入到网站的源代码中。上个月，你团队的一个开发者为内部原型启用了 Gemini API。

**你的公开 Maps Key 现在变成了 Gemini 凭证。**

任何抓取到它的人都可以访问你上传的文件、缓存内容，并消耗你的 AI 账单。**没人告诉过你。**

### 2. 不安全的默认值（Insecure Defaults）

当你在 Google Cloud 中创建新的 API Key 时，它默认为"无限制"，意味着它立即对项目中启用的每个 API 都有效，包括 Gemini。UI 会显示关于"未授权使用"的警告，但架构默认是完全开放的。

**结果：成千上万个原本作为无害计费令牌部署的 API Key，现在成了公开互联网上的活 Gemini 凭证。**

---

## 为什么这是权限提升而非配置错误？

关键在于事件顺序：

1. 开发者创建 API Key 并将其嵌入网站用于 Maps。（此时，Key 是无害的。）
2. Gemini API 在同一项目上被启用。（现在，同一个 Key 可以访问敏感的 Gemini 端点。）
3. 开发者从未被警告 Key 的权限在暗中发生了变化。（Key 从公开标识符变成了秘密凭证。）

虽然用户*可以*限制 Google API Key（按 API 服务和应用程序），但漏洞在于**不安全默认姿态（CWE-1188）**和**不正确的权限分配（CWE-269）**：

- **隐式信任升级**：Google 追溯性地将敏感权限应用于已经合法部署在公开环境（如 JavaScript 包）中的现有 Key。
- **缺乏 Key 分离**：安全的 API 设计需要为每个环境使用不同的 Key（可发布 vs. 秘密 Key）。通过依赖单一 Key 格式来同时服务两者，系统招致了妥协和混淆。
- **安全默认的失败**：通过 GCP API 面板生成的 Key 的默认状态允许访问敏感的 Gemini API（假设它已启用）。一个为地图小部件创建 Key 的用户正在不知不觉中生成一个能够执行管理操作的凭证。

---

## 攻击者能做什么？

攻击非常简单。攻击者访问你的网站，查看页面源代码，从 Maps 嵌入中复制你的 `AIza...` Key。然后他们运行：

```bash
curl "https://generativelanguage.googleapis.com/v1beta/files?key=$API_KEY"
```

不是 `403 Forbidden`，他们得到 `200 OK`。从这里，攻击者可以：

- **访问私有数据**：`/files/` 和 `/cachedContents/` 端点可能包含上传的数据集、文档和缓存上下文。项目所有者通过 Gemini API 存储的任何东西都是可访问的。
- **耗尽你的账单**：Gemini API 使用不是免费的。根据模型和上下文窗口，威胁行为者最大化 API 调用可能在单个受害者账户上每天产生数千美元的费用。
- **耗尽你的配额**：这可能完全关闭你的合法 Gemini 服务。

攻击者从不触碰你的基础设施。他们只是从公开网页上抓取一个 Key。

---

## 公开互联网上的 2,863 个活跃 Key

为了了解这个问题的规模，Truffle Security 扫描了 **2025 年 11 月的 Common Crawl 数据集**——一个包含来自互联网各地的 HTML、JavaScript 和 CSS 的庞大（约 700 TiB）公开抓取网页存档。

他们识别出了 **2,863 个易受此权限提升向量攻击的活跃 Google API Key**。

这些不仅仅是业余爱好者的副业项目。受害者包括**主要金融机构、安全公司、全球招聘公司**，以及值得注意的是 **Google 自己**。

如果供应商自己的工程团队都无法避免这个陷阱，期望每个开发者都能正确导航它是不现实的。

---

## 概念验证：Google 自己的 Key

Truffle Security 向 Google 提供了来自其自身基础设施的具体示例来演示这个问题。

他们测试的一个 Key 嵌入在 Google 产品面向公众网站的页面源代码中。通过检查 Internet Archive，他们确认这个 Key 自 **2023 年 2 月**以来就公开部署了——远在 Gemini API 存在之前。

页面上没有任何客户端逻辑尝试访问任何 Gen AI 端点。它仅被用作公开项目标识符，这对 Google 服务来说是标准的。

他们通过访问 Gemini API 的 `/models` 端点（Google 确认在范围内）测试了这个 Key，得到了列出可用模型的 `200 OK` 响应。

**一个几年前为完全无害目的部署的 Key，在没有任何开发者干预的情况下，静默地获得了对敏感 API 的完全访问权限。**

---

## 披露时间线

| 日期 | 事件 |
|------|------|
| 2025 年 11 月 21 日 | 向 Google 的 VDP 提交报告 |
| 2025 年 11 月 25 日 | Google 最初确定此行为是预期的。Truffle Security 推回。 |
| 2025 年 12 月 1 日 | 提供来自 Google 自己基础设施的示例后，问题在内部获得了关注。 |
| 2025 年 12 月 2 日 | Google 将报告从"客户问题"重新分类为"Bug"，升级了严重性，确认产品团队正在评估修复。他们请求完整的 2,863 个暴露 Key 列表。 |
| 2025 年 12 月 12 日 | Google 分享了补救计划。确认了发现泄露 Key 的内部管道，开始限制暴露的 Key 访问 Gemini API。 |
| 2026 年 1 月 13 日 | Google 将漏洞分类为"单服务权限提升，读取"（Tier 1）。 |
| 2026 年 2 月 2 日 | Google 确认团队仍在进行根本原因修复。 |
| 2026 年 2 月 19 日 | 90 天披露窗口结束。 |

---

## Google 表示他们正在做什么

Google 公开记录了其路线图：

- **范围默认值**：通过 AI Studio 创建的新 Key 将默认为仅 Gemini 访问，防止意外的跨服务使用。
- **泄露 Key 阻止**：他们正在默认阻止被发现为泄露并与 Gemini API 一起使用的 API Key。
- **主动通知**：他们计划在识别到泄露 Key 时主动沟通，提示立即行动。

这些是有意义的改进，其中一些显然已经在进行中。

---

## 你现在应该做什么

如果你使用 Google Cloud（或其任何服务，如 Maps、Firebase、YouTube 等），第一件事是弄清楚你是否暴露了。

### 步骤 1：检查每个 GCP 项目是否有 Generative Language API

进入 GCP 控制台，导航到 **APIs & Services > Enabled APIs & Services**，查找"Generative Language API"。对你组织中的每个项目都这样做。如果它没有启用，你就不受此特定问题的影响。

### 步骤 2：如果启用了 Generative Language API，审计你的 API Key

导航到 **APIs & Services > Credentials**。检查每个 API Key 的配置。你正在寻找两种类型的 Key：

- 带有警告图标的 Key，意味着它们设置为无限制
- 在其允许服务中明确列出 Generative Language API 的 Key

任一配置都允许 Key 访问 Gemini。

### 步骤 3：验证这些 Key 都不是公开的

这是关键步骤。如果具有 Gemini 访问权限的 Key 嵌入在客户端 JavaScript 中、签入到公开存储库中，或以其他方式暴露在互联网上，你就有问题了。

**从你最旧的 Key 开始。** 这些最有可能在旧指导（API Key 可以安全共享）下公开部署，然后在团队成员启用 API 时追溯性地获得了 Gemini 权限。

如果发现暴露的 Key，**轮换它**。

### 额外：使用 TruffleHog 扫描

你也可以使用 TruffleHog 扫描你的代码、CI/CD 管道和 Web 资产以查找泄露的 Google API Key。TruffleHog 将验证发现的 Key 是否活跃**并且具有 Gemini 访问权限**，所以你会确切知道哪些 Key 是暴露和活跃的，而不仅仅是哪些匹配正则表达式。

```bash
trufflehog filesystem /path/to/your/code --only-verified
```

---

## 关键启示

这里发现的模式（公开标识符静默获得敏感权限）并**不是 Google 独有的**。

随着越来越多的组织将 AI 能力添加到现有平台，遗留凭证的攻击面以没有人预料到的方式扩展。

对于开发者和安全团队来说，这是一个重要的提醒：

1. **审查所有 API Key 的权限范围**，尤其是那些创建时间较早的
2. **永远不要假设"公开"标识符永远保持公开**——平台策略会变化
3. **启用新服务时审计现有凭证**，确保它们不会意外获得新权限
4. **使用工具持续监控泄露的凭证**

Google 已经开始解决这个问题，但作为开发者，我们需要主动审查和限制我们的 API Key，以保护我们的数据安全和钱包。
