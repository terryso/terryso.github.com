---
layout: post
title: "深入理解 XNU 内核的 Clutch 与 Edge 调度器设计"
date: 2026-02-09 07:18:02 +0800
categories: tech-translation
description: "解析 Apple XNU 内核中的集群调度器设计，包括 Clutch 调度器的分层架构和 Edge 调度器的多集群策略。"
original_url: https://github.com/apple-oss-distributions/xnu/blob/main/doc/scheduler/sched_clutch_edge.md
source: Apple Open Source
---

本文翻译自 [Clutch Scheduler](https://github.com/apple-oss-distributions/xnu/blob/main/doc/scheduler/sched_clutch_edge.md)，原载于 Apple Open Source Distributions。

## 背景

XNU 内核运行在各种平台上，对动态性和效率有着强烈的需求。它需要在广泛的场景下提供良好表现：从对延迟敏感的工作负载（如 UI 交互、多媒体录制/播放）需要快速访问 CPU，到低优先级的批处理工作负载（如照片同步、源代码编译）需要避免饥饿。传统的 Mach 调度器通过给系统中的所有线程打上优先级标签来尝试实现这些目标，将高优先级线程视为交互式线程，低优先级线程视为批处理线程。然后它使用基于优先级衰减的时间共享模型来惩罚使用 CPU 的线程，以实现公平共享和饥饿避免。

然而，这种方法丢失了线程与更高级别用户工作负载之间的关系，使得调度器无法作为一个整体来推理工作负载——而这正是最终用户所关心的。这种基于线程的时间共享方法的一个问题是，同一优先级的线程被同等对待，无论它们为哪个用户工作负载服务，这往往导致次优决策。

这最终导致整个平台的优先级通胀，各个子系统提高自己的优先级以避免与其他不相关线程发生饥饿和时间共享。传统的线程级调度模型还存在以下问题：

* **不精确的统计**：线程级的 CPU 统计激励在系统上创建更多线程。在 GCD 和工作队列的世界中，线程被快速创建和销毁，线程级统计是不精确的，并允许过度的 CPU 使用。
* **隔离性差**：在 Mach 调度器中，时间共享通过根据全局系统负载衰减线程优先级来实现。这种属性可能导致相同或更低优先级带的突发活动导致 App/UI 线程的衰减，从而导致性能和响应性下降。调度器在处理延迟敏感的 UI 工作负载的线程和执行大量非延迟敏感操作的线程之间提供非常有限的隔离。

**Clutch 调度器**是单个集群内线程的时间共享算法。**Edge 调度器**在 Clutch 调度器设计的基础上扩展，支持具有不同性能和效率特征的多个集群。Edge 调度器在每个集群上使用 Clutch 时间共享，并添加了其他多集群功能，如线程放置、迁移、轮询等。

## Clutch 调度器设计

为了推理更高级别的用户工作负载，Clutch 调度器调度的是线程组而不是单个线程。它打破了传统的单层调度模型，实现了一个分层调度器，在各个线程分组级别做出最优决策。目前实现的分层调度器有 3 个级别：

* 调度桶级别（Scheduling Bucket Level）
* 线程组级别（Thread Group Level）
* 线程级别（Thread Level）

### 调度桶级别

最高级别是调度桶级别，它决定应该选择哪一类线程执行。内核为每个线程维护一个调度桶的概念，这些桶是根据线程的基础/调度优先级定义的。这些调度桶大致映射到 OS 运行时使用的 QoS 类，用于定义各种工作的性能期望。具有相同调度桶的所有可运行线程在此级别由单个条目表示。这些条目在整个实现中被称为**根桶（root buckets）**。此级别的目标是为高 QoS 类提供对 CPU 的低延迟访问，同时确保低 QoS 类的饥饿避免。此级别还为此层次结构和集群绑定的线程维护单独的根桶，允许调度器在各种 QoS 级别有效地在绑定和未绑定线程之间进行时间共享。

**实现**

调度桶级别使用最早截止时间优先（EDF）算法来决定下一个应该选择哪个根桶执行。每个具有可运行线程的根桶在优先级队列中表示为一个条目，按桶的截止时间排序。桶选择算法只需选择优先级队列中截止时间最早的根桶。根桶的截止时间根据其首次可运行时间戳和其**最坏情况执行延迟（WCEL）**值计算，WCEL 为每个桶预定义。WCEL 值基于 Mach 时间共享算法遵循的衰减曲线选择，以允许系统从更高级别的角度像现有调度器一样运行。

```c
static uint32_t sched_clutch_root_bucket_wcel_us[TH_BUCKET_SCHED_MAX] = {
        SCHED_CLUTCH_INVALID_TIME_32,                   /* FIXPRI */
        0,                                              /* FG */
        37500,                                          /* IN (37.5ms) */
        75000,                                          /* DF (75ms) */
        150000,                                         /* UT (150ms) */
        250000                                          /* BG (250ms) */
};
```

每当根桶从不可运行转变为可运行时，其截止时间被设置为 `(now + WCEL[bucket])`。这确保即使在重负载系统中，桶也会在 WCEL[bucket] 时被调度。一旦根桶被选中执行，其截止时间将被 WCEL[bucket] 推迟到未来。这种 EDF 的基本实现存在一个主要问题。在重负载系统中，较高桶可能在最近的过去使用了足够的 CPU，导致它们在截止时间顺序上落后于较低的桶。现在，如果一小部分用户关键工作负载突然出现，高桶必须等待较低的桶运行后才能获得 CPU，这可能导致性能问题。

为了解决这个问题，桶级调度器实现了根桶"跃迁"（warp）机制。每个桶提供一个跃迁值，当桶因其截止时间到期而被选中时，该值会刷新。

```c
static uint32_t sched_clutch_root_bucket_warp_us[TH_BUCKET_SCHED_MAX] = {
        SCHED_CLUTCH_INVALID_TIME_32,                   /* FIXPRI */
        8000,                                           /* FG (8ms)*/
        4000,                                           /* IN (4ms) */
        2000,                                           /* DF (2ms) */
        1000,                                           /* UT (1ms) */
        0                                               /* BG (0ms) */
};
```

根桶选择逻辑找到截止时间最早的桶，然后检查是否有任何更高的（按自然优先级顺序）桶具有剩余的跃迁值。如果存在这样的更高桶，它将选择该桶并有效地打开一个跃迁窗口。在这个跃迁窗口期间，调度器将继续选择这个跃迁桶而不是较低优先级的桶。一旦跃迁桶耗尽或跃迁窗口到期，调度器将恢复按截止时间顺序调度桶。这种机制为高级桶提供有界的优势，允许它们在突发工作负载的存在下保持响应。

`FIXPRI` 桶是特殊处理的，因为它包含极低延迟敏感的线程。由于 `FIXPRI（又称 AboveUI）` 和 `FG Timeshare` 桶的优先级范围重叠，因此在这些桶之间保持一些本机优先级顺序很重要。这里实现的策略是比较两个桶的最高 Clutch 桶；如果 Above UI 桶更高，则立即调度它，否则回退到上述基于截止时间的调度。该实现为 Above UI 线程提供了极低延迟的 CPU 访问，同时支持高优先级时间共享线程与较低优先级固定优先级线程竞争的用例，这在一些媒体工作负载中可以观察到。由于时间共享桶在消耗 CPU 时最终会降低优先级，因此此模型为 Above UI 的时间共享线程提供了所需的行为。

当 EDF 算法由于截止时间顺序而选择低 QoS 根桶时，即使较高 QoS 根桶是可运行的，根桶选择算法也会将低根桶标记为处于"饥饿避免模式"，并打开等于 `thread_quantum[bucket]` 的"饥饿避免窗口"。在此窗口期间，所有根桶选择都将选择被饥饿的根桶。这种饥饿避免窗口确保被饥饿的根桶即使在来自高优先级线程的激烈竞争下也能获得公平的机会来排出低 QoS 线程。

EDF 算法是此级别的最佳选择，原因如下：

* 基于截止时间的调度允许调度器为所有调度桶定义最坏情况执行延迟的严格界限。
* EDF 算法基于桶可运行性和选择是动态的。由于所有截止时间更新在计算上都很便宜，因此算法可以保持最新信息而无需可测量的开销。
* 它有效地实现了为高桶保持低调度延迟和为低桶避免饥饿的目标。
* 由于桶级调度器在最坏情况下处理固定的小数量的可运行桶，因此很容易在定义截止时间、跃迁等方面进行配置。

### 线程组级别

第二级是"线程组"级别，它决定应该选择 QoS 桶中的哪个线程组执行。线程组代表代表特定工作负载的线程集合。此级别的目标是在各种用户工作负载之间共享 CPU，优先选择交互式应用程序而非计算密集型批处理工作负载。

**实现**

线程组级别实现了 FreeBSD ULE 调度器的变体，来决定下一个应该选择哪个线程组执行。QoS 桶中每个具有可运行线程的线程组使用 `struct sched_clutch_bucket_group` 表示。对于多集群平台，`sched_clutch_bucket_group` 表示平台上所有集群上排队的线程。Clutch 桶组维护 CPU 利用历史、可运行历史以及下一级调度器的一些时间共享信息。

Clutch 桶组有一个条目来代表平台上每个集群的线程组的可运行线程。这个条目是 `sched_clutch_bucket`，算法的这一级试图找到要在每个根层次结构上调度的最佳 Clutch 桶。每个具有可运行线程的 Clutch 桶在运行队列中表示为一个条目，按 Clutch 桶优先级排序。Clutch 桶选择算法只需选择 Clutch 桶运行队列中优先级最高的 Clutch 桶。Clutch 桶的优先级计算基于以下因素：

* **Clutch 桶中可运行的最高线程**：Clutch 桶维护一个优先级队列，其中包含按其提升或基础优先级排序的线程（无论哪个属性使线程有资格成为该 Clutch 桶的一部分）。它使用这些线程中最高的线程来计算 Clutch 桶的基础优先级。同时使用基础和调度优先级允许调度器通过 SPI 尊重用户空间指定的优先级差异、由于优先级继承机制（如旋转门）和其他影响核心调度器外部的机制引起的优先级提升。
* **交互性分数**：调度器根据 Clutch 桶整体的自愿阻塞时间和 CPU 使用时间的比率计算交互性分数。此分数允许调度器优先选择高度交互的线程组，而不是批处理计算密集型线程组。

Clutch 桶组维护几个指标，以允许计算线程组的交互性分数：

* **Clutch 桶组阻塞时间**：维护 Clutch 桶组没有线程可运行的时间量。
* **Clutch 桶组等待时间**：维护此 Clutch 桶组的线程等待执行的时间量。一旦 Clutch 桶组的某个线程被执行，此值就会重置。
* **Clutch 桶组 CPU 时间**：维护此 Clutch 桶组的所有线程使用的 CPU 时间。

基于交互性分数的算法非常适合此级别，原因如下：

* 它允许基于线程组最近行为在它们之间公平共享 CPU。由于算法只查看最近的 CPU 使用历史，因此它也能快速适应变化的行为。
* 由于优先级计算相当便宜，调度器能够维护有关所有线程组的最新信息，从而导致更优的决策。
* 线程组为一起为用户工作负载工作的线程组提供了方便的抽象。基于此抽象进行调度决策允许系统做出有趣的选择，例如优先选择应用程序而不是守护进程，这通常对系统响应性更好。

Clutch 桶运行队列数据结构允许在 Clutch 桶的线程被抢占时将 Clutch 桶插入队列的头部。当从 Clutch 桶中选择线程执行时，运行队列还会在同一优先级级别将 Clutch 桶旋转到运行队列的末尾。这允许系统在同一优先级值的线程组之间高效轮询，特别是在竞争激烈的低 CPU 系统上。

### 线程级别

在最低级别，调度器决定应该选择 Clutch 桶中的哪个线程执行。Clutch 桶中每个可运行线程在运行队列中表示为一个条目，按线程的 `sched_pri` 组织。线程选择算法只需选择运行队列中优先级最高的线程。线程的 `sched_pri` 计算基于传统的 Mach 调度算法，该算法使用负载和 CPU 使用来衰减线程的优先级。线程衰减模型在此级别比全局调度器更适合，因为负载计算仅考虑同一 Clutch 桶组中的线程。由于同一 Clutch 桶组中的所有线程都属于同一线程组和调度桶，因此该算法为 Clutch 桶组中的延迟敏感线程提供快速 CPU 访问，而不会影响系统中其他不相关的线程。

**实现**

线程级调度器实现 Mach 时间共享算法，来决定应该选择 Clutch 桶中的哪个线程执行。Clutch 桶中的所有可运行线程根据 `sched_pri` 插入运行队列。调度器根据 Clutch 桶组中可运行线程的数量和各个线程的 CPU 使用来计算 Clutch 桶组中线程的 `sched_pri`。负载信息在每个调度器 tick 更新，线程在使用 CPU 时使用此信息进行优先级衰减计算。优先级衰减算法试图奖励突发交互线程并惩罚 CPU 密集型线程。一旦选择线程运行，就会为其分配一个量子，这取决于它所属的调度桶。各个桶的量子静态定义为：

```c
static uint32_t sched_clutch_thread_quantum_us[TH_BUCKET_SCHED_MAX] = {
        10000,                                          /* FIXPRI (10ms) */
        10000,                                          /* FG (10ms) */
        8000,                                           /* IN (8ms) */
        6000,                                           /* DF (6ms) */
        4000,                                           /* UT (4ms) */
        2000                                            /* BG (2ms) */
};
```

每桶线程量子允许调度器限制被高优先级线程饥饿的低优先级线程的最坏情况执行延迟。

## 调度器优先级计算

### 根优先级计算

调度器为层次结构维护根级别优先级，以做出有关抢占和线程选择的决策。当线程插入/移出层次结构时，会更新根优先级。根级别还维护紧急位以帮助抢占决策。由于根级别优先级/紧急性用于抢占决策，因此它基于层次结构中的线程并计算如下：

```
Root Priority Calculation:
* If AboveUI bucket is runnable,
*     Compare priority of AboveUI highest clutch bucket (CBUI) with Timeshare FG highest clutch bucket (CBFG)
*     If pri(CBUI) >= pri(CBFG), select CBUI
* Otherwise find the (non-AboveUI) highest priority root bucket that is runnable and select its highest clutch bucket
* Find the highest priority (promoted or base pri) thread within that clutch bucket and assign that as root priority

Root Urgency Calculation:
* On thread insertion into the hierarchy, increment the root level urgency based on thread's sched_pri
* On thread removal from the hierarchy, decrement the root level urgency based on thread's sched_pri
```

### 根桶优先级计算

根桶优先级就是根桶的截止时间，通过将桶的 WCEL 添加到根桶变为可运行的时间戳来计算。

```
root-bucket priority = now + WCEL[bucket]
```

### Clutch 桶优先级计算

如前所述，Clutch 桶的优先级值基于最高可运行线程和交互性分数计算。实际计算算法如下：

```
* Find the highest runnable thread (promoted or basepri) in the clutch bucket (maxpri)
* Calculate the ratio of CPU blocked and CPU used for the clutch bucket.
*      If blocked > used, assign a score (interactivity_score) in the higher range.
*      Else, assign a score (interactivity_score) in the lower range.
* clutch-bucket priority = maxpri + interactivity_score
```

### 线程优先级计算

线程优先级计算基于 Mach 时间共享算法。它按以下方式计算：

```
* Every scheduler tick, snapshot the load for the clutch bucket
* Use the load value to calculate the priority shift values for all threads in the clutch bucket
* thread priority = base priority - (thread CPU usage >> priority shift)
```

## Edge 调度器设计

Edge 调度器实现了在多集群非对称平台上调度所需的所有必要功能。在每个集群上，它使用上述 Clutch 调度器时间共享设计。在线程放置和负载平衡方面，Edge 调度器将机器表示为一个图，其中每个节点是一个计算集群，有向边描述了线程从一个集群迁移到另一个集群的可能性。Edge 调度器与性能控制器密切合作来定义...

### Edge 调度器系统目标

* 系统应该是**紧凑的**。尽可能将小宽度工作负载线程限制在单个集群中。此属性很重要的几个原因：
    * 更好的 LLC 使用。
    * 通过避免昂贵的集群间、芯片间缓存填充来提高性能
    * 功率门控或关闭未使用的 ACC
* 如果工作负载可以使用它们（例如，为了并行性，减轻乘客效应），应该**快速打开集群**，原因如下：
    * 没有暗硅
    * 效率核心为基准测试和吞吐量导向的工作负载提供有意义的性能提升。
* 允许高 QoS 工作**低延迟访问 CPU**。此属性确保高 QoS 线程在激烈的 CPU 竞争下也能体验低调度延迟。
* **仅"向下"迁移**。线程应该迁移到执行效率不会显著更差的集群。这可能是打开新集群的原因（与保持系统紧凑的第一个系统目标相反）。
* 管理**乘客效应**。当共享集群的工作负载的期望性能开始分歧时，一些将支付"乘客税"。在这些情况下，理想情况下分割工作负载以确保平台上的最高效执行。
* 适应**快速变化的工作负载宽度**。

当为 Skye（第一个 AMP 平台）设计调度器和性能控制器时，大部分重点放在跨 E-cores 和 P-cores 划分工作上。线程组、非对称溢出和窃取等概念被发明出来以有效地利用硬件中的这种性能和能效异构性。然而，相同的概念在很大程度上也适用于具有多个同构集群和具有独立 DVFM 域的异构集群的平台。

### Edge 调度器线程放置策略

Edge 调度器使用来自性能控制器的**每线程组建议**和调度器中的**每集群运行队列**。该设计旨在为性能控制器提供影响系统宽度（就集群数量而言）的能力，同时保留调度器在线程风暴期间扩展的能力。

#### 线程组集群建议

调度器期望性能控制器为每个线程组指定集群建议。为了允许更细粒度的线程放置，Edge 调度器允许性能控制器在线程组内为每个 QoS 指定首选集群，即每个 sched_clutch_bucket_group。偏好特定集群而不是集群类型的能力允许性能控制器实现乘客税减少策略并期望类似性能特征的同位置工作负载。

当线程变为可运行时，调度器查看它所属的 sched_clutch_bucket_group 的首选集群建议，并将其用作线程放置的起始决策点。如果首选集群处于空闲或运行较低的 QoS 工作负载，调度器只需选择首选集群来排队线程。否则，调度器使用下一节中描述的线程迁移策略。

当性能控制器更改 sched_clutch_bucket_group 的首选集群时，Edge 调度器还提供了一个选项，可以立即迁移该组的运行和可运行线程（而不是在下一个调度点重新评估首选集群）。性能控制器可以使用此功能来更改延迟敏感工作负载的建议，从效率集群到性能集群，并确保工作负载线程立即放置在新首选的集群上。

#### 线程迁移策略

为了选择可运行线程的集群和处理器，edge 调度器使用线程的 sched_clutch_bucket_group 的首选集群。如果首选集群处于空闲或运行较低的 QoS 工作负载，调度器只需选择首选集群来排队线程。否则，调度器评估从首选集群发出的边以进行迁移决策。

**Edge 调度器边矩阵**

Edge 调度器维护一个线程迁移图，其中每个节点代表一个集群，每个有向边代表跨该边迁移线程的可能性。每个图边编码以下属性：

```c
typedef union sched_clutch_edge {
        struct {
                uint32_t
                /* boolean_t */ sce_migration_allowed : 1,
                /* boolean_t */ sce_steal_allowed     : 1,
                                _reserved             : 30;
                uint32_t        sce_migration_weight;
        };
        uint64_t sce_edge_packed;
} sched_clutch_edge;
```

`sce_migration_allowed` 和 `sce_steal_allowed` 标志指示是否允许跨边迁移和窃取线程。`sce_migration_weight` 是源节点和目标节点（即集群）之间应该存在的调度延迟增量的度量，以便线程被迁移。每集群调度延迟指标在下一节描述。

性能控制器可以动态更新边矩阵的权重和属性，以出于性能和效率原因更改系统的宽度。

**Edge 调度器集群调度延迟指标**

Edge 调度器维护每集群调度延迟指标，指示给定 QoS 的线程在集群上上核的延迟。该指标根源于排队延迟算法，并计算新可运行线程被集群上的核心选中所需的时间量。调度延迟指标使用以下公式计算：

```
Scheduling-Latency(QoS) = Cumulative Higher QoS Load(QoS) * Avg. Execution Latency(QoS)
```

* 累积更高 QoS 负载：累积更高 QoS 负载指标计算在集群上排队或运行的更高或相等 QoS 的可运行和运行线程的数量。这衡量了在获得在集群上执行的机会方面，新变为可运行线程之前的线程数量。
* 平均执行延迟：平均执行延迟指标跟踪特定 QoS 线程的平均执行延迟。此值跟踪此 QoS 的线程在阻塞或上下文切换之前通常做的工作量。

这两个指标都保持为指数移动加权平均值，以确保它们捕获系统上线程的最近行为。每集群调度延迟指标用于根据以下算法决定线程放置：

```
* On thread becoming runnable, get the scheduling latency metric for the thread's QoS and preferred cluster (as specified by CLPC)
* If preferred cluster scheduling latency is 0, return preferred cluster
* Otherwise, for each cluster which is not the preferred cluster,
*    Calculate the scheduling latency metric for the cluster and the thread's QoS
*    If scheduling latency metric is 0, return cluster
*    Otherwise, calulate the scheduling latency delta between the cluster and the preferred cluster
*    If delta is less than the edge weight between preferred cluster and cluster, continue
*    Otherwise, if delta is greater than largest delta, store delta as largest delta
* Return cluster with largest scheduling latency delta
```

上述算法中集群迭代的顺序专门选择同构集群而不是非对称集群，以确保线程在非对称空闲集群之前迁移到具有类似性能特征的空闲集群。

#### 线程窃取/再平衡策略

当处理器在其运行队列中找不到任何线程执行时，将调用 `SCHED(steal_thread)` 调度器调用。窃取操作的目的是找到在其他集群中运行/可运行的其他线程，这些线程应该在此处执行。如果窃取调用未返回线程，`thread_select()` 逻辑将调用 `SCHED(processor_balance)` 调用，该调用应该向其他 CPU 发送 IPI 以重新平衡线程并使当前 CPU 空闲，等待 IPI 的线程将线程重新调度到此 CPU 上。

**Edge 调度器外部线程**

当这些 Clutch 桶在与线程组的首选集群非对称的集群上排队时，Edge 调度器将 Clutch 桶（以及相应地 Clutch 桶中的线程）识别为外部的。外部 Clutch 桶是 Clutch 根的常规层次结构的一部分，但也在根级别维护的特殊"外部"优先级队列中链接。这个外部优先级队列允许其他集群在其本地层次结构运行队列中的线程用完时，轻松地从非对称集群重新平衡线程。

**Edge 调度器窃取实现**

edge 调度器通过 `sched_edge_processor_idle()` 实现窃取操作。此例程按顺序尝试执行以下操作：

```
* (1) Find foreign runnnable threads in non-native cluster runqueues (sched_edge_foreign_runnable_thread_remove())
* (2) Steal a runnable thread from a native cluster runqueue (sched_edge_steal_thread())
* (3) Check if foreign threads are running on the non-native clusters (sched_edge_foreign_running_thread_available())
*     If available, return THREAD_NULL for the steal callout and perform rebalancing as part of SCHED(processor_balance) i.e. sched_edge_balance()
* (4) Steal a thread from another cluster based on sce_steal_allowed & cluster loads (sched_edge_steal_thread())
```

以这种特定顺序执行这些操作的政策是为了确保线程不会在与其首选集群类型不同的集群类型上可运行或执行。如果未找到此类线程，则调度器旨在通过从其他集群窃取线程来减少其他集群上的负载。

**Edge 调度器重新平衡操作**

如果 `SCHED(steal_thread)` 未为处理器返回线程，则表明处理器发现线程在"外部"集群上运行，并希望将其重新平衡到自己身上。实现（`sched_edge_balance()`）向外部 CPU 发送 IPI，使自己空闲并等待外部 CPU 将线程重新平衡到此空闲 CPU 上。

#### 集群共享资源线程管理

Edge 调度器尝试跨集群负载平衡集群共享资源密集型线程，以减少共享资源上的争用。它通过维护每个集群上的可运行和运行共享资源负载并在多个集群之间平衡负载来实现这一点。当前集群共享资源负载平衡的实现在线程可运行时查看每集群负载，以便将线程排入适当的集群。

**集群共享资源线程调度策略**

共享资源的线程可以使用以下两种策略之一进行调度：

* EDGE_SHARED_RSRC_SCHED_POLICY_RR
此策略分布线程，使它们分布在所有可用集群上，无论类型如何。这个调度策略的想法是，它将在平台上的每个集群上放置一个共享资源线程，然后再开始在集群上加倍。
* EDGE_SHARED_RSRC_SCHED_POLICY_NATIVE_FIRST
此策略分布线程，使线程首先填满首选集群及其同构对等点的所有容量，然后再溢出到不同的核心类型。当前实现根据集群中的 CPU 数量定义容量；因此，如果集群上有 n 个 cpu 的集群上有 n 个可运行 + 运行共享资源线程，则认为集群的共享资源已满。此策略与 edge 调度器的默认调度策略不同，因为这总是尝试将本地集群填充到容量，即使非本地集群可能处于空闲状态。

#### 长运行工作负载 AMP 轮询

Edge 调度器实现了一种策略，在各种类型的集群之间轮询长运行工作负载线程，以确保工作负载的所有线程取得同等进展，即"搅拌锅"。这对于在 ncpu 线程之间静态划分工作的工作负载的性能至关重要。当线程在非首选集群上到期量子时（最可能是由于从首选集群迁移/溢出），调度器调用此机制。调度器识别这一点（通过设置 `AST_QUANTUM` 和 `AST_REBALANCE`）并将其排入与首选集群本地集群的队列。在该集群的下一个调度事件中，CPU 将拾取此线程并将之前运行的线程溢出/迁移到非首选集群。为了确保首选集群本地的所有集群都平等地受到这种轮询，调度器为每个 sched_clutch_bucket_group（代表同一 QoS 级别工作负载的所有线程）维护 `scbg_amp_rebalance_last_chosen` 值。

## 总结与思考

XNU 的 Clutch 和 Edge 调度器设计展示了操作系统调度器从传统的基于优先级的时间共享模型向更智能的分层架构演进的过程。核心亮点包括：

**分层设计思想**：通过调度桶、线程组、线程三个层次的抽象，调度器能够同时满足多种目标——高 QoS 工作的低延迟、低 QoS 工作的饥饿避免、以及工作负载之间的公平共享。

**集群感知调度**：Edge 调度器针对 Apple 芯片的 P-core/E-core 异构架构进行了深度优化，通过"乘客效应"管理、仅向下迁移等策略，在性能和功耗之间找到最佳平衡点。

**可扩展性**：整个架构允许性能控制器动态调整调度行为，这意味着同一调度器内核可以适应不同代的芯片设计，为未来的硬件演进提供了灵活性。

对于系统编程爱好者而言，这份文档不仅是了解 XNU 内核的窗口，更是学习现代操作系统调度器设计思想的绝佳材料。EDF 算法的应用、优先级衰减机制、多集群负载平衡等概念，在其他操作系统（如 Linux CFS、Windows UMS）中也能找到对应的实现思路。
