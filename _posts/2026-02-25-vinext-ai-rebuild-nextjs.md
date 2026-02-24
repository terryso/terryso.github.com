---
layout: post
title: "用 AI 在一周内重构 Next.js：vinext 诞生记"
date: 2026-02-25 06:29:33 +0800
categories: tech-translation
description: "Cloudflare 工程师仅用一周时间和 1100 美元的 token 成本，借助 AI 从零重构了 Next.js。基于 Vite 构建的 vinext 构建速度提升 4 倍，打包体积减少 57%，一键部署到 Cloudflare Workers。"
original_url: https://blog.cloudflare.com/vinext/
source: Hacker News
---

本文翻译自 [How we rebuilt Next.js with AI in one week](https://blog.cloudflare.com/vinext/)，原载于 Hacker News。

---

上周，一名工程师和一个 AI 模型从零开始重构了最流行的前端框架。这个名为 **vinext**（发音为 "vee-next"）的项目是 Next.js 的直接替代品，基于 Vite 构建，只需一条命令就能部署到 Cloudflare Workers。在早期基准测试中，它的生产构建速度提升高达 4 倍，客户端打包体积减少高达 57%。而且已经有客户在生产环境中运行它了。

整个项目仅花费了约 1,100 美元的 token 成本。

## Next.js 的部署困境

Next.js 是最受欢迎的 React 框架，数百万开发者在使用它。它支撑着大量生产环境的 Web 应用，理由很充分——开发体验一流。

但 Next.js 在更广泛的无服务器（serverless）生态系统中存在部署问题。其工具链完全独立定制：Next.js 在 Turbopack 上投入了大量资源，但如果你想部署到 Cloudflare、Netlify 或 AWS Lambda，就必须将构建输出重新塑造成目标平台能实际运行的形式。

你可能会想："这不就是 OpenNext 要解决的问题吗？"没错。

OpenNext 确实是为解决这个问题而生的。包括 Cloudflare 在内的多家提供商投入了大量工程 effort。它能工作，但很快就会遇到限制，变成打地鼠游戏。

事实证明，在 Next.js 输出之上构建是困难且脆弱的方法。因为 OpenNext 必须逆向工程 Next.js 的构建输出，这导致版本之间出现不可预测的变化，需要大量工作来修正。

Next.js 一直在开发一流的 adapters API，我们也一直在与他们合作。但这仍是早期尝试，即使有了适配器，你仍然构建在定制的 Turbopack 工具链上。而且适配器只覆盖构建和部署。在开发期间，`next dev` 完全在 Node.js 中运行，无法插入不同的运行时。如果你的应用使用平台特定的 API，如 Durable Objects、KV 或 AI bindings，就无法在开发环境中测试这些代码，只能使用变通方案。

## vinext 登场

如果我们不是适配 Next.js 的输出，而是直接在 Vite 上重新实现 Next.js 的 API 接口会怎样？Vite 是 Next.js 之外大多数前端生态系统使用的构建工具，支撑着 Astro、SvelteKit、Nuxt 和 Remix 等框架。不是简单的包装器或适配器，而是干净的重新实现。老实说，我们没想到它会成功。但现在是 2026 年，构建软件的成本已经完全改变了。

我们比预期走得更远。

```bash
npm install vinext
```

将脚本中的 `next` 替换为 `vinext`，其他一切保持不变。你现有的 `app/`、`pages/` 和 `next.config.js` 都可以直接使用。

```bash
vinext dev          # 带 HMR 的开发服务器
vinext build        # 生产构建
vinext deploy       # 构建并部署到 Cloudflare Workers
```

这不是包装 Next.js 和 Turbopack 输出的壳。它是 API 接口的替代实现：路由、服务端渲染、React Server Components、server actions、缓存、中间件。所有这些都作为 Vite 插件构建在 Vite 之上。最重要的是，得益于 Vite Environment API，Vite 输出可以在任何平台上运行。

## 性能数据

早期基准测试很有希望。我们使用共享的 33 路由 App Router 应用，将 vinext 与 Next.js 16 进行比较。

两个框架都在做相同的工作：编译、打包和准备服务端渲染的路由。我们在 Next.js 构建中禁用了 TypeScript 类型检查和 ESLint（Vite 在构建期间不运行这些），并使用 force-dynamic，这样 Next.js 不会花额外时间预渲染静态路由（否则会不公平地拖慢其数据）。目标是只测量打包器和编译速度，不包括其他内容。基准测试在每次合并到 main 分支时在 GitHub CI 上运行。

**生产构建时间：**

| 框架 | 平均耗时 | 对比 Next.js |
| --- | --- | --- |
| Next.js 16.1.6 (Turbopack) | 7.38s | 基准 |
| vinext (Vite 7 / Rollup) | 4.64s | 1.6 倍更快 |
| vinext (Vite 8 / Rolldown) | 1.67s | 4.4 倍更快 |

**客户端打包体积（gzip 压缩）：**

| 框架 | Gzip 体积 | 对比 Next.js |
| --- | --- | --- |
| Next.js 16.1.6 | 168.9 KB | 基准 |
| vinext (Rollup) | 74.0 KB | 减少 56% |
| vinext (Rolldown) | 72.9 KB | 减少 57% |

这些基准测试测量编译和打包速度，而非生产服务性能。测试装置是单个 33 路由应用，不代表所有生产应用。我们预期这些数字会随着三个项目的持续发展而变化。完整的方法论和历史结果是公开的。请将它们视为方向性指标，而非确定性结论。

不过方向是令人鼓舞的。Vite 的架构，尤其是 Rolldown（Vite 8 中基于 Rust 的打包器），在构建性能方面具有结构性优势，在这里表现得非常明显。

## 部署到 Cloudflare Workers

vinext 以 Cloudflare Workers 作为首要部署目标构建。一条命令就能从源代码到运行中的 Worker：

```bash
vinext deploy
```

这会处理所有事情：构建应用、自动生成 Worker 配置并部署。App Router 和 Pages Router 都可以在 Workers 上运行，支持完整的客户端注水（hydration）、交互式组件、客户端导航、React 状态等。

对于生产缓存，vinext 包含一个 Cloudflare KV 缓存处理器，开箱即用支持 ISR（增量静态再生成）：

```javascript
import { KVCacheHandler } from "vinext/cloudflare";
import { setCacheHandler } from "next/cache";

setCacheHandler(new KVCacheHandler(env.MY_KV_NAMESPACE));
```

KV 对大多数应用来说是不错的默认选择，但缓存层设计为可插拔的。`setCacheHandler` 调用意味着你可以替换成任何合理的后端。对于有大型缓存负载或不同访问模式的应用，R2 可能更合适。我们也在改进 Cache API，应该能提供更强大的缓存层且配置更少。目标是灵活性：选择适合你应用的缓存策略。

当前运行的在线示例：
- App Router Playground
- Hacker News 克隆
- App Router 最小示例
- Pages Router 最小示例

我们还有一个 Cloudflare Agents 在 Next.js 应用中运行的实时示例，无需 `getPlatformProxy` 这样的变通方案，因为整个应用现在都在 workerd 中运行，包括开发和部署阶段。这意味着可以无妥协地使用 Durable Objects、AI bindings 和所有其他 Cloudflare 特定服务。

## 框架是团队运动

当前部署目标是 Cloudflare Workers，但这只是图景的一小部分。vinext 大约 95% 是纯 Vite。路由、模块 shim、SSR 管道、RSC 集成：都不是 Cloudflare 特定的。

Cloudflare 正在寻求与其他托管提供商合作，为他们的客户采用这套工具链（工作量很小——我们在不到 30 分钟内就在 Vercel 上搞定了概念验证！）。这是一个开源项目，为了长期成功，我们认为与生态系统中的合作伙伴合作以确保持续投资非常重要。来自其他平台的 PR 是受欢迎的。如果你有兴趣添加部署目标，请开 issue 或联系我们。

## 状态：实验性

我们要明确一点：vinext 是实验性的。它甚至还不满一周，尚未经过任何规模流量的实战测试。如果你考虑在生产应用中使用，请保持适当的谨慎。

话虽如此，测试套件非常全面：超过 1,700 个 Vitest 测试和 380 个 Playwright E2E 测试，包括直接从 Next.js 测试套件和 OpenNext 的 Cloudflare 一致性套件移植的测试。我们已经针对 Next.js App Router Playground 进行了验证。覆盖率达到了 Next.js 16 API 接口的 94%。

真实客户的早期结果令人鼓舞。我们一直在与 National Design Studio 合作，这是一个旨在现代化每个政府界面的团队，在他们其中一个测试网站 CIO.gov 上。他们已经在生产环境中运行 vinext，构建时间和打包体积都有显著改善。

README 对不支持和不会支持的内容以及已知限制都坦诚相告。我们希望坦诚而不是过度承诺。

## 预渲染呢？

vinext 已经开箱即用支持增量静态再生成（ISR）。对任何页面的首次请求后，它会被缓存并在后台重新验证，就像 Next.js 一样。这部分现在已经可以工作。

vinext 尚不支持构建时的静态预渲染。在 Next.js 中，没有动态数据的页面会在 `next build` 期间渲染并作为静态 HTML 提供。如果你有动态路由，可以使用 `generateStaticParams()` 枚举要预先构建的页面。vinext 还不这样做……暂时。

这是发布时的有意设计决定。这在路线图上，但如果你的网站是 100% 预构建的静态 HTML 和静态内容，你可能今天不会从 vinext 获得太多好处。话虽如此，如果一名工程师可以花费 1,100 美元的 token 重构 Next.js，你大概可以花 10 美元迁移到专门为静态内容设计的基于 Vite 的框架，比如 Astro（它也部署到 Cloudflare Workers）。

但对于非纯静态的网站，我们认为可以做一些比在构建时预渲染所有内容更好的事情。

## 引入流量感知预渲染

Next.js 在构建期间预渲染 `generateStaticParams()` 中列出的每个页面。一个有 10,000 个产品页面的网站意味着构建时 10,000 次渲染，即使其中 99% 的页面可能永远不会收到请求。构建时间随页面数量线性增长。这就是为什么大型 Next.js 网站最终会有 30 分钟的构建时间。

所以我们构建了 **流量感知预渲染（Traffic-aware Pre-Rendering，TPR）**。它目前是实验性的，我们计划在有更多实战测试后将其设为默认。

想法很简单。Cloudflare 已经是你网站的反向代理。我们有你的流量数据。我们知道哪些页面实际被访问。所以 vinext 不是预渲染所有内容或什么都不预渲染，而是在部署时查询 Cloudflare 的区域分析，只预渲染重要的页面。

```bash
vinext deploy --experimental-tpr

  Building...
  Build complete (4.2s)

  TPR (experimental): Analyzing traffic for my-store.com (last 24h)
  TPR: 12,847 unique paths — 184 pages cover 90% of traffic
  TPR: Pre-rendering 184 pages...
  TPR: Pre-rendered 184 pages in 8.3s → KV cache

  Deploying to Cloudflare Workers...
```

对于有 100,000 个产品页面的网站，幂律分布意味着 90% 的流量通常流向 50 到 200 个页面。这些页面在几秒钟内完成预渲染。其他所有内容回退到按需 SSR，并在首次请求后通过 ISR 缓存。每次新部署都会根据当前流量模式刷新集合。病毒式传播的页面会自动被选中。所有这些都无需 `generateStaticParams()`，也无需将构建与生产数据库耦合。

## 用 AI 挑战 Next.js

像这样的项目通常需要一个工程师团队数月甚至数年的时间。多家公司的多个团队都尝试过，但范围实在太大了。我们在 Cloudflare 也尝试过一次！两个路由器、33+ 个模块 shim、服务端渲染管道、RSC 流式传输、文件系统路由、中间件、缓存、静态导出。难怪没有人成功过。

这次我们在不到一周内完成了。一名工程师（技术上是工程经理）指挥 AI。

第一个 commit 在 2 月 13 日。到当天晚上结束时，Pages Router 和 App Router 都有了基本的 SSR 工作，还有中间件、server actions 和流式传输。到第二天下午，App Router Playground 已经可以渲染 11 个路由中的 10 个。到第三天，`vinext deploy` 已经可以将应用发布到 Cloudflare Workers 并支持完整的客户端注水。这一周的其余时间是加固：修复边缘情况、扩展测试套件、将 API 覆盖率提升到 94%。

与之前的尝试相比，什么改变了？AI 变得更好了。好得多。

## 为什么这个问题特别适合 AI

并非每个项目都会这样发展。这个项目之所以成功，是因为几件事恰好在正确的时间点重合。

**Next.js 规范完善。** 它有详尽的文档、庞大的用户群、多年的 Stack Overflow 问答和教程。API 接口遍布训练数据。当你让 Claude 实现 `getServerSideProps` 或解释 `useRouter` 如何工作时，它不会产生幻觉。它知道 Next 的工作方式。

**Next.js 有精细的测试套件。** Next.js 仓库包含数千个 E2E 测试，覆盖每个功能和边缘情况。我们直接从他们的套件移植测试（你可以在代码中看到归属）。这给了我们可以机械验证的规范。

**Vite 是优秀的基础。** Vite 处理前端工具的难点：快速 HMR、原生 ESM、干净的插件 API、生产打包。我们不必构建打包器。我们只需要教会它说 Next.js。`@vitejs/plugin-rsc` 还在早期，但它给了我们 React Server Components 支持，而不必从头构建 RSC 实现。

**模型跟上了。** 我们认为这在几个月前都不可能。早期模型无法在这个规模的代码库中保持连贯性。新模型可以在上下文中保持完整架构，推理模块如何交互，并经常产生足够正确的代码来保持势头。有时，我看到它深入 Next、Vite 和 React 内部来找出 bug。最先进的模型令人印象深刻，而且它们似乎在不断变好。

所有这些必须同时成立。文档良好的目标 API、全面的测试套件、底层可靠的构建工具，以及能真正处理复杂性的模型。去掉任何一个，效果都不会这么好。

## 我们实际是如何构建的

vinext 中几乎每一行代码都是 AI 写的。但更重要的是：每一行都通过你期望人类编写代码的相同质量关卡。项目有 1,700+ 个 Vitest 测试、380 个 Playwright E2E 测试、通过 tsgo 进行完整的 TypeScript 类型检查，以及通过 oxlint 进行代码检查。持续集成在每个 pull request 上运行所有这些。建立一套好的护栏对于让 AI 在代码库中高效工作是至关重要的。

过程始于一个计划。我花了几个小时在 OpenCode 中与 Claude 反复讨论来定义架构：构建什么、按什么顺序、使用哪些抽象。那个计划成为了北极星。从那里开始，工作流程很直接：

1. 定义任务（"实现 `next/navigation` shim，包括 `usePathname`、`useSearchParams`、`useRouter`"）。
2. 让 AI 编写实现和测试。
3. 运行测试套件。
4. 如果测试通过，合并。如果不通过，给 AI 错误输出，让它迭代。
5. 重复。

我们也为代码审查配置了 AI agents。当 PR 被打开时，一个 agent 审查它。当审查评论返回时，另一个 agent 处理它们。反馈循环大多是自动化的。

它并非每次都完美工作。有些 PR 就是错的。AI 会自信地实现一些看起来正确但不符合实际 Next.js 行为的东西。我必须经常纠正方向。架构决策、优先级排序、知道 AI 何时走入死胡同：那都是我。当你给 AI 好的方向、好的上下文和好的护栏时，它可以非常高效。但人类仍然必须掌舵。

对于浏览器级测试，我使用 agent-browser 来验证实际渲染输出、客户端导航和注水行为。单元测试会遗漏很多微妙的浏览器问题。这个工具能捕捉到它们。

在整个项目过程中，我们在 OpenCode 中运行了超过 800 个会话。总成本：大约 1,100 美元的 Claude API tokens。

## 这对软件意味着什么

为什么我们的技术栈有这么多层？这个项目迫使我深入思考这个问题。并考虑 AI 如何影响答案。

软件中的大多数抽象之所以存在，是因为人类需要帮助。我们无法在脑海中保持整个系统，所以我们构建层来管理复杂性。每一层让下一个人的工作更容易。这就是为什么你最终得到框架之上的框架、包装库、数千行胶水代码。

AI 没有同样的限制。它可以在上下文中保持整个系统并直接编写代码。它不需要中间框架来保持组织。它只需要一个规范和一个构建基础。

目前还不清楚哪些抽象是真正基础的，哪些只是人类认知的拐杖。这条界线在未来几年会发生很大变化。但 vinext 是一个数据点。我们拿了一个 API 契约、一个构建工具和一个 AI 模型，AI 编写了中间的所有东西。不需要中间框架。我们认为这种模式会在很多软件中重复。我们多年来构建的层不会全部留存下来。

## 致谢

感谢 Vite 团队。Vite 是这一切的基础。`@vitejs/plugin-rsc` 还在早期，但它给了我们 RSC 支持，而不必从头构建——否则会是交易破坏者。当我把插件推向它之前未被测试过的领域时，Vite 维护者们反应迅速且乐于助人。

我们也想感谢 Next.js 团队。他们花多年构建了一个框架，提高了 React 开发的标准。他们的 API 接口文档如此完善、测试套件如此全面，是使这个项目成为可能的重要原因。没有他们设定的标准，vinext 就不会存在。

## 试试看

vinext 包含一个 Agent Skill，可以为你处理迁移。它与 Claude Code、OpenCode、Cursor、Codex 和数十种其他 AI 编码工具配合使用。安装它，打开你的 Next.js 项目，告诉 AI 迁移：

```bash
npx skills add cloudflare/vinext
```

然后在任何受支持的工具中打开你的 Next.js 项目，说：

```
migrate this project to vinext
```

这个 skill 处理兼容性检查、依赖安装、配置生成和开发服务器启动。它知道 vinext 支持什么，会标记任何需要手动注意的内容。

或者如果你更喜欢手动操作：

```bash
npx vinext init    # 迁移现有 Next.js 项目
npx vinext dev     # 启动开发服务器
npx vinext deploy  # 发布到 Cloudflare Workers
```

源代码在 [github.com/cloudflare/vinext](https://github.com/cloudflare/vinext)。欢迎提交 Issues、PR 和反馈。

---

## 关键要点

1. **AI 重塑软件开发** - 一名工程师用一周时间重构了一个需要团队数月甚至数年才能完成的主流框架，这说明 AI 正在根本性改变软件构建的成本结构。

2. **Vite 架构优势明显** - 基于 Rust 的 Rolldown 打包器带来的 4 倍构建速度提升和 57% 的打包体积减少，证明了 Vite 生态系统的技术优势。

3. **流量感知预渲染是创新方向** - TPR 通过分析真实流量数据决定预渲染哪些页面，解决了传统静态站点生成面临的构建时间问题，是值得关注的工程思路。

4. **框架的可移植性很重要** - vinext 95% 是纯 Vite 代码，这让它可以更容易地移植到不同平台。设计可移植的架构对于开源项目的长期成功至关重要。

5. **质量护栏不可少** - 即使代码由 AI 生成，1,700+ 单元测试和 380+ E2E 测试的质量关卡确保了代码质量。AI 时代的开发仍然需要严格的测试保障。
