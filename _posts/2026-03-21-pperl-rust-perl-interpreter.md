---
layout: post
title: "pperl：用 Rust 重写的 Perl 5 解释器——由 AI 打造"
date: 2026-03-21 02:55:32 +0800
categories: tech-translation
description: "Richard Jelinek 在 GPW 2026 上展示了 pperl——一个由 AI 编写、用 Rust 实现的 Perl 5 解释器，具备自动并行化、JIT 编译、自动 FFI 等现代特性，性能最高可达 perl5 的 400+ 倍。"
original_url: https://perl.petamem.com/gpw2026/perl-mit-ai-gpw2026.html#/4/1/1
source: Hacker News
---

本文翻译自 [Perl mit AI — Richard Jelinek — GPW 2026](https://perl.petamem.com/gpw2026/perl-mit-ai-gpw2026.html#/4/1/1)，原载于 Hacker News。

---

## 引言

Richard Jelinek 是一位使用 Perl 进行 AI 开发数十年的资深程序员。在 2026 年德国 Perl Workshop（GPW 2026）上，他做了一个令人印象深刻的演讲，主题是：**把谓词反过来——让 AI 来写 Perl**。

> "I have been doing AI with Perl for a few decades. Now — 3 decades into Perl — I think it is time to turn the predicate around and let AI do Perl."

这句话道出了演讲的核心思想：不再只是用 Perl 写 AI，而是让 AI 来帮助写 Perl。

## 背景故事：从智能家居到 AI 编程

演讲的前半部分，Jelinek 分享了他过去十年的一些项目经历。他设计并建造了一套完全离网的智能家居系统（Villa-A），配备：

- 40 kWp 太阳能板
- 120 kWh LiFePO4 电池组
- 地源热泵
- 毛细管天花板采暖/制冷系统
- 完整的 DALI 照明控制

这套系统需要一个自动化控制系统，但他尝试了现有的解决方案都不满意：

- **MisterHouse**：Perl 写的，但 2017 年就停止更新了
- **FHEM**：Perl 写的，但架构设计有问题（"We do not like CPAN"、"Tests? That's superfluous work!"）
- **Home Assistant**：Python 写的，不够 "Perl"

于是他决定自己造轮子——**WHIP (Witty House Infrastructure Processor)**。这套系统使用 CAN 总线、STM32 微控制器、FreeRTOS，以及 Perl 作为上层控制语言。

在这个过程中，AI 帮他写了大量的代码：

- Modbus 和 CANbus 工具
- 各种 API 接口（Discord、Reddit、Twitter、Kraken、Ollama、Proxmox...）
- SNMP::MIB::Compiler（99.2% 的 MIB 解析通过率，比 Python 和 Go 的实现都好）
- Grpc::FFI（326 个测试通过，零内存泄漏）

但这些都只是前奏，真正的主角是 **pperl**。

## pperl：用 Rust 重写的 Perl 5 解释器

### 历史背景

在 Perl 5 的历史上，有过多次重写尝试：

| 项目 | 时间 | 结局 |
|------|------|------|
| Topaz | 1999 | C++ 重写，放弃 |
| B::C / perlcc | 1996-2016 | Perl 到 C 编译器，已死 |
| cperl | 2015-2020 | Perl 5 分支，休眠 |
| RPerl | - | 受限 Perl 到 C++，休眠 |
| WebPerl | - | Perl 到 WebAssembly，半活跃 |
| PerlOnJava | - | JVM 上的 Perl 5，活跃 |

> "Common failure mode: underestimating Perl 5's complexity"
> 常见的失败模式：低估 Perl 5 的复杂性

### pperl 的目标

- **兼容性**：追求与 Perl 5.42 的最大兼容
- **性能**：追求 V8 级别的性能
- **XS**：不使用 XS，而是用原生 Rust 实现
- **平台**：仅支持 Linux

目前状态：
- **22,000+ 测试**
- **61-400 个失败**（取决于如何计算）
- 性能表现：有好有坏，也有惊艳的

### 核心特性

#### 1. 自动并行化（Autoparallelization）

使用 Rust 的 Rayon 库实现数据并行：

```perl
# 这段代码会自动并行执行
my @results = map { expensive_computation($_) } @large_list;
# 不需要 threads、MCE 或 forks
# pperl 检测安全的循环 → Rayon 处理其余部分
```

启用条件：
- 使用 `--parallel` 标志
- 列表元素 ≥ 1000
- 没有共享变量修改

#### 2. JIT 编译

使用 Cranelift 作为 JIT 后端：

1. 解释器正常运行，同时分析热点代码路径
2. 检测到热点循环 → 降级为 Cranelift IR
3. Cranelift 编译为原生机器码
4. 下一次迭代直接执行原生代码——零分发开销

**Mandelbrot 基准测试结果：**

| 基准测试 | perl5 | pperl 解释执行 | pperl JIT | vs perl5 |
|----------|-------|----------------|-----------|----------|
| Mandelbrot | 133ms | 1493ms | 41ms | **3.2× 更快** |
| Ackermann | 13ms | 630ms | 12ms | 1.1× 更快 |

**完整嵌套循环 JIT：**

| Mandelbrot 1000×1000 | perl5 | pperl JIT | vs perl5 |
|---------------------|-------|-----------|----------|
| 执行时间 | 12,514ms | 163ms | **76× 更快** |

**JIT + 自动并行（8 线程）：**

| Mandelbrot | perl5 | pperl JIT | pperl JIT + 8 线程 | vs perl5 |
|------------|-------|-----------|-------------------|----------|
| 1000×1000 | 12,514ms | 163ms | 29ms | **431× 更快** |
| 4000×4000 | ~200s | 2,304ms | 342ms | **~580× 更快** |

> "Perl. With JIT. That's a sentence nobody expected."
> Perl 加上 JIT。没人想到会有这种句子。

#### 3. 自动 FFI（Auto-FFI）

不需要 XS、Inline::C 或编译，直接调用 C 库：

```perl
# Layer 0 —— 原始模式：任意库，你需要提供类型签名
use Peta::FFI qw(dlopen call);
my $lib = dlopen("libz.so.1");
my $ver = call($lib, "zlibVersion", "()p");
say "zlib: $ver"; # 1.3.1
```

```perl
# Layer 1 —— 预制模式：精选的函数签名，零配置
use Peta::FFI::Libc qw(getpid strlen strerror uname);
say strlen("hello"); # 5
my @info = uname();
say "$info[0] $info[2]"; # Linux 6.18.6-arch1-1
```

```perl
# Layer 2 —— 发现模式：扫描系统中的所有库
use Peta::FFI qw(scan dlopen call);
my $libs = scan();
say scalar(keys %$libs), " libraries found";
```

#### 4. 字节码缓存（.plc）

类似 Python 的 .pyc，但用于 Perl：

```bash
# 默认：不缓存（适合开发）
$ pperl script.pl

# 启用：编译一次，后续运行从缓存加载
$ pperl --cache script.pl

# 清除所有缓存
$ pperl --flush
```

| 基准测试 | perl5 | pperl | pperl --cache |
|----------|-------|-------|---------------|
| three_modules | 22.3ms | 12.6ms | 9.9ms |
| mixed_native_fallback | 26.3ms | 13.0ms | 10.0ms |
| deep_deps | 18.1ms | 13.1ms | 9.9ms |

模块加载成本降低 33-37%。

#### 5. 守护进程化（Daemonize）

类似 Emacs 的 daemon/client 模式：

```bash
$ pperl --daemon script.pl  # 编译、预热、监听
$ pperl --client script.pl  # 连接 → fork → 运行 → 响应
$ pperl --stop script.pl    # 清理关闭
```

| 基准测试 | perl5 | pperl | --cache | --daemon |
|----------|-------|-------|---------|----------|
| fallback + native mix | 23.5ms | 15.8ms | ~10ms | **5.0ms (3.2×)** |

通过 fork() 实现请求隔离，每个请求获得全新的地址空间，同时继承已编译的内存区域——零 I/O，零解析，零反序列化。

## AI 的角色：导航员与执行者

Jelinek 强调，AI 不会独自完成这一切。成功的公式是：

> **人类**：策略、架构、学习路径、优先级
> **AI**：执行、文档、模式学习、迭代

以 gRPC 为例：
- 他决定"先做 UUID，然后 SQLite，最后 gRPC"
- AI 执行每个阶段，记录经验教训，逐步升级

> "Without the navigator — the AI builds impressive things that go nowhere.
> Without the AI — the navigator doesn't have enough hours in the day."
>
> 没有导航员，AI 会构建出令人印象深刻但无处可去的东西。
> 没有 AI，导航员一天中没有足够的小时数。

## 兼容性：追求极致

Jelinek 分享了一个关于 `$,`（OFS）和 `$\`（ORS）在 `print` 中的行为差异的 bug 修复案例。

perl5 对两者的检查方式不同：

```c
// perl5 — $, (OFS)
if (SvGMAGICAL(ofs) || SvOK(ofs))
// 检查 get-magic 和 ok-flags

// perl5 — $\ (ORS)
if (PL_ors_sv && SvOK(PL_ors_sv))
// 只检查 ok-flags，不检查 get-magic
```

pperl 最初对两者使用了相同的检查掩码，这是错误的。实际触发这个问题的概率几乎为零，但他们还是修复了它。

> "The depth of compatibility is the product's guarantee."
> 兼容性的深度是产品的保证。

## 何时使用 pperl

**适合：**
- 受益于 JIT 和/或自动并行化的工作负载
- 使用原生内置模块的脚本（50+ Rust 模块，速度快）
- 快速启动——本身就比 perl5 快约 2 倍，加上 --cache 更快
- pperl 特有功能：Auto-FFI、Daemonize、Bytecode Cache
- 安全性：不同的代码库——不太可能与 perl5 共享 CVE
- 较小、不太复杂的脚本

**暂不适合：**
- 大型、复杂的代码库——pperl 与 perl5 的边缘情况可能不同
- 如果不想修改代码，继续使用 perl5

> 经验法则：脚本越长越复杂，就越可能遇到边界情况。

## 彩蛋：psh——交互式 Perl Shell

演讲最后还展示了一个交互式 Perl shell：

```perl
ls "-la";      # 就是一个子程序调用
cd "/tmp";     # chdir 包装
ps "aux";      # 系统命令

# 但你已经在脚本语言中：
for my $f (glob("*.log")) {
    if (-M $f > 7) {
        rm $f;
        say "cleaned $f";
    }
}
```

支持对象管道——传递数据结构而非文本：

```perl
ps() | grep { $_->{mem} > 100_000 }
    | sort { $b->{cpu} <=> $a->{cpu} };
```

> PowerShell 的哲学 + Perl 的文本处理能力 + pperl 的 JIT 速度

## 总结

这次演讲展示了一个令人兴奋的未来：**AI 不仅能帮助我们写代码，还能帮助我们重新实现整个编程语言**。pperl 项目证明了：

1. **AI 可以处理极端复杂性**——Perl 5 是出了名的复杂，但 AI 能够理解并重新实现它
2. **人机协作是关键**——人类提供方向，AI 提供执行力
3. **性能提升可以是革命性的**——431 倍甚至 580 倍的性能提升不是渐进式的改进，而是范式转移
4. **兼容性可以被认真对待**——即使是最小的边缘情况也被修复

项目地址：[perl.petamem.com](https://perl.petamem.com)

---

*这是一次令人印象深刻的工程实践，也是对"AI 时代程序员该如何定位自己"这个问题的一个回答：我们不是被替代，而是被赋能——前提是我们知道该往哪里走。*
