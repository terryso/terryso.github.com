---
layout: post
title: "JavaScript 膨胀的三大支柱"
date: 2026-03-22 18:39:54 +0800
categories: tech-translation
description: "深入分析 JavaScript 依赖树膨胀的三个主要根源：旧运行时支持、原子化架构以及过期未退的 Ponyfill，以及我们如何开始解决这些问题。"
original_url: https://43081j.com/2026/03/three-pillars-of-javascript-bloat
source: Hacker News
---

本文翻译自 [The Three Pillars of JavaScript Bloat](https://43081j.com/2026/03/three-pillars-of-javascript-bloat)，原载于 Hacker News。

---

在过去的几年里，我们见证了 [e18e](https://e18e.dev) 社区的显著成长，以及随之而来的性能导向贡献的增加。其中一个重要组成部分是"清理"（cleanup）倡议——社区在持续修剪那些冗余、过时或无人维护的包。

在这个过程中，最常被提及的话题之一就是"依赖膨胀"（dependency bloat）——即 npm 依赖树随时间变得越来越大，其中充斥着平台早已原生支持的冗余代码。

在这篇文章中，我想简要探讨我认为依赖树中存在的三种主要膨胀类型，分析它们存在的原因，以及我们如何开始解决这些问题。

## 1. 旧运行时支持（及安全性与跨 Realm 问题）

![is-string dependency graph](https://43081j.com/assets/images/is-string-graph.png)

上面的图在许多 npm 依赖树中非常常见——一个看似应该原生可用的小工具函数，后面跟着许多类似的小型深层依赖。

那么，为什么会存在这种情况？为什么我们需要 `is-string` 而不是直接用 `typeof` 检查？为什么需要 `hasown` 而不是 `Object.hasOwn`（或 `Object.prototype.hasOwnProperty`）？原因有三：

1. 对非常旧引擎的支持
2. 防止全局命名空间被篡改
3. 跨 Realm 值的处理

### 对非常旧引擎的支持

在这个世界上，确实有一些人需要支持 **ES3**——想想 IE6/7，或者极早期版本的 Node.js。

对于这些人来说，我们今天习以为常的很多东西根本不存在。例如，他们没有以下任何一个：

- `Array.prototype.forEach`
- `Array.prototype.reduce`
- `Object.keys`
- `Object.defineProperty`

这些都是 ES5 特性，意味着它们在 ES3 引擎中根本不存在。

对于那些仍然运行旧引擎的不幸者，他们需要自己重新实现一切，或者依赖 polyfill。

当然，更好的选择是——升级。

### 防止全局命名空间被篡改

这些包存在的第二个原因是"安全性"。

基本上，在 Node.js 内部有一个"primordials"的概念。这些本质上是在启动时包装的全局对象，Node 从那时起导入它们，以避免 Node 本身被某人篡改全局命名空间而破坏。

例如，如果 Node 本身使用 `Map`，而我们重新定义了 `Map` 是什么——我们就能破坏 Node。为了避免这种情况，Node 保留了对原始 `Map` 的引用，它导入这个引用而不是访问全局对象。

你可以在 [Node 仓库](https://github.com/nodejs/node/blob/7547e795ef700e1808702fc2851a0dcc3395a065/doc/contributing/primordials.md)中了解更多相关内容。

这对于**引擎**来说非常有道理，因为它不应该因为脚本搞乱了全局命名空间而崩溃。

一些维护者也认为这也是构建**包**的正确方式。这就是为什么我们在上面的图中看到 `math-intrinsics` 这样的依赖——它基本上重新导出各种 `Math.*` 函数以避免被篡改。

### 跨 Realm 值

最后，我们有跨 Realm 值的问题。这些基本上是你从一个 Realm 传递到另一个 Realm 的值——例如，从网页传递到子 `<iframe>` 或反之。

在这种情况下，在 iframe 中 `new RegExp(pattern)` 创建的正则表达式，与父页面中的 `RegExp` 类**不是**同一个。这意味着 `window.RegExp !== iframeWindow.RegExp`，当然也就意味着如果值来自 iframe（另一个 Realm），`val instanceof RegExp` 将返回 `false`。

举个例子，我是 chai 的维护者，我们就遇到了这个问题。我们需要支持跨 Realm 的断言（因为测试运行器可能在 VM 或 iframe 中运行测试），所以我们不能依赖 `instanceof` 检查。因此，我们使用 `Object.prototype.toString.call(val) === '[object RegExp]'` 来检查某物是否是正则表达式，这在跨 Realm 时有效，因为它不依赖于构造函数。

在上面的图中，`is-string` 基本上在做同样的工作，以防我们从另一个 Realm 传递 `new String(val)`。

### 为什么这是个问题

所有这些对于极小的一群人来说是有意义的。如果你需要支持非常旧的引擎、跨 Realm 传递值，或者想要防止环境被篡改的保护——这些包正是你需要的。

**问题在于，我们绝大多数人根本不需要这些。**我们运行的是过去 10 年内的 Node.js 版本，或者使用自动更新的浏览器。我们不需要支持 ES5 之前的环境，我们不在 frame 之间传递值，我们会卸载那些破坏环境的包。

这些小众的兼容性层 somehow 进入了日常包的"热路径"。真正需要这些东西的一小群人应该是去寻找特殊包的人。然而，情况是反过来的——**我们所有人都在付出代价**。

## 2. 原子化架构

[有些人认为](https://sindresorhus.com/blog/small-focused-modules)包应该被拆分到几乎原子的级别，创建一组小的构建块，之后可以重新用来构建其他更高层次的东西。

这种架构意味着我们最终会得到这样的图：

![execa dependency graph](https://43081j.com/assets/images/execa-graph.png)

如你所见，最细粒度的代码片段都有自己的包。例如，在写这篇文章时，`shebang-regex` 的内容如下：

```ts
const shebangRegex = /^#!(.*)/;
export default shebangRegex;
```

通过将代码拆分到这种原子级别，理论上我们可以简单地通过连接这些点来创建更高层次的包。

一些原子包的例子，让你感受一下这种粒度：

- `arrify` - 将值转换为数组（`Array.isArray(val) ? val : [val]`）
- `slash` - 将文件系统路径中的反斜杠替换为 `/`
- `cli-boxes` - 一个包含盒子边缘的 JSON 文件
- `path-key` - 获取当前平台的 `PATH` 环境变量键（Unix 上是 `PATH`，Windows 上是 `Path`）
- `onetime` - 确保函数只被调用一次
- `is-wsl` - 检查 `process.platform` 是否为 `linux` 且 `os.release()` 包含 `microsoft`
- `is-windows` - 检查 `process.platform` 是否为 `win32`

如果我们想构建一个新的 CLI，可以拉入几个这样的包而不用担心实现。我们不需要自己写 `env['PATH'] || env['Path']`，可以直接拉一个包来处理。

### 为什么这是个问题

实际上，大多数或所有这些包并没有成为它们本该成为的可重用构建块。它们要么在更广泛的树中大量重复（各种版本），要么是只有一个其他包使用的单用途包。

#### 单用途包

让我们看看一些最细粒度的包：

- `shebang-regex` 几乎只被同一维护者的 `shebang-command` 使用
- `cli-boxes` 几乎只被同一维护者的 `boxen` 和 `ink` 使用
- `onetime` 几乎只被同一维护者的 `restore-cursor` 使用

这些每个都只有一个消费者，意味着它们相当于内联代码，但获取成本更高（npm 请求、tar 解压、带宽等）。

#### 重复

看看 [nuxt 的依赖树](https://npmgraph.js.org/?q=nuxt@4.4.2)，我们可以看到一些这样的构建块被重复：

- `is-docker`（2 个版本）
- `is-stream`（2 个版本）
- `is-wsl`（2 个版本）
- `isexe`（2 个版本）
- `npm-run-path`（2 个版本）
- `path-key`（2 个版本）
- `path-scurry`（2 个版本）

内联它们并不意味着我们不再重复代码，但确实意味着我们不需要支付版本解析、冲突、获取成本等代价。

**内联使重复几乎免费，而打包使其变得昂贵。**

#### 更大的供应链攻击面

我们拥有的包越多，供应链攻击面就越大。每个包都是维护、安全等方面的潜在故障点。

例如，去年这些包的许多维护者被入侵了。这意味着数百个小型构建块被入侵，进而意味着我们实际安装的高层次包也被入侵了。

像 `Array.isArray(val) ? val : [val]` 这样简单的逻辑可能不需要自己的包、安全审查、维护等。它可以直接内联，我们可以避免被入侵的风险。

与第一个支柱类似，这种哲学进入了"热路径"，而它可能本不应该如此。同样，我们都在付出代价却没有真正受益。

## 3. 过期未退的"Ponyfill"

![eslint-plugin-react polyfills](https://43081j.com/assets/images/eslint-plugin-react-polyfills.svg)

如果你在构建应用，可能想使用你选择的引擎尚不支持的"未来"特性。在这种情况下，**polyfill** 可以派上用场——它在特性应该在的地方提供后备实现，这样你可以像原生支持一样使用它。

例如，[temporal-polyfill](https://npmx.dev/package/temporal-polyfill) polyfill 了新的 Temporal API，这样我们可以使用 `Temporal`，无论引擎是否支持。

那么，如果你在构建库，应该怎么做？

一般来说，没有任何库应该加载 polyfill，因为这是消费者的责任，库不应该改变它周围的环境。作为替代，一些维护者选择使用所谓的 **ponyfill**（延续独角兽、闪粉和彩虹的主题）。

ponyfill 基本上是一个你导入的 polyfill，而不是一个改变环境的。

这在某种程度上可行，因为库可以通过导入一个实现来使用未来技术——如果原生存在则传递给原生实现，否则使用后备。这不会改变环境，所以库可以安全使用。

例如，fastly 提供了 [@fastly/performance-observer-polyfill](https://github.com/fastly/performance-observer-polyfill/tree/455bd5eb62c1e07af3309e4c212f73c414e2a7d8?tab=readme-ov-file#usage-as-a-ponyfill)，其中包含 `PerformanceObserver` 的 polyfill 和 ponyfill。

### 为什么这是个问题

这些 ponyfill 在当时完成了它们的工作——它们允许库作者使用未来技术而不改变环境，也不强迫消费者知道安装哪些 polyfill。

**问题在于，这些 ponyfill 赖着不走。**当它们填充的特性现在已被我们关心的所有引擎支持时，ponyfill 应该被移除。然而，这往往没有发生，ponyfill 在不再需要后仍然存在。

我们现在留下了许多依赖 ponyfill 的包，而这些特性我们所有人已经用了十年了。

例如：

- `globalthis` - `globalThis` 的 ponyfill（2019 年广泛支持，每周 4900 万次下载）
- `indexof` - `Array.prototype.indexOf` 的 ponyfill（2010 年广泛支持，每周 230 万次下载）
- `object.entries` - `Object.entries` 的 ponyfill（2017 年广泛支持，每周 3500 万次下载）

除非这些包是因为**支柱 1** 而被保留，否则它们通常只是因为没人想过要移除它们而继续被使用。

**当引擎的所有长期支持版本都有该特性时，ponyfill 应该被移除。**

## 我们能做些什么？

这种膨胀如今深深嵌入了依赖树中，要解开这一切并达到良好状态是一项相当艰巨的任务。这需要时间，也需要维护者和消费者的大量努力。

话虽如此，如果我们共同努力，我相信我们可以在这方面取得重大进展。

开始问问自己："为什么我有这个包？"和"我真的需要它吗？"。

如果你发现某些东西看起来是冗余的，向维护者提出 issue 询问是否可以移除。

如果你遇到一个直接依赖有许多这样的问题，找一个没有这些问题的替代品。一个好的起点是 [module-replacements](https://e18e.dev/docs/replacements/) 项目。

### 使用 Knip 移除未使用的依赖

[Knip](https://knip.dev) 是一个很棒的项目，可以帮助你找到并移除未使用的依赖、死代码等等。在这种情况下，它可以是一个很好的工具，帮助你在做更复杂的工作之前找到并移除不再使用的依赖。

你可以在它们的[文档](https://knip.dev/typescript/unused-dependencies)中了解更多关于 Knip 如何处理未使用依赖的信息。

### 使用 e18e CLI 检测可替换的依赖

[e18e CLI](https://github.com/e18e/cli) 有一个超级有用的 `analyze` 模式，可以确定哪些依赖不再需要，或者有社区推荐的替代品。

例如，如果你得到这样的结果：

```sh
$ npx @e18e/cli analyze

...

│  Warnings:
│    • Module "chalk" can be replaced with native functionality. You can read more at
│      https://nodejs.org/docs/latest/api/util.html#utilstyletextformat-text-options. See more at
│      https://github.com/es-tooling/module-replacements/blob/main/docs/modules/chalk.md.

...
```

使用这个，我们可以快速识别哪些直接依赖可以被清理。我们还可以使用 `migrate` 命令自动迁移一些依赖：

```sh
$ npx @e18e/cli migrate --all

e18e (cli v0.0.1)

┌  Migrating packages...
│
│  Targets: chalk
│
◆  /code/main.js (1 migrated)
│
└  Migration complete - 1 files migrated.
```

在这个例子中，它会从 `chalk` 迁移到 `picocolors`——一个提供相同功能的更小包。

未来，这个 CLI 甚至会根据你的环境进行推荐——例如，如果你运行足够新的 Node 版本，它可能会建议原生的 [`styleText`](https://nodejs.org/docs/latest-v22.x/api/util.html#utilstyletextformat-text-options) 而不是颜色库。

### 使用 npmgraph 调查你的依赖树

[npmgraph](https://npmgraph.js.org) 是一个可视化依赖树并调查膨胀来源的好工具。

例如，让我们看看写这篇文章时 [ESLint 依赖图](https://npmgraph.js.org/?q=eslint@10.1.0)的下半部分：

![eslint dependency graph](https://43081j.com/assets/images/eslint-graph.png)

我们可以在这个图中看到 `find-up` 分支是孤立的，没有其他东西使用它的深层依赖。对于像向上遍历文件系统这样简单的事情，也许我们不需要 6 个包。我们可以寻找替代品，比如 [empathic](https://npmx.dev/package/empathic)，它有更小的[依赖图](https://npmgraph.js.org/?q=empathic@2.0.0)并实现相同的功能。

### 模块替换

[module-replacements](https://github.com/es-tooling/module-replacements) 项目被用作社区的中央数据集，记录哪些包可以用原生功能或更高性能的替代品替换。

如果你需要一个替代品或只是想检查你的依赖，这个数据集非常棒。

同样，如果你在依赖树中遇到已被原生功能淘汰的包，或者只是有更好的经过实战检验的替代品，这个项目绝对是一个贡献的好地方，这样其他人也可以受益。

与数据配套的还有一个 [codemods 项目](https://github.com/es-tooling/module-replacements-codemods)，提供 codemods 来自动将一些包迁移到它们建议的替代品。

## 结语

我们所有人都在为极小的一群人付出代价——他们有着他们喜欢的异常架构，或者他们需要的向后兼容级别。

这不一定是最初创建这些包的人的错，因为每个人都应该以自己想要的方式构建。他们中许多人是老一代有影响力的 JavaScript 开发者——在一个更黑暗的时代构建包，那时我们今天拥有的许多好的 API 和跨兼容性根本不存在。他们以那种方式构建是因为那可能是当时最好的方式。

**问题在于我们从未从中走出来。**即使我们已经拥有这些功能好几年了，我们今天仍然在下载所有这些膨胀。

我认为我们可以通过逆转情况来解决这个问题。这个小群体应该付出代价——他们应该有自己特殊的堆栈，几乎只有他们使用。其他人则获得现代、轻量级和广泛支持的代码。

希望 [e18e](https://e18e.dev) 和 [npmx](https://npmx.dev) 这样的事物可以通过文档、工具等帮助实现这一点。你也可以通过仔细查看你的依赖并问"为什么？"来帮助。向你的依赖提出 issue，询问它们是否以及为什么仍然需要这些包。

**我们可以解决这个问题。**

---

## 核心要点

1. **旧运行时兼容性的代价**：为极少数需要支持 ES3 或跨 Realm 场景的用户，我们所有人都在依赖树中承担了额外的包
2. **原子化架构的陷阱**：将代码拆分成过多微小包不仅没有带来预期的复用，反而增加了获取成本和供应链风险
3. **Ponyfill 应及时清理**：当特性已成为所有 LTS 版本的标准支持时，相应的 ponyfill 应该被移除
4. **行动建议**：使用 knip 清理未使用依赖，用 e18e CLI 分析可替换的包，通过 npmgraph 可视化依赖树

> 这篇文章让我深刻反思了自己项目中的依赖选择。作为开发者，我们往往只关注"能用就行"，却忽略了依赖膨胀带来的长期成本。e18e 社区的工作值得更多关注和支持。
