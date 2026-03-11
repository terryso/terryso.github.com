---
layout: post
title: "Temporal API 正式成为 JavaScript 标准：近 30 年来最重大的日期时间革新"
date: 2026-03-12 03:39:35 +0800
categories: tech-translation
description: "JavaScript 的 Temporal API 于 2026 年 3 月 11 日达到 Stage 4，成为 ECMAScript 2026 正式标准。这是 JavaScript 近 30 年来最重大的日期时间 API 革新，彻底解决了 Date 对象的历史遗留问题。"
original_url: https://bloomberg.github.io/js-blog/post/temporal/
source: Hacker News
---

本文翻译自 [Temporal: A Better Time for JavaScript](https://bloomberg.github.io/js-blog/post/temporal/)，原载于 Bloomberg Engineering Blog。

## 引言

今天（2026年3月11日），Temporal API 正式达到 TC39 Stage 4，成为 ECMAScript 2026 的一部分。这标志着 JavaScript 近 30 年来最重大的日期时间 API 革新终于落地。

## JavaScript 如何演进？

JavaScript 是一门独特的语言——它运行在所有浏览器中，没有单一的"所有者"。你不能在孤立环境中做修改就期望它到处适用。你需要所有参与方的认可。演进通过 TC39（负责 ECMAScript 的技术委员会）进行。

提案需要经过一系列成熟度阶段：

- **Stage 0** - 构想
- **Stage 1** - 问题空间被接受
- **Stage 2** - 草案设计选定，但工作继续
- **Stage 2.7** - 原则上批准；等待测试和反馈
- **Stage 3** - 实现和反馈
- **Stage 4** - 标准化

2018年，当我第一次看到 Temporal 时，它处于 Stage 1。TC39 委员会确信这个问题是真实的。这是一个激进的提案，要为 JavaScript 引入一套全新的日期时间库：

- 替代 Date
- 提供不同的 DateTime 类型（而不是单一 API）
- 不可变
- 添加一流的时区和日历支持

但为什么我们需要它？为什么 Date 是如此痛点？让我们回顾一下历史。

## 时代的产物

1995年，Brendan Eich 被要求在 10 天冲刺中创建 Mocha（后来成为 JavaScript）。在巨大的时间压力下，许多设计决策是务实的。其中之一是直接移植 Java 的 Date 实现。

正如 Brendan 后来解释的：

> 这是 Ken Smith（"Mocha"中我唯一没写的代码）将 Java 的 Date 代码从 Java 移植到 C 的直接移植。

当时，这很合理。Java 正在崛起，JavaScript 被定位为其轻量级伴侣。内部甚至有一个哲学叫 **MILLJ**：Make It Look Like Java（让它看起来像 Java）。

Brendan 还指出，更改 API 在政治上会很困难：

> 当每个人都期望 Java 成为"大哥"语言时，改变它会造成混乱和 bug；Sun 公司也会反对。

在那个时刻，与 Java 的一致性比从根本上重新思考时间模型更重要。这是一个务实的权衡。Web 还很年轻，大多数使用 JavaScript 的应用程序都是简单的，至少在一开始是这样。

## Web 长大了，Date 没有

到了 2010 年代，JavaScript 正在驱动银行系统、交易终端、协作工具，以及运行在地球上每个时区的其他复杂系统。Date 正在成为开发者的更大痛点。

### 可变性问题

开发者经常会编写辅助函数，在打算返回新对象时意外地原地修改了原始 Date 对象：

```javascript
const date = new Date("2026-02-25T00:00:00Z");
console.log(date.toISOString());
// "2026-02-25T00:00:00.000Z"

function addOneDay(d) {
  // 哎呀！这会修改原日期
  d.setDate(d.getDate() + 1);
  return d;
}

addOneDay(date);
console.log(date.toISOString());
// "2026-02-26T00:00:00.000Z"
```

### 不一致的月份计算

```javascript
const billingDate = new Date("Sat Jan 31 2026");
billingDate.setMonth(billingDate.getMonth() + 1);
// 期望：Feb 28
// 实际：Mar 02
```

有时候人们想要获取月份的最后一天，却落入这样的陷阱：他们把月份增加一个，但日期保持不变。Date 不会将无效的日历结果约束回有效日期，而是静默地将溢出滚动到下个月。

### 歧义的解析

```javascript
new Date("2026-06-25 15:15:00").toISOString();
// 可能的返回值：
// - 本地时区
// - Invalid Date RangeError
// - UTC
```

在这个例子中，字符串与 ISO 8601 相似但不完全相同。历史上，浏览器对"几乎 ISO"字符串的行为在规范中是未定义的。有些会将其视为本地时间，有些视为 UTC，还有一些会完全作为无效输入抛出。

还有更多，更多，但重点是：在过去三十年中，Date 一直是 JavaScript 开发者的痛点。

## 库时代

Web 生态系统别无选择，只能用库来修补 Date 的缺陷。你可以看到下面日期时间库的急剧增长。今天，它们的下载量总计每周超过 1 亿次。

领头的是 Moment.js，它拥有表达性的 API、强大的解析能力和急需的不可变性。创建于 2011 年，它很快成为 JavaScript 中处理日期时间操作的既定标准。那么问题肯定解决了吧？每个人都应该直接获取一份副本然后完事。

moment.js（以及其他类似库）的广泛采用带来了自己的一套问题。添加库意味着增加包大小，因为它需要随附自己的一组区域设置信息加上来自时区数据库的时区数据。

尽管使用了压缩器、编译器和静态分析工具，所有这些额外数据都无法被 tree-shaking 移除，因为大多数开发者事先不知道他们需要哪些区域设置或时区。为了安全起见，大多数用户 wholesale 获取所有数据并将其发送给用户。

Maggie Johnson-Pint（以及其他一些人）多年来一直是 Moment.js 的维护者，她对处理包大小的请求并不陌生：

> 我们在 moment 的处境是，跟上模块、webpack、人们因为 React 而想要一切不可变等等，比任何净新功能都需要更多的维护
>
> 当然人们从未停止谈论大小。

2017 年，Maggie 决定是用"Temporal Proposal"为 TC39 全会标准化日期时间的时候了。它受到了极大的热情欢迎，从而被推进到 Stage 1。

## 勇士集结

**Stage 1** 是一个重要的里程碑，但距离终点线还很远。在最初的能量爆发后，进展自然会放缓。Maggie 和 Matt Johnson-Pint 与 **Brian Terlson** 一起领导这项工作，同时还要平衡 Microsoft 内部的其他责任。Temporal 还处于早期阶段，大部分即时工作并不光鲜：需求收集、明确语义，以及将"生态系统的痛点"转化为实际可以交付的设计。

在 Bloomberg，这种痛苦不是理论上的。

我们在 Terminal 中大规模运行 JavaScript，使用底层运行时和引擎，如 **Chromium、Node.js** 和 **SpiderMonkey**。我们的用户以及他们投资的市场遍布地球上的每个时区。我们不断传递时间戳：在服务之间、进入存储、进入 UI，以及跨系统，所有这些系统都必须就"现在"的含义达成一致，即使政府提前很短通知更改 DST 规则。

除此之外，我们有内置 Date 模型根本不为之设计的需求：

- **用户配置的时区**，不是机器的时区（并且可以随请求更改）。
- **正确的历史时区行为**，由 IANA 时区数据库（tzdata）更新驱动。
- **更高精度的时间戳**（至少纳秒），而不是永远在临时包装器上粘贴额外字段。

在 Maggie 将 Temporal 带到 TC39 的同时，Bloomberg 工程师 **Andrew Paprocki** 正在与 Igalia 讨论在 V8 中使时区可配置。具体来说，他们讨论引入一个支持的间接层，以便嵌入器可以控制"感知"的时区，而不是依赖操作系统默认值。在那次对话中，**Daniel Ehrenberg**（当时在 Igalia 工作）将 Andrew 指向早期的 Temporal 工作，因为它看起来与 Bloomberg 现有的值语义日期时间类型惊人地相似。

那次交流成为 Bloomberg 的生产需求、Igalia 的浏览器和标准专业知识以及 Temporal 新兴方向之间的早期桥梁。在随后的几年中，Bloomberg 与 Igalia 合作（包括通过持续的资金支持）并直接投入工程时间推进 Temporal，直到它最终成为整个生态系统可以交付的东西。Andrew 正在 Bloomberg 内寻找一些志愿者来推动 Temporal，**Philipp Dunkel** 志愿成为规范 champion。与 Andrew 一起，他说服 Bloomberg 投资于使 Temporal 成为现实，包括与 Igalia 的更深入合作。该支持引入了 **Philip Chimento** 和 **Ujjwal Sharma** 作为全职 Temporal champions，为提案增加了继续前进所需的日常工作重点。

Shane Carr 加入了 Champions 团队，代表 Google 的国际化团队。他提供了我们在国际化主题上所需的关注，如日历，并且还充当了标准化过程与体验过与 JavaScript 国际化 API（Intl）相关工具痛点的用户声音之间的粘合剂，例如格式化、时区和日历。

最后，我们有 Justin Grant，一位受邀专家，他在 iCalendar 和各种其他需要使用日期时间的项目方面有经验。其他值得一提但未在此列表中的人包括 Daniel Ehrenberg、Adam Shaw 和 Kevin Ness。

### Temporal 的现任和历任 Champions

- Maggie Johnson-Pint (Microsoft)
- Matt Johnson-Pint (Microsoft)
- Brian Terlson (Microsoft)
- Richard Gibson (Agoric)
- Philipp Dunkel (Bloomberg)
- Ujjwal Sharma (Igalia)
- Philip Chimento (Igalia)
- Jason Williams (Bloomberg)
- Shane Carr (Google)
- Justin Grant (Invited Expert)

## Temporal 现在的样子

Temporal 是一个顶级命名空间对象（类似于 Math 或 Intl），存在于全局作用域中。在它下面是以构造函数形式存在的"类型"。预计开发者在使用 API 时会根据需要选择类型，例如 `Temporal.PlainDateTime`。

以下是 Temporal 附带的类型：

### Temporal.ZonedDateTime

如果您不知道需要哪种 Temporal 类型，请从 `Temporal.ZonedDateTime` 开始。它是 `Date` 最接近的概念替代品，但没有"陷阱"。

**Date 表示：**

- 精确的时间点（内部是自纪元以来的毫秒数）
- 通过机器当前时区解释
- 具有隐式、可变行为

**Temporal.ZonedDateTime 表示：**

- 精确的时间点
- 具有明确时区
- 具有明确日历
- 完全的夏令时正确性
- 全部作为不可变值

如果您当前正在写：

```javascript
const now = new Date();
```

Temporal 等价物是：

```javascript
const now = Temporal.Now.zonedDateTimeISO();
```

上面的例子使用 Now 命名空间，它为您提供已设置为当前本地时间和时区的类型。

此类型针对可能需要一些日期时间算术的 DateTime 进行了优化，其中夏令时转换可能潜在导致问题。`ZonedDateTime` 在进行任何时间的加法或减法时可以考虑这些转换（见下面的例子）。

```javascript
// 伦敦 DST 开始：2026-03-29 01:00 -> 02:00
const zdt = Temporal.ZonedDateTime.from(
  "2026-03-29T00:30:00+00:00[Europe/London]",
);
console.log(zdt.toString());
// → "2026-03-29T00:30:00+00:00[Europe/London]"

const plus1h = zdt.add({ hours: 1 });
console.log(plus1h.toString());
// "2026-03-29T02:30:00+01:00[Europe/London]" (01:30 不存在)
```

在这个例子中，我们没有落在 01:30，而是 02:30，因为 01:30 在那个特定时间点不存在。

### Temporal.Instant

`Temporal.Instant` 是一个精确的时间点，它没有时区，没有夏令时，没有日历。它表示自 1970 年 1 月 1 日午夜以来经过的时间（Unix 纪元）。与具有非常相似数据模型的 `Date` 不同，`Instant` 以纳秒而不是毫秒为单位测量。这是 champions 做出的决定，因为即使浏览器出于安全目的有一些粗化，开发者仍然需要处理可能从其他地方生成的基于纳秒的时间戳。

`Temporal.Instant` 的典型用法示例如下：

```javascript
// 一个精确的时间点
const instant = Temporal.Instant.from("2026-02-25T15:15:00Z");
instant.toString();
// "2026-02-25T15:15:00Z"

instant.toZonedDateTimeISO("Europe/London").toString();
// "2026-02-25T15:15:00+00:00[Europe/London]"

instant.toZonedDateTimeISO("America/New_York").toString();
// "2026-02-25T10:15:00-05:00[America/New_York]"
```

`Instant` 可以创建然后转换为不同的"分区"DateTime（稍后详述）。您最可能将 `Instant`（存储在您选择的存储后端中），然后使用不同的时区转换为向其时区内的用户显示相同时间。

### Temporal.Plain 系列

我们还有一系列 plain 类型。这些是我们称之为"挂钟时间"的东西，因为如果你想象墙上的模拟时钟，它不会检查夏令时或时区。它只是普通的时间（将时钟向前移动一小时会在墙上推进一小时，即使你在夏令时转换期间这样做）。

我们有几种类型，信息逐渐减少。这很有用，因为您可以选择要表示的类型，并且不需要担心对任何其他不需要的数据运行计算（例如，如果您只对显示日期感兴趣，则计算时间）。

如果您只打算向用户显示值而不需要执行任何日期/时间算术，例如向前或向后移动几周（您将需要日历）或几小时（您可能最终跨越夏令时边界），这些类型也很有用。其中一些类型的限制也使它们如此有用。您很难绊倒并遇到意外的 bug。

```javascript
const date = Temporal.PlainDate.from({ year: 2026, month: 3, day: 11 }); // => 2026-03-11
date.year; // => 2026
date.inLeapYear; // => false
date.toString(); // => '2026-03-11'
```

### 日历支持

Temporal 支持日历。浏览器和运行时随附一组内置日历，这允许您在用户首选的日历系统中表示、显示和进行算术运算，而不仅仅是不同地格式化公历日期。

因为 Temporal 对象是日历感知的，像"加一个月"这样的操作是在**该日历的规则**中执行的，所以您会得到预期的结果。在下面的例子中，我们将一个希伯来月添加到希伯来历日期：

```javascript
const today = Temporal.PlainDate.from("2026-03-11[u-ca=hebrew]");
today.toLocaleString("en", { calendar: "hebrew" });
// '22 Adar 5786'

const nextMonth = today.add({ months: 1 });
nextMonth.toLocaleString("en", { calendar: "hebrew" });
// '22 Nisan 5786'
```

使用旧版 `Date`，无法将"加一个希伯来月"表达为一流操作。您可以_使用不同的日历格式化_，但您所做的任何算术运算仍然在底层是公历月算术。

如果您尝试用 `Date` 近似这一点，它可能看起来像：

```javascript
const legacyDate = new Date(2026, 2, 11);
legacyDate.toLocaleDateString("en", { calendar: "hebrew" });
// '22 Adar 5786'

legacyDate.setMonth(legacyDate.getMonth() + 1);
legacyDate.toLocaleDateString("en", { calendar: "hebrew" });
// '24 Nisan 5786'
```

这添加了一个**公历**月（三月 → 四月）。当您然后在希伯来日历中_显示_结果时，您会落在不同的日子，**24 Nisan** 而不是 **22 Nisan**，因为日历没有相同的月份结构或月份长度。

### Temporal.Duration

我们的最后一种类型是 `Temporal.Duration`。`Duration` 很直接，可以与任何其他类型一起用于加法和减法。`Duration` 的另一个有用特性是以不同单位显示它，如下例所示：

```javascript
const duration = Temporal.Duration.from({
  hours: 130,
  minutes: 20,
});
duration.total({ unit: "second" }); // => 469200
```

大多数日期时间库已经有持续时间类型，所以包含一个是有意义的。它还通过允许开发者比较时间或 DateTime 并获得 `Duration` 类型来补充其他类型。

## 实现

实现 Temporal 是一个挑战。这是一个非常大的提案，给 JavaScript 带来的变化比该编程语言历史上任何其他提案都多。一些具体挑战包括：

- 这个巨大的规范比整个 ECMA-402（国际化规范）还大；这使得单个人员很难（但不是不可能）实现
- 规范的波动性创造了一个移动目标。多年来规范一直在变化，这意味着实现一直在努力跟上。
- 浏览器要求几乎所有方面都是高效和高性能的。

> Temporal 是自 ES2015 以来 ECMAScript 的最大添加

虽然 Firefox 能够在规范制定过程中实现 Temporal——感谢 André Bargull（在线称为 Anba）的出色工作——但并非所有浏览器或引擎都能在早期阶段处理 Temporal。这意味着在 Stage 3 的后期需要大量的追赶工作。

根据添加到 ECMAScript 官方测试套件（Test262）的测试数量，Temporal 是 ECMAScript 规范的最大添加。Temporal 今天有约 4,500 个测试，与其他一些内置组件相比是一个高数字，包括其前身 Date。

在 2024 年 6 月的全会上，Google 国际化团队和 Boa 决定合作实现 Temporal，并开发一个可以服务于两个引擎的 Rust 库。该库称为 `temporal_rs`。在 2024 年和 2025 年期间，由于 Kevin Ness、Manish Goregaokar、Jose Espina 和卑尔根大学学生的工作，Temporal 的实现加速了。今天，`temporal_rs` 通过了 100% 的所有测试，现在服务于 V8 和 Boa 之外的其他引擎！

`temporal_rs` 非常不寻常。多个引擎合作开发共享库来实现 TC39 提案是罕见的，如果不是史无前例的话。这不仅奏效了，而且取得了巨大成功。`temporal_rs` 意味着：

- **降低准入门槛**：学生和其他合作者不需要理解 V8 或 Boa 代码库就能为库做出贡献。
- **改进的长期维护**：`temporal_rs` 有一组维护者，即使在 Temporal 达到 Stage 4 后也会继续在库上工作。这为开发者提供了一个稳定的位置来提出问题、报告 bug，甚至自己贡献改进，引擎作为利益相关者。
- **更高质量的代码审查**：因为 `temporal_rs` 被限定为一个库，这意味着审查它更容易，因为您不需要整个引擎的上下文。此外，库使用现代 Rust 特性，如内置 linting（Clippy）、格式化（Rustfmt）和针对引擎的 CI 测试。

## 交付和标准化

今天早些时候，Temporal 在 TC39 分阶段过程中达到 Stage 4，这意味着它将成为下一个年度 ECMAScript 规范（ES2026）的一部分。但是，您不需要等到那时——您今天就可以使用它！

Temporal 已经在以下环境中得到支持：

- Firefox v139（自 2025 年 5 月）
- Chrome v144（自 2026 年 1 月）
- Edge v144（自 2026 年 1 月）
- TypeScript 6.0 Beta（自 2026 年 2 月）
- Safari（Technology Preview 中的部分支持）
- Node.js v26（待定）

## 接下来是什么？

Temporal 还有很多工作要做，比如弄清楚它如何与 Web 生态系统的其余部分集成。我们已经有多年的 Web API 使用或围绕 Date 对象工作，这些相同的 API 也必须与 Temporal 对象兼容。以下是一些例子：

### 与日期选择器集成

开发者会希望在日期选择器中使用 Temporal。目前，这不可能（可能可以通过 polyfill 修补，但今天标准中没有任何内容）。随着我们改善使用 Temporal 的人体工程学，我们需要在 Date 今天使用的领域添加支持。一个例子是与日期时间相关的输入类型。见下文：

```html
<input type="datetime-local" value="2026-03-12T10:00">
```

### 补充 DOMHighResTimeStamp

由于 Temporal Instants 支持纳秒级时间，它们可以在任何使用 `DOMHighResTimeStamp` 的地方使用。在以下示例中，我们可以使用 Instant 设置 cookie 过期，通常我们以前会使用 `DOMHighResTimeStamp`。

```javascript
cookieStore.set({
  name: "foo",
  value: "bar",
  expires: Temporal.Now.instant().add({ hours: 24 }).epochMilliseconds,
});
```

当然还有更多。可以肯定的是，JavaScript 社区将继续努力将 Temporal 不仅带到 Web 平台，还有今天使用 Date 的任何其他库。

## JavaScript 更好的时间

Temporal 是跨公司、引擎和个人近十年工作的结果。它代表了：

- 在 TC39 内部多年的共识建设，直接由生态系统的先前经验提供信息
- 跨多个 JavaScript 引擎的实现工作
- Microsoft、Google、Mozilla、Bloomberg、Igalia、Boa 和许多独立贡献者之间的合作
- 以及以 `temporal_rs` 库形式的共享基础设施的罕见例子

我们很自豪多年来资助和支持 Igalia 在 Temporal 上的工作。该投资结合开放合作，成功帮助将提案从想法推进到规范再到交付现实。

`temporal_rs` 的成功证明了一些重要的事情：新的语言特性不一定意味着跨引擎的重复努力。共享、高质量的开源基础设施可以降低成本、增加一致性，并加速跨 Web 生态系统的创新。

Temporal 不仅仅是一个更好的 API。它证明 JavaScript 社区可以共同解决长期存在的问题。

经过近 30 年，JavaScript 终于拥有了一个现代日期时间 API。

这一次，我们做对了。

---

## 译者总结

Temporal API 的正式标准化是 JavaScript 发展史上的一个重要里程碑。以下是关键要点：

1. **彻底解决 Date 的历史问题**：可变性、歧义解析、不一致的月份计算等问题终于得到解决
2. **类型安全**：提供多种类型（ZonedDateTime、Instant、Plain 系列、Duration），开发者可以根据需求选择
3. **原生国际化支持**：内置日历系统支持，非公历计算不再是难题
4. **纳秒精度**：Instant 类型支持纳秒级时间戳
5. **跨引擎协作**：`temporal_rs` 库开创了多引擎共享基础设施的先例

作为开发者，现在是时候开始学习 Temporal API 了。虽然完整的 ES2026 规范还未发布，但主流浏览器已经提供支持。这不再是一个实验性特性，而是 JavaScript 的未来。

**相关资源：**
- [MDN Temporal 文档](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal)
- [TC39 Temporal Proposal](https://github.com/tc39/proposal-temporal)
- [temporal_rs GitHub](https://github.com/boa-dev/temporal_rs)
