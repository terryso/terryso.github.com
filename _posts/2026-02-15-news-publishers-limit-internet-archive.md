---
layout: post
title: "新闻出版商因 AI 爬虫担忧限制 Internet Archive 访问"
date: 2026-02-15 06:14:39 +0800
categories: tech-translation
description: "卫报、纽约时报等主流新闻机构开始限制 Internet Archive 的访问权限，担心其数字档案成为 AI 公司爬取内容的后门。"
original_url: https://www.niemanlab.org/2026/01/news-publishers-limit-internet-archive-access-due-to-ai-scraping-concerns/
source: Hacker News
---

本文翻译自 [News publishers limit Internet Archive access due to AI scraping concerns](https://www.niemanlab.org/2026/01/news-publishers-limit-internet-archive-access-due-to-ai-scraping-concerns/)，原载于 Hacker News。

---

## 背景介绍

《卫报》和《纽约时报》等新闻机构正在审查数字档案，将其视为 AI 爬虫的潜在后门。

作为保存互联网使命的一部分，Internet Archive 运营着抓取网页快照的爬虫。其中许多快照可以通过其公开工具 Wayback Machine 访问。但随着 AI 机器人在网络上搜集训练数据来喂养它们的模型，Internet Archive 对免费信息获取的承诺已经使其数字图书馆成为一些新闻出版商的潜在负担。

## 出版商的应对措施

### 《卫报》的策略

当《卫报》查看谁在试图提取其内容时，访问日志显示 Internet Archive 是一个频繁的爬虫，商业事务和许可主管 Robert Hahn 表示。该出版商决定限制 Internet Archive 对已发布文章的访问，以最大限度地减少 AI 公司通过该非营利组织超过一万亿网页快照的存储库抓取其内容的机会。

具体来说，Hahn 表示《卫报》已采取措施将其从 Internet Archive 的 API 中排除，并从 Wayback Machine 的 URL 接口中过滤掉其文章页面。《卫报》的区域主页、主题页面和其他着陆页将继续出现在 Wayback Machine 中。

Hahn 特别对 Internet Archive 的 API 表示担忧：

> "很多这些 AI 企业都在寻找现成的、结构化的内容数据库。Internet Archive 的 API 显然是一个可以插入他们自己的机器并吸走知识产权的地方。"

### 其他出版商的行动

《金融时报》阻止任何试图抓取其付费内容的机器人，包括来自 OpenAI、Anthropic、Perplexity 和 Internet Archive 的机器人。根据全球公共政策和平台战略总监 Matt Rogerson 的说法，大多数 FT 故事都是付费的。因此，通常只有未付费的 FT 故事出现在 Wayback Machine 中。

《纽约时报》证实它正在"硬阻止"Internet Archive 的爬虫。2025 年底，Times 还将其中的一个爬虫 — archive.org_bot — 添加到其 robots.txt 文件中，禁止访问其内容。

《纽约时报》发言人说：
> "我们相信《纽约时报》人工主导的新闻价值，并始终希望确保我们的知识产权被合法访问和使用。我们阻止 Internet Archive 的机器人访问 Times，因为 Wayback Machine 提供了对 Times 内容的无限制访问 — 包括 AI 公司 — 而没有授权。"

## 规模化趋势

去年 8 月，Reddit 宣布将阻止 Internet Archive，其数字图书馆包括无数存档的 Reddit 论坛、评论部分和个人资料。这些内容与 Reddit 现在以数千万美元许可给 Google 作为 AI 训练数据的内容没有什么不同。

Reddit 发言人告诉 The Verge：
> "Internet Archive 为开放网络提供服务，但我们已经意识到 AI 公司违反平台政策（包括我们的）并从 Wayback Machine 抓取数据的例子。在他们能够保护自己的网站并遵守平台政策之前……我们正在限制他们对 Reddit 数据的一些访问，以保护 redditors。"

### 数据分析

Nieman Lab 使用记者 Ben Welsh 的 1,167 个新闻网站数据库作为起点进行了探索性分析。在 Welsh 的出版商列表中，76% 的网站位于美国。

**关键发现：**
- 总共 241 个来自九个国家的新闻网站明确禁止四个 Internet Archive 爬虫中的至少一个
- 其中 87% 的网站归 USA Today Co.（前身为 Gannett）所有
- 每个 Gannett 旗下的媒体都禁止相同的两个机器人："archive.org_bot" 和 "ia_archiver-web.archive.org"
- 一些 Gannett 网站采取了更强硬的措施：《得梅因纪事报》的 URL 在 Wayback Machine 中返回"此 URL 已被排除在 Wayback Machine 之外"的消息

## AI 训练与 Internet Archive

有证据表明，Wayback Machine 过去通常被用于训练 LLM（大语言模型）。《华盛顿邮报》2023 年对 Google C4 数据集的分析显示，Internet Archive 是用于构建 Google T5 模型和 Meta Llama 模型的训练数据中的数百万个网站之一。在 C4 数据集的 1500 万个域名中，Wayback Machine 的域名（web.archive.org）在出现频率方面排名第 187 位。

### 过载事件

2023 年 5 月，Internet Archive 在一家 AI 公司导致服务器过载后暂时离线，Wayback Machine 主任 Mark Graham 告诉 Nieman Lab。该公司从 Amazon Web Services 上的虚拟主机每秒发送数万个请求，以从该非营利组织的公共领域档案中提取文本数据。Internet Archive 两次阻止了这些主机，然后公开发出"尊重地"抓取其网站的呼吁。

Graham 说：
> "我们与他们取得了联系。他们最终给了我们一笔捐款。他们最终表示歉意并停止了这样做。"

## 伦理与法律困境

Old Dominion University 的计算机科学家兼教授 Michael Nelson 说：
> "Common Crawl 和 Internet Archive 被广泛认为是'好人'，被像 OpenAI 这样的'坏人'使用。在每个人都不想被 LLM 控制的厌恶中，我认为好人是附带损害。"

Internet Archive 创始人 Brewster Kahle 在被问及《卫报》的决定时表示：
> "如果出版商限制像 Internet Archive 这样的图书馆，那么公众将减少对历史记录的访问。"

这是一个可能会削弱该组织打击"信息混乱"工作的前景。

## 技术实现细节

### robots.txt 的作用

网站的 robots.txt 页面告诉机器人可以抓取网站的哪些部分，就像"门卫"一样，告诉访客谁被允许进入房子以及哪些部分是禁区。robots.txt 页面不具有法律约束力，因此运行爬虫的公司没有义务遵守它们，但它们表明了 Internet Archive 不受欢迎的地方。

### 当前状态

目前，Internet Archive 没有通过其 robots.txt 文件禁止任何特定的爬虫，包括主要 AI 公司的爬虫。截至 1 月 12 日，archive.org 的 robots.txt 文件内容为："欢迎来到档案馆！请抓取我们的文件。如果您能负责任地抓取，我们将不胜感激。保持开放！"在我们询问此语言后不久，它被更改了。该文件现在简单地写着："欢迎来到 Internet Archive！"

## 行业影响与反思

《卫报》没有记录其网页被 AI 公司通过 Wayback Machine 抓取的具体实例。相反，它正在采取这些措施，并正在直接与 Internet Archive 合作实施更改。Hahn 说该组织对《卫报》的担忧持开放态度。

该媒体没有完全阻止 Internet Archive 的爬虫，Hahn 说，因为它支持该非营利组织使信息民主化的使命，尽管该立场作为其常规机器人管理的一部分仍在审查中。

Hahn 表示：
> "[这个决定] 更多是关于合规性和对我们内容的后门威胁。"

正如我们之前报道的那样，Internet Archive 承担了保存互联网的艰巨任务，许多新闻组织没有能力保存自己的作品。12 月，Poynter 宣布与 Internet Archive 联合倡议，培训当地新闻机构如何保存其内容。像这样的存档倡议虽然急需，但很少见。由于没有要求保存互联网内容的联邦授权，Internet Archive 是美国最强大的存档倡议。

Hahn 总结道：
> "Internet Archive 往往是好公民。这是意外后果的法则：你为了真正好的目的做某事，但它被滥用了。"

## 总结与思考

这篇文章揭示了 AI 时代内容保护的一个复杂困境：

1. **"好人"的困境**：Internet Archive 作为公益组织，其开放性被 AI 公司利用，成为获取训练数据的便捷渠道。

2. **连锁反应**：随着主要出版商限制访问，可能会导致互联网历史记录的不完整，影响公共利益。

3. **技术对抗**：robots.txt 只是一个君子协定，没有法律约束力，真正的内容保护需要更强大的技术手段。

4. **平衡难题**：如何在保护知识产权和促进信息开放之间找到平衡，是这个时代的重要课题。

对于开发者而言，这个案例提醒我们在构建 AI 系统时需要考虑伦理问题，尊重内容创作者的权利，同时也要思考如何建立更健康的内容生态系统。

---

*翻译说明：本文根据原文进行了适当的文化适配和技术术语调整，保留了关键技术概念如 LLM、robots.txt、API 等的英文原文，以便中文开发者理解。*
