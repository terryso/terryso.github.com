---
layout: post
title: "我们用 Rust 写 WASM 解析器，结果优化错了方向"
date: 2026-03-21 09:11:54 +0800
categories: tech-translation
description: "OpenUI 团队用 Rust 编写解析器并编译成 WASM，以为能获得性能提升，结果发现问题不在计算本身，而在于 JS-WASM 边界的数据传输开销。"
original_url: https://www.openui.com/blog/rust-wasm-parser
source: Hacker News
---

本文翻译自 [We built a Rust WASM parser. We were optimising the wrong thing.](https://www.openui.com/blog/rust-wasm-parser)，原载于 Hacker News。

---

## 背景

OpenUI 团队用 Rust 构建了 openui-lang 解析器，并编译成 WASM。逻辑听起来很合理：Rust 很快，WASM 在浏览器中能提供接近原生的速度，而且他们的解析器是一个相当复杂的多阶段流水线。为什么不选 Rust 呢？

**结果发现，他们优化错了方向。**

openui-lang 解析器将 LLM 输出的自定义 DSL 转换为 React 组件树。它在每个流式传输的 chunk 上运行，所以延迟非常重要。整个流水线有六个阶段：

```
autocloser → lexer → splitter → parser → resolver → mapper → ParseResult
```

- **Autocloser（自动闭合器）**：通过追加最少的闭合括号/引号，使部分（流中间）文本在语法上有效
- **Lexer（词法分析器）**：单遍字符扫描器，输出类型化的 token
- **Splitter（分割器）**：将 token 流切割成 `id = expression` 语句
- **Parser（解析器）**：递归下降表达式解析器，构建 AST
- **Resolver（解析器）**：内联所有变量引用（支持提升，循环引用检测）
- **Mapper（映射器）**：将内部 AST 转换为 React 渲染器使用的公共 `OutputNode` 格式

## WASM 的隐形成本

每次调用 WASM 解析器都会产生固定的开销，无论 Rust 代码本身运行多快：

```
JS 世界                          WASM 世界
────────────────────────────────────────────────────────
wasmParse(input)
│
├─ 复制字符串: JS 堆 → WASM 线性内存 (分配 + memcpy)
│
│  Rust 解析 ✓ 快
│  serde_json::to_string() ← 序列化结果
│
├─ 复制 JSON 字符串: WASM → JS 堆 (分配 + memcpy)
│
JSON.parse(jsonString) ← 反序列化结果
│
return ParseResult
```

Rust 解析本身从来不是慢的部分。开销完全在边界上：复制字符串进去，将结果序列化为 JSON 字符串，复制 JSON 字符串出来，然后 V8 将其反序列化回 JS 对象。

## 尝试直接返回 JS 对象？更慢

自然而然的问题是：如果 WASM 直接返回 JS 对象，跳过 JSON 序列化步骤会怎样？他们集成了 `serde-wasm-bindgen`，正是做这件事的——它将 Rust 结构体转换为 `JsValue` 并直接返回。

**结果慢了 30%。**

原因如下：JS 无法将 Rust 结构体的字节从 WASM 线性内存作为原生 JS 对象读取——两个运行时使用完全不同的内存布局。要从 Rust 数据构造 JS 对象，`serde-wasm-bindgen` 必须递归地将 Rust 数据物化为真正的 JS 数组和对象，这涉及每次 `parse()` 调用时跨运行时边界的许多细粒度转换。

相比之下，JSON 方法：`serde_json::to_string()` 在纯 Rust 中运行，零边界交叉，生成一个字符串，一次 `memcpy` 将其复制到 JS 堆，然后 V8 的原生 C++ `JSON.parse` 在单次优化遍历中处理它。更少、更大、更优化的操作胜过许多小操作。

### 基准测试：JSON 字符串 vs 直接 JsValue（1000 次运行，每次调用 µs）

| Fixture | JSON 往返 | serde-wasm-bindgen | 变化 |
| --- | --- | --- | --- |
| simple-table | 20.5 | 22.5 | -9% 更慢 |
| contact-form | 61.4 | 79.4 | -29% 更慢 |
| dashboard | 57.9 | 74.0 | -28% 更慢 |

他们立即回滚了这个更改。

## 重写为 TypeScript

他们将完整的解析器流水线移植到 TypeScript。同样的六阶段架构，同样的 `ParseResult` 输出格式——没有 WASM，没有边界，完全在 V8 堆中运行。

### 基准测试结果：单次解析（中位数 µs，1000 次运行）

| Fixture | TypeScript | WASM | 加速比 |
| --- | --- | --- | --- |
| simple-table | 9.3 | 20.5 | **2.2x** |
| contact-form | 13.4 | 61.4 | **4.6x** |
| dashboard | 19.4 | 57.9 | **3.0x** |

消除 WASM 解决了每次调用的成本问题，但流式架构还有更深层的效率问题。

## 流式解析的 O(N²) 问题

解析器在每个 LLM chunk 上被调用。朴素的方法累积 chunk 并每次从头重新解析整个字符串：

```
Chunk 1: parse("root = Root([t") → 14 字符
Chunk 2: parse("root = Root([tbl])\ntbl = T") → 27 字符
Chunk 3: parse(full_accumulated_string) → ...
```

对于 1000 字符的输出，以 20 字符 chunk 交付：50 次 parse 调用，处理累计约 25,000 字符。相对于 chunk 数量是 O(N²)。

### 解决方案：语句级增量缓存

以深度 0 换行符终止的语句是**不可变的**——LLM 永远不会回来修改它们。他们添加了一个流式解析器来缓存已完成语句的 AST：

```
State: { buf, completedEnd, completedSyms, firstId }

On each push(chunk):
1. 从 completedEnd 扫描 buf 寻找深度 0 换行符
2. 对于每个找到的完整语句：解析 + 缓存 AST → 推进 completedEnd
3. 待处理（最后、不完整）语句：自动闭合 + 重新解析
4. 合并缓存 + 待处理 → 解析 + 映射 → 返回 ParseResult
```

已完成的语句永远不会被重新解析。只有尾部进行中的语句会在每个 chunk 重新解析。O(total_length) 而不是 O(N²)。

### 基准测试结果：完整流式总解析成本（所有 chunk 的中位数 µs）

| Fixture | 朴素 TS（每个 chunk 重解析） | 增量 TS（缓存已完成） | 加速比 |
| --- | --- | --- | --- |
| simple-table | 69 | 77 | 无（单语句，无缓存收益） |
| contact-form | 316 | 122 | **2.6x** |
| dashboard | 840 | 255 | **3.3x** |

`simple-table` fixture 是单个语句——没有可缓存的内容，所以两种方法等效。收益随语句数量增加而增加，因为更多文档被缓存并跳过。

## 为什么两个 TypeScript 数字看起来不同

单次解析表显示 `contact-form` 为 13.4µs；流式表显示 316µs（朴素）。这些并不矛盾——它们测量的是不同的东西：

- **13.4µs** = 对完整 400 字符字符串进行一次 `parse()` 调用的成本
- **316µs** = 流期间约 20 次 `parse()` 调用的总成本（chunk 1 解析 20 字符，chunk 2 解析 40 字符，...，chunk 20 解析 400 字符——所有这些增长调用的累计总和）

## 完整对比

| 方法 | 每次调用成本 | 完整流式总计 | 备注 |
| --- | --- | --- | --- |
| WASM + JSON 往返 | 20-61µs | 基准 | 每次调用有复制开销 |
| WASM + serde-wasm-bindgen | 22-79µs | +9-29% 更慢 | 数百次内部边界交叉 |
| TypeScript（朴素重解析） | 9-19µs | 69-840µs | 无边界，但 O(N²) 流式 |
| TypeScript（增量） | 9-19µs | 69-255µs | 无边界 + O(N) 流式 |

**最终结果：每次调用快 2.2-4.6x，流式总成本降低 2.6-3.3x。**

## 什么时候适合用 WASM？

这次经历让他们对 WASM 的正确用例有了更清晰的思考：

✅ **计算密集型且最少互操作**：图像/视频处理、密码学、物理模拟、音频编解码器。大输入 → 标量输出或原地修改。边界交叉很少。

✅ **可移植的原生库**：将 C/C++ 库（SQLite、OpenCV、libpng）发布到浏览器，无需完整 JS 重写。

❌ **将结构化文本解析为 JS 对象**：无论如何都要支付序列化成本。解析计算足够快，V8 的 JIT 消除了任何 Rust 优势。边界开销占主导地位。

❌ **频繁调用小输入的函数**：如果函数在每个流中被调用 50 次，计算需要 5µs，你无法摊销边界成本。

## 关键经验总结

1. **在选择实现语言之前，先分析时间实际花在哪里。** 对于他们来说，成本从来不在计算上——而总是在 WASM-JS 边界的数据传输上。

2. **通过 `serde-wasm-bindgen` "直接传递对象"并不更便宜。** 从 Rust 逐字段构造 JS 对象比单个 JSON 字符串传输涉及更多边界交叉，而不是更少。边界交叉发生在单个 FFI 调用内部，是不可见的。

3. **算法复杂度改进优于语言级优化。** 在流式情况下从 O(N²) 到 O(N) 比从 WASM 切换到 TypeScript 有更大的实际影响。

4. **WASM 和 JS 不共享堆。** WASM 有一个平面线性内存（`WebAssembly.Memory`），JS 可以作为原始字节读取，但这些字节是 Rust 的内部布局——指针、枚举判别式、对齐填充——对 JS 运行时完全不透明。转换总是必需的，总是有成本的。

---

这个案例给我们的启示是：性能优化需要先找到真正的瓶颈，而不是盲目追求"更快"的技术栈。在某些场景下，简化架构比追求底层语言的性能优势更能带来显著的改进。
