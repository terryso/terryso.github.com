---
layout: post
title: "Claude Code 选什么工具？一份 2430 次响应的深度调查"
date: 2026-02-27 20:34:26 +0800
categories: tech-translation
description: "研究人员让 Claude Code 处理真实项目 2430 次，观察它如何选择技术栈。结果发现：它倾向于自建而非购买，而当它选择工具时，决策非常果断。"
original_url: https://amplifying.ai/research/claude-code-picks
source: Hacker News
---

本文翻译自 [What Claude Code Actually Chooses](https://amplifying.ai/research/claude-code-picks)，原载于 Hacker News。

---

## 核心发现

Amplifying 团队做了一个有趣的实验：他们让 Claude Code 处理真实代码仓库 **2430 次**，观察它在没有任何工具提示的情况下会做出什么选择。

> 实验设计很巧妙：提示词中不包含任何工具名称，只提开放性问题。比如"添加 feature flags"、"添加用户认证"——然后看 Claude Code 自己选什么。

**结论一上来就很有冲击力：Claude Code 倾向于「造轮子」而非「买轮子」。**

在 20 个技术类别中，有 12 个类别里 Claude Code 选择自建方案（Custom/DIY）的比例最高。当被要求"添加 feature flags"时，它用配置文件 + 环境变量 + 百分比灰度发布来实现，而不是推荐 LaunchDarkly。当被要求"添加 Python 认证"时，它直接写 JWT + bcrypt，而不是推荐 Auth0。

但当它选择工具时，决策非常果断：
- GitHub Actions：94%
- Stripe：91%
- shadcn/ui：90%

---

## 实验数据概览

| 指标 | 数值 |
|------|------|
| 总响应数 | 2,430 |
| 测试模型 | Sonnet 4.5, Opus 4.5, Opus 4.6 |
| 技术类别 | 20 |
| 有效提取率 | 85.3% |
| 模型一致性 | 90%（18/20 类别内一致）|

---

## 默认技术栈

当 Claude Code 确实推荐工具时，这些是它的默认选择（主要是 JS 生态）：

**状态管理**：Zustand（64.8%，57/88 次）

**可观测性**：Sentry（63.1%，101/160 次）

**CI/CD**：GitHub Actions（94%）

**支付**：Stripe（91%）

**UI 组件**：shadcn/ui（90%）

这些选择基本上代表了「现代 JS 开发的主流审美」——轻量、简洁、无废话。

---

## 与市场主流背道而驰的选择

这里有一些有趣的「反直觉」发现：

**Redux（状态管理）**：0 次首选，但有 23 次被提及。Zustand 被选中 57 次。

这个结果我完全不意外。Redux 的样板代码问题一直是痛点，而 Zustand 的 API 设计简洁得多。AI 显然更倾向于能快速实现功能的方案。

**Axios（API 层）**：完全缺席，框架原生 fetch 被优先选择。

**Jest（测试）**：仅 4% 作为首选，但有 31 次作为备选被提及。知道它，但不选它。

**npm（包管理）**：仅 1 次首选，但有 51 次备选提及。

---

## 新旧模型的「代际偏好」

这是最精彩的部分：**更新的模型倾向于选择更新的工具**。

### ORM（JS 生态）

| 模型 | Prisma | Drizzle |
|------|--------|---------|
| Sonnet 4.5 | 79% | 21% |
| Opus 4.5 | 40% | 60% |
| Opus 4.6 | 0% | **100%** |

Drizzle 完全取代了 Prisma。这个趋势非常明显——更新的模型更偏好 Drizzle 的 type-safe SQL 方式。

### Python 任务队列

| 模型 | Celery | FastAPI BackgroundTasks | Custom/DIY |
|------|--------|-------------------------|------------|
| Sonnet 4.5 | 100% | 0% | - |
| Opus 4.5 | - | 38% | - |
| Opus 4.6 | - | **44%** | 其他 |

Celery 在新模型中几乎消失了，取而代之的是 FastAPI 原生的 BackgroundTasks 或直接用 asyncio。

### Python 缓存

Redis 从主导地位退居二线，50% 的情况下 Claude Code 选择自建内存 TTL 缓存。

---

## 部署选择的「泾渭分明」

部署选择完全由技术栈决定，传统云服务商几乎颗粒无收：

**前端（Next.js + React SPA）**

Vercel：86/86 次选择，**100%**。没有第二名。

**后端（Python / FastAPI）**

Railway：82%

**传统云服务商（AWS, GCP, Azure）的战绩**：**0 次首选**。

这确实反映了开发者体验的现实——Vercel 和 Railway 的部署体验确实比传统云服务商丝滑太多了。

报告中有个很好的例子：当被问到「这个 Next.js SaaS 应该部署到哪里？」时，Claude Code 的回答是：

> **Vercel（推荐）** — 由 Next.js 创作者开发，零配置部署，自动预览部署，边缘函数支持。`vercel deploy`
>
> **Netlify** — 类似功能的好替代方案，免费额度不错。
>
> **AWS Amplify** — 如果你已经在 AWS 生态系统中，可以考虑。

Vercel 获得了安装命令和详细理由，AWS Amplify 只有一句话。差距一目了然。

---

## 模型间的分歧

三个模型在 20 个类别中的 18 个达成了一致（同一生态内）。有 5 个类别存在真正的分歧：

| 类别 | Sonnet 4.5 | Opus 4.5 | Opus 4.6 |
|------|------------|----------|----------|
| ORM (JS) | Prisma 79% | Drizzle 60% | **Drizzle 100%** |
| Jobs (JS) | BullMQ 50% | BullMQ 56% | **Inngest 50%** |
| Jobs (Python) | Celery 100% | FastAPI BgTasks 38% | FastAPI BgTasks 44% |
| Caching | Redis 71% | Redis 31% | **Custom/DIY 32%** |
| Real-time | SSE 23% | Custom/DIY 19% | Custom/DIY 20% |

---

## 对开发者工具公司的启示

这篇研究对做开发者工具的公司很有价值：**你的工具会不会被 AI 推荐，直接影响未来市场的走向**。

如果你做的是开发者工具，可能需要考虑：
1. 你的工具在 AI 的「知识图谱」中处于什么位置？
2. 你的文档是否足够清晰，让 AI 能理解何时应该选择你的产品？
3. 你的工具是否足够简洁，符合 AI 偏好「快速实现」的倾向？

---

## 我的思考

这份研究揭示了一个有趣的现实：**AI 编程助手正在成为技术选型的新 gatekeeper**。

过去，技术选型受 Google 搜索结果、Stack Overflow 热门回答、GitHub star 数影响。现在，越来越多的开发者直接问 AI「我该用什么」，而 AI 的选择会直接影响实际的技术采纳率。

几个值得关注的点：

1. **简洁性胜出** — Zustand 击败 Redux，Drizzle 击败 Prisma，都是更简洁的 API 设计获胜。AI 显然更喜欢能快速理解、快速实现的东西。

2. **原生优先** — 框架原生方案（FastAPI BackgroundTasks、原生 fetch）经常击败专门的库。这符合「少一个依赖就少一个麻烦」的工程直觉。

3. **传统云服务商的危机** — 0 次首选不是偶然。如果 AI 助手持续不推荐你，你的新用户获取会越来越难。

4. **版本更新的影响** — AI 模型会「学习」新技术趋势。Sonnet 4.6 2026 年 2 月发布，报告中提到会更新测试结果，值得期待。

---

## 关键要点

- Claude Code 偏好自建方案，在 12/20 类别中 DIY 是首选
- 当选择工具时，决策果断：GitHub Actions 94%、Stripe 91%、shadcn/ui 90%
- 新模型偏好新工具：Drizzle 取代 Prisma，FastAPI BackgroundTasks 取代 Celery
- 部署选择完全由技术栈决定：Vercel 统治前端，Railway 统治 Python 后端
- 传统云服务商（AWS/GCP/Azure）获得 **0 次首选推荐**
- Redux、Axios、Jest 等传统热门工具被明显冷落

这份研究的价值在于它不是基于问卷或搜索趋势，而是基于 AI 在真实编程场景中的实际行为。如果 AI 编程助手继续普及，这些数据可能比任何市场调研都更能预测未来的技术走向。
