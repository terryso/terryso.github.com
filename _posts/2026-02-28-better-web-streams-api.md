---
layout: post
title: "JavaScript 值得拥有更好的 Streams API"
date: 2026-02-28 00:42:48 +0800
categories: tech-translation
description: "Cloudflare 工程师 James M Snell 深入分析 Web Streams API 的设计缺陷，并提出了一个基于异步迭代器的替代方案，性能提升可达 2-120 倍。"
original_url: https://blog.cloudflare.com/a-better-web-streams-api/
source: Hacker News
---

本文翻译自 [We deserve a better streams API for JavaScript](https://blog.cloudflare.com/a-better-web-streams-api/)，原载于 Hacker News。

## 引言

流式数据处理是现代应用开发的基础。为了在各种环境中实现流式传输，WHATWG Streams Standard（俗称 "Web streams"）被设计为跨浏览器和服务器的通用 API。它已被浏览器、Cloudflare Workers、Node.js、Deno 和 Bun 采用，成为 `fetch()` 等 API 的基础。

但 Cloudflare 工程师 James M Snell 在多年实践后发现，这个标准 API 存在根本性的可用性和性能问题——不是 bug，而是十年前设计决策的结果。这些问题与当今 JavaScript 开发者的编码方式已不再匹配。

本文将深入探讨 Web streams 的问题，并介绍一个基于 JavaScript 语言原语的替代方案。在基准测试中，这个替代方案在所有测试的运行时（包括 Cloudflare Workers、Node.js、Deno、Bun 和所有主流浏览器）上比 Web streams **快 2 到 120 倍**。

## 历史背景

Streams Standard 在 2014-2016 年间开发，目标是提供"用于创建、组合和消费数据流的 API，能够高效映射到低级 I/O 原语"。在 Web streams 出现之前，Web 平台没有标准的流式数据处理方式。

Web streams 的设计早于 JavaScript 的异步迭代。`for await...of` 语法直到 ES2018 才落地——比 Streams Standard 初步定稿晚了两年。这意味着 API 最初无法利用最终成为 JavaScript 中消费异步序列的惯用方式。相反，规范引入了自己的 reader/writer 获取模型，这个决策影响了 API 的方方面面。

## 问题一：过度繁琐的常见操作

使用 Web streams 读取流的最常见任务：

```javascript
// 首先，获取一个 reader，它会独占锁定流
const reader = stream.getReader();
const chunks = [];
try {
  // 然后，反复调用 read 并 await 返回的 promise
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
} finally {
  // 最后，释放流上的锁
  reader.releaseLock();
}
```

这种模式并非流式处理的固有要求。reader 获取、锁管理和 `{ value, done }` 协议都只是设计选择，而非必要条件。异步迭代正是为了处理随时间到达的序列而存在的——但异步迭代在流规范编写时还不存在。

现在 Web streams 支持了 `for await...of`：

```javascript
const chunks = [];
for await (const chunk of stream) {
  chunks.push(chunk);
}
```

这确实减少了样板代码，但没有解决所有问题。异步迭代是被追加到一个非为此设计的 API 上的，BYOB（bring your own buffer）读取等功能无法通过迭代访问。当出问题或需要 API 的额外功能时，开发者又回到了原始 API 的泥潭中。

## 问题二：锁定问题

Web streams 使用锁定模型来防止多个消费者交错读取。调用 `getReader()` 时，流被锁定。锁定期间，其他任何代码都不能直接从流读取、管道传输甚至取消它——只有实际持有 reader 的代码才能操作。

这听起来合理，但很容易出错：

```javascript
async function peekFirstChunk(stream) {
  const reader = stream.getReader();
  const { value } = await reader.read();
  // 糟糕 —— 忘记调用 reader.releaseLock()
  // 而且 reader 在返回时不再可用
  return value;
}
const first = await peekFirstChunk(stream);
// TypeError: 无法获取锁 —— 流被永久锁定
for await (const chunk of stream) { /* 永远不会执行 */ }
```

忘记调用 `releaseLock()` 会永久破坏流。`locked` 属性告诉你流被锁定了，但不会告诉你原因、被谁锁定，或者锁是否仍然可用。

## 问题三：BYOB——高复杂性，低收益

BYOB（自带缓冲区）读取旨在让开发者在读取流时重用内存缓冲区，是高吞吐量场景的重要优化。想法是合理的：不为每个 chunk 分配新缓冲区，而是提供自己的缓冲区让流填充它。

实际上，BYOB 很少带来可衡量的收益。API 比默认读取复杂得多，需要单独的 reader 类型（`ReadableStreamBYOBReader`）和专门的类（如 `ReadableStreamBYOBRequest`），还需要仔细管理缓冲区生命周期并理解 ArrayBuffer 分离语义。

```javascript
const reader = stream.getReader({ mode: 'byob' });
const buffer = new ArrayBuffer(1024);
let view = new Uint8Array(buffer);
const result = await reader.read(view);
// 'view' 现在应该被分离且不可用
// result.value 是一个新的视图，可能在不同的内存上
view = result.value; // 必须重新赋值
```

BYOB 也不能与异步迭代或 TransformStream 一起使用，所以想要零拷贝读取的开发者被迫回到手动 reader 循环。

## 问题四：背压——理论美好，实践破碎

背压——让慢消费者向快生产者发出减速信号的能力——是 Web streams 中的一等概念。理论上是这样。实际上，这个模型有严重缺陷。

主要信号是 controller 上的 `desiredSize`。它可以是正数（需要数据）、零（已达容量）、负数（超容量）或 null（已关闭）。生产者应该检查这个值，当它不是正数时停止入队。但没有任何东西强制执行这一点：`controller.enqueue()` 总是成功，即使 `desiredSize` 深度为负。

```javascript
new ReadableStream({
  start(controller) {
    // 没有任何东西阻止你这样做
    while (true) {
      controller.enqueue(generateData()); // desiredSize: -999999
    }
  }
});
```

`tee()` 创建两个分支时，如果一个分支读取比另一个快，数据会在内部缓冲区无限累积。快速消费者可能导致无界内存增长，而慢消费者在追赶——没有办法配置或退出这种情况。

## 问题五：Promise 的隐藏成本

Web streams 规范要求在许多地方创建 promise，通常在热路径上，且对用户不可见。每次 `read()` 调用不仅返回一个 promise；内部实现还会为队列管理、`pull()` 协调和背压信号创建额外的 promise。

这种开销在管道中会叠加。每个 TransformStream 在源和接收器之间添加另一层 promise 机制。规范没有定义同步快速路径，所以即使数据立即可用，promise 机制仍然运行。

Vercel 的 Malte Ubl 在他们的研究中发现：

> "考虑 `pipeTo()`。每个 chunk 经过完整的 Promise 链：读取、写入、检查背压、重复。每次读取分配一个 `{value, done}` 结果对象。错误传播创建额外的 Promise 分支...我们基准测试显示 Web stream 原生 `pipeThrough` 在 1KB chunk 时约 630 MB/s。Node.js `pipeline()` 同样的透传转换：~7,900 MB/s。这是 12 倍的差距，差异几乎完全是 Promise 和对象分配开销。"

## 一个更好的方案

James M Snell 提出了一个基于不同原则的替代 API：

### 设计原则

1. **流就是可迭代对象** —— 没有自定义的 `ReadableStream` 类，可读流就是 `AsyncIterable<Uint8Array[]>`。用 `for await...of` 消费，没有 reader 要获取，没有锁要管理。

2. **拉取式转换** —— 转换在消费者拉取之前不会执行。没有急切求值，没有隐藏缓冲。数据按需从源流经转换到消费者。

3. **显式背压** —— 背压默认严格。缓冲区满时，写入会被拒绝而非静默累积。可以配置替代策略，但必须明确选择。

4. **批量 chunk** —— 流产生 `Uint8Array[]` 而非单个 chunk，将异步开销分摊到多个 chunk。

5. **仅处理字节** —— API 只处理 `Uint8Array`。字符串自动 UTF-8 编码。没有"值流"与"字节流"的二分法。

### 代码对比

Web streams 版本：

```javascript
const { readable, writable } = new TransformStream();
const enc = new TextEncoder();
const writer = writable.getWriter();
await writer.write(enc.encode("Hello, World!"));
await writer.close();
writer.releaseLock();
const dec = new TextDecoder();
let text = '';
for await (const chunk of readable) {
  text += dec.decode(chunk, { stream: true });
}
text += dec.decode();
```

新 API 版本：

```javascript
import { Stream } from 'new-streams';

// 创建推送流
const { writer, readable } = Stream.push();

// 写入数据 —— 背压被强制执行
await writer.write("Hello, World!");
await writer.end();

// 作为文本消费
const text = await Stream.text(readable);
```

### 拉取式转换

```javascript
// 在迭代开始之前不执行任何操作
const output = Stream.pull(source, compress, encrypt);

// 转换在我们迭代时执行
for await (const chunks of output) {
  for (const chunk of chunks) {
    process(chunk);
  }
}
```

### 显式背压策略

```javascript
const { writer, readable } = Stream.push({
  highWaterMark: 10,
  backpressure: 'strict' // 或 'block', 'drop-oldest', 'drop-newest'
});
```

四种策略：

- **strict**（默认）：缓冲区满时拒绝写入，捕获"发射后不管"模式
- **block**：写入等待直到有缓冲区空间可用
- **drop-oldest**：丢弃最旧的缓冲数据腾出空间
- **drop-newest**：满时丢弃传入数据

### 同步/异步分离

新 API 有完整的同步版本：`Stream.pullSync()`、`Stream.bytesSync()`、`Stream.textSync()` 等。如果源和转换都是同步的，可以在没有单个 promise 的情况下处理整个管道：

```javascript
// 同步源来自内存数据
const source = Stream.fromSync([inputBuffer]);

// 同步转换
const compressed = Stream.pullSync(source, zlibCompressSync);
const encrypted = Stream.pullSync(compressed, aesEncryptSync);

// 同步消费 —— 无 promise，无事件循环
const result = Stream.bytesSync(encrypted);
```

## 性能基准

在新 API 参考实现与 Web streams 之间的基准测试结果（Node.js v24.x，Apple M1 Pro）：

| 场景 | 替代方案 | Web streams | 差异 |
|------|----------|-------------|------|
| 小 chunk (1KB × 5000) | ~13 GB/s | ~4 GB/s | ~3× |
| 微小 chunk (100B × 10000) | ~4 GB/s | ~450 MB/s | ~8× |
| 异步迭代 (8KB × 1000) | ~530 GB/s | ~35 GB/s | ~15× |
| 链式 3× 转换 (8KB × 500) | ~275 GB/s | ~3 GB/s | ~80–90× |
| 高频 (64B × 20000) | ~7.5 GB/s | ~280 MB/s | ~25× |

链式转换的结果特别引人注目：拉取语义消除了困扰 Web streams 管道的中间缓冲。数据按需从消费者流向源，而不是每个 TransformStream 急切地填充其内部缓冲区。

浏览器基准（Chrome/Blink）也显示一致提升：

| 场景 | 替代方案 | Web streams | 差异 |
|------|----------|-------------|------|
| Push 3KB chunk | ~135k ops/s | ~24k ops/s | ~5–6× |
| 3 转换链 | ~4.6k ops/s | ~880 ops/s | ~5× |
| 异步迭代 | ~1.1M ops/s | ~10k ops/s | ~40–100× |

值得注意的是，这些基准比较的是新 API 的纯 TypeScript/JavaScript 实现与各运行时中原生（JavaScript/C++/Rust）Web streams 实现。新 API 的参考实现没有进行任何性能优化工作；收益完全来自设计。

## 如何解决实际问题

1. **未消费的 body**：拉取语义意味着在迭代之前什么都不会发生。没有隐藏的资源占用。

2. **tee() 内存悬崖**：`Stream.share()` 需要显式缓冲区配置。预先选择 `highWaterMark` 和背压策略。

3. **转换背压缺口**：拉取式转换按需执行。数据不会通过中间缓冲区级联；只有在消费者拉取时才流动。

4. **SSR 中的 GC 抖动**：批量 chunk 分摊异步开销。通过 `Stream.pullSync()` 的同步管道完全消除 CPU 密集型工作负载的 promise 分配。

## 与 Web streams 的桥接

从 ReadableStream 到新方法时，只需传入 readable：

```javascript
const readable = getWebReadableStreamSomehow();
const input = Stream.pull(readable, transform1, transform2);
for await (const chunks of input) {
  // 处理 chunks
}
```

适配到 ReadableStream：

```javascript
async function* adapt(input) {
  for await (const chunks of input) {
    for (const chunk of chunks) {
      yield chunk;
    }
  }
}
const input = Stream.pull(source, transform1, transform2);
const readable = ReadableStream.from(adapt(input));
```

## 下一步

作者发布这个方案是为了开启对话。哪些对了？哪些遗漏了？是否有不适合这个模型的用例？迁移路径会是什么样的？

参考实现可在 [GitHub](https://github.com/jasnell/new-streams) 找到。

## 总结

Web streams 是一个雄心勃勃的项目，在没有任何其他选择时将流式处理带到了 Web 平台。设计者在 2014 年的约束下做出了合理的选择——在异步迭代之前，在多年的生产经验揭示边缘情况之前。

但我们从那以后学到了很多。JavaScript 已经演进。今天设计的流 API 可以更简单、更符合语言特性，对背压和多消费者行为等重要事项更加明确。

我们值得拥有更好的 stream API。让我们讨论它应该是什么样子。

---

**核心观点**：
- Web streams 的设计问题不是 bug，而是十年前设计决策的后果
- 异步迭代器提供了更自然的流式处理原语
- 拉取式语义 + 显式背压 + 批量 chunk = 显著性能提升
- 同步快速路径对 CPU 密集型工作负载至关重要
- 简单的 API 设计可以胜过复杂的优化
