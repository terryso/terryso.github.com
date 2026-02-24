---
layout: post
title: "用 Prolog 扩展 C：构建智能专家系统"
date: 2026-02-25 03:21:24 +0800
categories: tech-translation
description: "探讨 Prolog 与 C 语言如何互补，通过模式匹配和回溯机制简化复杂逻辑，并以 IRQ 冲突诊断为例展示专家系统的实际应用。"
original_url: https://www.amzi.com/articles/irq_expert_system.htm
source: Hacker News
---

本文翻译自 [Extending C with Prolog](https://www.amzi.com/articles/irq_expert_system.htm)，原载于 Hacker News。

## 引言

Prolog 和 C 各有所长，程序员们很早就开始将它们结合使用。KnowledgeWare 的 CASE 工具 ADW 的核心是一个庞大的 Prolog 程序；ICARUS 为化学工程师提供项目估算工具，内部逻辑由 Prolog 完成；Pacific AI 为工业提供教育工具，用 C 库做界面展示，用 Prolog 处理内部逻辑。

本文将探讨 Prolog 的优势、其本质，以及 Prolog 与 C 之间接口的设计。所有关于 Prolog 的说明和示例都遵循 Edinburgh Prolog 标准，因此适用于任何符合标准的 Prolog 实现。

## 为什么选择 Prolog？

关于 Prolog 作为声明式编程语言的奇妙之处，以及它在人工智能（AI）应用中的强大能力，已经有很多论述。让我们看看 AI 和 Prolog 的底层原理。

当我刚开始对 AI 感兴趣时，我买了一本当时为数不多的相关书籍。我期待着关于智能本质以及在计算机上模拟智能的深层讨论。然而，我发现的是一堆搜索和模式匹配算法。

这恰恰是许多 AI 编程的精髓。国际象棋程序搜索棋局中的模式，自然语言程序搜索单词列表中的模式，诊断程序搜索匹配症状的规则。而 Prolog 非常擅长模式匹配和搜索。

使模式匹配更容易的编程语言有两个关键特性：1）将符号作为原始数据类型支持，无需调用特殊函数即可操作；2）动态内存管理，开发者可以直接使用符号而无需担心内存分配问题。具有这些特性的语言，如 Prolog 和 LISP，被称为符号语言。

来看一个简单的控制循环示例，读取用户命令然后执行相应操作。在 C 中，代码可能是这样的：

```c
void main()
{
  char buf[20];
  do {
     gets(buf);
     if (0 == strcmp(buf, "open")) ...
     else if (0 == strcmp(buf, "add")) ...
     else if (0 == strcmp(buf, "delete")) ...
  } while (strcmp(buf, "quit"));
  printf("done");
}
```

而在 Prolog 中，使用动态分配的符号代替字符串，等效代码如下：

```prolog
main :-
  repeat,
  read(X),
  do(X),
  X == quit,
  write(done).

do(open) :- ...
do(add) :- ...
do(delete) :- ...
```

注意这里没有数据定义语句或字符串比较。在简单示例中差异不大，但在大量符号比较的应用中，差异非常显著。

除了动态分配的符号，Prolog 还内置了复杂的模式匹配算法（称为**合一/unification**）和搜索机制（称为**回溯/backtracking**）。

在上面的代码片段中可以看到这两个特性。模式 `do(X)` 与三个 `do` 规则中的第一个进行合一，`:-` 符号表示"如果"。如果用户输入 `open`，第一个子句就会匹配，`:-` 右边的代码将被执行。如果用户输入的不是 `open`，Prolog 会"回溯"，继续寻找匹配用户输入的 `do` 规则。

同样，`main` 规则中 `repeat` 和 `X == quit` 的使用使代码段"循环"直到用户输入 `quit`。Prolog 程序员不编写 if-then-else、函数调用、while 或其他流程控制结构，但通过合一和回溯，程序员可以实现任何其他语言能够达到的流程控制行为。

符号、合一、回溯和动态内存管理，都倾向于消除程序员通常需要编写的过程式代码。毫不奇怪，剩下的代码看起来比传统代码更具声明性，而且通常只有后者的一小部分。KnowledgeWare 声称他们的 Prolog 模块只有等效 C 代码的十分之一大小。

以下是一个可以分析简单英语句子的 Prolog 程序：

```prolog
sentence --> noun_phrase, verb_phrase.
noun_phrase --> determiner, modified_noun.
noun_phrase --> modified_noun.
modified_noun --> noun.
modified_noun --> adjective, modified_noun.
verb_phrase --> verb, noun_phrase.
determiner --> [the]; [a].
noun --> [cat];[dog];[mouse];[cheese].
adj --> [big];[small];[hungry];[brown].
verb --> [eats];[chases].
```

如果这段代码加载到 Prolog 解释器中，可以直接用来判断句子是否符合这些语法规则：

```prolog
?- sentence([the,big,brown,dog,chases,a,small,hungry,cat],[]).
yes
?- sentence([a,small,dog,cat,eats],[]).
no
```

稍加扩展，这个思路可以用于实现数据库查询的自然语言前端，同时解析自然语言查询并将其映射到正式的数据库查询。

事实上，Prolog 最初就是为处理语言而设计的。它不仅适合自然语言处理，也适合实现和实验各种形式语言。

## 专家系统外壳

Prolog 的一个常见用途是构建专家系统外壳。这些外壳使用自己的语言来表示特定类型问题的知识。例如，诊断系统的工作方式与配置系统不同。

以下规则和事实摘自一个用于诊断汽车无法启动的示例知识库：

```prolog
rule 1
if       not turn_over and
         battery_bad
then     problem is battery cf 100.

rule 2
if      lights_weak
then    battery_bad cf 50.

rule 4
if      turn_over and
        smell_gas
then    problem is flooded cf 80.

output problem is battery get the battery recharged.
output problem is flooded wait 5 minutes and try again.

ask turn_over
menu (yes no)
prompt 'Does the engine turn over?'.

ask lights_weak
menu (yes no)
prompt 'Are the lights weak?'.

ask smell_gas
menu (yes no)
prompt 'Do you smell gas?'.
```

## Prolog 与 C 的协作

虽然 C 可以编写任何 Prolog 能写的东西，但对于 Prolog 擅长的应用，Prolog 代码要简单得多。因此，Prolog 开发者可以在应用中管理和维护更复杂的逻辑，从而为用户提供更高级的功能。

Prolog 程序的交互方式决定了 C 与 Prolog 接口的本质。它必须能够执行编译后的 Prolog 代码，或查询加载的 Prolog 程序。从这个意义上说，从 C 到 Prolog 的接口看起来更像数据库 API，而不是过程式的跨语言调用。

经典的 Hello World 程序也说明了 Prolog 到 C 方向的接口：

```prolog
main :- write('Hello World').
```

注意 `write` 语句与逻辑、模式匹配或搜索无关——它只是执行 I/O。Prolog 提供了许多主要用于副作用的特殊谓词，如 `write`。而这正是 Prolog 比 C 弱的地方。

Prolog 程序员必须依赖特定供应商在实现中提供的特殊谓词。例如，如果某个 Prolog 实现不提供访问 Windows 的工具，那么它就不能用于实现 Windows 应用程序。这就是 Prolog 到 C 连接的用武之地。它们让程序员定义任意数量的扩展谓词，使 Prolog 代码能够访问任何可以从 C 访问的服务。

## 实战案例：IRQ 冲突诊断

作者曾在 PC 上安装 Gateway 多媒体套件，但由于中断（IRQ）通道冲突，安装过程相当繁琐。一个简单的专家系统可以帮助解决这些 IRQ 冲突。

IRQXS.PRO 是一个 Prolog 程序，包含了一些解决 IRQ 冲突的专家规则。它首先检查正在安装的设备的默认 IRQ 是否可用。如果可用，就没问题。如果不可用，它会尝试备用 IRQ，如果有空槽就推荐一个，并告诉用户重置设备卡上的 IRQ 开关。如果备用也不可用，它会尝试移动现有的 IRQ，最后实在不行，会寻找可以共享单个 IRQ 的 COM 端口，从而为新设备腾出一个 IRQ。

示例程序的主入口：

```c
lsCallStr(&t, "irq_advice('%s')", sDevice);
```

这行代码调用顾问程序的主入口点。它动态构建查询并提交给编译后的 Prolog 程序，非常类似于数据库调用。

Prolog 代码首先通过调用 C 实现的函数获取现有的 IRQ 分配：

```prolog
irq_advice(Device) :-
  msg($IRQ Conflict Resolution Analysis$),
  get_irqs,  % 从 C 程序获取 IRQ 信息
  free_irq(Device),
  msg($ Continue normal install$).
```

C 函数使用类似 printf 的函数构建 Prolog 项并将其断言到 Prolog 动态数据库：

```c
for (i=0; i<16; i++)
{
  fgets(buf, 80, fp);
  lsAssertzStr("irq(%i, %s)", i, buf);
}
```

这相当于在 Prolog 程序中直接输入以下形式的事实：

```prolog
irq(4,mouse).
irq(5,open).
```

以下代码片段使用 Prolog 模式匹配找到两个具有单个 COM 端口的 IRQ，然后建议用户合并它们：

```prolog
make_room :-       % 合并 COM 端口以腾出空间
  irq(IRQ_X, com(COM_X)),
  irq(IRQ_Y, com(COM_Y)),
  IRQ_X \= IRQ_Y,
  msg([$ Put com ports $, COM_X, $ and $, COM_Y,
       $ together on IRQ $, IRQ_X]),
  retract(irq(IRQ_X, _)),
  assert(irq(IRQ_X, com(COM_X)+com(COM_Y))),
  retract(irq(IRQ_Y, _)),
  assert(irq(IRQ_Y, open)).
```

运行结果示例：

```
What device are you installing? Sound Blaster
Use which test file? irqtest1.dat
IRQ Conflict Resolution Analysis
  Put com ports 3 and 4 together on IRQ 3
  Move device mouse to IRQ 4
  Continue normal install
```

## 应用场景展望

上述示例说明了一整类顾问模块为大型应用添加专业知识的可能性：

- **操作系统调优**：如 Windows 环境优化顾问
- **金融应用**：基于当前数据推荐各种行动方案的逻辑顾问
- **帮助台系统**：许多组织发现他们最终会有许多小型顾问，而不是一个大型系统——打印机顾问、LAN 顾问、各种软件包顾问
- **自然语言前端**：帮助系统可以提供自然语言解析器，让用户表达他们想做什么
- **数据库查询**：用户可以用母语表达想从数据库获取什么

## 如何继续学习

有多种符合标准的 Prolog 实现可供选择，从大学提供的共享软件到昂贵的商业实现，覆盖各种机器和操作环境。获取 Prolog 信息的最佳来源之一是 Internet 新闻组 comp.lang.prolog，其 FAQ 文件列出了许多 Prolog 源和学习资源。

---

## 总结

这篇文章虽然是 1994 年的作品，但其中关于 Prolog 与 C 协作的思路在今天依然有价值：

1. **符号处理的优势**：Prolog 的动态符号、合一和回溯机制使其在处理规则和模式时比传统语言简洁得多
2. **混合编程的智慧**：用 C 处理 I/O 和系统交互，用 Prolog 处理业务逻辑和规则——这种分工在今天看起来依然合理
3. **专家系统的演进**：规则可以随着新案例不断扩展，系统会越来越"聪明"
4. **声明式思维**：描述"是什么"而非"怎么做"的编程范式，在现代框架中依然有回响

虽然今天的开发环境已经大不相同，但理解 Prolog 的思维方式对于处理复杂规则系统、知识图谱、甚至现代 AI 应用仍有启发意义。
