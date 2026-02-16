---
layout: post
title: "Discord 性能优化案例研究：从 Actor 模型到 ScyllaDB"
date: 2026-02-15 07:16:41 +0800
categories: tech-translation
description: "深入剖析 Discord 如何通过 Actor 模型、Elixir、Rust 和 ScyllaDB 等技术栈，实现支撑数万亿消息的实时通讯系统，以及其中蕴含的分布式系统设计智慧。"
original_url: https://newsletter.fullstack.zip/p/discord-a-case-study-in-performance
source: Hacker News
---

本文翻译自 [Discord: A Case Study in Performance Optimization](https://newsletter.fullstack.zip/p/discord-a-case-study-in-performance)，原载于 Hacker News。

---

Discord 表面上看只是一个「聊天应用」，但深入研究后你会发现，它实际上是一个精心调校的系统，实现了速度、规模和可靠性的完美结合——这是消费者应用的三重奏。

每当你发送一条消息、加入语音频道或观看直播时，Discord 都需要将事件路由到正确的位置，通知大量客户端，并且要足够快让人感觉是即时的。当服务器只有 50 人时这很容易，但当它有 1900 万用户时，这简直就是疯狂。

这篇文章讲述的是让 Discord 在大规模下保持敏捷的各种创造性优化。

## Actor 模型：分布式系统的基石

在深入 Discord 的实现细节之前，我们需要理解它所基于的架构模式：**Actor 模型**。

Carl Hewitt 在 1973 年的论文中首次提出了这个概念。Alan Kay 在 80 年代将其应用于消息传递。Gul Agha 在 1985 年正式化了它在分布式系统中的相关性。

在共享内存模型中，多个线程使用相同的状态，这很快导致竞态条件。你可以通过添加**数据访问约束：锁**来防止这种情况。但锁本身会带来 bug，比如当多个线程互相等待对方释放锁时，就会导致永久冻结（死锁）。随着系统增长，这些问题成为瓶颈。

**Actor 模型允许在分布式系统中更容易地更新数据。**

一个 `actor` 是一个拥有邮件地址和行为的代理。Actor 通过消息进行通信，并发地执行它们的动作。Actor 模型通过**通信约束**确保安全并发，而不是锁。

Actor 模型可以总结为四条规则：

```
1. 每个 actor 拥有自己的状态（其他 actor 不能直接修改它）
2. Actor 只通过消息通信
3. Actor 一次只处理一条消息（没有竞态条件）
4. 响应消息时，actor 可以：
   - 改变自己的状态
   - 发送消息
   - 创建子 actor
```

只要遵守规则，就不会有竞态条件和锁的意大利面条代码。你还能获得其他好处：

- **位置无关性**：接口保证每个 actor 无论位置在哪都会一致地行为。不关心一个 actor 在 localhost 还是远程。
- **容错性**：如果一个 actor 失败，它的管理者可以恢复它或将消息传递给可用的 actor。
- **可扩展性**：Actor 易于实例化，与微服务和水平扩展兼容。
- **可组合性**：鼓励原子化而非单体架构。

### 现代 Actor 模型应用

- **视频编辑软件**：发送每个设置更改，以便立即反映在草稿中。
- **交易平台（Robinhood）**：将每次提款视为独立的 actor，有更新账户的功能。
- **AI 代理**：代理就是 actor。它传递消息（提示）、有内部状态（上下文）、产生其他代理（actor）。

当然，Actor 模型也有权衡：
- **调试数据流 bug 更困难**：虽然每个 actor 有良好隔离的日志，但跨多个服务追踪 bug 可能更难。
- **成本**：创建更多代理的代理对工程团队来说是梦想，但如果不受约束，对财务团队来说是噩梦。
- **需要教育**：纯函数、状态机、事件驱动架构——这些对许多人来说是不熟悉的概念。

## Discord 的实现

> 一切都是「actor」。每个 Discord 服务器、WebSocket 连接、语音通话、屏幕共享等...都使用一致性哈希环进行分布式。
>
> 这是一个非常棒的模型。我们已经能够将这个系统从数百万扩展到数亿用户，而对底层架构几乎没有改变。
>
> — Jake，Discord 首席工程师

Discord 需要一种平滑的方式将纯文本/语音数据转换为内部消息，然后实时路由到正确的 guild（Discord 服务器）。

### 基本架构

1. 用户连接到 WebSocket 并启动一个 Elixir 会话进程，然后连接到 guild。
2. 每个 guild 有一个 Elixir 进程，作为所有 guild 活动的路由器。
3. Rust 数据服务在发送到 ScyllaDB 之前对 API 查询进行去重。
4. 后台通信通过 PubSub 进行。

「Fan-out」是指并行发送消息到多个目的地而不需要响应的行为。这正是 Discord 需要实现的，让聊天感觉实时。

当用户上线时，他们连接到 guild，guild 发布状态到所有其他连接的会话。每个 guild 和连接的用户都有一个长期存在的 Erlang 进程。Guild 的进程跟踪客户端会话并向它们发送更新。当 guild 收到消息时，它将消息 fan-out 到所有客户端会话。最后，每个会话进程通过 WebSocket 将更新推送到客户端。

```
User ↔ WebSocket ↔ Session ↔ Guild
```

Elixir 对 Actor 模式的函数式实现使得它能够轻松处理大量进程：

```elixir
# 用 4 行 Elixir 发布到其他 guild。很简洁。
def handle_call({:publish, message}, _from, %{sessions: sessions}=state) do
  Enum.each(sessions, &send(&1.pid, message))
  {:reply, :ok, state}
end
```

### 扩展挑战

Elixir 的语言特性帮助 Discord 轻松起步。但随着使用增长，他们需要做更多来保持响应。

如果 1000 个在线成员每人说一次「hello, world」，Discord 必须处理 100 万条通知。
- 10,000 条消息 → 1 亿条通知
- 100,000 条 → 100 亿条

鉴于每个 guild 是一个进程，他们需要最大化每个进程的吞吐量：

1. 使用 relay 在多线程间分配工作
2. 调整 Elixir 内存数据库
3. 使用工作进程卸载操作（维护、部署）
4. 将 fan-out 委托给单独的「sender」，卸载主进程

## 数据库层的优化：从 Cassandra 到 ScyllaDB

当消息层瓶颈解决后，下一个问题转移到了数据库。

Discord 使用 Apache Cassandra 集群。作为优化水平扩展的 NoSQL 数据库，Cassandra 应该线性扩展而不降低性能。但在添加 177 个节点和数万亿消息后，热门服务器的读取变慢了。

### 问题：热分区

Discord 使用 channel_id 和 10 天窗口将 `messages` 数据分区到 Cassandra：

```sql
CREATE TABLE messages (
  channel_id bigint,
  bucket int, -- 静态 10 天时间窗口
  message_id bigint,
  author_id bigint,
  content text,
  PRIMARY KEY ((channel_id, bucket), message_id)
) WITH CLUSTERING ORDER BY (message_id DESC);
```

两个因素导致问题：
1. 热门 guild 的消息比小型 guild 多几个数量级（Midjourney 有 1900 万成员，其中超过 200 万可能随时在线）
2. Cassandra 中读取比写入更昂贵（需要查询 memtable 和 SSTables）

大量读取导致热分区，减慢了 `messages` 读取，进而减慢了整个 guild。

### 解决方案：ScyllaDB

ScyllaDB 是一个 C++ NoSQL 数据存储，自称为「你真正想要的 Cassandra」。

它的优势：
- 每核心分片 → 更高效的 CPU
- 每查询缓存绕过 → 更快的查询
- 每行修复（而非分区） → 更快的维护
- 更好的调度、编译、驱动程序和事务算法
- **没有垃圾回收**

Discord 与 Scylla 团队合作改进了反向查询等功能。最终，Scylla 足够好以支持 Discord 的工作流程，而 Discord 也足够擅长 Scylla 以至于写了一本 392 页的书。

## API 层优化：Rust 数据服务

无论数据库与你的应用多么兼容，用请求淹没它都会导致延迟。Discord 在 Python API 遇到了这个问题——消息 fan-out 机制导致热门 guild 中出现大量重复请求。

这引入了两个问题：
1. CPU 释放数千个线程，使负载飙升（「惊群效应」）
2. 用户不喜欢等待

Discord 引入了一个新的 Rust 服务：**数据服务库**。当请求进入数据服务库时，它订阅一个工作线程。这个工作线程执行查询，然后通过 gRPC 将结果发送给所有订阅者。如果 100 个用户同时请求同一条消息，只会有一个数据库请求。

```
Request -> Python API -> DB
Request -> Python API -> Data Service Library -> DB
```

这种技术成功将热门频道的入站查询率降低了 10-50 倍，并线性扩展数据库连接（每个工作线程一个，而非每个并发请求一个）。

> 模因信誉非常重要。
>
> — Bo Ingram，Discord 高级软件工程师

**关键结论：当查询昂贵（数据库往返、API 调用）时，飞行中去重比分布式缓存更便宜。**

## 硬件层优化：Super-Disk

最终，对 Discord 数据库性能影响最大的是**磁盘操作延迟**。

Discord 运行在 GCP 上，提供可以以微秒级操作的 SSD。问题是：
- GCP SSD：快，但不可靠（磁盘故障时数据不可恢复）
- GCP 持久磁盘：可靠，但慢（几毫秒延迟 vs SSD 的半毫秒）

Discord 工程师创造性地构建了「Super-Disk」：一个涉及 Linux、写透缓存和 RAID 阵列的磁盘抽象。

**GCP + SSD + 持久磁盘 = 快速且可靠。**

## 其他优化技巧

Discord 没有将性能视为孤立的优先级。他们抓住每一个机会让事情变快：

### 请求路由（Manifold）
按 PID 分组并按核心数量哈希，优化节点间消息传递。开源项目：Manifold。

### 可排序 ID（Snowflake）
使用 Twitter 的「Snowflake」ID 格式，基于时间戳。可以在没有数据库的情况下生成 ID，按创建时间排序，仅从 ID 就能推断消息发送时间。Discord 使用自己的纪元：2015 年的第一秒。

### Elasticsearch 抽象
虽然不在 Elasticsearch 中存储消息，但存储消息元数据和用户 DM 用于索引和快速检索。将 Elasticsearch 集群分组为「cells」，避免索引期间的瓶颈。

### 被动会话
90% 的大型服务器会话是被动的——用户没有主动阅读或写入。如果用户没有打开 guild 标签页，他们不会收到所有新消息。一旦切换到 guild，被动会话会「升级」为正常会话。这导致带宽减少 20%。

### Android 表情符号和列表
他们原本致力于 React Native。但发现自定义表情符号在低端 Android 上渲染不好。所以用 Kotlin 编写表情符号功能，同时维护 React Native。结果是架构分裂：iOS（React Native）和 Android（原生）。

## 核心工程原则

### 1. 让堆栈自然演进

Discord 实际上从 Mongo 开始，然后迁移到 Cassandra，再到 ScyllaDB。他们本无法在开始时预料到瓶颈，更不用说正确的解决方案。

**预测未来的头疼问题，但不要在 v1 中担心预防它们。** 创建解决方案的骨架。用粗糙的 v0 填充细节。当痛苦发生时，找到下一个解决方案。

### 2. 语言基础知识

Discord 开始评估 Elixir 时，它才三岁。随着扩展，他们需要掌握 Elixir 的并发、分布和容错抽象。

> 没有 Elixir，我们在 Discord 做的事情是不可能的。用 Node 或 Python 是不可能的。如果是 C++ 代码库，我们不可能用五名工程师构建这个。学习 Elixir 从根本上改变了我思考和推理软件的方式。
>
> — Jake Heinz，Discord 首席软件工程师

### 3. 垃圾回收基础知识

GC 的不可预测性在多个维度上影响了 Discord 的性能：

- **数据库层**：Cassandra 的 GC 导致「stop-the-world」减速
- **进程层**：BEAM 的默认配置值与 Discord 的使用模式冲突
- **微服务层**：用 Go 编写的「读取状态」服务，每两分钟导致 CPU 峰值

> 我们真的不喜欢垃圾回收。
>
> — Bo Ingram，Discord 高级软件工程师

Rust，没有垃圾收集器，最终拯救了局面：

> 即使只是基本优化，Rust 也能够超越高度手工调优的 Go 版本。
>
> — Jesse Howarth，Discord 软件工程师

### 4. 明确核心价值主张

Discord 的核心价值是**为游戏玩家提供语音聊天**。这让他们从第一天起就优先考虑速度和可靠性。

十一年后，Discord 应用仍然不臃肿或缓慢，因为他们坚持性能优先。

### 5. 拥有优秀工程师并让他们发挥创造力

2020 年，Discord 的消息系统有超过 20 个服务，部署到 500 台 Elixir 机器集群，能够处理数百万并发用户，每秒推送数千万条消息。**负责的基础设施团队只有五名工程师。**

优秀的工程师会提出创造性的解决方案。当面对数据库问题时，普通工程师会责怪 Cassandra 和选择它的旧工程师。Discord 则对如何让任何数据库更轻松感到好奇，这导致了数据服务库用于请求合并。

## 结论

复杂性不是美德，也不是敌人。对 Discord 来说，敌人是延迟。当他们用完简单的方法让应用变快时，他们提出了创造性的解决方案——是的，通常很复杂。

**让事情变得复杂是可以的...只要它帮助用户。**

Discord 对速度的需求让它跨越了堆栈的每一层，从廉价 Android 到昂贵数据中心。这记录了许多执行良好的性能技术——有些教科书式，有些创造性。但它真正突出的是那些致力于在大规模上帮助用户的团队所拥有的力量。

---

**关键要点：**

1. **Actor 模型**是构建高并发分布式系统的强大抽象，通过消息传递避免锁和竞态条件
2. **语言选择很重要**：Elixir 的并发模型让小团队构建大规模系统成为可能
3. **数据库选型要匹配使用模式**：从 Mongo → Cassandra → ScyllaDB 的演进是正确的
4. **飞行中去重**比分布式缓存更适合高并发场景
5. **GC 是性能杀手**：Rust 的无 GC 特性在高性能场景有巨大优势
6. **让架构自然演进**：不要过早优化，在瓶颈出现时再解决
7. **核心价值决定技术选择**：为游戏玩家提供实时语音的需求驱动了所有性能优化决策
