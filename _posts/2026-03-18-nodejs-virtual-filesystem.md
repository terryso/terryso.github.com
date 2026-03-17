---
layout: post
title: "为什么 Node.js 需要虚拟文件系统"
date: 2026-03-18 02:01:30 +0800
categories: tech-translation
description: "Node.js 终于有了虚拟文件系统（VFS）！本文介绍 VFS 如何解决单文件应用打包、测试隔离、多租户沙箱、AI 代码执行等痛点，以及 node:vfs 核心模块与 @platformatic/vfs 用户态实现的技术细节。"
original_url: https://blog.platformatic.dev/why-nodejs-needs-a-virtual-file-system
source: Hacker News
---

本文翻译自 [Why Node.js needs a virtual file system](https://blog.platformatic.dev/why-nodejs-needs-a-virtual-file-system)，原载于 Hacker News。

---

Node.js 从诞生之初就是为 I/O 而生的。流（Streams）、缓冲区（Buffers）、套接字（Sockets）、文件（Files）——这个运行时从一开始就被设计成能在网络和文件系统之间以最快的速度移动数据。

但是，有一个问题困扰了我很多年：**你无法虚拟化文件系统**。

你不能 `import` 或 `require()` 一个只存在于内存中的模块。你不能在不打补丁修改半个标准库的情况下把资源打包进单个可执行文件。你不能在不从头重新实现 `fs` 的情况下为租户（tenant）进行文件访问沙箱隔离。

**现在，这一切正在改变。** 我们要宣布 `@platformatic/vfs`——一个用户态的 Node.js 虚拟文件系统，以及即将登陆 Node.js 核心的 `node:vfs` 模块。

## 问题是什么？

当 Node.js 没有 VFS 时，实际开发中会遇到这些问题：

1. **将完整应用打包成单一可执行文件（SEA）。** 你需要将配置文件、模板和静态资源与代码一起发布。这通常意味着要额外附加 20-40 MB 的样板代码来处理运行时的资源访问。Node.js SEA 可以嵌入单个 blob，但你的应用代码仍然调用 `fs.readFileSync()` 期望真实路径，所以你最终要么重复文件，要么注入膨胀二进制文件的胶水代码。

2. **运行不触碰磁盘的测试。** 你需要一个隔离的、内存中的文件系统，这样测试不会留下残留文件，也不会在 CI 中发生冲突。今天，你用 `memfs` 这样的工具来模拟 fs，但这些模拟无法与 `import` 或 `require()` 集成。

3. **沙箱隔离租户的文件访问。** 在多租户平台上，你需要将每个租户限制在一个目录中，防止他们通过 `../` 逃逸。你最终会编写脆弱且容易出错的路径验证逻辑。

4. **加载运行时生成的代码。** AI 智能体、插件系统和代码生成管道会产生需要被导入的 JavaScript 代码。今天，这意味着写入临时文件并希望清理工作能够完成。

这四个场景都需要同一个原语：一个能钩入 `node:fs` 和 Node.js 模块加载的虚拟文件系统。社区已经构建了 `memfs`、`unionfs`、`mock-fs` 等近似方案，但它们都有相同的限制：它们打补丁修改 fs，但不修改模块解析器。调用 `import('./config.json')` 的代码会完全绕过它们。

## `node:vfs` 进入 Node.js 核心

我在 2025 年圣诞节期间开始实现 VFS。这个始于假期实验的项目变成了 PR #61478：一个 Node.js 的 `node:vfs` 模块，包含近 14,000 行代码，分布在 66 个文件中。

老实说：正常情况下，这种规模的 PR 需要数月的全职工作。这一个之所以能够完成，是因为我用 **Claude Code** 构建了它。我把 AI 指向那些枯燥的部分——那些让 14k 行 PR 成为可能但没人愿意手写的东西：实现每个 `fs` 方法变体（sync、callback、promises）、连接测试覆盖率、生成文档。我专注于架构、API 设计和审查每一行代码。没有 AI，这不会是一个假期副业项目。它根本不会发生。

### 它是如何工作的

```javascript
import vfs from 'node:vfs'
import fs from 'node:fs'

const myVfs = vfs.create()

myVfs.mkdirSync('/app')
myVfs.writeFileSync('/app/config.json', '{"debug": true}')
myVfs.writeFileSync('/app/module.mjs', 'export default "hello from VFS"')

myVfs.mount('/virtual')

// 标准 fs 可以工作
const config = JSON.parse(fs.readFileSync('/virtual/app/config.json', 'utf8'))

// import 可以工作，require() 也是
const mod = await import('/virtual/app/module.mjs')
console.log(mod.default) // "hello from VFS"

myVfs.unmount()
```

**这不是模拟。** 当你调用 `myVfs.mount('/virtual')` 时，VFS 会钩入实际的 fs 模块和模块解析器。进程中任何代码——无论是你的还是你的依赖项的——只要从 `/virtual` 下的路径读取，就会从 VFS 获取内容。第三方库不需要知道它的存在。`express.static('/virtual/public')` 直接就能工作。

### 架构设计

VFS 有**提供者层**和**挂载层**。

**Providers（提供者）** 是存储后端。`MemoryProvider` 是默认的：内存中、快速、进程退出时消失。`SEAProvider` 提供对嵌入在单文件应用中的资源的只读访问。`VirtualProvider` 是一个基类，你可以扩展它来实现自定义后端（数据库、网络、任何你需要的）。

**Mounting（挂载）** 是 VFS 对进程其余部分可见的方式。`myVfs.mount('/virtual')` 使 VFS 内容在该路径前缀下可访问。进程对象发出 `vfs-mount` 和 `vfs-unmount` 事件，以便你可以跟踪发生了什么：

```javascript
process.on('vfs-mount', (info) => {
  console.log(`VFS mounted at (${info.mountPoint}, overlay: ${info.overlay}, readonly: ${info.readonly})`)
})
```

还有 **overlay 模式**，用于当你想拦截特定文件而不隐藏真实文件系统时：

```javascript
const myVfs = vfs.create({ overlay: true })
myVfs.writeFileSync('/etc/config.json', '{"mocked": true}')
myVfs.mount('/')

// /etc/config.json 来自 VFS
// /etc/hostname 来自真实文件系统
```

只有 VFS 中存在的路径会被拦截。其他所有内容都访问真实文件系统。对于测试来说，这是理想的：你可以覆盖几个文件，其余的保持不变。

### 为什么 VFS 必须在 Node.js 核心中

`@platformatic/vfs` 证明了 API 是可行的，但它也证明了为什么用户态实现永远是一种妥协。以下是你尝试在 Node.js 之外构建时遇到的问题：

**模块解析被重复实现。** 用户态包包含 960+ 行模块解析逻辑：遍历 `node_modules` 树、解析 `package.json exports` 字段、尝试索引文件、解析条件导出。所有这些都已经存在于 Node.js 内部。

> *在核心中，VFS 直接钩入现有的解析器。在用户态，我们重新实现它并希望我们没有遗漏任何边缘情况。*

**私有 API。** 在 23.5 之前的 Node.js 版本中，没有公共 API 来钩住模块解析。用户态包打补丁修改 `Module._resolveFilename` 和 `Module._extensions`，两者都是没有稳定性保证的私有内部实现。Node.js 的次版本更新可能会破坏它们。

> *在核心中，VFS 是解析器的一部分，而不是它上面的补丁。*

**全局 fs 打补丁是脆弱的。** 用户态包替换 `fs.readFileSync`、`fs.statSync` 和其他核心函数。如果任何代码在 VFS 挂载之前捕获了对 `fs.readFileSync` 的引用，该引用会完全绕过 VFS。

> *在核心中，拦截发生在公共 API 表面之下，所以捕获的引用仍然有效。*

**原生模块不工作。** `dlopen()` 需要真实的文件路径。

> *用户态 VFS 无法教原生模块加载器从内存读取 `.node` 文件。核心可以。*

**模块缓存清理是不可能的。** 当你卸载 VFS 时，从中 `require()` 的模块仍然留在 `require.cache` 中。

> *用户态包无法区分 VFS 加载的模块和真实模块，所以它无法清理它们。核心可以跟踪哪些模块来自哪个 VFS 并在卸载时使它们失效。*

这些问题都不是用户态包中的 bug。它们只是运行时之外可能实现的基本限制。用户态包是一座桥梁。现在使用它，当 `node:vfs` 可用时再切换。

## `@platformatic/vfs`：今天就可以使用

我们不想等待核心 PR 被合并。当 Vercel 的 CTO Malte Ubl 看到这个 PR 时，他发推说：

> *「我看到了 @matteocollina 的 Node.js 虚拟文件系统 PR，我超级兴奋！所以我在想它是否可以移植到用户态。看起来很不错。可能会发布到 npm。」*

我们有同样的想法，Vercel 团队也是如此，他们发布了 node-vfs-polyfill。当两个团队独立将相同的 API 提取到用户态时，这是设计可靠的好迹象。

我们的版本是 `@platformatic/vfs`，它适用于 Node.js 22 及以上版本。

```bash
npm install @platformatic/vfs
```

API 与提议的 `node:vfs` 匹配：

```javascript
import { create, MemoryProvider, SqliteProvider, RealFSProvider } from '@platformatic/vfs'

const vfs = create()
vfs.writeFileSync('/index.mjs', 'export const version = "1.0.0"')
vfs.mount('/app')

const mod = await import('/app/index.mjs')
console.log(mod.version) // "1.0.0"
```

当 `node:vfs` 在核心中发布时，迁移只需一行更改：将 `'@platformatic/vfs'` 替换为 `'node:vfs'`。

用户态包还附带两个不在核心 PR 中的提供者。`SqliteProvider` 提供由 `node:sqlite` 支持的持久化 VFS。文件在进程重启后仍然存在：

```javascript
import { create, SqliteProvider } from '@platformatic/vfs'

const disk = new SqliteProvider('/tmp/myfs.db')
const vfs = create(disk)

vfs.writeFileSync('/config.json', '{"saved": true}')
disk.close()

// 稍后，在另一个进程中：
const disk2 = new SqliteProvider('/tmp/myfs.db')
const vfs2 = create(disk2)
console.log(vfs2.readFileSync('/config.json', 'utf8')) // '{"saved": true}'
```

这对缓存编译资源或跨部署保留生成的代码很有帮助。

`RealFSProvider` 是沙箱化的真实文件系统访问。它将 VFS 路径映射到真实目录并防止路径遍历：

```javascript
import { create, RealFSProvider } from '@platformatic/vfs'

const provider = new RealFSProvider('/tmp/sandbox')
const vfs = create(provider)

vfs.writeFileSync('/file.txt', 'sandboxed') // 写入到 /tmp/sandbox/file.txt
vfs.readFileSync('/../../../etc/passwd') // 抛出异常，无法逃逸沙箱
```

## 使用场景

### 单文件应用（SEA）

Node.js SEA 可以嵌入资源，但访问它们一直很棘手。有了 VFS，SEA 资源会自动挂载，可以通过标准的 `fs` 调用、`import` 和 `require()` 访问。你的应用代码不需要知道它作为 SEA 运行。

### 测试

你可以为每个测试创建一个隔离的文件系统。没有需要清理的临时目录，没有并行测试运行之间的冲突：

```javascript
import { create } from '@platformatic/vfs'
import { test } from 'node:test'

test('从虚拟文件系统读取配置', () => {
  using vfs = create()
  vfs.writeFileSync('/config.json', '{"env": "test"}')
  vfs.mount('/app')

  // 你的应用代码通过标准 fs 读取 /app/config.json
  // 没有磁盘 I/O，不需要清理
  // `using` 语句在块退出时自动卸载
})
```

### AI 智能体和代码生成

AI 智能体生成需要运行的代码。写入临时文件很慢，会产生清理问题，并增加安全风险。有了 VFS，生成的代码保留在内存中，可以用 `import` 加载：

```javascript
import { create } from '@platformatic/vfs'

const vfs = create()
vfs.writeFileSync('/handler.mjs', agentGeneratedCode)
vfs.mount('/generated')

const { default: handler } = await import('/generated/handler.mjs')
await handler(request)
```

## 接下来是什么

`node:vfs` 和 `@platformatic/vfs` 都是**实验性的**。测试覆盖率很扎实，但一个钩入模块加载和 `node:fs` 的虚拟文件系统有巨大的表面积。会有 bug。会有我们没遇到的边缘情况。会有我们没有预见的与第三方代码的交互。

如果你遇到问题，请报告。对于用户态包，在 platformatic/vfs 上开 issue。对于核心模块，在 PR 上评论或在 nodejs/node 上开 issue。每个 bug 报告都有帮助。

一旦 `node:vfs` 进入核心，我们将保持 `@platformatic/vfs` 与任何 API 更改同步，并最终弃用它以支持内置模块。

在此期间，试试看，告诉我们你构建了什么。

---

**译者总结：**

这篇文章介绍了 Node.js 虚拟文件系统（VFS）的诞生背景和实现细节，主要亮点包括：

1. **解决长期痛点**：VFS 填补了 Node.js 生态的一个重要空白，让内存中的模块可以被 `import`/`require`，这对于测试、SEA 打包、AI 代码执行等场景至关重要。

2. **核心 vs 用户态的权衡**：作者坦诚地分析了为什么 VFS 最终需要在 Node.js 核心实现，而不是仅仅依赖用户态包——模块解析、原生模块加载等都需要核心级别的支持。

3. **AI 辅助开发**：这个 14k 行的 PR 得益于 Claude Code 的帮助，展示了 AI 如何加速繁琐但必要的编码工作。

4. **实用的 API 设计**：overlay 模式、多种 Provider 后端、与现有代码的无缝兼容，都体现了深思熟虑的设计。

对于国内开发者来说，这个特性特别值得关注，因为它简化了单文件应用打包（国内工具链常用）、AI 代码执行（LLM 应用开发热点）、以及测试隔离等常见需求。

---

*node:vfs PR* 由 Matteo Collina 提交。
修复了 Daniel Lando 提出的 issue #60021。
@platformatic/vfs 现已在 npm 上可用。
