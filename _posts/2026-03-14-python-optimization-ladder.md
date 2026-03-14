---
layout: post
title: "Python 性能优化阶梯：从升级版本到 Rust 的完整指南"
date: 2026-03-14 23:35:50 +0800
categories: tech-translation
description: "Python 在基准测试中比 C 慢 21-875 倍，但通过正确的优化手段可以获得高达 1633 倍的加速。这篇文章系统性地测试了从 CPython 升级到 Rust 的每一级优化阶梯，给出了真实的性能数据和投入成本分析。"
original_url: https://cemrehancavdar.com/2026/03/10/optimization-ladder/
source: Hacker News
---

本文翻译自 [The Optimization Ladder](https://cemrehancavdar.com/2026/03/10/optimization-ladder/)，原载于 Hacker News。

---

每年都有人发布基准测试，显示 Python 比 C 慢 100 倍。争论总是相同的：一方说"基准测试不重要，真实应用是 I/O 密集型的"，另一方说"用真正的语言吧"。两边都错了。

作者选取了两个最常被引用的 Benchmarks Game 问题——**n-body** 和 **spectral-norm**——在本地复现，并测试了所有能找到的优化工具。然后又添加了第三个基准测试——一个 JSON 事件管道——来测试更接近真实场景的代码。

相同的问题，相同的 Apple M4 Pro，真实的数字。这是一个开发者的优化之旅，而非权威排名。完整代码在 [faster-python-bench](https://github.com/cavdar/faster-python-bench)。

先看起点——CPython 3.13 在官方 Benchmarks Game 上的表现：

| 基准测试 | C gcc | CPython 3.13 | 倍数 |
| --- | --- | --- | --- |
| n-body (50M) | 2.1s | 372s | **177x** |
| spectral-norm (5500) | 0.4s | 350s | **875x** |
| fannkuch-redux (12) | 2.1s | 311s | **145x** |
| mandelbrot (16000) | 1.3s | 183s | **142x** |
| binary-trees (21) | 1.6s | 33s | **21x** |

问题不在于 Python 在计算上是否慢——确实慢。问题在于每种修复方案的成本是多少，能带来多少提升。这就是"优化阶梯"的意义。

## 为什么 Python 慢

通常的嫌疑对象是 GIL、解释执行和动态类型。这三者都有影响，但都不是根本原因。真正的原因是 Python 被设计为**最大程度动态**——你可以在运行时 monkey-patch 方法、替换内置函数、在实例存在时改变类的继承链——这种设计使得它**从根本上难以优化**。

C 编译器看到两个整数之间的 `a + b`，会发出一条 CPU 指令。Python VM 看到 `a + b` 必须问：`a` 是什么？`b` 是什么？`a.__add__` 存在吗？自上次调用以来它被替换过吗？`a` 实际上是重写了 `__add__` 的 `int` 子类吗？每个操作都要经过这个分发过程，因为语言**保证**你可以在任何时候改变任何东西。

对象开销是这一点的具体体现。在 C 中，一个整数是栈上的 4 字节。在 Python 中：

```
C int:        [    4 bytes    ]

Python int:   [ ob_refcnt  8B ]    引用计数
              [ ob_type    8B ]    指向类型对象的指针
              [ ob_size    8B ]    数字位数
              [ ob_digit   4B ]    实际值
              ─────────────────
              = 至少 28 字节
```

4 字节的数值，24 字节用于支持动态性的机制。`a + b` 意味着：解引用两个堆指针、查找类型槽、分发到 `int.__add__`、为结果分配新的 `PyObject`（除非命中小整数缓存）、更新引用计数。CPython 3.11+ 通过自适应特化（adaptive specialization）缓解了这个问题——热点字节码如 `BINARY_OP_ADD_INT` 可以跳过已知类型的分发——但在通用情况下开销仍然存在。一个数字不慢。循环中的数百万个就慢了。

**GIL（全局解释器锁）经常被指责，但它对单线程性能没有影响**——只有当多个 CPU 密集型线程竞争解释器时才重要。对于本文的基准测试，GIL 无关紧要。CPython 3.13 发布了实验性的自由线程模式（`--disable-gil`）——在 3.14 中仍是实验性的——但我们会看到，它实际上让单线程代码**更慢**，因为移除 GIL 给每次引用计数操作增加了开销。

解释开销是真实存在的，但正在被积极解决。CPython 3.11 的 Faster CPython 项目添加了自适应特化——VM 检测"热点"字节码并用类型特化版本替换它们，跳过部分分发。这带来了约 1.4 倍的提升。CPython 3.13 更进一步，引入了实验性的 copy-and-patch JIT 编译器——一个轻量级 JIT，通过拼接预编译的机器码模板而不是从头生成代码。它不是像 V8 的 TurboFan 那样的完整优化 JIT，也不是像 PyPy 那样的追踪 JIT；它的设计目标是小型且快速启动，避免历史上阻止 CPython 走这条路的重型 JIT 启动成本。3.13 的早期结果显示在大多数基准测试上没有改进，但基础设施已经就位，为未来版本的更激进优化铺平了道路。

所以总结是：**Python 慢是因为它的动态设计需要在每个操作上进行运行时分发**。GIL、解释器、对象模型——这些都是那个设计选择的结果。阶梯的每一级都移除了部分分发。爬得越高，绕过得越多——成本也越高。

---

## 第 0 级：升级 CPython

**成本：更改基础镜像。收益：最高 1.4 倍。**

| 版本 | N-body | vs 3.14 | Spectral-norm | vs 3.14 |
| --- | --- | --- | --- | --- |
| CPython 3.10 | 1,663ms | 0.75x | 16,826ms | 0.83x |
| CPython 3.11 | 1,200ms | 1.04x | 13,430ms | 1.05x |
| CPython 3.13 | 1,134ms | 1.10x | 13,637ms | 1.03x |
| CPython 3.14 | 1,242ms | 1.0x | 14,046ms | 1.0x |
| CPython 3.14t (free-threaded) | 1,513ms | 0.82x | 14,551ms | 0.97x |

关键故事是 **3.10 到 3.11**：n-body 上 1.39 倍的免费加速。这就是 Faster CPython 项目——字节码的自适应特化、内联缓存、零成本异常。3.13 又挤出了一点。3.14 在这些基准测试上略有回退。

Free-threaded Python（3.14t）在单线程代码上**更慢**。GIL 移除给每次引用计数操作增加了开销。只有当你有真正并行的 CPU 密集型线程时才值得。

这一级不花任何成本。如果你还在 3.10，升级吧。

---

## 第 1 级：替代运行时（PyPy, GraalPy）

**成本：切换解释器。收益：6-66 倍。**

|  | N-body | Spectral-norm |
| --- | --- | --- |
| CPython 3.14 | 1,242ms | 14,046ms |
| GraalPy | 211ms (**5.9x**) | 212ms (**66x**) |
| PyPy | 98ms (**13x**) | 1,065ms (**13x**) |

两者都是 JIT 编译的运行时，从未修改的 Python 生成原生机器码。零代码更改。只是不同的解释器。

PyPy 使用追踪 JIT——它记录热点循环并编译它们。GraalPy 运行在 GraalVM 的 Truffle 框架上，使用基于方法的 JIT。PyPy 在 n-body 上胜出（13x vs 5.9x），但 GraalPy 在 spectral-norm 上占主导（66x vs 13x）——矩阵密集的内循环正好发挥 GraalVM 的优势。GraalPy 还提供 Java 互操作，由 Oracle 积极开发。

问题在于：生态系统兼容性。两者都支持主要包，但 C 扩展通过兼容层运行，可能比 CPython 慢。GraalPy 目前是 Python 3.12（还没有 3.14），启动慢——它是基于 JVM 的，所以 JIT 需要预热才能达到峰值性能。对于具有长时间运行热点循环的纯 Python 代码——这些是免费的加速。

---

## 第 2 级：Mypyc

**成本：你可能已经有的类型注解。收益：2.4-14 倍。**

|  | N-body | Spectral-norm |
| --- | --- | --- |
| CPython 3.14 | 1,242ms | 14,046ms |
| Mypyc | 518ms (**2.4x**) | 990ms (**14x**) |

Mypyc 使用与 mypy 相同的类型分析将类型注解的 Python 编译为 C 扩展。没有新语法，没有新语言——只是你现有的有类型 Python，提前编译。

```python
# 已经是有效的有类型 Python -- mypyc 将其编译为 C
def advance(dt: float, n: int, bodies: list[Body], pairs: list[BodyPair]) -> None:
    dx: float
    dy: float
    dz: float
    dist_sq: float
    dist: float
    mag: float
    for _ in range(n):
        for (r1, v1, m1), (r2, v2, m2) in pairs:
            dx = r1[0] - r2[0]
            dy = r1[1] - r2[1]
            dz = r1[2] - r2[2]
            dist_sq = dx * dx + dy * dy + dz * dz
            dist = math.sqrt(dist_sq)
            mag = dt / (dist_sq * dist)
            # ...
```

与基线的区别：在每个局部变量上显式类型声明，这样 mypyc 可以使用 C 原语而不是 Python 对象，以及将 `** (-1.5)` 分解为 `sqrt()` + 算术以避免慢速幂运算分发。就是这样——没有特殊装饰器，除了 `mypycify()` 之外没有新的构建系统。

mypy 项目本身——约 10 万多行 Python——通过用 mypyc 编译实现了 4 倍的端到端加速。官方文档说现有注解代码可获得"1.5x 到 5x"，为编译调优的代码可获得"5x 到 10x"。spectral-norm 结果（14x）超出该范围，因为内循环是纯算术运算，mypyc 直接编译为 C。

约束：mypyc 支持 Python 的一个子集。动态模式如 `**kwargs`、`getattr` 技巧和高度鸭子类型的代码会编译但不会被优化——它们回退到慢速通用路径。但如果你的代码已经通过 mypy strict 模式，mypyc 是阶梯上成本最低的编译级。

---

## 第 3 级：NumPy

**成本：了解 NumPy。收益：最高 520 倍。**

|  | Spectral-norm |
| --- | --- |
| CPython 3.14 | 14,046ms |
| NumPy | 27ms (**520x**) |

520 倍。比我们在同一问题上的单线程 Rust（154x）还快——不过 NumPy 委托给 BLAS，后者使用多核。

Spectral-norm 是矩阵-向量乘法。NumPy 预先计算矩阵一次，然后委托给 BLAS（macOS 上的 Apple Accelerate）：

```python
a = build_matrix(n)
for _ in range(10):
    v = a.T @ (a @ u)
    u = a.T @ (a @ v)
```

每个 `@` 都是对手工优化的 BLAS 的单次调用，带有 SIMD 和多线程。NumPy 用 O(N²) 内存换取 O(N) 内存——它存储完整的 2000x2000 矩阵（30MB）——但计算是在编译的 C/C++ 中完成的（macOS 上的 Apple Accelerate，Linux 上的 OpenBLAS 或 MKL），而不是 Python。

这是人们说"Python 慢"时忽略的教训。Python 作为循环运行器是慢的。Python 作为编译库的编排者，与任何东西一样快。

约束：你的问题必须适合向量化操作。逐元素数学、矩阵代数、归约、条件（`np.where` 计算两个分支并掩盖结果——冗余工作，但在大数组上仍然比 Python 循环快）——NumPy 处理所有这些。它帮不上忙的：每步馈送到下一步的顺序依赖、递归结构，以及 NumPy 的每次调用开销比计算本身成本更高的小数组。

---

## 插曲：JAX

**成本：将循环重写为 `jax.lax.fori_loop` + 数组操作。收益：12-1,633 倍。**

一位 Reddit 评论者（justneurostuff）建议测试 JAX——一个使用 XLA JIT 编译的数组计算库。我预期它会落在 NumPy 附近。我错了。

|  | N-body | Spectral-norm |
| --- | --- | --- |
| CPython 3.14 | 1,242ms | 14,046ms |
| NumPy | -- | 27ms (**520x**) |
| JAX JIT | 100ms (**12.2x**) | 8.6ms (**1,633x**) |

8.6ms 在 spectral-norm 上。这比 NumPy 快 3 倍，是整篇文章中最快的结果。在 n-body 上，12.2x——介于 Mypyc 和 Numba 之间。两个结果都与 CPython 基线匹配到小数点后 9 位。这是单线程的——强制单线程在 spectral-norm 上给出 9.1ms vs 8.6ms。

问题：JAX 是一种不同的编程模型。Python 循环变成 `lax.fori_loop`。条件变成 `lax.cond`。你写的函数式数组程序恰好使用 Python 语法——更接近领域特定语言而非即插即用的优化器。但如果你的问题适合，数字不言自明。

---

## 第 4 级：Numba

**成本：`@njit` + 将数据重组为 NumPy 数组。收益：56-135 倍。**

|  | N-body | Spectral-norm |
| --- | --- | --- |
| CPython 3.14 | 1,242ms | 14,046ms |
| Numba @njit | 22ms (**56x**) | 104ms (**135x**) |

Numba 通过 LLVM 将装饰的函数 JIT 编译为机器码：

```python
@njit(cache=True)
def advance(dt, n, pos, vel, mass):
    for i in range(n):
        for j in range(i + 1, n):
            dx = pos[i, 0] - pos[j, 0]
            dy = pos[i, 1] - pos[j, 1]
            dz = pos[i, 2] - pos[j, 2]
            dist = sqrt(dx * dx + dy * dy + dz * dz)
            mag = dt / (dist * dist * dist)
            vel[i, 0] -= dx * mag * mass[j]
            # ...
```

一个装饰器。将数据重组为 NumPy 数组。约束：Numba 最适合 NumPy 数组和数值类型。它对有类型字典、有类型列表和 `@jitclass` 的支持有限，但字符串和通用 Python 对象基本无法触及。它是手术刀，不是锯子。

---

## 第 5 级：Cython

**成本：学习 C 的心智模型，用 Python 语法表达。收益：99-124 倍。**

|  | N-body | Spectral-norm |
| --- | --- | --- |
| CPython 3.14 | 1,242ms | 14,046ms |
| Cython | 10ms (**124x**) | 142ms (**99x**) |

n-body 上 124 倍。与 Rust 相差 10% 以内。但关于这一级的事实是：

**我的第一个 Cython n-body 只得到了 10.5 倍。**同样的 Cython，同样的编译器。最终版本得到了 124 倍。差异是三个地雷，没有一个产生警告：

- Cython 的 `**` 运算符与浮点指数。即使有类型化的 double 和 `-ffast-math`，`x ** 0.5` 在 Cython 中比 `sqrt(x)` 慢 40 倍——该运算符通过慢速分发路径而不是编译为 C 的 `sqrt()`。n-body 基线使用 `** (-1.5)`，无法用单次 `sqrt()` 调用替换——它需要将公式分解为 `sqrt()` + 算术。**整体基准测试 7 倍的惩罚。**
- 预计算的配对索引数组阻止 C 编译器展开嵌套循环。**2 倍惩罚。**"聪明"的版本更慢。
- 缺少 `@cython.cdivision(True)` 在内循环的每次浮点除法前插入零除检查。数百万个从未发生的分支。

Cython 的承诺是"让为 Python 编写 C 扩展像 Python 本身一样容易"。实际上这意味着：学习 C 的心智模型，用 Python 语法表达，并使用注解报告（`cython -a`）验证编译器做了你认为的事。

回报是真实的——99-124 倍，匹配编译语言。但失败模式是静默的。所有三个地雷都静默地让你付出代价，注解报告是唯一能捕获它们的方法。

---

## 第 6 级：新浪潮

**成本：新工具链、粗糙的边缘、生态系统缺口。收益：26-198 倍。**

三个工具承诺将 Python（或类 Python 代码）编译为原生机器码。我测试了所有三个。

|  | N-body | 加速 | Spectral-norm | 加速 | 问题所在 |
| --- | --- | --- | --- | --- | --- |
| Codon 0.19 | 47ms | **26x** | 99ms | **142x** | 自己的运行时、有限的 stdlib、有限的 CPython 互操作 |
| Mojo nightly | 16ms | **78x** | 118ms | **119x** | 新语言（1.0 前）、需要完全重写 |
| Taichi 1.7 | 16ms | **78x** | 71ms | **198x** | 仅支持 Python 3.13（没有 3.14 wheels） |

数字是真实的。开发者体验是粗糙的。Codon 无法导入你现有的代码。Mojo 是穿着 Python 衣服的新语言。Taichi 有最好的 spectral-norm 结果（198x）但**没有为 Python 3.14 发布 wheels**——上面的数字是在单独的 Python 3.13 环境上基准测试的。这就是这些工具的妥协：如果你的运行时跟不上 CPython 发布，你就被困在旧版本上或者要在多个环境间周旋。

没有一个是可以直接替换的。都值得观望。

---

## 第 7 级：通过 PyO3 使用 Rust

**成本：学习 Rust。收益：113-154 倍。**

|  | N-body | Spectral-norm |
| --- | --- | --- |
| CPython 3.14 | 1,242ms | 14,046ms |
| Rust (PyO3) | 11ms (**113x**) | 91ms (**154x**) |

阶梯的顶端。但注意：在 n-body 上，Cython 的 10ms vs Rust 的 11ms——它们基本打平。两者都编译为原生机器码。剩余的差异是噪声，不是根本性的语言差距。

Rust 的真正优势不是原始速度——而是**管道所有权**。当 Rust 通过 serde 直接将 JSON 解析为有类型结构体时，它从不创建 Python dict。它完全绕过 Python 对象系统。这在下一个基准测试上更重要。

---

## 天花板

Benchmarks Game 问题是纯计算：紧密循环、无 I/O、除数组外无数据结构。大多数 Python 代码看起来完全不是那样。所以我构建了第三个基准测试：加载 100K 个 JSON 事件、过滤、转换、按用户聚合。字典、字符串、日期时间解析——这种代码让 Numba 无用，让 Cython 与 Python 对象系统搏斗。

首先，每个工具都从预解析的 Python dict 开始——相同的输入，相同的工作：

| 方法 | 时间 | 加速 | 代价 |
| --- | --- | --- | --- |
| CPython 3.14 | 48ms | 1.0x | 无 |
| Mypyc | 21ms | 2.3x | 类型注解 |
| Cython (dict 优化) | 12ms | 4.1x | 数天的注解工作 |

4.1 倍。不是 50 倍。瓶颈是**Python dict 访问**。即使 Cython 的完全优化版本——`@cython.cclass`、计数器的 C 数组、直接 CPython C-API 调用（`PyList_GET_ITEM`、带借用引用的 `PyDict_GetItem`）——仍然通过 Python C API 读取输入 dict。

等等——为什么要给 Cython 喂 Python dict？`json.loads()` 花费约 57ms 创建这些 dict。那比整个基线管道还多。如果 Cython 自己读取原始字节会怎样？

我写了第二个 Cython 管道，调用 yyjson——一个通用 C JSON 解析器，与 Rust 的 serde_json 相当。两者都是模式无关的：它们解析任何有效的 JSON，不只是我们的事件格式。Cython 用 C 指针遍历解析树、过滤并聚合到 C 结构体，只为最终输出构建 Python dict。对于 Rust，使用惯用的 serde 与零拷贝反序列化。两者端到端拥有数据：

| 方法 | 时间 | 加速 | 代价 |
| --- | --- | --- | --- |
| CPython 3.14 (json.loads + pipeline) | 105ms | 1.0x | 无 |
| Mypyc (json.loads + pipeline) | 77ms | 1.4x | 类型注解 |
| Cython (json.loads + pipeline) | 67ms | 1.6x | C-API dict 访问 |
| Rust (serde, from bytes) | 21ms | **5.0x** | 新语言 + 绑定 |
| Cython (yyjson, from bytes) | 17ms | **6.3x** | C 库 + Cython 声明 |

**Cython 6.3 倍，Rust 5.0 倍。**天花板从来不是管道代码——是 `json.loads()`。两种方法都使用通用 JSON 解析器——Cython 端的 yyjson，Rust 端的 serde——两者都在热点循环中完全避免 Python 对象：Cython 将 yyjson 的 C 树遍历到 C 结构体，Rust 通过 serde 反序列化到原生结构体。

我不是在声称 Cython 比 Rust 快或反之。一个足够有动力的人可以让任何一个更快——交换解析器、调整分配器、重构管道。重点不是哪个工具赢得这个特定基准测试。重点是**你愿意爬多少级**。一旦绕过 `json.loads()`，两者都落在相同的邻域。

---

## 完整成绩单

### N-body（500K 次迭代，紧密浮点循环）

| 方法 | 时间 | 加速 | 代价 |
| --- | --- | --- | --- |
| CPython 3.10 | 1,663ms | 0.75x | 旧版本 |
| CPython 3.14 | 1,242ms | 1.0x | 无 |
| CPython 3.14t | 1,513ms | 0.82x | 无 GIL 但单线程更慢 |
| Mypyc | 518ms | 2.4x | 类型注解 |
| GraalPy | 211ms | 5.9x | 仅 Python 3.12、生态系统兼容性 |
| JAX JIT | 100ms | 12.2x | 将循环重写为 `lax.fori_loop` |
| PyPy | 98ms | 13x | 生态系统兼容性 |
| Codon | 47ms | 26x | 独立运行时、有限 stdlib |
| Numba | 22ms | 56x | `@njit` + NumPy 数组 |
| Taichi | 16ms | 78x | 仅 Python 3.13（无 3.14 wheels） |
| Mojo | 16ms | 78x | 新语言 + 工具链 |
| Cython | 10ms | 124x | C 知识 + 地雷 |
| Rust (PyO3) | 11ms | 113x | 学习 Rust |

### Spectral-norm（N=2000，矩阵-向量乘法）

| 方法 | 时间 | 加速 | 代价 |
| --- | --- | --- | --- |
| CPython 3.10 | 16,826ms | 0.83x | 旧版本 |
| CPython 3.14 | 14,046ms | 1.0x | 无 |
| CPython 3.14t | 14,551ms | 0.97x | 无 GIL 但单线程更慢 |
| Mypyc | 990ms | 14x | 类型注解 |
| GraalPy | 212ms | 66x | 仅 Python 3.12、生态系统兼容性 |
| PyPy | 1,065ms | 13x | 生态系统兼容性 |
| Codon | 99ms | 142x | 独立运行时、有限 stdlib |
| Numba | 104ms | 135x | `@njit` + NumPy 数组 |
| Mojo | 118ms | 119x | 新语言 + 工具链 |
| Rust (PyO3) | 91ms | 154x | 学习 Rust |
| Cython | 142ms | 99x | C 知识 + 地雷 |
| Taichi | 71ms | 198x | 仅 Python 3.13（无 3.14 wheels） |
| NumPy | 27ms | 520x | 了解 NumPy + O(N²) 内存 |
| JAX JIT | 8.6ms | 1,633x | 将循环重写为 `lax.fori_loop` |

### JSON 管道（100K 事件，从原始字节端到端）

| 方法 | 时间 | 加速 | 代价 |
| --- | --- | --- | --- |
| CPython 3.14 (json.loads + pipeline) | 105ms | 1.0x | 无 |
| Mypyc (json.loads + pipeline) | 77ms | 1.4x | 类型注解 |
| Cython (json.loads + pipeline) | 67ms | 1.6x | C-API dict 访问 |
| Rust (serde, from bytes) | 21ms | 5.0x | 新语言 + 绑定 |
| Cython (yyjson, from bytes) | 17ms | 6.3x | C 库 + Cython 声明 |

---

## 什么时候该停下来

努力曲线是指数级的。Mypyc（2.4-14x）成本是类型注解。PyPy/GraalPy（6-66x）成本是二进制替换。Numba（56-135x）成本是一个装饰器和数据重组。JAX（12-1,633x）成本是函数式重写代码。Cython（99-124x）成本是数天和 C 知识。Rust（113-154x）成本是学习一门新语言。

**先升级。**3.10 到 3.11 给你免费的 1.4 倍。

**有类型代码库用 Mypyc。**如果你的代码已经通过 mypy strict，编译它。n-body 上 2.4x，spectral-norm 上 14x，几乎不用工作。

**可向量化数学用 NumPy。**如果你的问题是矩阵代数或逐元素操作，NumPy 用你已经知道的代码给你 520 倍。

**如果能函数式表达用 JAX。**与 NumPy 相同的数组范式，但 XLA 全图编译将 spectral-norm 带到了 1,633x——比 NumPy 快 3 倍。成本是将循环重写为 `lax.fori_loop`、条件为 `lax.cond`。

**数值循环用 Numba。**`@njit` 用一个装饰器和诚实的错误信息给你 56-135x。

**懂 C 用 Cython。**99-124x 是真实的，但失败模式是静默的慢。

**需要管道所有权用 Rust。**在纯计算上，Cython 和 Rust 不相上下。真正的优势是当 Rust 端到端拥有数据流时。

**纯 Python 用 PyPy 或 GraalPy。**零代码更改获得 6-66x 是了不起的，如果你的依赖支持的话。GraalPy 的 spectral-norm 结果（66x）可以媲美编译解决方案。

**大多数代码不需要这些。**管道基准——三个中最现实的——从 Python dict 开始时最高达到 4.1x。当 Cython 调用 yyjson 并拥有字节时是 6.3x。如果你的热路径是 `dict[str, Any]`，答案可能是"停止创建 dict"，而不是"改变语言"。如果你的代码是 I/O 密集型的，这些都不重要。

**优化前先分析。**用 `cProfile` 找到函数。用 `line_profiler` 找到行。然后选择正确的阶梯级。

---

## 总结

这篇文章最核心的洞见是：**Python 慢的本质是动态性带来的运行时分发开销**，而非简单的"解释执行"或"GIL"。每一级优化阶梯都在消除部分分发：

1. **升级版本**（1.4x）——零成本，必须做
2. **Mypyc**（2.4-14x）——如果已有类型注解，几乎免费
3. **NumPy/JAX**（520-1633x）——适合向量化问题，性价比最高
4. **Numba**（56-135x）——数值循环的利器，一个装饰器搞定
5. **Cython/Rust**（99-154x）——天花板级别，但成本也最高

对于国内开发者，我建议从 **NumPy + Numba** 组合开始，覆盖了大部分数值计算场景。如果你已经在用类型注解（mypy），加上 mypyc 编译是唾手可得的加速。Rust 虽然性能天花板最高，但学习曲线陡峭，建议只在确实需要"管道所有权"——完全控制数据流——的场景下考虑。

最后记住：**先 profile，再 optimize**。大多数代码根本不需要这些优化。

---

> 原文还有更多技术细节和代码示例，感兴趣的读者建议阅读[原文](https://cemrehancavdar.com/2026/03/10/optimization-ladder/)获取完整信息。
