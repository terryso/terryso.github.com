---
layout: post
title: "从 Supabase 到 Clerk 再到 Better Auth：Val Town 的认证之路"
date: 2026-05-07 09:24:27 +0800
categories: tech-translation
description: "Val Town 分享了他们在认证方案上的三次迁移经验：从 Supabase 到 Clerk，最终转向开源的 Better Auth，揭示了第三方认证服务的隐藏成本与架构权衡"
original_url: https://blog.val.town/better-auth
source: Hacker News
---

本文翻译自 [From Supabase to Clerk to Better Auth](https://blog.val.town/better-auth)，原载于 Hacker News。

## 背景

2023 年，Val Town 的 Tom MacWright 写了一篇关于[他们如何从 Supabase 迁移](https://blog.val.town/blog/migrating-from-supabase)到更传统数据库架构的文章。当时他们大量使用了 Supabase 的功能，包括认证（Authentication）服务。迁移的时候，他们分别找到了替代方案：用 [Render](https://render.com/) 替代数据库，用 [Clerk](https://clerk.com/) 替代认证。

但现实来得很快——到 2023 年底，团队内部就提了一个 issue：**必须从 Clerk 迁走**。这个 issue 直到一个月前才最终关闭，因为他们切换到了 [Better Auth](https://www.better-auth.com/)。

需要先说明的是：Clerk 本身是一家非常成功的公司。他们刚刚完成了 [5000 万美元的融资](https://clerk.com/blog/series-c)，拥有大量满意的用户。Supabase 也以 50 亿美元的估值[融资了 1 亿美元](https://supabase.com/)。这些数字和成绩是实打实的。但 Val Town 的架构和 Clerk 的设计理念之间存在根本性的冲突，这才是问题所在。

## 核心问题：你的用户表不应该托管给第三方

Clerk 的核心设计理念是：**它想同时充当你的用户表（users table）和会话表（sessions table）**。

这听起来很方便——少维护一张表嘛。Clerk 甚至在 2021 年发过一篇博客叫 "[Consider dropping your users table](https://clerk.com/blog/offload_user_table)"，2023 年还有个 YouTube 视频直接叫 [DELETE your Users table](https://www.youtube.com/watch?v=86sFORO-M3Y)。**但作者强烈建议你不要这么做。**

### 问题一：Clerk 作为用户表的替代品，并不靠谱

把用户数据交给第三方服务，会遇到两个大问题。

首先，Clerk 有严重的**速率限制（rate limit）**，而且**可靠性不够**。

Val Town 切换到 Clerk 后，最初的想法是随时从 Clerk 的 API 加载用户数据——比如用户设置、头像 URL、邮箱等。Clerk 的 SDK 确实提供了方便的方法：`rootAuthLoader` 有个 `loadUser` 选项可以自动完成这个请求。开发环境里一切正常。

但到了生产环境，**这个端点的速率限制是每秒 5 次请求**。注意，是整个账号、所有用户加在一起每秒 5 次。这在生产环境就是一个巨大的陷阱。他们最终[不得不移除了这个选项](https://github.com/clerk/javascript/issues/1043)。

这个问题对 Val Town 这种社交属性的产品打击尤其严重。社交网站的大量页面都需要展示其他用户的信息——用户名、头像等。但 Clerk 的默认 UI 假设用户只需要看到**自己的**头像和设置信息，这些都存在 JWT（JSON Web Token）里就行。社交网站完全打破了这个假设。

Clerk 的建议是通过 **webhook** 把数据同步到自己的数据库——结果就是，你现在有了**两个**用户数据源，两套权威，复杂度翻倍。注册流程变得非常曲折：用户在某个瞬间有了 Clerk 账号但没有数据库记录；或者因为平台要求用户名，用户可能处于有 Clerk 账号、有数据库行、但账号不完整的尴尬状态。用户设置也被割裂在两处。

### 问题二：Clerk 成了所有用户会话的单点故障

基于 Cookie 的用户会话通常是短生命周期的，需要不断刷新，这样可以快速让会话失效。但这意味着每隔几分钟，用户就需要用旧 cookie 换新 cookie。

当用户的登录会话需要刷新时，请求链路是：Val Town 子域名 → Clerk → 完成刷新。Val Town 自己没有会话表，不控制会话生命周期。

这个设计的好处是你可以完全不管认证的事。但坏处是：**Clerk 一挂，整个网站就挂了**。Clerk 宕机不仅影响登录/登出流程，它会让**已经登录的用户也无法使用网站**。而 Clerk 宕机的频率和持续时间都让人难以接受——[从 2025 年 5 月以来](https://status.clerk.com/)，它的正常运行时间在两个九到三个九之间摇摆（即 99% 到 99.9%），这之前的数据没有公开，但作者记得很多次网站挂了而自己完全无能为力。

> 一个复杂系统的可靠性，等于其所有关键组件可靠性的**最小值**。

## 为什么没有立即切换？

既然 Clerk 问题这么多，为什么不立刻换掉？

首先，频繁更换基础设施不是好事。做决定然后坚持下去，对开发效率和团队士气都有好处。Val Town 不想重写更多不必要的代码。

其次，Clerk 确实有做得好的地方：为 Remix、Fastify、Express 等框架都提供了 SDK，跟进了框架的快速迭代。他们的管理和反滥用措施也确实帮助解决了客服问题和防范骗子。

Clerk 最适合的场景是**相对简单、重前端、没有社交功能的应用**——这些应用确实不需要自己的用户表。Clerk 上手极其简单，价格合理，管理后台也很好用。

而且说实话，认证领域的好选择并不多。很多开源认证方案年久失修；认证即服务平台有同样的供应商风险；自己从零搭建又担心安全漏洞。关键在于找到合适的技术控制度——既不想完全自己写认证系统引入安全漏洞，也不想把太多责任外包给供应商。**尤其是，绝不会再信任第三方的会话管理了。**

## Better Auth：终于找到答案

[Better Auth](https://better-auth.com/) 一开始就满足了很多要求：代码质量高、与各种框架集成良好、而且作为一个独立的开源项目真正可用。

当然，供应商风险依然存在——这是一个主要由一家公司开发的大型复杂代码库。但关键区别是：**Val Town 不再依赖第三方保持在线来维持用户认证和会话的正常工作**。

当时的亚军是 WorkOS 的 [AuthKit](https://www.authkit.com/)。WorkOS 值得信任，AuthKit 也非常精良。但在经历了两次供应商切换之后，作者更希望找到一个可以独立运行、核心开源的方案。

Better Auth 的付费策略也很巧妙：Val Town 管理自己的所有数据，Better Auth 通过插件提供一个 API，让他们的仪表盘可以拉取信息做轻量级用户管理。Better Auth 的付费服务（叫 "Infrastructure"）在 Val Town 的使用方式中基本是无状态的，**完全不参与会话管理**。

简而言之，Better Auth 名副其实——确实更好。

### 有趣的插曲：AI 辅助平滑迁移

有趣的是，作者不得不承认 LLM 在迁移过程中帮了大忙。借助 AI 的辅助，他们采用了一个更复杂的策略：**同时支持 Better Auth 和 Clerk 长达两周的过渡期**。每个处理认证的端点都同时接受两种 cookie，用户逐渐自然地迁移到 Better Auth，因为新的登录页面只提供 Better Auth 的会话。

当然，跟安全相关的事情不能完全依赖 AI——仔细审查、重写、测试所有代码是必须的。最终的纯 Better Auth 认证代码完全是手写的。

## 经验总结

1. **你的用户表应该在你自己的数据库里。** 把核心数据交给第三方，你不仅受制于它的可用性，还要处理数据同步的复杂性。
2. **会话管理不应该外包。** 认证服务宕机不应该让你的整个网站瘫痪。
3. **系统可靠性 = min(各关键组件可靠性)。** 评估第三方服务时，要把它的 SLA 当作你整个系统的上限。
4. **好的产品不一定适合你。** Clerk 对简单的前端应用来说确实很好，但社交型产品需要不同的架构。
5. **软件世界变化很快。** 你需要解决方案的时候它可能还不存在，但一年后可能就出现了。保持关注，适时迁移。

Better Auth 也提供了 Val Town 的[入门模板](https://www.val.town/x/templates/better-auth-starter)，如果你想在 Val Town 上快速集成认证，可以试试。

---

本文的核心观点非常明确：认证是基础设施中的基础设施，用户数据和会话管理应该尽可能掌握在自己手中。对于中国开发者来说，在选择认证方案时，除了考虑功能和易用性，更要从架构层面思考——你的产品是否有社交属性？你是否能接受第三方服务成为你的单点故障？这些问题在选型之初就应该想清楚。
