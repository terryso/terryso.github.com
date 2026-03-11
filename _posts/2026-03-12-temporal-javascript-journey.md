---
layout: post
title: "Temporal：JavaScript 时间处理的 9 年征程"
date: 2026-03-12 00:31:43 +0800
categories: tech-translation
description: "JavaScript 的 Date 对象困扰了开发者近 30 年。本文讲述了 Temporal API 如何历经 9 年、跨越多家公司最终成为 ECMAScript 标准的故事。"
original_url: https://bloomberg.github.io/js-blog/post/temporal/
source: Hacker News
---

本文翻译自 [Temporal: The 9-Year Journey to Fix Time in JavaScript](https://bloomberg.github.io/js-blog/post/temporal/)，原载于 Hacker News。

---

JavaScript 的 `Date` 对象是一个困扰了开发者近三十年的历史包袱。今天，`Temporal` API 正式达到 TC39 Stage 4，将成为 ECMAScript 2026 的一部分。这是一个跨越 9 年、涉及多家公司和无数贡献者的漫长故事。

## JavaScript 是如何演进的？

JavaScript 的独特之处在于它运行在所有浏览器中，没有单一的"所有者"。任何变更都需要各方达成共识，这个过程通过 TC39（ECMAScript 技术委员会）来完成。

提案会经历一系列成熟阶段：

- **Stage 0** - 创意
- **Stage 1** - 问题空间被接受
- **Stage 2** - 草案设计确定，但工作继续
- **Stage 2.7** - 原则上批准，等待测试和反馈
- **Stage 3** - 实现和反馈
- **Stage 4** - 标准化

2018 年我第一次看到 Temporal 时，它还处于 Stage 1。这是一个激进的提案——要将一套全新的日期时间库引入 JavaScript。

## 时代的产物

1995 年，Brendan Eich 被要求在 10 天内创建 Mocha（后来成为 JavaScript）。在巨大的时间压力下，许多设计决策都是务实的妥协。其中一个决定是直接移植 Java 的 `Date` 实现。

Brendan 后来解释道：

> 它是 Ken Smith 直接从 Java 移植到 C 的代码（这是"Mocha"中我唯一没写的代码）。

当时的内部理念被称为 **MILLJ**：Make It Look Like Java。在那个时刻，与 Java 的一致性比重新思考时间模型更重要。Web 还很年轻，大多数使用 JavaScript 的应用程序都很简单——至少一开始是这样。

## Web 成长了，Date 没有

到了 2010 年代，JavaScript 正在驱动银行系统、交易终端、协作工具等运行在全球每个时区的复杂系统。`Date` 越来越成为开发者的痛点。

### 可变性问题

开发者经常会写出意外修改原始 Date 对象的辅助函数：

```javascript
const date = new Date("2026-02-25T00:00:00Z");
console.log(date.toISOString());
// "2026-02-25T00:00:00.000Z"

function addOneDay(d) {
  // 糟糕！这会直接修改 date
  d.setDate(d.getDate() + 1);
  return d;
}

addOneDay(date);
console.log(date.toISOString());
// "2026-02-26T00:00:00.000Z"
```

### 不一致的月份运算

```javascript
const billingDate = new Date("Sat Jan 31 2026");
billingDate.setMonth(billingDate.getMonth() + 1);
// 期望：2 月 28 日
// 实际：3 月 2 日
```

Date 不会将无效的日历结果约束回有效日期，而是静默地将溢出滚动到下个月。

### 模糊的解析

```javascript
new Date("2026-06-25 15:15:00").toISOString();
// 可能的返回值：
// - 本地时区
// - Invalid Date RangeError
// - UTC
```

这个字符串类似但不完全符合 ISO 8601。历史上，浏览器对"接近 ISO"字符串的行为在规范中是未定义的。

## 库的时代

Web 生态系统别无选择，只能用库来修补 Date 的缺陷。各种日期时间库的下载量每周加起来超过 1 亿次。

领头的是 Moment.js，它拥有表达力强的 API、强大的解析能力和急需的不可变性。创建于 2011 年，它很快成为 JavaScript 日期时间操作的事实标准。

但 Moment.js 的广泛采用也带来了自己的问题。添加这个库意味着增加包体积，因为它需要携带自己的区域设置信息和时区数据库。

尽管使用了压缩器、编译器和静态分析工具，所有这些额外数据都无法被 tree-shake 掉，因为大多数开发者不知道他们需要哪些区域设置或时区。为了保险起见，大多数用户会把所有数据一股脑打包。

## 冠军团队集结

2017 年，Maggie Johnson-Pint 决定为 TC39 提出一个"Temporal 提案"来标准化日期和时间。这个提案获得了极大的热情，并推进到了 Stage 1。

在 Bloomberg，这种痛点不是理论上的。我们在 Terminal 上大规模运行 JavaScript，使用 Chromium、Node.js 和 SpiderMonkey 等运行时。我们的用户和他们投资的金融市场遍布全球每个时区。

Bloomberg 工程师 Andrew Paprocki 开始与 Igalia 讨论在 V8 中使时区可配置。那次对话中，Daniel Ehrenberg（当时在 Igalia 工作）将 Andrew 引向了早期的 Temporal 工作，因为它看起来与 Bloomberg 现有的值语义日期时间类型惊人地相似。

那次交流成为了 Bloomberg 生产需求、Igalia 的浏览器和标准专业知识以及 Temporal 新兴方向之间的早期桥梁。

**Temporal 的冠军团队包括：**

- Maggie Johnson-Pint (Microsoft)
- Matt Johnson-Pint (Microsoft)
- Brian Terlson (Microsoft)
- Richard Gibson (Agoric)
- Philipp Dunkel (Bloomberg)
- Ujjwal Sharma (Igalia)
- Philip Chimento (Igalia)
- Jason Williams (Bloomberg)
- Shane Carr (Google)
- Justin Grant (特邀专家)

## Temporal 的样子

Temporal 是一个顶级命名空间对象（类似于 `Math` 或 `Intl`），存在于全局作用域中。下面是它包含的类型：

### Temporal.ZonedDateTime

如果你不知道需要哪种 Temporal 类型，从 `Temporal.ZonedDateTime` 开始。它是 `Date` 最接近的概念替代品，但没有"地雷"。

**Date 表示：**
- 一个精确的时间点（内部是自 epoch 以来的毫秒数）
- 通过机器当前时区解释
- 隐式的可变行为

**Temporal.ZonedDateTime 表示：**
- 一个精确的时间点
- 显式的时区
- 显式的日历
- 完整的夏令时正确性
- 所有这些都是不可变值

```javascript
// 以前
const now = new Date();

// Temporal 等价写法
const now = Temporal.Now.zonedDateTimeISO();
```

这个类型针对可能需要进行日期时间运算的 DateTime 进行了优化，其中夏令时转换可能会造成问题：

```javascript
// 伦敦夏令时开始：2026-03-29 01:00 -> 02:00
const zdt = Temporal.ZonedDateTime.from(
  "2026-03-29T00:30:00+00:00[Europe/London]",
);
console.log(zdt.toString());
// → "2026-03-29T00:30:00+00:00[Europe/London]"

const plus1h = zdt.add({ hours: 1 });
console.log(plus1h.toString());
// "2026-03-29T02:30:00+01:00[Europe/London]"（01:30 不存在）
```

在这个例子中，我们不会落在 `01:30` 而是 `02:30`，因为 `01:30` 在那个特定时间点不存在。

### Temporal.Instant

`Temporal.Instant` 是一个精确的时间点，没有时区、没有夏令时、没有日历。它表示自 1970 年 1 月 1 日午夜（Unix epoch）以来经过的时间。与有类似数据模型的 `Date` 不同，`Instant` 以纳秒而非毫秒为单位测量。

```javascript
const instant = Temporal.Instant.from("2026-02-25T15:15:00Z");
instant.toString();
// "2026-02-25T15:15:00Z"

instant.toZonedDateTimeISO("Europe/London").toString();
// "2026-02-25T15:15:00+00:00[Europe/London]"

instant.toZonedDateTimeISO("America/New_York").toString();
// "2026-02-25T10:15:00-05:00[America/New_York]"
```

### Plain 类型系列

我们还有一组 plain 类型：`PlainDate`、`PlainTime`、`PlainDateTime`、`PlainYearMonth`、`PlainMonthDay`。这些是所谓的"墙上时间"——想象墙上的模拟时钟，它不检查夏令时或时区，只是显示普通时间。

```javascript
const date = Temporal.PlainDate.from({ year: 2026, month: 3, day: 11 });
date.year; // => 2026
date.inLeapYear; // => false
date.toString(); // => '2026-03-11'
```

### 日历支持

Temporal 支持日历。浏览器和运行时附带一组内置日历，让你可以用用户偏好的日历系统表示、显示和做运算，而不仅仅是用不同方式格式化格里高利日期。

```javascript
const today = Temporal.PlainDate.from("2026-03-11[u-ca=hebrew]");
today.toLocaleString("en", { calendar: "hebrew" });
// '22 Adar 5786'

const nextMonth = today.add({ months: 1 });
nextMonth.toLocaleString("en", { calendar: "hebrew" });
// '22 Nisan 5786'
```

使用旧的 `Date`，你无法表达"添加一个希伯来月"作为一等操作。你可以使用不同的日历进行*格式化*，但你做的任何运算仍然是格里高利月运算。

### Temporal.Duration

最后是 `Temporal.Duration`。Duration 很直接，可以与其他类型一起用于加减运算。另一个有用的特性是以不同单位显示：

```javascript
const duration = Temporal.Duration.from({
  hours: 130,
  minutes: 20,
});
duration.total({ unit: "second" }); // => 469200
```

## 实现挑战

Temporal 是一个非常大的提案，它给 JavaScript 带来的变化比这门编程语言历史上任何其他提案都多。

一些具体挑战包括：

- 这个**巨大的规范**比整个 ECMA-402（国际化规范）还大
- 规范的波动性造成了移动目标
- 浏览器要求几乎所有方面都高效且高性能

Firefox 能够在规范制定过程中实现 Temporal——感谢 André Bargull（网名 Anba）的出色工作——但并非所有浏览器或引擎都能在早期阶段处理 Temporal。

2024 年 6 月的 TC39 大会上，Google 国际化团队和 Boa 决定合作实现 Temporal，并开发一个可以同时服务于两个引擎的 Rust 库。这个库叫做 `temporal_rs`。

今天，`temporal_rs` 通过了 100% 的所有测试，现在服务于 V8 和 Boa 之外的其他引擎！

`temporal_rs` 非常不寻常。多个引擎合作开发共享库来实现 TC39 提案是罕见的，甚至可能是前所未有的。这不仅成功了，而且非常成功。`temporal_rs` 意味着：

- **降低入门门槛**：学生和其他协作者不需要理解 V8 或 Boa 代码库就可以为库做出贡献
- **改善长期维护**：`temporal_rs` 有一组维护者，即使在 Temporal 达到 Stage 4 之后也会继续在库上工作
- **更高质量的代码审查**：因为 `temporal_rs` 的作用域是库，审查它更容易，因为不需要整个引擎的上下文

## 已发布并标准化

今天早些时候，Temporal 在 TC39 流程中达到了 Stage 4，这意味着它将成为下一年度 ECMAScript 规范（ES2026）的一部分。

不过你不必等到那时——你今天就可以使用它！

Temporal 已经在以下环境中支持：

- Firefox v139（自 2025 年 5 月）
- Chrome v144（自 2026 年 1 月）
- Edge v144（自 2026 年 1 月）
- TypeScript 6.0 Beta（自 2026 年 2 月）
- Safari（技术预览版部分支持）
- Node.js v26（待定）

## 接下来是什么？

Temporal 还有大量工作要做，比如弄清楚它如何与 Web 生态系统的其他部分集成。我们有多年与 Date 对象配合或绕过它的 Web API，这些 API 也必须与 Temporal 对象兼容。

### 与日期选择器集成

开发者会想在日期选择器中使用 Temporal。目前这还不行。随着我们改进使用 Temporal 的体验，我们需要在 Date 使用的领域添加支持。

### 补充 DOMHighResTimeStamp

由于 Temporal Instant 支持纳秒级精度，它们可以在任何使用 `DOMHighResTimeStamp` 的地方使用。

```javascript
cookieStore.set({
  name: "foo",
  value: "bar",
  expires: Temporal.Now.instant().add({ hours: 24 }).epochMilliseconds,
});
```

## JavaScript 更好的时间处理

Temporal 是跨越公司、引擎和个人近十年工作的成果。它代表了：

- 在 TC39 内部多年的共识建设，直接由生态系统的先行经验指导
- 跨多个 JavaScript 引擎的实现工作
- Microsoft、Google、Mozilla、Bloomberg、Igalia、Boa 和许多独立贡献者之间的合作
- 以 `temporal_rs` 库形式存在的共享基础设施的罕见例子

我们很自豪多年来资助和支持 Igalia 的 Temporal 工作。这种投资加上开放合作，成功帮助提案从想法走向规范再到发布现实。

`temporal_rs` 的成功证明了一些重要的事情：新的语言特性不必意味着跨引擎的重复努力。共享的高质量开源基础设施可以降低成本、增加一致性，并加速整个 Web 生态系统的创新。

Temporal 不仅仅是一个更好的 API。它是 JavaScript 社区可以共同解决长期问题的证明。

将近 30 年后，JavaScript 终于有了一个现代的日期时间 API。

这一次，我们做对了。

---

**要点总结：**

1. `Temporal` 是 JavaScript 30 年来第一个真正的现代日期时间 API
2. 它提供了多种类型（`ZonedDateTime`、`Instant`、`PlainDate` 等）来适应不同场景
3. 所有 Temporal 对象都是不可变的，避免了 Date 的可变性问题
4. 内置时区和日历支持，包括非格里高利日历
5. 已经在 Firefox、Chrome、Edge 和 TypeScript 中可用
6. `temporal_rs` Rust 库展示了跨引擎协作的新模式
