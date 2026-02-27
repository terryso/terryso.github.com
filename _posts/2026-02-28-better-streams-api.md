---
layout: post
title: "JavaScript 值得拥有更好的 Streams API"
date: 2026-02-28 02:51:14 +0800
categories: tech-translation
description: "Web Streams API 已成为 JavaScript 运行时的标准，但它的设计属于另一个时代。本文探讨其根本问题并提出基于现代语言特性的替代方案，性能提升可达 2-120 倍。"
original_url: https://blog.cloudflare.com/a-better-web-streams-api/
source: Hacker News
---

本文翻译自 [We deserve a better streams API for JavaScript](https://blog.cloudflare.com/a-better-web-streams-api/)，原载于 Hacker News。

---

流式数据处理是构建应用程序的基础。为了让流处理在任何地方都能工作，WHATWG Streams Standard（非正式称为 "Web streams"）被设计为跨浏览器和服务器的通用 API。它已在浏览器中发布，被 Cloudflare Workers、Node.js、Deno 和 Bun 采用，并成为 `fetch()` 等 API 的基础。这是一个重要的工程成果，设计它的人们在当时面临的约束和工具条件下解决了难题。

但在多年的 Web streams 实践中——在 Node.js 和 Cloudflare Workers 中实现它、为客户和运行时调试生产问题、帮助开发者解决太多常见的陷阱——我开始相信标准 API 存在根本性的可用性和性能问题，仅靠渐进式改进无法轻易解决。这些问题不是 bug；它们是设计决策的后果，这些决策在十年前可能合理，但已不再符合当今 JavaScript 开发者的编码方式。

这篇文章探讨 Web streams 的一些根本问题，并提出一种基于 JavaScript 语言原语的替代方案，证明更好的东西是可能的。在基准测试中，这种替代方案在我测试的每个运行时（包括 Cloudflare Workers、Node.js、Deno、Bun 和所有主流浏览器）中都可以比 Web streams 快 **2 倍到 120 倍**。

## 历史背景

Streams Standard 在 2014 年至 2016 年间开发，目标宏大：提供"用于创建、组合和消费数据流的 API，这些 API 能高效映射到低级 I/O 原语"。在 Web streams 之前，Web 平台没有处理流数据的标准方式。

Node.js 当时已有自己的流 API 并被移植到浏览器，但 WHATWG 选择不以此为基础，因为其章程只考虑 Web 浏览器的需求。服务端运行时后来才采用 Web streams，在 Cloudflare Workers 和 Deno 各自出现并优先支持 Web streams 后，跨运行时兼容性才成为优先事项。

Web streams 的设计早于 JavaScript 中的异步迭代。`for await...of` 语法直到 ES2018 才落地，比 Streams Standard 初步定稿晚了两年。这个时间点意味着 API 最初无法利用最终成为 JavaScript 中消费异步序列的惯用方式。相反，规范引入了自己的 reader/writer 获取模型，这个决定影响了 API 的方方面面。

## 过度繁琐的常见操作

流最常见的任务是将它读取完毕。使用 Web streams 是这样的：

```javascript
// 首先，我们获取一个 reader，它会独占锁定流...
const reader = stream.getReader();
const chunks = [];
try {
  // 其次，我们反复调用 read 并 await 返回的 promise
  // 要么产生一个数据块，要么指示完成
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
} finally {
  // 最后，我们释放流的锁
  reader.releaseLock();
}
```

你可能认为这种模式是流处理固有的。其实不是。reader 获取、锁管理和 `{ value, done }` 协议都只是设计选择，不是必需品。它们是 Web streams 规范编写方式和时间的产物。异步迭代恰恰是为了处理随时间到达的序列而存在的，但规范编写时异步迭代还不存在。这里的复杂性纯粹是 API 开销，不是基本必要。

现在 Web streams 确实支持 `for await...of` 了，考虑替代方案：

```javascript
const chunks = [];
for await (const chunk of stream) {
  chunks.push(chunk);
}
```

这更好，样板代码少多了，但不能解决所有问题。异步迭代是在一个不是为它设计的 API 上后加的，这一点很明显。BYOB（bring your own buffer）读取无法通过迭代访问。reader、lock 和 controller 的底层复杂性仍然存在，只是被隐藏了。当确实出问题时，或者需要 API 的额外功能时，开发者发现自己又回到了原始 API 的泥潭中，试图理解为什么他们的流被"锁定"，或者为什么 `releaseLock()` 没有按预期工作。

## 锁定问题

Web streams 使用锁定模型来防止多个消费者交错读取。当你调用 `getReader()` 时，流变成锁定状态。锁定时，没有其他东西可以直接从流中读取、管道它，甚至取消它——只有实际持有 reader 的代码才能这样做。

这听起来合理，直到你看到它有多容易出错：

```javascript
async function peekFirstChunk(stream) {
  const reader = stream.getReader();
  const { value } = await reader.read();
  // 哎呀 —— 忘了调用 reader.releaseLock()
  // 而且 reader 在我们返回时不再可用
  return value;
}

const first = await peekFirstChunk(stream);
// TypeError: Cannot obtain lock — stream is permanently locked
for await (const chunk of stream) { /* 永远不会运行 */ }
```

忘记 `releaseLock()` 会永久破坏流。`locked` 属性告诉你流被锁定了，但不告诉你为什么、被谁、或者锁是否仍然可用。管道操作内部会获取锁，以不明显的方式使流在管道操作期间不可用。

锁释放与待处理读取的语义多年来也不清楚。如果你调用了 `read()` 但没有 await 它，然后调用 `releaseLock()`，会发生什么？规范最近被澄清为在锁释放时取消待处理的读取——但实现各不相同，依赖先前未指定行为的代码可能会出错。

## BYOB：复杂性没有回报

BYOB（bring your own buffer）读取被设计为让开发者在从流读取时重用内存缓冲区，这是为高吞吐量场景设计的重要优化。想法是合理的：不是为每个块分配新缓冲区，而是提供自己的缓冲区让流填充它。

在实践中，BYOB 很少带来可衡量的好处。API 比默认读取复杂得多，需要单独的 reader 类型（`ReadableStreamBYOBReader`）和其他专门类（如 `ReadableStreamBYOBRequest`）、仔细的缓冲区生命周期管理，以及对 `ArrayBuffer` 分离语义的理解。当你把缓冲区传递给 BYOB 读取时，缓冲区被分离——转移到流——你得到的是可能不同内存上的不同视图。这种基于 transfer 的模型容易出错且令人困惑：

```javascript
const reader = stream.getReader({ mode: 'byob' });
const buffer = new ArrayBuffer(1024);
let view = new Uint8Array(buffer);

const result = await reader.read(view);
// 'view' 现在应该被分离且不可用
// （并非在每个实现中都如此）
// result.value 是一个新视图，可能在不同的内存上
view = result.value; // 必须重新赋值
```

BYOB 也不能与异步迭代或 TransformStream 一起使用，所以想要零拷贝读取的开发者被迫回到手动 reader 循环。

## 背压：理论上很好，实践中糟糕

背压——慢消费者向快生产者发出减速信号的能力——是 Web streams 中的一等概念。理论上。实践中，这个模型有一些严重的缺陷。

主要信号是 controller 上的 `desiredSize`。它可以是正数（想要数据）、零（已满）、负数（超载）或 null（已关闭）。生产者应该检查这个值，当它不是正数时停止入队。但没有什么强制这一点：即使 desiredSize 深度为负，`controller.enqueue()` 也总是成功。

```javascript
new ReadableStream({
  start(controller) {
    // 没有什么阻止你这样做
    while (true) {
      controller.enqueue(generateData()); // desiredSize: -999999
    }
  }
});
```

流实现可以也确实忽略背压；一些规范定义的功能明确破坏背压。例如 `tee()` 从单个流创建两个分支。如果一个分支比另一个读取得快，数据在内部缓冲区中无限制积累。快速消费者可能导致无界内存增长，而慢消费者追赶，没有办法配置这个或选择退出，只能取消较慢的分支。

## Promise 的隐藏成本

Web streams 规范要求在许多地方创建 promise，通常在热路径中，而且通常对用户不可见。每次 `read()` 调用不只是返回一个 promise；在内部，实现为队列管理、`pull()` 协调和背压信号创建额外的 promise。

这种开销是规范依赖 promise 进行缓冲区管理、完成和背压信号的结果。虽然有些是特定于实现的，但如果你按照规范编写，其中大部分是不可避免的。对于高频流——视频帧、网络数据包、实时数据——这种开销是显著的。

问题在管道中复合。每个 `TransformStream` 在源和汇之间添加另一层 promise 机制。规范没有定义同步快速路径，所以即使数据立即可用，promise 机制仍然运行。

Vercel 的 Malte Ubl 最近发表了一篇博客文章，描述了 Vercel 在改进 Node.js Web streams 实现性能方面的研究工作。在那篇文章中，他们讨论了每个 Web streams 实现都面临的相同根本性能优化问题：

> "考虑 `pipeTo()`。每个块通过完整的 Promise 链：读取、写入、检查背压、重复。每次读取分配一个 `{value, done}` 结果对象。错误传播创建额外的 Promise 分支。
>
> 这些都不是错误的。这些保证在浏览器中很重要，流在其中跨越安全边界，取消语义需要无懈可击，你不控制管道的两端。但在服务器上，当你以 1KB 块通过三个转换管道传输 React Server Components 时，成本会累积。
>
> 我们基准测试显示，对于 1KB 块，原生 WebStream pipeThrough 为 630 MB/s。使用相同透传转换的 Node.js pipeline()：约 7,900 MB/s。这是 12 倍的差距，差异几乎完全是 Promise 和对象分配开销。"

## 现实世界的失败

### 未消费的 body 耗尽资源

当 `fetch()` 返回响应时，body 是一个 `ReadableStream`。如果你只检查状态而不消费或取消 body，会发生什么？答案因实现而异，但常见的结果是资源泄漏。

```javascript
async function checkEndpoint(url) {
  const response = await fetch(url);
  return response.ok; // Body 从未被消费或取消
}

// 在循环中，这可能耗尽连接池
for (const url of urls) {
  await checkEndpoint(url);
}
```

这种模式在使用 undici（Node.js 内置的 `fetch()` 实现）的 Node.js 应用程序中导致了连接池耗尽，类似的问题也出现在其他运行时中。流持有对底层连接的引用，没有显式消费或取消，连接可能会一直保留直到垃圾回收——在负载下可能不会足够快地发生。

### 从 tee() 的内存悬崖跌落

`tee()` 将流分成两个分支。看起来很简单，但实现需要缓冲：如果一个分支比另一个读取得快，数据必须保存在某处直到较慢的分支赶上。

```javascript
const [forHash, forStorage] = response.body.tee();

// 哈希计算很快
const hash = await computeHash(forHash);

// 存储写入很慢 —— 同时，整个流
// 可能在内存中缓冲，等待这个分支
await writeToStorage(forStorage);
```

规范没有规定 `tee()` 的缓冲区限制。公平地说，规范允许实现以任何他们认为合适的方式实现 `tee()` 和其他 API 的实际内部机制，只要满足规范的可观察规范性要求。但如果实现选择以规范描述的特定方式实现 `tee()`，那么 `tee()` 将带有内置的内存管理问题，很难解决。

### SSR 中的 GC 抖动

流式服务器端渲染（SSR）是一个特别痛苦的情况。典型的 SSR 流可能渲染数千个小型 HTML 片段，每个都通过流机制传递：

```javascript
// 每个组件入队一个小块
function renderComponent(controller) {
  controller.enqueue(encoder.encode(`<div>${content}</div>`));
}

// 数百个组件 = 数百次 enqueue 调用
// 每次都在内部触发 promise 机制
for (const component of components) {
  renderComponent(controller);  // 创建 promise，分配对象
}
```

每个片段意味着为 `read()` 调用创建的 promise、背压协调的 promise、中间缓冲区分配和 `{ value, done }` 结果对象——其中大部分几乎立即变成垃圾。

在负载下，这会产生可能严重损害吞吐量的 GC 压力。JavaScript 引擎花大量时间收集短命对象而不是做有用的工作。当 GC 暂停中断请求处理时，延迟变得不可预测。我见过 GC 占用每个请求总 CPU 时间相当大比例（高达甚至超过 50%）的 SSR 工作负载。

讽刺的是，流式 SSR 本应通过增量发送内容来提高性能。但流机制的开销可能抵消这些收益，特别是对于有许多小组件的页面。开发者有时发现缓冲整个响应实际上比通过 Web streams 流式传输更快，完全违背了初衷。

## 更好的 Streams API 是可能的

在多次跨不同运行时实现 Web streams 规范并亲眼看到痛点后，我决定是时候探索如果今天从第一性原则设计，更好的替代流 API 会是什么样子。

以下是一个概念验证：它不是完成的标准，不是生产就绪的库，甚至不一定是新东西的具体提案，而是一个讨论的起点，证明 Web streams 的问题不是流本身固有的；它们是可以以不同方式做出的特定设计选择的结果。

### 什么是流？

在深入 API 设计之前，值得问一下：什么是流？

在其核心，流只是随时间到达的数据序列。你不会一次拥有所有数据。你随着它的可用性增量处理它。

Unix 管道也许是这个想法最纯粹的表达：

```bash
cat access.log | grep "error" | sort | uniq -c
```

数据从左向右流动。每个阶段读取输入、做工作、写入输出。没有管道 reader 需要获取，没有 controller lock 需要管理。如果下游阶段慢，上游阶段也会自然减速。背压在模型中是隐式的，不是需要学习（或忽略）的单独机制。

在 JavaScript 中，"随时间到达的事物序列"的自然原语已经在语言中：异步可迭代对象。你用 `for await...of` 消费它。你通过停止迭代来停止消费。

这是新 API 试图保留的直觉：流应该感觉像迭代，因为它们就是。Web streams 的复杂性——reader、writer、controller、lock、排队策略——掩盖了这种基本的简单性。更好的 API 应该让简单情况变得简单，只在实际需要的地方增加复杂性。

### 设计原则

我围绕一组不同的原则构建了概念验证替代方案。

**流是可迭代对象。** 没有带有隐藏内部状态的自定义 `ReadableStream` 类。可读流只是一个 `AsyncIterable<Uint8Array[]>`。你用 `for await...of` 消费它。没有 reader 需要获取，没有 lock 需要管理。

**拉取式转换。** 转换直到消费者拉取才执行。没有急切求值，没有隐藏缓冲。数据按需从源、通过转换、流向消费者。如果你停止迭代，处理就停止。

**显式背压。** 背压默认是严格的。当缓冲区满时，写入被拒绝而不是静默累积。你可以配置替代策略——阻塞直到空间可用、丢弃最旧、丢弃最新——但你必须显式选择。不再有静默内存增长。

**批量块。** 流不是每次迭代产生一个块，而是产生 `Uint8Array[]`：块数组。这将异步开销分摊到多个块上，减少热路径中的 promise 创建和微任务延迟。

**仅字节。** API 只处理字节（`Uint8Array`）。字符串自动 UTF-8 编码。没有"value stream"与"byte stream"的二分法。如果你想流式传输任意 JavaScript 值，直接使用异步可迭代对象。

**同步快速路径很重要。** API 认识到同步数据源既是必要的也是常见的。应用程序不应被迫总是接受异步调度的性能成本，仅仅因为这是提供的唯一选项。同时，混合同步和异步处理可能是危险的。同步路径应该始终是一个选项，并且应该始终是显式的。

### 新 API 实战

#### 创建和消费流

在 Web streams 中，创建一个简单的生产者/消费者对需要 `TransformStream`、手动编码和仔细的锁管理：

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

即使这个相对干净的版本也需要：一个 `TransformStream`、手动 `TextEncoder` 和 `TextDecoder`，以及显式锁释放。

新 API 的等效写法：

```javascript
import { Stream } from 'new-streams';

// 创建一个推送流
const { writer, readable } = Stream.push();

// 写入数据 —— 背压被强制执行
await writer.write("Hello, World!");
await writer.end();

// 作为文本消费
const text = await Stream.text(readable);
```

readable 只是一个异步可迭代对象。你可以把它传递给任何期望异步可迭代对象的函数，包括 `Stream.text()`，它收集并解码整个流。

#### 拉取式转换

在新 API 设计下，转换在数据被消费之前不应执行任何工作。这是一个基本原则。

```javascript
// 直到迭代开始才执行任何操作
const output = Stream.pull(source, compress, encrypt);

// 转换在我们迭代时执行
for await (const chunks of output) {
  for (const chunk of chunks) {
    process(chunk);
  }
}
```

`Stream.pull()` 创建一个惰性管道。`compress` 和 `encrypt` 转换直到你开始迭代 output 才运行。每次迭代按需通过管道拉取数据。

这与 Web streams 的 `pipeThrough()` 根本不同，后者在你设置管道时就开始主动从源向转换泵送数据。拉取语义意味着你控制处理何时发生，停止迭代就停止处理。

无状态转换只是一个接收块并返回转换后块的函数：

```javascript
// 无状态转换 —— 一个纯函数
// 接收块或 null（刷新信号）
const toUpperCase = (chunks) => {
  if (chunks === null) return null; // 流结束
  return chunks.map(chunk => {
    const str = new TextDecoder().decode(chunk);
    return new TextEncoder().encode(str.toUpperCase());
  });
};

// 直接使用
const output = Stream.pull(source, toUpperCase);
```

#### 显式背压策略

当有界缓冲区填满且生产者想写入更多时，只有几件事可以做：

1. **拒绝写入**：拒绝接受更多数据
2. **等待**：阻塞直到空间可用
3. **丢弃旧数据**：驱逐已缓冲的以腾出空间
4. **丢弃新数据**：丢弃传入的

就是这样。Web streams 目前默认总是选择等待。

新 API 让你显式选择这四个之一：

```javascript
const { writer, readable } = Stream.push({
  highWaterMark: 10,
  backpressure: 'strict' // 或 'block', 'drop-oldest', 'drop-newest'
});
```

- `strict`（默认）：缓冲区满且待处理写入过多时拒绝写入。捕获忽略背压的"即发即弃"模式。
- `block`：写入等待直到缓冲区空间可用。当你信任生产者会正确 await 写入时使用。
- `drop-oldest`：丢弃最旧的缓冲数据以腾出空间。对于陈旧数据失去价值的实时源有用。
- `drop-newest`：满时丢弃传入数据。当你想处理已有的而不被淹没时有用。

不再希望生产者合作。你选择的策略决定了缓冲区填满时会发生什么。

#### 同步/异步分离

并非所有流工作负载都涉及 I/O。当你的源在内存中且转换是纯函数时，异步机制增加开销而没有好处。

新 API 有完整的并行同步版本：`Stream.pullSync()`、`Stream.bytesSync()`、`Stream.textSync()` 等。如果你的源和转换都是同步的，你可以处理整个管道而不创建单个 promise。

```javascript
// 异步 —— 当源或转换可能是异步的
const textAsync = await Stream.text(source);

// 同步 —— 当所有组件都是同步的
const textSync = Stream.textSync(source);
```

这是一个完整的同步管道——压缩、转换和消费，零异步开销：

```javascript
// 来自内存数据的同步源
const source = Stream.fromSync([inputBuffer]);

// 同步转换
const compressed = Stream.pullSync(source, zlibCompressSync);
const encrypted = Stream.pullSync(compressed, aesEncryptSync);

// 同步消费 —— 没有 promise，没有事件循环行程
const result = Stream.bytesSync(encrypted);
```

整个管道在单个调用栈中执行。不创建 promise，不发生微任务队列调度，没有来自短命异步机制的 GC 压力。

### 性能

设计选择有性能影响。以下是此可能替代方案的参考实现与 Web streams 的基准测试（Node.js v24.x，Apple M1 Pro，10 次运行平均）：

| 场景 | 替代方案 | Web streams | 差异 |
|------|----------|-------------|------|
| 小块 (1KB × 5000) | ~13 GB/s | ~4 GB/s | ~3× 更快 |
| 微小块 (100B × 10000) | ~4 GB/s | ~450 MB/s | ~8× 更快 |
| 异步迭代 (8KB × 1000) | ~530 GB/s | ~35 GB/s | ~15× 更快 |
| 链式 3× 转换 (8KB × 500) | ~275 GB/s | ~3 GB/s | **~80–90× 更快** |
| 高频 (64B × 20000) | ~7.5 GB/s | ~280 MB/s | ~25× 更快 |

链式转换结果特别引人注目：拉取式语义消除了困扰 Web streams 管道的中间缓冲。数据按需从消费者流向源，而不是每个 `TransformStream` 急切地填充其内部缓冲区。

浏览器基准测试（Chrome/Blink，3 次运行平均）也显示出一致的增益：

| 场景 | 替代方案 | Web streams | 差异 |
|------|----------|-------------|------|
| 推送 3KB 块 | ~135k ops/s | ~24k ops/s | ~5–6× 更快 |
| 推送 100KB 块 | ~24k ops/s | ~3k ops/s | ~7–8× 更快 |
| 3 转换链 | ~4.6k ops/s | ~880 ops/s | ~5× 更快 |
| bytes() 消费 | ~73k ops/s | ~11k ops/s | ~6–7× 更快 |
| 异步迭代 | ~1.1M ops/s | ~10k ops/s | **~40–100× 更快** |

这些基准测试测量的是受控场景下的吞吐量；现实世界的性能取决于你的具体用例。

值得注意的是，这些基准测试将新 API 的纯 TypeScript/JavaScript 实现与每个运行时中原生（JavaScript/C++/Rust）的 Web streams 实现进行比较。新 API 的参考实现没有经过性能优化工作；增益完全来自设计。

## 下一步

我发布这个是为了开始讨论。我做对了什么？我错过了什么？有没有不适合这个模型的用例？这种方法的迁移路径会是什么样子？目标是收集经历过 Web streams 痛苦并对更好的 API 应该是什么样有意见的开发者的反馈。

参考实现现在可用：https://github.com/jasnell/new-streams

Web streams 是一个雄心勃勃的项目，在没有其他东西存在时将流带到了 Web 平台。设计它的人们在 2014 年的约束下做出了合理的选择——在异步迭代之前，在多年生产经验揭示边缘情况之前。

但自那时以来我们学到了很多。JavaScript 已经进化。今天设计的流 API 可以更简单，更符合语言，对重要的事情（如背压和多消费者行为）更明确。

**我们值得拥有更好的 stream API。让我们讨论它应该是什么样子。**

---

## 要点总结

1. **历史包袱**：Web Streams API 设计于 2014-2016 年，早于 ES2018 的异步迭代，这导致它采用了 reader/writer 获取模型而非语言原生的方式。

2. **核心问题**：
   - 过度繁琐的样板代码
   - 易错的锁定机制
   - BYOB 复杂性高但实际收益低
   - 背压机制形同虚设
   - Promise 开销在热路径中累积

3. **替代方案的核心原则**：
   - 流即异步可迭代对象
   - 拉取式转换（消费者驱动）
   - 显式背压策略
   - 批量块处理
   - 同步快速路径

4. **性能提升**：在基准测试中，替代方案比 Web streams 快 **2-120 倍**，特别是在链式转换场景下。

5. **实践意义**：对于 SSR、实时数据处理等高频场景，API 设计的选择会直接影响性能和内存使用。

> "我们做了很多工作来改进 Node streams 的性能和一致性，但从零开始有一些独特的力量。新 streams 的方法拥抱现代运行时现实，没有遗留包袱，这为更简单、更高性能和更连贯的 streams 模型打开了大门。" — Robert Nagy, Node.js TSC 成员
