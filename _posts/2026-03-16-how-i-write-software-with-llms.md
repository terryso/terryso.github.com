---
layout: post
title: "我如何用 LLM 写软件"
date: 2026-03-16 16:49:17 +0800
categories: tech-translation
description: "作者分享了他使用 LLM 进行软件开发的完整工作流程，包括多模型协作、Agent 分工以及一个真实的开发会话案例。"
original_url: https://www.stavros.io/posts/how-i-write-software-with-llms/
source: Hacker News
---

本文翻译自 [How I write software with LLMs](https://www.stavros.io/posts/how-i-write-software-with-llms/)，原载于 Hacker News。

## 我不在乎编程的乐趣

最近我*重度*回归到造东西这件事上，这主要归功于 LLM。我原以为自己喜欢编程，结果发现我真正喜欢的是**造东西**，编程只是其中一种方式而已。既然 LLM 已经擅长编程，我就一直在用它们不停地造东西，非常令人兴奋的是，我们正处于又一个全新未探索领域的前沿。

目前关于 LLM 的争论很多，但有几位朋友问过我具体的工作流程，所以我决定详细写下来，希望能帮助他们（以及你）更轻松、更快速、更高质量地造东西。

文章末尾还有一个真实的（带注释的）编码会话。如果你想跳过工作流程的细节，可以直接跳到那里。

## 好处

第一次发现这个事实是在 Codex 5.2 发布前后（感觉像一个世纪前），更近一点是在 Opus 4.6 发布时：我惊讶地发现，现在我可以和 LLM 一起写软件，而且缺陷率非常低——可能比我手写代码还要低——同时还能保持对整个系统的了解。在此之前，代码在编程两三天后就会迅速变得无法维护，但现在我已经连续几周在几个项目上工作，积累了数万行有用的代码，每次修改都和第一次一样可靠。

我还注意到我的工程技能并没有变得无用，只是发生了转移：我不再需要知道如何正确写出每一行代码，但正确地架构系统、做出正确的选择让东西变得可用，变得前所未有的重要。

在我对底层技术不了解的项目上（比如移动应用），代码仍然很快会变成一堆糟糕选择的混乱。然而，在我熟悉所用技术的项目上（比如后端应用，虽然不一定是 Python），这种情况还没有发生过，即使是数万行代码。这大部分是因为模型越来越好，但我认为很大程度上也是因为我改进了与模型协作的方式。

我注意到的一件事是，不同的人用 LLM 得到的结果差异巨大，所以我怀疑你与它们对话的方式会影响结果。正因如此，我会在本文中非常深入地讨论细节，甚至发布真实的会话记录，让你可以看到我开发的所有细节。

另一点值得一提的是，我不知道模型未来会如何演变，但我注意到一个趋势：在 LLM 的早期（GPT-2 不算，因为它太有限，但从 davinci 开始），我必须审查每一行代码，确保它是正确的。随着 LLM 后续几代的发展，这个级别提升到了函数层面，所以我不需要检查代码，但必须检查函数是否正确。现在，这主要是在"整体架构"层面，也许明年连这个都不需要了。不过目前，你仍然需要一个有良好编码技能的人类。

## 我用这种方式构建的东西

最近我构建了不少东西，我想在这里列出其中一些，因为对 LLM 的一个常见批评是人们只用它们写玩具脚本。这些项目从严肃的日常工具到艺术项目都有，但它们都是我每天使用的真实、维护中的项目：

### Stavrobot

我最近构建的最大的东西是一个专注于安全的 OpenClaw 替代品。我多年来一直想要一个 LLM 个人助理，现在我终于有了。大多数人会说"但你不能让 LLM 安全！"，这是误解了安全就是权衡，而我的代理试图做的是在给定可用性下最大化安全性。我认为它非常成功，我已经使用了一段时间，真的很喜欢能够准确推理它能做什么和不能做什么。

它管理我的日历，智能地决定我的可用性或任何冲突，为我做研究，通过写代码扩展自己，提醒我以前忘记的所有事情，自主管理家务等等。助手的好处很难解释，因为它们没有**一个**杀手级功能，而是减轻了一千个小麻烦，而这些麻烦对每个人来说都不同。所以，试图向某人解释拥有助手的好处往往会得到"但我不需要你需要的东西"的反应，这忽略了每个人需要不同的东西，而一个能访问工具并做出智能决策来解决问题的代理对任何人都是很好的帮助。

我计划很快更详细地写这个，因为设计它时有一些非常有趣的挑战，我喜欢我解决它们的方式。

### Middle

也许我最近的命名不太出色，但这是一个小吊坠，可以录制语音笔记、转录它们，并可选择将它们 POST 到你选择的 webhook。我让它把语音笔记发送给我的 LLM，随时从口袋里拿出它，按下一个按钮，记录一个想法或问一个问题，知道答案或待办事项下次我检查助手消息时会在那里，感觉太棒了。

这是一个简单的东西，但它的有用性不在于**它做什么**，而在于**它做的方式**。它总是可用，总是可靠，使用零摩擦。

### Sleight of hand

我也计划写一些关于这个的东西，但这更像是一个艺术作品：这是一个不规则滴答作响的挂钟，但总是精确到分钟（时间通过互联网同步）。它有多种模式，一种模式有可变的滴答时间，从 500 毫秒到 1500 毫秒，令人愉悦地令人愤怒。另一种模式滴答得比一秒钟略快，然后随机停顿一秒钟，让毫无戒心的观察者质疑自己的理智。还有一种模式以双倍速度跑到 :59，然后在那里等待三十秒，最后一种是普通的时钟，因为所有不规则滴答让我发疯。

### Pine Town

Pine Town 是一个奇思妙想的无限多人画布草地，你有自己的一小块土地可以画画。大多数人画……有问题的内容，但偶尔会有成年人访问并画一些不错的东西。有些画真的很棒，通常滚动看看人们做了什么很有趣。

我用 LLM 制作了所有这些项目，甚至从未阅读过它们的大部分代码，但我仍然非常熟悉每个项目的架构和内部运作。我是这样做的：

## 工具链

对于工具链，我使用 OpenCode。我真的很喜欢它的功能，但显然有很多选择，我也对 Pi 有很好的体验，但无论你使用什么工具链，它都需要让你：

- **使用来自不同公司的多个模型**。大多数第一方工具链（Claude Code、Codex CLI、Gemini CLI）会失败于此，因为公司只想让你使用他们的模型，但这是必要的。
- **定义可以自主相互调用的自定义 Agent**

还有各种其他不错的功能，比如会话支持、worktree 管理等，你可能需要根据项目和技术栈来选择，但这些取决于你。我会解释上面的两个要求，以及为什么它们是必要的。

### 多个模型

你可以把特定的模型（比如 Claude Opus）看作一个人。当然，你可以用干净的上下文重新开始，但模型基本上会有相同的意见/优势/弱点，而且它很可能会同意自己。这意味着让一个模型审查它刚刚写的代码是相当无用的，因为它倾向于同意自己，但让一个**不同**的模型审查代码会带来很大的改进。本质上，你是从第二双眼睛那里获得审查。

不同的模型在这里会有不同的优势和劣势。例如（这对今天的模型来说非常具体），我发现 Codex 5.4 相当挑剔和迂腐。这不是我写代码时想要的，但这绝对是我在审查时想要的。Opus 4.6 做出的决定与我做出的决定相关性很高，而 Gemini 3 Flash（是的，Flash！）甚至在提出其他模型没有看到的解决方案方面表现出色。

每个人对哪个模型适合哪个工作有不同的看法，而且模型往往会交替（例如，我在 11 月使用 Codex 作为我的主要模型，后来切换回 Opus）。为了获得最佳结果，你需要所有模型的混合。

### 相互调用的 Agent

我使用的工作流程由不同的 agent 组成，如果工具链没有能力让 agent 相互交谈，你将做很多烦人的在 LLM 之间传递信息的工作。你可能想减少这种情况，所以这是一个非常有用的功能。

## 我的工作流程

我的工作流程由一个架构师、一个开发者和一到三个审查者组成，具体取决于项目的重要性。这些 agent 被配置为 OpenCode agent（基本上是技能文件，包含我希望每个 agent 如何行为的指令）。我手写这些，因为我觉得如果你让 LLM 写一个技能没有真正帮助，这就像让某人写出如何成为一名优秀工程师的说明，然后给他们自己的说明并说"这是如何成为一名优秀工程师，现在成为一名"。这显然不会真正让他们变得更好，所以我尝试自己写指令。

### 架构师

架构师（目前是 Claude Opus 4.6）是我唯一交互的 agent。这需要是一个非常强大的模型，通常是我能访问的最强模型。这一步不会消耗太多 token，因为主要是聊天，但你希望这是经过深思熟虑的。

我会告诉 LLM 我的主要目标（这将是一个非常具体的功能或错误修复，例如"我想给 Stavrobot 添加带指数退避的重试，这样如果 LLM 提供商宕机它可以重试"），并与它交谈直到我确定它理解我想要的。这一步花费最多时间，有时甚至长达半小时的来回讨论，直到我们最终确定所有目标、限制和方法的权衡，并同意最终架构应该是什么样子。它会产生一个相当低级别的计划，详细到单个文件和函数的级别。例如，任务可能是"我将在这个文件的这两个组件的这三个代码路径中添加指数退避，因为没有其他组件与 LLM 提商交谈"。

我知道有些人在这一步更喜欢让 LLM 把计划写到一个文件中，然后他们把反馈加到那个文件而不是与 LLM 交谈。这是个人偏好的问题，因为我可以看到两种方法同样有效，所以如果更适合你，可以随意用那种方式做审查。个人而言，我更喜欢与 LLM 聊天。

澄清一下，在这一步我不仅仅是提示，我是在 LLM 的帮助下塑造计划。我仍然需要大量纠正 LLM，要么因为它错了，要么仅仅因为它做事的方式不是我做事的方式，这是我贡献的一大部分，也是我从中获得乐趣的部分。这个方向让我能够称项目为**我的**，因为使用相同 LLM 的其他人会想出不同的东西。

当我满意我们已经解决了所有问题（LLM 在这方面非常有帮助，会问它还不知道的问题并给我选项），我终于可以批准计划。我已经要求架构师在我真正说"approved"这个词之前不要开始任何事情，因为有些模型往往过于急切，当**它们**觉得理解了就开始实现，而我想要确保**我**有信心它理解了。

然后，架构师将工作分解为任务，将每个任务写到一个计划文件中，通常比我们的聊天更详细（并且级别更低），并调用开发者开始工作。这给开发者提供了具体的方向，并最小化了开发者可以做的高级选择，因为选择已经为它做好了。

### 开发者

开发者可以是一个较弱、更节省 token 的模型（我使用 Sonnet 4.6）。计划不应该给它太多发挥空间，它的工作严格是实现计划中的更改。完成后，它调用审查者审查它的工作。

### 审查者

每个审查者将独立查看刚刚实现的功能的计划和 diff，并进行批评。对于这一步，我将始终使用至少 Codex，有时我会添加 Gemini，在重要项目上我也会添加 Opus。

这个反馈会回到开发者那里，如果审查者同意，它就整合反馈，如果审查者不同意，它就升级到架构师。我发现 Opus 非常擅长选择正确的反馈来实现，有时会忽略反馈因为它太迂腐（即难以实现且在实践中不太可能成为问题）。显然，当我使用客观评估如"非常好"时，我真正的意思是"我非常同意它"。

### 整体方法

这种工作方式意味着我仍然知道函数级别以上做出的每个选择，并可以在后续运行中使用该知识。我经常注意到 LLM 推荐的东西在另一个代码库中可能是好的，但在我的代码库中要么不起作用要么是次优的，这表明 LLM 在研究代码时有一些盲点。我经常说"不，你应该用 Y 来做这个"，这时 LLM 意识到 Y 实际上存在于代码中，是比它推荐的方式更好的方式。

### 失败模式

另一方面，当我对技术不够熟悉以至于无法掌控架构时，我倾向于没有发现 LLM 做出的错误决定。这导致 LLM 在这些错误决定之上构建越来越多的东西，最终进入一种无法解开混乱的状态。当你一直告诉 LLM 代码不起作用，它说"我知道为什么！让我修复它"并不断把东西弄得更糟时，你就知道这种情况发生了。

这是我发生过太多次的真实失败模式，这就是为什么我最终采用了这个工作流程。出于这个原因，即使在我不熟悉特定技术的情况下，我也尝试在规划时尽可能多地理解。如果我能够很好地引导 LLM，以后会省去很多麻烦。

## 一个真实的会话

这是一个真实的会话记录，我在其中给 Stavrobot 添加电子邮件支持。我删减了工具调用和冗长的部分，但对话和决策过程完全按原样发生。

我首先告诉 LLM 我想实现什么，在一个非常高的层次上。有时我会给它更多细节，特别是如果我已经有了一个我想要如何实现的想法。

> **我**: I'd like to add email support to this bot. Let's think through how we would do this.

Bot 阅读代码并找到所有相关的部分，并提出一些问题。

> **LLM**: Good overview acquired. Here's what I see and the questions we need to resolve:
>
> ## Current pattern
> All channels follow the same flow: inbound webhook/listener → enqueueMessage(message, source, sender, attachments) → LLM processes → LLM calls send_*_message tool to reply. Channels are either in-process (Telegram webhooks, WhatsApp via Baileys) or separate containers (Signal bridge). Email would be a new channel following this same pattern.
>
> ## Key design questions
> 1. **Inbound** — how does email arrive?
>    - IMAP polling (simplest — poll a mailbox on a timer, works with any provider)
>    - Webhook from a transactional email service (SendGrid/Mailgun inbound parse — requires that service)
>    - Run an SMTP server (most complex, requires DNS/MX setup)
> 2. **Outbound** — how do we send?
>    - SMTP client (works with any provider — Gmail, Fastmail, self-hosted)
>    - Transactional email API (SendGrid/Mailgun API)
> 3. **What's your actual use case?** This affects several decisions:
>    - Full bidirectional conversation (reply to emails, maintain threads)?
>    - One-way notifications from the bot?
>    - Processing incoming emails (e.g., forwarded emails, digests)?
> 4. **Architecture** — separate container or in-process?
>    Signal uses a bridge container because signal-cli is a heavy Java process. Email libraries are lightweight, so in-process (like Telegram) is viable.
> 5. **Email-specific concerns:**
>    - How to handle HTML emails? Strip to plain text? Pass a markdown conversion to the LLM?
>    - Thread tracking — match replies to conversations by In-Reply-To/References headers, or treat each email independently?
>    - Attachments — needed?

在这次会话中，我只是带着一个还没想透的想法来了。LLM 通过提出具体问题来帮助，我来决定我想要实现走哪条路：

> **我**: 1. Email will arrive from a webhook, yes. I will create a Cloudflare Email worker that will forward the entire body of the email via webhook. It'll upload a JSON version of the message: {"from":"me@mydomain.com", etc}
> 2. SMTP client
> 3. Full bidirectional conversation, yes. This will be the same as how interlocutors work with the other transports, if someone sends an email to the bot, it will be ignored unless they are set up as an interlocutor. The owner can also send emails or forward emails for processing.
> 4. In-process, since this will be a webhook.
> 5. Markdown conversion, yes. Let's treat each email independently for now, and then we can change that if necessary. Attachments are needed, they should work like any other platform, the agent will receive them as files.
>
> The scenario I'm envisioning is both being able to correspond with people over email via subagents (like the bot currently does with Signal/Telegram/Whatsapp) and the owner being able to forward emails (e.g. a confirmation email for a booking) for the bot to process and ingest the info. Does this make sense? What edge cases can you foresee, or is there something you're worried about?

LLM 塑造计划，给它更多细节：

> **LLM**: This makes sense and fits cleanly into the existing channel pattern. Here are my observations and the edge cases I see:
>
> ## Concerns and edge cases
> 1. MIME parsing is non-trivial. Plain text emails are easy, but real-world emails are multipart MIME (HTML+text alternatives, inline images, attachments, nested multipart parts, various character encodings). We should use mailparser (from the Nodemailer project) to parse the raw RFC 2822 message server-side rather than trying to handle this in the worker.
> 2. Webhook authentication. The endpoint must be public (Cloudflare can't do a browser login), but we need to prevent anyone from POSTing fake emails. Simplest approach matching the Telegram pattern: generate a random secret on startup, but since we can't call back to Cloudflare to register it, we'd configure a shared secret in config.toml and have the worker send it as a header.
> 3. Outbound emails need a subject line. Every other channel is subject-less, but email requires one.
> 4. HTML-only emails. Some emails have no plain text part at all. mailparser can extract textAsHtml which we'd convert to markdown.
> 5. From address identity. For outbound SMTP, the from address must match what the SMTP server allows.
> 6. Forwarded emails for processing. When the owner forwards an email, the original sender's address will be in the forwarded body, not in the from field (which will be the owner's address). The LLM will need to understand this contextually — no special code needed.
> 7. Attachments on outbound. The existing send_*_message tools support attachments via file paths.
>
> ## Proposed design
> [详细的设计方案，包括代码示例、配置文件格式、文件变更列表等]

我回复一些我看到它遗漏的东西。这需要我很好地了解架构，遵循这个过程让我跟上所有中等低级别的更改。

> **我**: Make sure to update the README.md and config.example.toml as well. Also remember to change the email allowlist page to not validate E.164 for these

LLM 更新计划并询问任何最终问题。最终，计划确定，任务分解完成。

> **LLM**: Does this look right? Say "approved" to proceed.

> **我**: Approved.

LLM 写计划，调用开发者，审查者，最终完成。

> **LLM**: All 6 tasks are implemented. Here's what was done:
>
> New files:
> - src/email.ts — inbound webhook handler
> - src/email-api.ts — outbound SMTP transport
> - src/email.test.ts — webhook auth tests
>
> Modified files:
> - src/config.ts — EmailConfig interface
> - src/allowlist.ts — email: string[] on Allowlist
> - [... 多个其他文件]
>
> Test results: 421 tests passing, TypeScript type-check clean.

会话继续进行了更多的 QA 轮次，添加电子邮件地址的通配符匹配，一个关于 SQL 注入的问题，以及捕获子代理白名单中的遗漏条目。整个功能从开始到结束花了大约一个小时。

## 后记

这是我设置的基本概述。这不是什么特别花哨的东西，但对我来说效果很好，我对整个过程的可靠性非常满意。我已经 24/7 运行 Stavrobot 近一个月了，它非常可靠。

如果你有任何反馈或只是想聊天，可以在 Bluesky 上找我，或者直接给我发邮件。

---

## 关键要点

1. **核心转变**：使用 LLM 编程后，工程技能并没有变得无用，而是从"如何正确写代码"转向"如何正确架构系统"

2. **多模型协作**：不同模型有不同优势。让同一个模型审查自己的代码效果不好，但让不同模型审查会显著提高质量

3. **Agent 分工**：
   - 架构师：强大的模型，负责理解和规划
   - 开发者：节省 token 的模型，严格按计划实现
   - 审查者：多个不同模型，独立审查

4. **架构层面的掌控**：你仍然需要知道函数级别以上做出的每个选择，这让你能在后续运行中使用这些知识

5. **失败模式**：当对技术不够熟悉无法掌控架构时，LLM 会做出错误决定并在此基础上继续构建，最终形成无法解开的混乱

6. **迭代式对话**：与 LLM 的对话不是简单的提示，而是共同塑造计划的过程，你的纠正和偏好是让项目成为"你的"的关键部分
