---
layout: post
title: "永远不要购买 .online 域名"
date: 2026-02-26 03:29:09 +0800
categories: tech-translation
description: "作者因贪图便宜购买了一个 .online 域名，结果遭遇了域名被注册局暂停、Google Safe Browsing 拉黑的连环困境，陷入了无法验证所有权就无法申诉的死循环。"
original_url: https://www.0xsid.com/blog/online-tld-is-pain
source: Hacker News
---

本文翻译自 [Never Buy A .online Domain](https://www.0xsid.com/blog/online-tld-is-pain)，原载于 Hacker News。

---

作为一个坚持使用 `.com` 域名二十多年的开发者，我曾经破过一次例——为一个不起眼的小项目买了一个 `.online` 顶级域名（TLD）。这篇文章讲述的就是这个域名是如何灰飞烟灭的。

> **更新：** 在 Hacker News [发帖](https://news.ycombinator.com/item?id=47151233#47151462)后 40 分钟内，网站已从 Google Safe Search 黑名单中移除。感谢那位不知名的 Google 员工！我已经发邮件给 Radix 要求移除那个该死的 `serverHold` 状态。
>
> **更新 2：** 网站终于恢复了。这里不贴链接，免得看起来像营销炒作。想知道的可以看文末。

## Namecheap 的诱人促销

今年早些时候，Namecheap 搞了个活动：每个账户可以免费选择一个 `.online` 或 `.site` 域名。当时我正在做一个小产品，心想"何乐而不为呢？"这个应用是一个小型浏览器，而 `.online` 这个后缀在逻辑上似乎也挺契合。

付了 0.2 美元的 ICANN 费用，配置好 Cloudflare 和 GitHub，网站就上线了。或者说，我以为上线了。

## 神秘消失

在购买域名几周后，我在查看另一个无关域名的流量数据时，突然发现这个网站在过去 48 小时内访客数为零。尝试打开网站，Firefox 和 Chrome 都显示了那个让人心惊胆战的全屏红色警告："此网站不安全"。网站内容很简单：一个 App Store 链接、几张截图（没有任何暴力或不当内容）、几行应用介绍文字——完全没有可能触发这种警告的内容。

点击各种免责声明强行加载网站想看看是不是被黑了，结果看到的是"网站未找到"的错误提示。大事不妙。

## 初步排查

确认 Cloudflare 仍然处于激活状态、CF Worker 正确指向域名后，我先去查了注册商。Namecheap 不太靠谱的名声在外，从这里开始调查似乎很合理。域名在账户里显示正常，过期日期也没问题，DNS 服务器正确指向 Cloudflare。

一头雾水的我快速运行了 `dig NS getwisp.online +short`。返回结果：空。

也许我搞错了？于是我去查了在线 WHOIS 信息。状态：`serverHold`。完蛋……

## 困在无人区

这时候我再次确认了一遍：没有收到来自注册局、注册商、主机商或 Google 的任何邮件通知。什么都没有，一片死寂。

我给 Namecheap 发邮件询问情况（虽然我知道这是 `serverHold` 而非 `clientHold`）。几分钟后他们回复：

> 请知悉，该域名被暂停并非 Namecheap 的操作，而是由管理该 TLD 所有域名的注册局执行的，无论域名是在哪个注册商处注册的。通常情况下，注册局会因为域名涉及滥用行为而暂停域名。遗憾的是，我们无法解决此问题，因为暂停域名的不是 Namecheap。

心里暗骂一声——这证实了我最担心的事。我立刻向 [Radix（本案例中的注册局）](https://radix.website/)的滥用投诉团队提交了请求，他们回复：

> 域名 getwisp.online 因被列入 Google Safe Browsing 黑名单而被暂停。要恢复域名，请按照黑名单页面上的移除说明操作。域名移除后请通知我们，我们将处理恢复请求。

## 验证死循环

好吧，让我们把这个该死的域名从 Safe Browsing 黑名单里弄出来。能有多难？

非常难，我现在已经深刻体会到了。你需要先在 Google Search Console 中验证域名所有权，然后才能请求审核并移除标记。但怎么验证呢？添加 DNS TXT 记录或 CNAME 记录。但如果域名无法解析，这怎么工作？无法工作。

情况就是这样：注册局说 Google 不移除标记就不恢复域名，Google 说你不验证域名所有权就不移除标记——而我物理上根本无法验证。

我尝试了以下渠道报告误报：[这里](https://safebrowsing.google.com/safebrowsing/report_error/)、[这里](https://safebrowsing.google.com/safebrowsing/report_phish/)、还有[这里](https://support.google.com/webmasters/contact/safesearch_review/)，希望能有所突破。

我还向 Safe Search 团队提交了审核请求（这跟 Safe Browsing 完全是两回事），希望这能触发其他地方重新审核。结果只收到 Google 的消息："没有提交有效页面"——因为域名根本无法解析。

作为最后的挣扎，我向注册局提交了临时释放请求，希望 Google 能够审核网站内容，然后——但愿——移除标记。

## 一连串的错误

我犯了几个错误，以后绝不会再犯：

- **买了奇怪的 TLD。** `.com` 是黄金标准。我绝不会再买其他后缀了。一朝被蛇咬，十年怕井绳。
- **没有立即将域名添加到 Google Search Console。**我不需要他们的分析服务，也没计划在域名上放什么内容，所以想，何必麻烦呢？大错特错。
- **没有添加任何正常运行时间监控。**这只是一个落地页，我希望尽可能减少复杂性。

Radix（注册局）和 Google 都值得特别"表扬"——它们的秒封机制和痛苦的移除流程，以及零通知、零宽限期的处理方式。我不确定是因为奇怪的 TLD 导致了这种"短 fuse"，还是我之前被集中举报了。我永远不会知道答案了。

唉，这就是生活。再见，我的 0.2 美元。

---

## 技术要点

- `serverHold`：由注册局设置，处理起来极其麻烦。通常意味着情况已经彻底搞砸了。
- `clientHold`：由注册商设置，多半是付款或账单相关的问题。

---

## 译后记

这篇文章给所有开发者的警示：

1. **域名选择方面**，`.com` 仍然是最安全的选择。非主流 TLD 可能面临更严格的审核机制和更少的申诉渠道。
2. **预防措施**：无论网站多小，都应该立即添加到 Google Search Console，并配置基本的可用性监控。
3. **了解域名状态**：区分 `serverHold`（注册局暂停）和 `clientHold`（注册商暂停）很重要，前者处理难度远高于后者。
4. **平台依赖风险**：Google Safe Browsing 的黑名单机制缺乏有效的申诉渠道，对于小型项目来说尤其危险。

这个案例也提醒我们，所谓的"免费"域名可能隐藏着高昂的隐性成本——当你最需要控制权的时候，可能发现根本没有任何控制权可言。
