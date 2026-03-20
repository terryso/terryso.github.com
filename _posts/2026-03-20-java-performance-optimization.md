---
layout: post
title: "Java很快，但你的代码可能不快——八个常见性能反模式"
date: 2026-03-20 22:45:01 +0800
categories: tech-translation
description: "修复常见的 Java 反模式可以将应用响应时间从 1,198ms 降到 239ms。本文介绍八种能通过编译和代码审查，却会悄悄消耗 CPU 和堆内存的编码模式。"
original_url: https://jvogel.me/posts/2026/java-is-fast-your-code-might-not-be/
source: Hacker News
---

本文翻译自 [Java Is Fast. Your Code Might Not Be.](https://jvogel.me/posts/2026/java-is-fast-your-code-might-not-be/)，原载于 Hacker News。

---

作者为 DevNexus 大会构建了一个 Java 订单处理应用作为演示。应用运行正常，测试通过。但在进行负载测试并收集 Java Flight Recording (JFR) 后，发现了一些问题：

**优化前**：1,198ms 响应时间，每秒 85,000 个订单，峰值堆内存超过 1GB，19 次 GC 暂停。

**优化后**：239ms 响应时间，每秒 419,000 个订单，139MB 堆内存，4 次 GC 暂停。

同样的应用、同样的测试、同样的 JDK，没有任何架构变更。性能提升了 **5 倍**，堆内存减少了 **87%**，GC 暂停减少了 **79%**。

这些问题的根源是什么？是那些在真实代码库中常见的反模式——它们能通过编译，混过代码审查，如果不借助性能分析工具很难发现。下面是其中的八个。

## TL;DR 八个常见性能反模式

1. **循环中的字符串拼接** — String 不可变性导致的 O(n²) 复制
2. **循环内的 O(n²) Stream 操作** — 每个元素都遍历整个列表
3. **热点路径中的 String.format()** — 最慢的字符串构建方式，每次调用都要解析格式字符串
4. **热点路径中的自动装箱** — 数百万个临时包装对象
5. **用异常控制流程** — fillInStackTrace() 会遍历整个调用栈
6. **过粗的同步范围** — 单一锁成为瓶颈
7. **重复创建可复用对象** — 每次调用都 new ObjectMapper()、DateTimeFormatter 等
8. **虚拟线程钉住问题 (JDK 21–23)** — synchronized + 阻塞 I/O 会钉住载体线程

---

## 1. 循环中的字符串拼接

```java
String report = "";
for (String line : logLines) {
    report = report + line + "\n";
}
```

这段代码看起来没问题吧？问题在于 String 不可变性在实际运行时的表现。

每次使用 `+` 时，Java 都会创建一个全新的 String 对象，完整复制之前所有内容再加上新部分。旧对象被丢弃。这在**每次迭代**都会发生。

被复制的字符数呈 O(n²) 增长。如果有 10,000 行，第 1 次迭代几乎不复制，第 5,000 次迭代复制约 5,000 个字符的累积内容，第 10,000 次迭代复制全部内容。BellSoft 的 JMH 基准测试显示，当 n 增长 4 倍时，循环拼接版本会变慢 7 倍以上——远超线性增长。

**修复方法**：

```java
StringBuilder sb = new StringBuilder();
for (String line : logLines) {
    sb.append(line).append("\n");
}
String report = sb.toString();
```

StringBuilder 基于单个可变字符缓冲区工作。一次分配，每次 append 都写入该缓冲区，最后只调用一次 toString()。

> **注意**：从 JDK 9 开始，编译器足够智能，可以优化单行的 `"Order: " + id + " total: " + amount`。但这个优化不会延伸到循环中。在循环内部，每次迭代仍会创建一个新的 StringBuilder 然后丢弃。必须像上面的修复那样，在循环外部声明它。

---

## 2. 循环内意外产生的 O(n²) Stream 操作

```java
for (Order order : orders) {
    int hour = order.timestamp().atZone(ZoneId.systemDefault()).getHour();
    long countForHour = orders.stream()
        .filter(o -> o.timestamp().atZone(ZoneId.systemDefault()).getHour() == hour)
        .count();
    ordersByHour.put(hour, countForHour);
}
```

这看起来很合理——按小时分组订单。但仔细看：对于每个订单，都要流式遍历整个列表来统计有多少订单属于该小时。如果有 10,000 个订单，那就是 10,000 次迭代 × 10,000 个流元素 = **1 亿次比较**，而本应只需一次遍历。

在作者的演示应用中，这个确切的模式是**最大的 CPU 热点**，在 JFR 记录中占用了近 **71%** 的 CPU 栈样本。

**修复方法**：

```java
for (Order order : orders) {
    int hour = order.timestamp().atZone(ZoneId.systemDefault()).getHour();
    ordersByHour.merge(hour, 1L, Long::sum);
}
```

一次遍历，O(n) 复杂度。每个订单直接增加其小时的计数。也可以用 `Collectors.groupingBy(..., Collectors.counting())` 在单个流管道中完成，但 merge 方法更清晰，而且完全避免了创建流的开销。

> **经验法则**：如果在循环体内看到 `.stream()` 调用，就要停下来检查是否在做冗余工作。

---

## 3. 热点路径中的 String.format()

```java
public String buildOrderSummary(String orderId, String customer, double amount) {
    return String.format("Order %s for %s: $%.2f", orderId, customer, amount);
}
```

`String.format()` 常被推荐为构建字符串的简洁、可读方式。确实可读，但它也是 Java 中**最慢**的字符串构建选项（在频繁调用时）。

Baeldung 对 Java 中所有字符串拼接方式进行了 JMH 基准测试。`String.format()` 在每个类别中都垫底。它每次调用都要解析格式字符串、运行基于正则的 token 匹配，并经过完整的 `java.util.Formatter` 机制处理。StringBuilder 始终是最快的。

**修复方法**：

```java
return "Order " + orderId + " for " + customer + ": $" + String.format("%.2f", amount);
```

只在需要数值格式化的地方使用 `String.format()`，其余部分让编译器优化。或者如果需要完全控制，直接用 StringBuilder。

> **适用场景**：`String.format()` 用于配置加载、启动代码、错误消息等不频繁调用的地方完全没问题。但要把它从性能分析工具标记为热点的代码中移出去。

---

## 4. 热点路径中的自动装箱

```java
Long sum = 0L;
for (Long value : values) {
    sum += value;
}
```

JVM 层面实际发生的是：

```java
Long sum = Long.valueOf(0L);
for (Long value : values) {
    sum = Long.valueOf(sum.longValue() + value.longValue());
}
```

每次迭代都要拆箱 sum 得到 long，相加，然后将结果装箱回新的 Long 对象。百万级元素意味着创建了百万个 Long 对象等待 GC 清理。每个 Long 在 64 位 JVM 上大约占用 16 字节堆内存。对于一个简单的加法循环，这是 **16MB 的堆内存抖动**。

**修复方法**：

```java
long sum = 0L; // 基本类型，不是包装类
for (long value : values) {
    sum += value;
}
```

**这个问题的常见来源**：聚合和处理循环。汇总指标、累积计数器、构建统计数据。包装类型悄悄混入是因为有人在上游的集合签名中使用了 `Long`，而没人考虑循环中下游的代价。这确实容易被忽略。

> **警惕**：注意 `Integer`、`Long` 或 `Double` 被用作局部循环变量或累加器。还要注意频繁调用代码中的 `List<Long>` 和 `Map<String, Integer>`。每个 `.get()` 和 `.put()` 都涉及静默的装箱/拆箱开销。

---

## 5. 用异常控制流程

```java
public int parseOrDefault(String value, int defaultValue) {
    try {
        return Integer.parseInt(value);
    } catch (NumberFormatException e) {
        return defaultValue;
    }
}
```

如果这个方法在紧密循环中被调用，且有相当比例的非数字输入，就会有一个看起来不像性能问题的性能问题。

昂贵部分是 `Throwable.fillInStackTrace()`，它在每次创建异常时都会在 Throwable 构造函数内运行。它通过 native 方法遍历整个调用栈，并将其具象化为 StackTraceElement 对象。调用栈越深，代价越高。想象一下 Spring 这类框架中调用栈可能非常深的情况。Netty 项目的 Norman Maurer 对此做过基准测试，差异显著。Baeldung 的 JMH 结果显示，抛出异常会使方法运行速度比正常返回路径慢数百倍。

这不是理论。有一个真实的案例：一个 Scala/JVM 模板系统在发现每次模板渲染的每个字段都抛出 NumberFormatException 后，将响应时间缩短了 3 倍。每次测试字段名是否为数字索引时，都会抛出异常。

**修复方法**：

```java
public int parseOrDefault(String value, int defaultValue) {
    if (value == null || value.isBlank()) return defaultValue;
    for (int i = 0; i < value.length(); i++) {
        char c = value.charAt(i);
        if (i == 0 && c == '-') continue;
        if (!Character.isDigit(c)) return defaultValue;
    }
    return Integer.parseInt(value);
}
```

或者如果 classpath 中已有 Apache Commons Lang，可以使用 `NumberUtils.isParsable()`。

> **原则**：如果无效输入在你的应用中是常规情况——用户提供的数据、外部数据源、任何你不能完全控制的东西——请显式预验证。异常用于真正意外的情况，而不是"格式可能不对"。

---

## 6. 过粗的同步范围

```java
public class MetricsCollector {
    private final Map<String, Long> counts = new HashMap<>();

    public synchronized void increment(String key) {
        counts.merge(key, 1L, Long::sum);
    }

    public synchronized long getCount(String key) {
        return counts.getOrDefault(key, 0L);
    }
}
```

共享可变状态需要保护。但整个方法上的 `synchronized` 意味着任何时刻只有一个线程可以调用任一方法。在处理真实并发的服务中，每个调用 `increment()` 的线程都要排队等待其他线程完成。锁本身就变成了瓶颈。

**修复方法**：

```java
private final ConcurrentHashMap<String, LongAdder> counts = new ConcurrentHashMap<>();

public void increment(String key) {
    counts.computeIfAbsent(key, k -> new LongAdder()).increment();
}

public long getCount(String key) {
    LongAdder adder = counts.get(key);
    return adder == null ? 0L : adder.sum();
}
```

`ConcurrentHashMap` 无需锁定整个结构就能处理并发读写。`LongAdder` 专门为高并发计数设计，它将计数器分布到内部单元中，在竞争情况下比 `AtomicLong` 性能更好。

> **补充**：`Collections.synchronizedMap()` 包装器有同样的粗锁问题——整个 map 一把锁。`ConcurrentHashMap` 几乎总是正确的替代方案。

---

## 7. 重复创建"可复用"对象

```java
public String serializeOrder(Order order) throws JsonProcessingException {
    return new ObjectMapper().writeValueAsString(order);
}
```

`ObjectMapper` 是最常见的例子——看起来创建成本很低，实际不然。构造一个 ObjectMapper 涉及模块发现、序列化器缓存初始化、配置加载。在这个写法中，每次调用都要做这些工作。

同样的模式还有 `DateTimeFormatter.ofPattern("...")`、`new Gson()`、`new XmlMapper()`。它们都设计为构造一次后复用。在热点方法中创建它们意味着每次调用都要支付初始化成本。

**修复方法**：

```java
private static final ObjectMapper MAPPER = new ObjectMapper();

public String serializeOrder(Order order) throws JsonProcessingException {
    return MAPPER.writeValueAsString(order);
}
```

`ObjectMapper` 配置完成后是线程安全的，所以共享一个 `static final` 实例没问题。`DateTimeFormatter` 的内置实例如 `DateTimeFormatter.ISO_LOCAL_DATE` 已经是单例。如果在热点方法中调用 `DateTimeFormatter.ofPattern("...")`，把它移到常量中。

> **启发式规则**：如果一个对象的构造函数做了大量初始化工作，且该对象在构造后是无状态的（或可安全共享），它应该是一个字段或常量，而不是局部变量。

---

## 8. 虚拟线程钉住问题 (JDK 21–23)

如果你已经开始使用 Java 21 作为生产功能引入的虚拟线程，这一点值得关注。

虚拟线程通过挂载到一小池称为载体线程的平台（OS）线程上工作。当虚拟线程阻塞（例如等待 I/O）时，调度器会将其从载体上卸载，释放该载体去运行其他任务。这就是虚拟线程可扩展性的全部故事。

但有个问题。当虚拟线程进入 synchronized 块并在其中遇到阻塞操作时，它无法被卸载。它会**钉住载体线程**。那个平台线程现在只能等待，无法服务其他虚拟线程，直到阻塞操作完成。

```java
// 这个模式在 JDK 21 上可能钉住载体线程
public synchronized String fetchData(String key) throws IOException {
    return Files.readString(Path.of("/data/" + key)); // synchronized 内的阻塞 I/O
}
```

如果这种情况频繁发生，所有载体线程都会被钉住，应用程序就会停滞，即使有数千个虚拟线程等待工作。Netflix 在生产环境中遇到过这个问题并写了调试文章。

JFR 实际上会告诉你这种情况。`jdk.VirtualThreadPinned` 事件在虚拟线程被钉住时阻塞会触发，默认只在操作超过 20ms 时才触发，所以已经过滤到真正有影响的情况。

**JDK 21–23 的修复方法**：

```java
private final ReentrantLock lock = new ReentrantLock();

public String fetchData(String key) throws IOException {
    lock.lock();
    try {
        return Files.readString(Path.of("/data/" + key));
    } finally {
        lock.unlock();
    }
}
```

`ReentrantLock` 不使用操作系统级别的对象监视器，所以当虚拟线程阻塞时，JVM 可以正常卸载它，而不是钉住它。

> **JDK 24 说明**：JEP 491（Java 24 中发布）很大程度上解决了这个问题。在 JDK 24+ 上，synchronized 在大多数情况下不再导致钉住。如果还在 21、22 或 23 上，这仍然值得用 JFR 检查。如果在 24 上，大多不需要担心 synchronized 的问题，不过 native 方法调用仍可能导致钉住。

---

## 复合效应

这些模式都不会让应用崩溃。它们不会抛出异常或产生错误结果。它们只是让一切变慢一点，消耗更多内存，扩展性比应该的更差。

让它们在没有性能分析的情况下难以发现的是：其中任何一个在你的代码库中可能完全无害。启动时运行一次的循环中字符串拼接不会花费任何代价。一天调用两次的工具类中的 `String.format()` 没问题。问题在于当这些模式落在**热点路径**中——每个请求、每个事件、主处理循环的每次迭代都运行的代码。

在演示应用中，这些模式（以及其他一些）将一个 239ms 的操作变成了 1,198ms，将堆使用从 139MB 推高到超过 1GB。没有单个模式是灾难性的，但：

- 修复堆压力后，GC 暂停从 19 次降到 4 次
- 修复竞争后，之前被噪声掩盖的新热点变得可见
- 性能分析图的形状在变化

而且这些改进会在单个应用之外继续复合。有些优化在单个实例或测试套件运行时间上看可能微不足道。但在真实世界中，Java 代码通常不在一台机器上运行。在生产环境中，应用在集群上运行，处理大量真实客户请求。在一台主机上节省几毫秒或减少堆压力的改进，会同时在数千台主机上发生。在那个规模上，总体差异是惊人的——吞吐量提升加上集群实例缩容，成本影响可能非常显著。

---

## 关键要点

1. **循环内字符串拼接**：使用 `StringBuilder`，声明在循环外部
2. **Stream 在循环内**：警惕 O(n²) 复杂度，考虑用 `Map.merge()` 单次遍历
3. **String.format()**：保留给非热点代码，热点路径用 StringBuilder
4. **自动装箱**：循环变量和累加器用基本类型
5. **异常控制流程**：预验证输入，异常用于真正意外的情况
6. **粗粒度同步**：使用 `ConcurrentHashMap` + `LongAdder` 替代 synchronized HashMap
7. **重复创建对象**：ObjectMapper、DateTimeFormatter 等应是 static final 常量
8. **虚拟线程钉住**：JDK 21-23 上 synchronized 内避免阻塞 I/O，用 ReentrantLock

最后，性能优化需要基于数据而非猜测。使用 JFR (Java Flight Recorder) 进行性能分析，让数据告诉你优化哪里。
