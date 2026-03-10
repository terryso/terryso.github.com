---
layout: post
title: "深入理解 Postgres Top K 查询优化：从 B-Tree 到搜索引擎的思考"
date: 2026-03-10 17:31:02 +0800
categories: tech-translation
description: "本文深入分析 Postgres 中 Top K 查询的优化挑战，探讨为何传统的 B-Tree 索引在复杂过滤条件下表现不佳，以及 ParadeDB 如何借鉴搜索引擎的设计思路来解决这个问题。"
original_url: https://www.paradedb.com/blog/optimizing-top-k
source: Hacker News
---

本文翻译自 [How We Optimized Top K in Postgres](https://www.paradedb.com/blog/optimizing-top-k)，原载于 Hacker News。

---

在数据库领域，**Top K** 是一个非常常见的需求——"给我按某个字段排序后的前 K 条记录"。这通常意味着"最新的数据"、"最高分的记录"或"最大的值"。

听起来这是个基础问题，Postgres 应该能轻松解决，毕竟我们可以创建索引。但在实际的生产环境中，Top K 查询往往出人意料地棘手。本文将深入探讨 Postgres 的 Top K 优化在哪些场景下表现出色，在哪些场景下力不从心，以及为什么像 Lucene/Tantivy 这样的搜索库或专注于 Top K 的数据库（如 ParadeDB）采用了完全不同的思路。

## Postgres 的方案：排序的 B-Tree

让我们从一个包含 1 亿行数据的单表开始：

```sql
CREATE TABLE benchmark_logs (
  id SERIAL PRIMARY KEY,
  message TEXT,
  country VARCHAR(255),
  severity INTEGER,
  timestamp TIMESTAMP,
  metadata JSONB
);
```

我们需要返回按 `timestamp` 排序的最新 10 条记录：

```sql
SELECT *
FROM benchmark_logs
ORDER BY timestamp DESC
LIMIT 10;
```

没有索引时，这个查询需要 15 秒。为了加速，我们可以在 `timestamp` 上创建 B-Tree 索引：

```sql
CREATE INDEX ON benchmark_logs (timestamp);
```

B-Tree 非常适合 Top K 查询，因为它是排序结构，检索 Top K 结果的时间复杂度是 O(K)。查询时间从 15 秒骤降到令人印象深刻的 5ms！

**B-Tree 的工作原理**：B-Tree 是由 Postgres 页面（可以理解为节点）组成的层级结构。上层页面用于导航，实际的索引值存储在底层的叶子页面中，并且是有序的。当查询"给我最大的 K 条记录"时，Postgres 从根节点跳转到具有最大值的叶子节点，然后沿着链表向后遍历，读取条目直到收集到 K 行。由于 B-Tree 是平衡树，从根到任何叶子的路径都很短且可预测。

## 问题来了：我们还需要过滤条件

上面的例子有一个隐藏的约束：它只在索引完全匹配查询形状时有效。一旦你添加了不属于索引的过滤条件，情况就变得复杂了。

考虑一个更现实的查询，带有 `WHERE severity < 3` 过滤条件：

```sql
SELECT *
FROM benchmark_logs
WHERE severity < 3
ORDER BY timestamp DESC
LIMIT 10;
```

现在 Postgres 面临两难选择：
- 它可以使用 `timestamp` 上的 B-Tree 索引获取按时间排序的行，但无法跳过不符合 `severity` 条件的行。它必须逐个检查每行的 severity 值并丢弃大部分。在最坏情况下，这意味着遍历整个索引。
- 或者它可以先扫描符合 `severity < 3` 的行，但这样就失去了排序信息，必须对结果进行排序。

无论哪种方式，Postgres 最终都会扫描远超 K 行的数据，进行额外的过滤或排序工作。最坏情况下，查询可能回到 15 秒。

## 排序 + 过滤 = 组合爆炸

一个自然的反应是创建一个包含 `severity` 和 `timestamp` 的复合 B-Tree 索引：

```sql
CREATE INDEX ON benchmark_logs (severity, timestamp);
```

复合 B-Tree 仍然是排序树，但条目首先按 `severity` 排序，然后在每个 `severity` 值内按 `timestamp` 排序。这对于这种查询形状非常有效：Postgres 可以直接跳转到 `severity < 3` 的树部分，然后按降序遍历时间戳获取 Top K。

**问题是这个方案不能泛化**。例如，现在我们还想按 `country` 过滤：

```sql
SELECT *
FROM benchmark_logs
WHERE country = 'United States'
AND severity < 3
ORDER BY timestamp DESC
LIMIT 10;
```

或者改变排序列：

```sql
SELECT *
FROM benchmark_logs
WHERE country = 'United States'
ORDER BY severity ASC, timestamp DESC
LIMIT 10;
```

支持所有现实的过滤和排序组合需要一个不断增长的索引集合。这些索引会导致存储膨胀、写入变慢，查询计划也变得难以推理。

## Postgres 的 Top K 在搜索场景中彻底崩溃

到目前为止，我们都假设过滤器是可以用 B-Tree 中的等值或范围条件表达的简单谓词。全文搜索打破了这个假设。

考虑一个结合了 Postgres 原生文本搜索（执行 token 匹配而非完整字符串匹配）、范围过滤，然后按相关性排序的查询：

```sql
SELECT *,
  ts_rank(to_tsvector('english', message), q) AS rank
FROM benchmark_logs,
  plainto_tsquery('english', 'research team') AS q
WHERE to_tsvector('english', message) @@ q
AND severity < 3
ORDER BY rank DESC
LIMIT 10;
```

这个查询看起来与之前的例子相似：过滤行，然后返回按分数排序的前 10 条。但在内部，Postgres 没有单一结构能同时满足所有这些约束。

Postgres 可以使用 GIN（广义倒排）索引进行 `tsvector` 文本搜索谓词，使用 B-Tree 进行排序或数值过滤。但由于 GIN 不保持排序，且 Postgres 无法跨不同索引组合排序保证，规划器必须将查询分解为多个阶段：

1. 使用 GIN 索引产生（可能很大的）匹配行 ID 集合
2. 从"堆"（即底层表存储）中获取这些行
3. 应用额外过滤器如 `severity < 3`
4. 对剩余行进行排序
5. 返回前 10 个结果

如果 GIN 产生的结果集很大，步骤 2 中的重复堆获取会非常昂贵。

### 尝试优化

首先，预计算 `to_tsvector` 表达式：

```sql
ALTER TABLE benchmark_logs
ADD COLUMN message_fts tsvector
GENERATED ALWAYS AS (to_tsvector('english', coalesce(message,''))) STORED;
```

然后创建 GIN 索引：

```sql
CREATE INDEX ON benchmark_logs USING gin (message_fts);
```

**即使进行了这些优化，这个查询仍然需要 37 秒执行**，主要是因为查询 `research team` 返回了数百万个必须与过滤器检查并排序的匹配项。

创建部分 GIN 索引：

```sql
CREATE INDEX ON benchmark_logs USING gin (message_fts) WHERE severity < 3;
```

不幸的是，查询仍然需要大约相同的时间（33 秒），因为即使有 `severity < 3` 谓词，仍然返回大量候选集。

## 搜索数据库对 Top K 的不同思考方式

这些例子凸显了 Postgres 中 Top K 的两个问题：

1. **B-Tree 迫使你预先确定查询形状**，这与临时 Top K 查询的理念相矛盾
2. **B-Tree 与文本搜索查询/GIN 索引配合不好**，尤其是当 Top K 候选集很大时

像 ParadeDB 这样的搜索数据库采用了根本不同的方法。我们使用单一的复合索引，包含所有用于 Top K 过滤和排序的字段。与 B-Tree 不同，这个索引不一定是排序的。这意味着目标不是在单一特定查询上超越 B-Tree——而是让所有形状的 Top K 查询（包括文本搜索和评分）都相当快，不同查询形状之间的方差很小。

此外，由于排序键不是预先知道的，我们必须接受大候选集是不可避免的。优化目标变成了使扫描和过滤的实际工作极其廉价，并在选择 Top K 时积极剪枝以避免额外工作。

### 基础数据结构：倒排索引和列式数组

ParadeDB 的索引像大多数搜索索引一样，建立在两个核心结构上。

**第一个是倒排索引**，它将每个词元（如 "research"）映射到一个"倒排列表"——包含该词元的文档 ID 排序列表。

```
Documents          Inverted Index
[1]: "us research"    research → [1, 2]
[2]: "ca research"    us → [1, 3]
[3]: "us database"    ca → [2]
                     database → [3]
```

**第二个是列式布局**，它将单个字段存储在连续、紧凑的数组中。列式数组以加速分析查询而闻名，但它们也是 Top K 查询的自然选择，因为它们允许廉价、缓存友好的查找。

```
Row Store
+------------------------------+
| id  | country | severity    |
| [1] | [US]    | [2]         |
| [2] | [CA]    | [9]         |
| [3] | [US]    | [1]         |
+------------------------------+

Column Store
+------------------------------+
| id:      [1][2][3]           |
| country: [US][CA][US]        |
| severity: [2][9][1]          |
+------------------------------+
```

在 ParadeDB 中，这些结构由 Tantivy 提供——一个受 Lucene 启发的基于 Rust 的搜索库。

### 复合索引消除昂贵的行查找

在 Postgres 中，每个索引行都包含一个指向表中行位置的指针。如果 Top K 过滤器不能完全由索引回答，Postgres 必须跟随该指针并从底层表存储中物化整行。这个操作很昂贵，当对数百万候选者执行时容易产生缓存未命中。

ParadeDB 通过将所有可搜索、可过滤和可排序的字段存储在单个索引中来解决这个问题。每个索引行被分配一个紧凑的内部 `u32` 标识符，称为文档 ID，索引中的每个数据结构都引用相同的 ID。

这个文档 ID 设计对布尔查询（即多个 `WHERE` 子句）非常高效。例如，考虑布尔条件 `WHERE country = 'United States' AND severity < 3`。文本条件从倒排索引产生文档 ID 流，而范围过滤器变成在同一 ID 处对列式数组的直接查找。评估 `AND` 条件简化为交叉 `u32` 流，而无需物化任何中间行。

### 列式数组使过滤器变得廉价

由于文本搜索索引产生的候选者可能不是连续顺序的，列式数组必须具有真正的 O(1) 随机访问能力。在 Tantivy 的列式格式中，这是通过将列式值的行 ID 设置为其序数（即其在数组中的位置）来实现的。所以从列中访问一个值来评估过滤器就是：

```python
value = column[row_id]
```

此外，列用最小值和最大值元数据注释。这允许像 `severity < 3` 这样的范围过滤器跳过整个不能满足过滤器的列。对于与范围重叠的列，值是批量处理而不是单独处理。通过对值向量而不是标量应用比较，引擎可以使用 SIMD 指令在单个 CPU 操作中评估许多值。

### Block WAND 实现早期剪枝

对于按相关性分数（如 BM25 分数）排序的查询，Tantivy 通过称为 **Block WAND** 的优化更进一步。从概念上讲，这意味着跳过整个文档块的评估，除非它们有进入 Top K 的数学可能性。

Block WAND 通过维护文档 ID 块内任何文档可能达到的分数上限来工作。当引擎填充其 Top K 堆时，它建立一个阈值：当前堆中的最低分数。在评估块之前，引擎检查块的最大分数。如果该最大值低于阈值，整个块被跳过而无需对单个文档评分。

```
当前分数阈值: 8.5

+-------------------+  max_score=12 → 评估
| Block A           |
| docs: [1 2 3 4]   |
+-------------------+

+-------------------+  max_score=7 → 跳过
| Block B           |
| docs: [5 6 7 8]   |
+-------------------+
```

在 ParadeDB 中，与上述相关性排序查询等价的查询是：

```sql
SELECT *, pdb.score(id) FROM benchmark_logs
WHERE severity < 3 AND message ||| 'research team'
ORDER BY pdb.score(id) DESC
LIMIT 10;
```

`|||` 是 ParadeDB 的匹配析取操作符。

**这个查询现在降到了非常合理的 300ms**（相比 Postgres GIN 的 33 秒）。

## ParadeDB Top K 性能的最新改进

在 `0.21.0` 版本中，某些基准测试的 Top K 查询性能提高了高达 30%。例如，以下 Top K 查询在 1 亿行数据集上从 90ms 降到 70ms：

```sql
SELECT * FROM benchmark_logs
WHERE message === 'research' AND country === 'Canada'
ORDER BY severity, timestamp LIMIT 10;
```

`===` 是 ParadeDB 的词项搜索操作符。

这个改进得益于 Tantivy 的上游变更，该变更改变了在执行布尔查询时如何推进文档 ID 迭代器。

以前，为了确定文档 ID 是否存在于布尔 `AND` 的所有子句中，Tantivy 必须使用 `seek` 将所有迭代器推进到下一个匹配文档。例如，考虑两个文档 ID 迭代器：

```
Iterator A (country = 'United States'): [100, 101, 102, 103, ...]
Iterator B (country = 'Canada'): [50, 10000, ...]
```

假设迭代器 `B` 当前定位在 `50`，迭代器 `A` 定位在 `100`。为了确定 `100` 是否在 `B` 中，我们必须将 `B` 推进到 `10000`。这可能是一个昂贵的操作，因为推进到下一个匹配可能需要扫描包含 `50` 到 `10000` 之间值的多个块。

有了这个变更，Tantivy 可以改为执行更廉价的成员资格检查来检查特定文档 ID，而无需实际推进迭代器。

## 总结

Postgres 的 Top K 方法有点像全有或全无——最佳情况下几乎是即时的，但最坏情况可能需要几秒甚至几分钟。ParadeDB 则设计为只要所有过滤器和排序键都存在于索引中，就使任何 Top K 查询都相当快。

展望未来，我们仍然看到通过在执行管道早期剪枝工作来优化 Top K 性能的有意义空间。一个方向是索引分区和段级排序，其中数据按常查询的维度（如时间范围或粗略分数桶）物理分组或排序。有了这种布局，整个段如果其最大可能分数或排序值不能击败当前 Top K 阈值就可以被跳过。

---

**关键要点**：

1. **B-Tree 索引对简单 Top K 很有效**，但一旦加入额外过滤条件，性能可能急剧下降
2. **复合索引不是银弹**，支持所有查询组合会导致索引爆炸
3. **全文搜索 + Top K 是 Postgres 的弱点**，GIN 索引不保持排序，导致大量堆查找
4. **搜索引擎的思路值得借鉴**：倒排索引 + 列式存储 + Block WAND 剪枝
5. **ParadeDB 的设计哲学**：不追求单一查询的极致性能，而是让所有形状的 Top K 查询都"足够快"

对于需要复杂搜索和排序场景的开发者，考虑使用专门的搜索数据库或搜索引擎可能是更好的选择。
