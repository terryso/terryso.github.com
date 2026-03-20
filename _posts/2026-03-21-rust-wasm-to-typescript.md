---
layout: post
title: "为什么我们把 Rust WASM 解析器重写成了 TypeScript"
date: 2026-03-21 07:05:11 +0800
categories: tech-translation
description: "OpenUI 团队发现 WASM-JS 边界开销是性能瓶颈，将 Rust WASM 解析器重写为 TypeScript 后获得了 2.2-4.6 倍的性能提升"
original_url: https://www.openui.com/blog/rust-wasm-parser
source: Hacker News
---

本文翻译自 [Rewriting our Rust WASM Parser in TypeScript](https://www.openui.com/blog/rust-wasm-parser)，原载于 Hacker News。

---

我们最初用 Rust 构建了 openui-lang 解析器，并编译成 WASM。这个思路看起来很合理：Rust 很快，WASM 能在浏览器中获得接近原生的速度，而且我们的解析器是一个相当复杂的多阶段流水线。有什么理由不用 Rust 呢？

结果发现，**我们一直在优化错误的东西**。

## 问题背景

openui-lang 解析器负责将 LLM 生成的自定义 DSL 转换为 React 组件树。它在**每个流式 chunk 上都会运行**——所以延迟非常关键。整个流水线有六个阶段：

```
autocloser → lexer → splitter → parser → resolver → mapper → ParseResult
```

- **Autocloser**：通过追加最小化的闭合括号/引号，使部分（流式中间）文本在语法上有效
- **Lexer**：单遍字符扫描器，生成类型化 token
- **Splitter**：将 token 流切分为 `id = expression` 语句
- **Parser**：递归下降表达式解析器，构建 AST
- **Resolver**：内联所有变量引用（支持提升、循环引用检测）
- **Mapper**：将内部 AST 转换为 React 渲染器消费的公共 `OutputNode` 格式

## WASM 的隐形成本

每次调用 WASM 解析器都会产生**固定开销**，无论 Rust 代码本身跑多快：

```
JS 世界                           WASM 世界
────────────────────────────────────────────────────────
wasmParse(input)
│
├─ 复制字符串: JS heap → WASM 线性内存 (分配 + memcpy)
│
│  Rust 解析 ✓ 很快
│  serde_json::to_string() ← 序列化结果
│
├─ 复制 JSON 字符串: WASM → JS heap (分配 + memcpy)
│
JSON.parse(jsonString) ← 反序列化结果
│
return ParseResult
```

**Rust 解析本身从来不是慢的地方**。开销完全在边界上：复制字符串进去、序列化结果为 JSON 字符串、复制 JSON 字符串出来，然后 V8 把它反序列化回 JS 对象。

## serde-wasm-bindgen 尝试：更慢了

我们自然想到：如果 WASM 直接返回 JS 对象，跳过 JSON 序列化步骤会怎样？我们集成了 `serde-wasm-bindgen`，它正是做这个的——把 Rust 结构体转换成 `JsValue` 直接返回。

结果是**慢了 30%**。

原因如下：JS 无法从 WASM 线性内存中直接读取 Rust 结构体的字节作为原生 JS 对象——两个运行时使用完全不同的内存布局。要从 Rust 数据构造 JS 对象，`serde-wasm-bindgen` 必须**递归地将 Rust 数据物化为真正的 JS 数组和对象**，这涉及到每次 `parse()` 调用时大量细粒度的跨运行时边界转换。

对比 JSON 方式：`serde_json::to_string()` 在纯 Rust 中运行，零边界穿越，生成一个字符串，一次 `memcpy` 把它复制到 JS heap，然后 V8 原生的 C++ `JSON.parse` 在单次优化遍历中处理它。**少量、大型、优化的操作胜过大量小型操作**。

### 基准测试：JSON 字符串 vs 直接 JsValue（1000 次运行，每次调用 µs）

| Fixture | JSON round-trip | serde-wasm-bindgen | 变化 |
| --- | --- | --- | --- |
| simple-table | 20.5 | 22.5 | -9% 更慢 |
| contact-form | 61.4 | 79.4 | -29% 更慢 |
| dashboard | 57.9 | 74.0 | -28% 更慢 |

我们立刻回滚了这个改动。

## TypeScript 重写

我们把完整的解析器流水线移植到了 TypeScript。同样的六阶段架构，同样的 `ParseResult` 输出格式——没有 WASM，没有边界，完全在 V8 heap 中运行。

### 基准测试方法：单次解析

**测量内容**：对完整字符串的单次 `parse(completeString)` 调用。这隔离了每次调用的解析成本。

**运行方式**：30 次预热迭代以稳定 JIT，然后使用 `performance.now()`（µs 精度）进行 1000 次计时迭代。报告中位数。Fixture 是真实的 LLM 生成组件树，以各格式的真实流式语法序列化。

**Fixture 说明**：
- `simple-table` — root + 一个 3 列 5 行的 Table（约 180 字符）
- `contact-form` — root + 包含 6 个输入字段的表单布局 + 提交按钮（约 400 字符）
- `dashboard` — root + 侧边栏导航 + 3 个指标卡片 + 图表 + 数据表（约 950 字符）

### 结果：单次解析（中位数 µs，1000 次运行）

| Fixture | TypeScript | WASM | 加速比 |
| --- | --- | --- | --- |
| simple-table | 9.3 | 20.5 | **2.2x** |
| contact-form | 13.4 | 61.4 | **4.6x** |
| dashboard | 19.4 | 57.9 | **3.0x** |

## 进一步优化：语句级增量缓存

消除了 WASM 解决了每次调用的成本，但流式架构还有一个更深层的问题。

解析器在每个 LLM chunk 上都会被调用。朴素方法是累积 chunks 并每次从头重新解析整个字符串：

```
Chunk 1: parse("root = Root([t") → 14 chars
Chunk 2: parse("root = Root([tbl])\ntbl = T") → 27 chars
Chunk 3: parse(full_accumulated_string) → ...
```

对于 1000 字符输出、20 字符 chunk 分片：50 次解析调用，累计处理约 25,000 字符。**O(N²) 复杂度**。

### 解决方案

以 depth-0 换行符终止的语句是**不可变的**——LLM 永远不会回来修改它们。我们添加了一个流式解析器，缓存已完成语句的 AST：

```
State: { buf, completedEnd, completedSyms, firstId }

On each push(chunk):
1. 从 completedEnd 扫描 buf 寻找 depth-0 换行符
2. 对于每个找到的完整语句: 解析 + 缓存 AST → 推进 completedEnd
3. 待处理（最后的、不完整的）语句: autoclose + 重新解析
4. 合并已缓存 + 待处理 → resolve + map → 返回 ParseResult
```

已完成的语句永远不会被重新解析。每个 chunk 只重新解析尾部进行中的语句。**O(total_length) 而不是 O(N²)**。

### 结果：完整流式解析总成本（所有 chunk 的中位数 µs）

| Fixture | 朴素 TS（每 chunk 重解析） | 增量 TS（缓存已完成） | 加速比 |
| --- | --- | --- | --- |
| simple-table | 69 | 77 | 无（单语句，无缓存收益） |
| contact-form | 316 | 122 | **2.6x** |
| dashboard | 840 | 255 | **3.3x** |

`simple-table` fixture 是单条语句——没有东西可缓存，所以两种方法等效。收益随语句数量增加而增加，因为更多文档被缓存并在每个 chunk 中跳过。

### 为什么两个 TS 数字看起来不同

单次解析表格显示 `contact-form` 为 13.4µs；流式表格显示 316µs（朴素）。这并不矛盾——它们测量的是不同东西：

- **13.4µs** = 对完整 400 字符字符串的一次 `parse()` 调用成本
- **316µs** = 流式过程中约 20 次 `parse()` 调用的总成本（chunk 1 解析 20 字符，chunk 2 解析 40 字符，...，chunk 20 解析 400 字符——所有这些增长调用的累计和）

## 最终对比

| 方法 | 每次调用成本 | 完整流式总计 | 备注 |
| --- | --- | --- | --- |
| WASM + JSON round-trip | 20-61µs | baseline | 每次调用有复制开销 |
| WASM + serde-wasm-bindgen | 22-79µs | +9-29% 更慢 | 内部有数百次边界穿越 |
| TypeScript（朴素重解析） | 9-19µs | 69-840µs | 无边界，但 O(N²) 流式 |
| TypeScript（增量） | 9-19µs | 69-255µs | 无边界 + O(N) 流式 |

**最终结果：每次调用快 2.2-4.6 倍，完整流式成本低 2.6-3.3 倍。**

## WASM 适用场景总结

这次经历让我们对 WASM 的正确使用场景有了更清晰的认识：

✅ **计算密集型且最小互操作**：图像/视频处理、密码学、物理模拟、音频编解码器。大输入 → 标量输出或原地修改。边界穿越很少。

✅ **可移植原生库**：将 C/C++ 库（SQLite、OpenCV、libpng）发布到浏览器，无需完整 JS 重写。

❌ **将结构化文本解析为 JS 对象**：无论如何都要付出序列化成本。解析计算足够快，V8 的 JIT 消除了任何 Rust 优势。边界开销占主导。

❌ **频繁调用的小输入函数**：如果函数每个流被调用 50 次，计算只需 5µs，你无法摊销边界成本。

## 关键经验

1. **在选择实现语言之前，先分析时间实际花在哪里**。对我们来说，成本从来不在计算中——始终在跨 WASM-JS 边界的数据传输中。

2. **通过 `serde-wasm-bindgen` 的"直接对象传递"并不更便宜**。从 Rust 逐字段构造 JS 对象比单次 JSON 字符串传输涉及更多边界穿越，而不是更少。边界穿越发生在单次 FFI 调用内部，是不可见的。

3. **算法复杂度改进主导语言级优化**。在流式场景中，从 O(N²) 到 O(N) 的改进比从 WASM 切换到 TypeScript 有更大的实际影响。

4. **WASM 和 JS 不共享堆**。WASM 有扁平的线性内存（`WebAssembly.Memory`），JS 可以作为原始字节读取，但这些字节是 Rust 的内部布局——指针、枚举判别式、对齐填充——对 JS 运行时完全不透明。转换总是必需的，总是有成本的。

---

这篇文章给我们的启示是：性能优化需要找到真正的瓶颈。有时候，"更快的语言"反而因为运行时边界开销而变慢。在做技术选型时，要考虑完整的数据流路径，而不仅仅是某个环节的计算速度。
