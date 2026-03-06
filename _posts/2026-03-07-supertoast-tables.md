---
layout: post
title: "Supertoast Tables：防止大 JSON 负载撑爆 Postgres"
date: 2026-03-07 02:16:48 +0800
categories: tech-translation
description: "Hatchet 团队如何通过自创的 supertoast 表设计，将冷数据卸载到 S3，解决大量 jsonb 数据导致的 Postgres 存储和 autovacuum 性能问题"
original_url: https://hatchet.run/blog/supertoast-tables
source: Hacker News
---

本文翻译自 [Supertoast tables](https://hatchet.run/blog/supertoast-tables)，原载于 Hacker News。

---

"just use Postgres" 俱乐部有一条简单规则——我们可是忠实会员——那就是：对于 Web 应用，Postgres 应该是任何数据存储和检索问题的起点。

理由很直接：Postgres 是一个通用的数据库引擎，你的核心 OLTP 负载很可能已经跑在 Postgres 上了，而且你可能没时间去成为各种专用存储系统的专家。再加上硬件性能的提升和 Postgres 本身的优化，你可以用 Postgres 来处理任务队列、消息队列、缓存、向量嵌入、搜索甚至文件存储。

这正是 Hatchet 的主要策略，目前运行良好。每个工程师都能从头手写 Postgres schema 和查询，我们也清楚在与 Postgres 查询优化器和 MVCC 模型博弈时所做的取舍。

但每个成长的创业公司都会遇到这种方法的极限，我们也终于到了这一步：在 Postgres 实例中存储大量的 `jsonb` 数据。这就是我们从 `jsonb` 列和 TOAST 表迁移到我们亲切称为 **supertoast** 表的故事。

## 为什么选择 jsonb？

Hatchet 的基础数据结构是任务队列（task queue）；持久化工作流、DAG、事件以及几乎所有其他功能都建立在它之上。队列中的每个任务都包含一个输入，完成后还有一个输出。这些输入和输出是任意 JSON 负载，快速进入系统。

另一个约束是 Hatchet 必须足够快；从任务发送到引擎到在 worker 上开始运行，平均耗时不到 25ms（乐观情况下最快可达 9ms）。这排除了很多候选方案。对象存储太慢，而且很多托管数据库使用网络磁盘，IOPS 受限。NVMe 磁盘非常适合，而且我们已经将大部分托管基础设施运行在 NVMe 支持的 Postgres 上了！

所以像系统中几乎所有其他东西一样，我们使用 `jsonb` 列类型将这些负载持久化到 Postgres。

## jsonb 的缺点

缺点很明显。即使是小负载也能占用超过 50% 的数据库存储空间，大负载更是能占用超过 90%。但只有最近任务的负载会被频繁访问。负载访问遵循幂律分布；一天前的负载访问频率非常低。这意味着大量数据库存储空间闲置在我们的 NVMe 磁盘上，从成本效率角度看并不理想，也会导致备份膨胀。

如果数据库开始快速填满会发生什么？虽然 NVMe 磁盘提供了出色的 IOPS，但它们不是网络磁盘，这意味着更换磁盘需要配置一个全新的数据库。更糟糕的是，Hatchet 是一个高流失系统，这意味着与传统 SaaS 读多写少的工作负载相比，我们的 WAL（Write-Ahead Log）**非常大**。新数据库有时需要数小时才能配置完成，当数据库接近 100% 存储容量时，这会变得很可怕。

一个不那么明显的问题是大数据对数据库 autovacuum 操作的影响。我们开始在 Postgres 实例上看到类似以下的长时间运行进程：

```
| pid | query | state | duration | relname
+--------+-------------------------------------------------------------------------+--------+-----------------+---------------------
| 869233 | autovacuum: VACUUM pg_toast.pg_toast_2467713505 (to prevent wraparound) | active | 17:52:14.398029 | v1_payload_20251024
```

是的，这是一个接近 18 小时的 autovacuum！有很多调优方法。但更有趣的是它正在 vacuum 的表：一个 TOAST 表。

## 什么是 TOAST 表？

TOAST 是 **The Oversized-Attribute Storage Technique**（超大属性存储技术）的缩写。Postgres 对任何大于 2KB 的行值使用这种技术；这些大值会被写入 toast 表的多个块中。

Toast 表由 Postgres 管理，但也向用户暴露了一些功能。例如，你可以在带有 `toast.` 前缀的表上覆盖 autovacuum 设置，以便单独为这些表调整 autovacuum（默认情况下，toast 表从主表继承 autovacuum 设置）。

正如我们之前看到的，toast 表对 autovacuum 来说遍历成本很高，会导致数据库上非常高的 IOPS 负载——这一点后面会很重要。

## 理想方案：supertoast 表

为了解决不常访问的负载填满磁盘空间的问题，我们希望所有热负载都存储在 Postgres（主要在 toast 表中），而冷负载卸载到 S3，并在数据库中存储引用以保持完全一致性。这将为延迟敏感的工作负载提供快速访问，同时为较旧的任务提供灵活且廉价的存储（这些任务对延迟不敏感）。

我们称之为 `supertoast` 表：

```sql
CREATE TYPE supertoast_payload_location AS ENUM ('INLINE', 'EXTERNAL');
CREATE TABLE supertoast (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  location supertoast_payload_location NOT NULL,
  external_key TEXT,
  inline_content JSONB,
  PRIMARY KEY (id, inserted_at),
  CHECK (
    (location = 'INLINE' AND external_key IS NULL AND inline_content IS NOT NULL)
    OR
    (location = 'EXTERNAL' AND external_key IS NOT NULL AND inline_content IS NULL)
  )
) PARTITION BY RANGE(inserted_at);
```

注意这个表按日期分区——后面我们会看到为什么这很重要！一旦超过 24 小时阈值，我们会将给定分区中的所有现有负载卸载到 S3，只留下指向 S3 bucket 的 key。

## WAL 方式卸载的问题

卸载任务比我们最初想的要棘手。

这是一个延迟数据复制系统，所以我们很自然地想到了一种数据结构：将卸载操作建模为 supertoast 表的预写日志（WAL）。想法是有一个持续运行的作业，从 WAL 中弹出满足某些时间条件的行，将负载发送到 S3，然后用刚写入的 key 更新源记录。

我们很快构建并发布了这个方案，但它有明显问题：

1. **高磁盘和 CPU 压力**，因为 autovacuum 至少会在卸载过程中回收整个分区的死元组一次（这也会在处理 WAL 本身期间导致表和索引膨胀）
2. **S3 成本快速上升**，如果你不考虑请求量的话。PUT 请求（主要请求类型）在大多数区域按每 1000 次请求 $0.005 计费。

事实证明 WAL 也不是理想的数据模型，因为写入 S3 是高度可并行化的（而且我们很快会看到，应该批量处理），所以我们希望尽可能抓取大量数据。此外，我们意识到 WAL 中的更新和删除操作实际上没有意义；对于更新，我们可以直接内联重写负载，删除可以通过 S3 生命周期策略回收，只要 supertoast 引用行被正确删除就能保证数据一致性。

## S3 批量处理

我们必须快速找到一种方法来减少对 S3 的 PUT 请求成本；在我们的情况下，每行单独一个 PUT 请求每月要花费数万美元！为了解决这个问题，我们不再单独写入每个负载并存储其 key，而是将单个负载压缩并连接成一个更大的文件，然后存储指向起始索引和每个负载长度的指针以便检索。

例如，如果我们有两个负载：

```json
// payload A
{
  "foo": "bar"
}
// payload B
{
  "baz": 314,
  "qux": 159
}
```

我们会将这些负载合并成一个字符串（文件），如下所示：

```
{"foo": "bar"}{"baz": 314, "qux": 159}
```

然后我们记录每个负载的起始位置和长度：

```json
{
  "A": {
    "offset": 0,
    "length": 14
  },
  "B": {
    "offset": 14,
    "length": 24
  }
}
```

最后，我们会为负载 B 创建这样的 key：

```
/2026/03/04/17/.json:14:24
```

这个 key 存储在数据库中。这是一个冒号分隔的 key，我们可以解包成三个值：S3 中的对象 key、起始索引和长度。有了这些信息，我们可以只读取 S3 中较大对象的相应字节范围，读取字节后只需解压就能得到原始负载。

核心思想是通过这种方式将所需的 S3 操作数量减少几个数量级，同时通过显著减少总写入次数（从而减少到 S3 的往返次数）来提高应用层的吞吐量。

## 写入并交换（Write-and-Swap）

与其通过读取 WAL 来卸载数据，我们设计了一种我称之为 **write-and-swap** 的方法。如前所述，我们的负载表按日期分区，我们认为可以利用这一点，加上 Postgres 的一些便捷特性，以解决我们遇到的所有问题。

每天，一个 cron 在美国东部时间早上 7:00 左右启动负载处理作业，用于处理前一天写入的负载。我们选择早上 7:00 开始，这样如果出问题，我们能在线处理。作业有几个阶段。

**第一步：创建空表副本**

首先，我们创建一个新表，它是前一天分区的空副本。我们立即在这个表上手动创建一个 `CHECK` 约束，模仿我们要复制到 S3 的分区的分区约束：

```sql
CREATE TABLE supertoast_copy_2026_03_04 (LIKE supertoast_2026_03_04 INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);

ALTER TABLE supertoast_copy_2026_03_04
ADD CONSTRAINT supertoast_copy_2026_03_04_partition_copy_chk
CHECK (
  -- this constraint matches the partition constraint on the source partition
  inserted_at IS NOT NULL
  AND inserted_at >= '2026-03-04 00:00:00'::TIMESTAMPTZ
  AND inserted_at < '2026-03-05 00:00:00'::TIMESTAMPTZ
);
```

**第二步：创建同步触发器**

接下来，我们在源负载分区上创建触发器，将任何写入复制到新分区，这样在分页和卸载数据时不会丢失任何数据：

```sql
CREATE OR REPLACE FUNCTION sync_to_copy_partition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO supertoast_copy_2026_03_04 (id, inserted_at, location, external_key, inline_content)
    VALUES (NEW.id, NEW.inserted_at, NEW.location, NEW.external_key, NEW.inline_content)
    ON CONFLICT (id, inserted_at) DO UPDATE
    SET location = EXCLUDED.location,
        external_key = EXCLUDED.external_key,
        inline_content = EXCLUDED.inline_content;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE supertoast_copy_2026_03_04
    SET location = NEW.location,
        external_key = NEW.external_key,
        inline_content = NEW.inline_content
    WHERE id = NEW.id
    AND inserted_at = NEW.inserted_at;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM supertoast_copy_2026_03_04
    WHERE id = OLD.id
    AND inserted_at = OLD.inserted_at;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER sync_supertoast_writes
AFTER INSERT OR UPDATE OR DELETE ON supertoast_2026_03_04
FOR EACH ROW EXECUTE FUNCTION sync_to_copy_partition();
```

**第三步：批量处理**

一旦完成上述步骤，我们开始批量处理负载。每批处理分几个步骤：

1. 从单独的表中读取一条记录，存储作业进度的"偏移量"。该辅助表作为键值存储，key 是分区的日期，value 是包含负载表主键每列条目的元组。在这种情况下，每行包含对应分区日期的日期、一个 `id` 和一个 `inserted_at`，然后我们可以用 `WHERE (id, inserted_at) > ($1, $2)` 进行分页，参数来自存储的偏移量。

2. 从源分区读取一批负载，按主键和上述偏移量排序。

3. 将批次分成块，并行写入 S3。

4. 对每个块并发执行我们之前描述的压缩算法并存储结果。

5. 将这些卸载的结果写入我们创建的新表（原始分区的空副本）。

6. 更新数据库中辅助表的偏移量为本次迭代的最大主键值。

我们重复这个过程直到处理完所有批次的负载。

**第四步：原子交换**

在作业结束时，我们已经批量分页遍历了整个源分区，并将每批卸载到 S3。我们现在也已经用与原始分区相同的数据填充了复制分区，只是用 S3 的 key 替代了实际负载。

这就是分区真正有用的地方：我们可以简单地删除旧分区，这意味着**我们不会看到由行更新引起的任何 autovacuum 压力**。为了安全地做到这一点，我们以 `ACCESS EXCLUSIVE MODE` 获取分区表的锁，删除旧分区和触发器，重命名新分区，并将其作为先前分区的替代品附加到父表：

```sql
BEGIN;
LOCK TABLE supertoast IN ACCESS EXCLUSIVE MODE;
DROP TRIGGER sync_supertoast_writes;
DROP FUNCTION sync_to_copy_partition;
ALTER TABLE supertoast DETACH PARTITION supertoast_2026_03_04;
DROP TABLE supertoast_2026_03_04;
ALTER TABLE supertoast_copy_2026_03_04 RENAME TO supertoast_2026_03_04;
-- also rename indexes, etc. here
-- this is fast because the CHECK constraint exists
ALTER TABLE supertoast ATTACH PARTITION supertoast_2026_03_04
FOR VALUES FROM ('2026-03-04') TO ('2026-03-05');
-- not needed anymore
ALTER TABLE supertoast_2026_03_04 DROP CONSTRAINT supertoast_copy_2026_03_04_partition_copy_chk;
COMMIT;
```

这也是 CHECK 约束派上用场的地方：由于我们在创建副本时创建了与原始分区分区约束匹配的检查约束，我们可以在不需要再次验证该约束的情况下执行附加，这可能需要几秒钟。因为不需要验证，整个交换几乎是瞬间完成的。

一旦附加完成，我们释放锁，提交，数据就完成了切换！

## 结果

我们已经运行这个 write-and-swap 方法几个月了，每天持续卸载数亿个负载，同时保持数据库 CPU 使用率和 S3 成本较低，而且没有落后！

这里的关键洞察是：向分区副本的每次单次写入比我们 WAL 方法的 `UPDATE` / `DELETE` 开销要高效得多，因为我们可以比向原始表的 `UPDATES` 更快地执行写入，同时造成更少的锁争用和更少的 autovacuum 压力。

---

## 关键要点

1. **TOAST 表是隐形的性能杀手**：当你存储大型 `jsonb` 字段时，Postgres 会自动使用 TOAST 表，但这些表的 autovacuum 操作可能极其耗时（他们遇到了 18 小时的 autovacuum！）

2. **分区是解决此类问题的利器**：按时间分区让你可以用 `DROP` 替代 `DELETE`，完全避免 autovacuum 压力

3. **S3 批量写入技巧**：将多个负载打包成一个文件，只存储偏移量和长度，可以将 S3 请求成本降低数个数量级

4. **write-and-swap 模式**：创建副本 → 触发器同步 → 批量处理 → 原子交换，这套流程适用于任何需要大规模数据迁移的场景

5. **CHECK 约束的妙用**：预先创建匹配分区约束的 CHECK 约束，可以让 `ATTACH PARTITION` 瞬间完成

*`supertoast` 的命名归功于 Ubicloud 的 Daniel Farina*
