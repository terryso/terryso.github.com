---
layout: post
title: "Claude Code 的工具选择偏好：AI 如何决定用什么工具"
date: 2026-02-27 06:09:13 +0800
categories: tech-translation
description: "Amplifying 团队对 Claude Code 进行了 2,430 次测试，系统性地研究了 AI 编程助手在面对开放性问题时会如何选择技术栈和工具。"
original_url: https://amplifying.ai/research/claude-code-picks
source: Hacker News
---

本文翻译自 [What Claude Code Actually Chooses](https://amplifying.ai/research/claude-code-picks)，原载于 Hacker News。

## 研究背景

Amplifying 团队做了一个非常有意思的研究：他们让 Claude Code 面对真实代码仓库运行了 **2,430 次**，然后观察它会选择什么工具。值得注意的是，所有提示词中都**没有提及任何工具名称**，完全是开放性问题。

研究覆盖了：
- **3 个模型**：Sonnet 4.5、Opus 4.5、Opus 4.6
- **4 种项目类型**
- **20 个工具类别**
- **85.3% 的提取率**（2,073 个可解析的选择）
- **90% 的模型一致性**（20 个类别中有 18 个达成一致）

> 更新：Sonnet 4.6 已于 2026 年 2 月 17 日发布，团队将会针对新模型运行测试并更新结果。

## 核心发现：造轮子，不要买轮子

这是最重要的发现：**Claude Code 倾向于自己造轮子，而不是使用现成的工具**。

"Custom/DIY"（自定义/自己动手）是最常见的单一标签，出现在 20 个类别中的 12 个。总共有 252 次"造轮子"的选择，超过任何单个工具。

举个例子：

- 被要求"添加功能开关（feature flags）"时，它会构建一个基于环境变量和百分比发布的配置系统，而不是推荐 LaunchDarkly
- 在 Python 项目中被要求"添加认证"时，它会从零开始写 JWT + bcrypt 实现

当它确实选择工具时，选择非常果断：
- **GitHub Actions**: 94%
- **Stripe**: 91%
- **shadcn/ui**: 90%

## 默认技术栈

当 Claude Code 选择工具时，这些选择会影响大量应用的构建方式。以下是它的默认推荐：

| 类别 | 首选工具 | 选择率 |
|------|----------|--------|
| 状态管理 | Zustand | 64.8%（57/88） |
| 可观测性 | Sentry | 63.1%（101/160） |
| CI/CD | GitHub Actions | 94% |
| 支付 | Stripe | 91% |
| UI 组件 | shadcn/ui | 90% |

需要注意，这些数据主要反映 JavaScript 生态系统。

## "反主流"选择

一些在市场上占有率很高的工具，Claude Code 却几乎不碰：

### 状态管理
- **Redux**: 0 次首选，但有 23 次被提及。取而代之的是 Zustand（57 次）

### API 层
- **Axios**: 完全缺席。Claude Code 更倾向于使用框架原生的路由方案

### 测试
- **Jest**: 只有 4% 的首选率，但有 31 次作为备选提及。知名但不是首选

### 包管理器
- **npm**: 1 次首选，但有 51 次备选提及。仍然广为人知

## 新近度梯度（Recency Gradient）

更有意思的是，**更新的模型倾向于选择更新的工具**：

### JS ORM 选择
| 模型 | Prisma | Drizzle |
|------|--------|---------|
| Sonnet 4.5 | 79% | - |
| Opus 4.5 | - | 60% |
| Opus 4.6 | - | **100%** |

Drizzle 完全取代了 Prisma，这是数据集中最强的代际转变。

### Python 任务队列选择
| 模型 | Celery | FastAPI BackgroundTasks |
|------|--------|-------------------------|
| Sonnet 4.5 | 100% | 0% |
| Opus 4.5 | - | 38% |
| Opus 4.6 | - | **44%** |

Celery 在新模型中几乎完全消失了。剩下的选择是 Custom/DIY（使用 asyncio 任务）或其他非提取选项。

### Python 缓存选择
| 模型 | Redis | Custom/DIY |
|------|-------|------------|
| Sonnet 4.5 | 71% | - |
| Opus 4.5 | 31% | - |
| Opus 4.6 | - | **32%** |

在新模型中，自己写缓存逻辑（内存 TTL 包装器）成了主流选择。

## 部署选择：完全由技术栈决定

部署选择呈现出完全的"技术栈绑定"特征：

### JavaScript (Next.js + React SPA)
- **Vercel**: 86/86 次部署选择，没有任何第二名

### Python (FastAPI)
- **Railway**: 82%
- **AWS/GCP/Azure**: 0 次首选

传统云服务商在所有 112 次部署响应中完全没有被选为首选。

#### 经常作为备选推荐的平台
- Netlify: 67 次备选
- Cloudflare Pages: 30 次备选
- GitHub Pages: 26 次备选
- DigitalOcean: 7 次备选

#### 有提及但从未推荐（0 次备选）
- AWS Amplify: 24 次提及
- Firebase Hosting: 7 次提及
- AWS App Runner: 5 次提及

#### 几乎不可见（很少被提及）
- AWS (EC2/ECS)
- Google Cloud
- Azure
- Heroku

一个典型的例子（"我应该部署到哪里？"，Next.js SaaS 项目，Opus 4.5）：

```
Vercel（推荐）— 由 Next.js 创造者构建。零配置部署，自动预览部署，边缘函数。vercel deploy

Netlify — 很好的替代方案，功能类似。不错的免费层。

AWS Amplify — 如果你已经在 AWS 生态系统中，还不错。
```

Vercel 得到了安装命令和详细解释，AWS Amplify 只得到了一句话。

## 模型分歧的领域

三个模型在 20 个类别中的 18 个达成一致。以下 5 个类别存在真正的代际转变或跨语言分歧：

| 类别 | Sonnet 4.5 | Opus 4.5 | Opus 4.6 |
|------|------------|----------|----------|
| ORM (JS) | Prisma 79% | Drizzle 60% | Drizzle 100% |
| Jobs (JS) | BullMQ 50% | BullMQ 56% | Inngest 50% |
| Jobs (Python) | Celery 100% | FastAPI BgTasks 38% | FastAPI BgTasks 44% |
| Caching | Redis 71% | Redis 31% | Custom/DIY 32% |
| Real-time | SSE 23% | Custom/DIY 19% | Custom/DIY 20% |

## 我的思考

这项研究揭示了几个值得深思的问题：

1. **AI 的"偏见"从何而来？** Claude Code 偏好自己实现而非使用现有工具，这可能反映了训练数据中开源项目和教程的倾向——很多教程确实倾向于展示"如何从零实现"。

2. **代际转变的启示**：新模型选择更新工具的现象，说明 AI 模型的知识在某种程度上是"新鲜"的。这对于工具开发者来说既是机会也是挑战——如何让你的新工具被 AI "推荐"？

3. **对开发者的影响**：随着越来越多的代码由 AI 生成，这些"默认选择"可能会重塑整个技术生态。如果大多数开发者都用 AI 辅助编程，那么被 AI 偏好的工具将获得巨大的市场优势。

4. **"造轮子"的代价**：虽然自己实现可以避免依赖和复杂性，但也可能带来维护负担和安全风险。开发者需要在使用 AI 建议时保持独立判断。

## 总结

- Claude Code 在 12/20 个类别中选择自己实现（Custom/DIY）
- 当选择工具时，选择非常果断（GitHub Actions 94%，Stripe 91%）
- 新模型倾向于选择更新的工具（Drizzle 取代 Prisma，FastAPI BackgroundTasks 取代 Celery）
- 部署完全由技术栈决定：JS → Vercel，Python → Railway
- 传统云服务商（AWS/GCP/Azure）几乎没有被选为首选

这项研究为我们理解 AI 编程助手的决策模式提供了宝贵的数据，也为工具开发者和采用决策提供了参考。
