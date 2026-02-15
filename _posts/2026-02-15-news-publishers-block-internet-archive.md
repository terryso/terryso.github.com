---
layout: post
title: "新闻出版社限制 Internet Archive 访问，担忧 AI 爬虫通过「后门」获取内容"
date: 2026-02-15 12:25:31 +0800
categories: tech-translation
description: "《卫报》《纽约时报》等主流媒体开始限制 Internet Archive 的访问权限，担心 AI 公司将其数字档案馆作为获取训练数据的「后门」。"
original_url: https://www.niemanlab.org/2026/01/news-publishers-limit-internet-archive-access-due-to-ai-scraping-concerns/
source: Hacker News
---

本文翻译自 [News publishers limit Internet Archive access due to AI scraping concerns](https://www.niemanlab.org/2026/01/news-publishers-limit-internet-archive-access-due-to-ai-scraping-concerns/)，原载于 Hacker News。

## 背景：当「好人」成为「坏人」的工具

Internet Archive 作为互联网的「数字图书馆」，通过其爬虫程序持续抓取网页快照，并通过 Wayback Machine 向公众提供访问。然而，随着 AI 公司大规模爬取网络数据用于模型训练，这个致力于信息自由获取的非营利组织，反而成为了一些新闻出版商眼中的「安全隐患」。

## 《卫报》的决策：限制但不是封杀

当《卫报》检查谁在尝试获取其内容时，访问日志显示 Internet Archive 是频繁的爬虫之一。业务事务与授权主管 Robert Hahn 表示，出版社决定限制 Internet Archive 对已发布文章的访问，以降低 AI 公司通过该组织的万亿级网页快照库抓取内容的风险。

具体措施包括：
- 将自己从 Internet Archive 的 API 中排除
- 在 Wayback Machine 的 URL 接口中过滤掉文章页面
- 保留地区首页、主题页和其他着陆页在 Wayback Machine 中的展示

Hahn 特别强调了对 API 的担忧：

> "很多 AI 企业都在寻找现成的、结构化的内容数据库。Internet Archive 的 API 显然是他们可以直接接入并大量提取知识产权的地方。"

相比之下，Wayback Machine 本身风险较低，因为其数据结构化程度不高。

## 行业趋势：多家媒体采取类似行动

这并非个例。多家主流媒体正在重新评估与 Internet Archive 的关系：

**《纽约时报》**：正在「硬性封锁」Internet Archive 的爬虫，并在 2025 年底将 `archive.org_bot` 添加到 robots.txt 文件中。发言人表示：

> "Wayback Machine 在未经授权的情况下提供对《纽约时报》内容的无限制访问——包括被 AI 公司获取。"

**《金融时报》**：封锁所有尝试抓取付费内容的机器人，包括 OpenAI、Anthropic、Perplexity 和 Internet Archive 的爬虫。由于大多数 FT 文章都有付费墙，通常只有免费文章会出现在 Wayback Machine 中。

**Reddit**：去年 8 月宣布封锁 Internet Archive，其数字图书馆中存档了无数 Reddit 论坛、评论区和个人资料。这些内容与 Reddit 如今以数千万美元授权给 Google 作为 AI 训练数据的内容高度相似。

## 数据揭示：谁在限制访问？

Nieman Lab 使用记者 Ben Welsh 的 1,167 个新闻网站数据库进行了分析。结果显示：

- **241 个新闻网站**（来自 9 个国家）明确禁止至少一种 Internet Archive 爬虫
- **87% 的网站**隶属于 USA Today Co.（前身为 Gannett），这是美国最大的报业集团
- 每个 Gannett 旗下的媒体都禁止了两个爬虫：`archive.org_bot` 和 `ia_archiver-web.archive.org`

更有意思的是，这些网站不只针对 Internet Archive：
- 241 个网站中有 **240 个也禁止了 Common Crawl**（另一个非营利互联网保存项目）
- **231 个网站同时禁止** OpenAI、Google AI 和 Common Crawl 的爬虫

## Internet Archive 的困境

Old Dominion University 的计算机科学家 Michael Nelson 教授对此现象有一个精辟的总结：

> "Common Crawl 和 Internet Archive 被广泛认为是「好人」，但被 OpenAI 这样的「坏人」使用。在所有人都试图不被 LLM 控制的浪潮中，我认为好人成了附带损害。"

Internet Archive 创始人 Brewster Kahle 则警告：

> "如果出版商限制像 Internet Archive 这样的图书馆，公众将减少对历史记录的访问。"

## 技术细节：被滥用的开放性

有证据表明 Wayback Machine 确实曾被用于训练 LLM。《华盛顿邮报》2023 年对 Google C4 数据集的分析显示，在用于构建 Google T5 模型和 Meta Llama 模型的训练数据中，Internet Archive 是 1500 万个域名之一，排名高居第 187 位。

更严重的是，2023 年 5 月，一家 AI 公司导致 Internet Archive 服务器过载而暂时下线。该公司从 AWS 虚拟主机每秒发送数万次请求，从非营利组织的公共领域档案中提取文本数据。

Wayback Machine 主管 Mark Graham 回忆道：

> "我们联系了他们。他们最终给了我们一笔捐款，并说很抱歉，不再这样做了。"

## 开发者的思考

从技术角度看，这个事件揭示了几个值得思考的问题：

1. **开放数据的双刃剑**：Internet Archive 的开放理念在 AI 时代面临前所未有的挑战。如何在保持开放与保护内容创作者之间取得平衡？

2. **robots.txt 的局限性**：robots.txt 并不具有法律约束力，只能表达意愿。真正的内容保护需要更技术化的手段（如 API 访问控制、速率限制）。

3. **API vs 网页抓取**：《卫报》的决策点出了一个关键问题——结构化的 API 比非结构化的网页更容易被滥用。这对 API 设计者是个警示。

4. **版权与训练数据的灰色地带**：目前的法律框架尚未明确 AI 训练数据的使用边界，导致各方都在采取防御性措施。

## 小结

这场冲突的核心是一个哲学问题：在 AI 时代，我们如何平衡信息的开放获取与内容创作者的权益？

对于新闻媒体来说，他们的担忧是现实的——原创内容是他们的核心资产。对于 Internet Archive 来说，保存历史记录的使命同样重要。

或许，解决方案不在于封锁与对抗，而在于建立新的协作机制：比如 AI 公司直接与出版商签订授权协议（如 Gannett 与 Perplexity 的合作），或者 Internet Archive 开发更精细的访问控制机制，区分学术研究用途和商业 AI 训练。

在这个信息爆炸的时代，「保存」与「保护」之间的张力，可能还会持续很长一段时间。
