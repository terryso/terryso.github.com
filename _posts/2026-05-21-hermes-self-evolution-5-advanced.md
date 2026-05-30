---
layout: post
title: "高级进化：压缩、搜索与达尔文优化"
description: "Hermes 的自我进化不止于记忆和技能。当对话变长，上下文压缩让 Agent 保持关键信息不丢失。FTS5 会话搜索让它回溯过往所有对话。Darwinian Evolver 用进化算法优化 prompt 和技能。子代理委派让 Agent 学会分工。轨迹压缩则为训练下一代工具调用模型准备数据。本文是系列的收官之作。"
date: 2026-05-21 10:40 +0800
categories: [AI, Agent, 开源]
tags: [Hermes, 自进化, 上下文压缩, 进化算法, FTS5, 子代理]
---

> 本文是「Hermes 自我进化机制深度解析」系列第五篇（完结）。[上一篇：技能进化](/blog/hermes-self-evolution-4-skills)

前四篇我们分析了 Hermes 的核心进化机制：闭环架构、记忆系统、后台审查、技能进化。这篇看几个更高级的机制——它们不是核心闭环的必要组件，但让 Hermes 的自我进化能力上了一个台阶。

## 一、上下文压缩：长对话不丢失

Agent 的上下文窗口是有限的。当对话变得很长，Hermes 需要在不丢失关键信息的前提下压缩上下文。

### 压缩时机

```python
# ContextCompressor 的默认参数
threshold_percent: float = 0.75   # 达到 75% 上下文容量时触发
protect_first_n: int = 3          # 保护前 3 条非系统消息
protect_last_n: int = 6           # 保护最后 6 条消息
```

当 token 使用量达到模型上下文长度的 75% 时，压缩触发。

### 压缩策略

Hermes 的压缩不是简单的"砍掉中间"。它的策略是：

```
[系统提示词] ──────────── 始终保护
[前 3 条消息] ─────────── 始终保护（设定对话基调）
[中间消息] ────────────── 压缩为摘要
[最后 6 条消息] ───────── 始终保护（当前任务上下文）
```

### 摘要格式

压缩后的摘要不是普通的一段话——它有结构化的格式：

```
[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted
into the summary below. This is a handoff from a previous context
window — treat it as background reference, NOT as active instructions.

## Active Task
<当前正在进行的任务>

## Resolved
<已经解决的问题>

## Pending Questions
<待回答的问题>

## Remaining Work
<剩余的工作>
```

关键设计点：

1. **明确标注为"参考"** — 摘要以 `[CONTEXT COMPACTION — REFERENCE ONLY]` 开头，告诉模型这是背景信息，不是新指令
2. **区分已解决和待解决** — 已解决的问题不需要再次处理
3. **"Remaining Work" 代替 "Next Steps"** — 避免"Next Steps"被模型读作需要执行的指令
4. **强调记忆权威** — "Your persistent memory in the system prompt is ALWAYS authoritative"

### 迭代压缩

如果对话继续增长，压缩会再次触发。新的摘要会**合并旧摘要**的内容，而不是简单覆盖。这意味着信息在多次压缩中逐步精炼——重要的保留，不重要的丢失。

### 工具输出裁剪

在送给摘要模型之前，Hermes 会先裁剪工具输出中冗长的部分（比如大段日志）。这是一个廉价的预过滤，减少摘要模型的输入量。

### 辅助模型

压缩用辅助模型（通常是便宜、快速的模型）而非主模型来做摘要。这控制了成本——摘要不需要顶级模型的推理能力。

### 可插拔的上下文引擎

Hermes 的压缩系统是可替换的：

```python
class ContextEngine(ABC):
    """所有上下文引擎的基类。"""
    @abstractmethod
    def should_compress(self, prompt_tokens) -> bool
    @abstractmethod
    def compress(self, messages) -> List[Dict]
```

默认实现是 `ContextCompressor`，但第三方可以通过插件系统提供替代方案（比如 DAG-based 的 LCM 引擎）。配置 `context.engine` 选择使用哪个引擎。

## 二、会话搜索：回溯过往对话

Hermes 的所有对话都存在 SQLite 数据库中。FTS5 全文搜索引擎让 Agent 能回溯过往所有对话。

### 三种搜索模式

```python
# 模式 1：发现 — 关键词搜索
session_search(query="Flask deployment error")

# 模式 2：滚动 — 在特定会话中浏览
session_search(session_id="abc123", around_message_id=42)

# 模式 3：浏览 — 最近会话列表
session_search()  # 无参数
```

### 搜索结果

搜索返回的不只是匹配的片段——它提供**上下文窗口**：

```
┌─────────────────────────────────┐
│  匹配片段（高亮）               │
├─────────────────────────────────┤
│  前 5 条消息（上下文）           │
│  [匹配的消息]                   │
│  后 5 条消息（上下文）           │
├─────────────────────────────────┤
│  会话开头 3 条消息（背景）       │
│  会话结尾 3 条消息（结论）       │
└─────────────────────────────────┘
```

这样 Agent 不只看到匹配的那句话——它理解匹配发生时的完整上下文。

### 零 LLM 成本

搜索完全在 SQLite FTS5 上运行，不需要任何 LLM 调用。这是纯数据库操作，快速且免费。

## 三、Darwinian Evolver：进化式优化

这是 Hermes 技能系统里最有野心的工具——用进化算法来优化 prompt、正则表达式、SQL 查询和代码片段。

### 来源

Darwinian Evolver 来自 Imbue Research（[github.com/imbue-ai/darwinian_evolver](https://github.com/imbue-ai/darwinian_evolver)）。Hermes 把它封装成一个可选技能。

### 工作原理

```
初始种群（N 个候选 prompt）
        ↓
    评估适应度
    （在测试集上跑每个 prompt）
        ↓
    选择最优个体
        ↓
    变异（LLM 生成变体）
        ↓
    评估新个体
        ↓
    重复 N 轮
        ↓
    返回最优 prompt
```

三个核心组件：

**Organism（有机体）**：被进化的对象。可以是 prompt 模板、正则、SQL、代码片段。

**Evaluator（评估者）**：打分函数。输入有机体，输出 `[0, 1]` 的适应度分数。还区分"可训练失败"（给变异者看）和"保留失败"（检测过拟合）。

**Mutator（变异者）**：用 LLM 基于当前有机体和失败案例生成变体。

### 典型用例

```
你：帮我优化这个 prompt，让它生成的代码更不容易出错
Hermes：（安装 darwinian-evolver）
       （定义 Organism = prompt_template）
       （定义 Evaluator = 在测试集上跑生成的代码，统计通过率）
       （定义 Mutator = LLM 看失败案例，提出修改建议）
       （运行 10 轮进化）
       → 返回最优 prompt
```

### 成本

一次典型的进化运行需要 50-500 次 LLM 调用。在 gpt-4o-mini 上几美分，在 Claude Sonnet 上可能几美元。所以它适用于**值得优化的** prompt/技能——不是每个都值得。

## 四、子代理委派

Hermes 可以生成隔离子代理处理并行工作。这看似与自我进化无关，但子代理的**结果**可以被父代理学习。

### 委派机制

```python
# delegate_task 工具
delegate_task(
    tasks=[
        {"description": "搜索 Flask 部署最佳实践", "tools": ["web_search"]},
        {"description": "检查当前配置文件", "tools": ["read_file"]},
    ]
)
```

父代理可以同时派多个子代理出去，各自独立执行，结果汇总给父代理。

### 并发控制

```python
# 限制同时运行的子代理数量
from tools.delegate_tool import _get_max_concurrent_children
max_children = _get_max_concurrent_children()
```

如果模型在一个 turn 中发出太多 `delegate_task` 调用，多余的会被截断：

```python
def _cap_delegate_task_calls(tool_calls):
    """截断超额的 delegate_task 调用。"""
    kept_delegates = 0
    for tc in tool_calls:
        if tc.function.name == "delegate_task":
            if kept_delegates < max_children:
                result.append(tc)
                kept_delegates += 1
```

### 学习循环

子代理执行完成后，结果回到父代理。后台审查代理在审查父代理的对话时，能看到子代理的执行结果，从中提取值得学习的模式。

## 五、轨迹压缩：为下一代模型做准备

最后看一个面向研究的机制——**轨迹压缩**（Trajectory Compression）。

### 目的

Hermes 的每次对话都是一个完整的 Agent 轨迹：系统提示、用户消息、模型回复、工具调用、工具结果……这些轨迹是训练下一代工具调用模型的宝贵数据。但原始轨迹太长了。

### 压缩策略

```
[系统提示词] ──── 保护
[第一条用户消息] ─ 保护
[第一条模型回复] ─ 保护
[第一条工具调用] ─ 保护
[... 中间轮次 ...] ──── 压缩为摘要
[最后 N 轮] ──── 保护
```

与上下文压缩不同，轨迹压缩的目的是**保留训练信号**——模型做对了什么、做错了什么、什么工具调用是关键的。

### 用法

```bash
# 压缩一个目录的轨迹文件
python trajectory_compressor.py --input=data/my_run

# 压缩单个文件，目标 16000 token
python trajectory_compressor.py --input=data/trajectories.jsonl \
    --target_max_tokens=16000

# 抽样压缩 15%
python trajectory_compressor.py --input=data/trajectories.jsonl \
    --sample_percent=15
```

这不是给普通用户的功能——它是给研究者的。用来生成高质量的训练数据，训练下一代工具调用模型。

## 全景：Hermes 自我进化的完整图景

五篇文章下来，让我们把所有机制放在一张图里：

```
┌──────────────────────────────────────────────────────────┐
│                    Hermes 自我进化全景                     │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐ │
│  │  记忆系统    │    │  技能系统     │    │  上下文压缩  │ │
│  │ MEMORY.md   │    │  SKILL.md    │    │  长对话摘要  │ │
│  │ USER.md     │    │  lifecycle   │    │  结构化保留  │ │
│  │ 安全扫描     │    │  usage track │    │             │ │
│  │ Honcho(可选) │    │  Curator     │    │             │ │
│  └──────┬──────┘    └──────┬───────┘    └─────────────┘ │
│         │                  │                             │
│         ▼                  ▼                             │
│  ┌─────────────────────────────────┐                     │
│  │       后台审查代理               │                     │
│  │  fork + 共享前缀缓存             │                     │
│  │  积极但克制的学习策略             │                     │
│  │  明确的反模式清单                 │                     │
│  └─────────────────────────────────┘                     │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐ │
│  │  会话搜索    │    │  Darwinian   │    │  轨迹压缩    │ │
│  │  FTS5       │    │  Evolver     │    │  训练数据    │ │
│  │  零LLM成本   │    │  进化算法     │    │  研究导向    │ │
│  └─────────────┘    └──────────────┘    └─────────────┘ │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐                     │
│  │  子代理委派   │    │  Skills Hub  │                     │
│  │  并行执行     │    │  社区共享     │                     │
│  │  结果学习     │    │  安全隔离     │                     │
│  └─────────────┘    └──────────────┘                     │
└──────────────────────────────────────────────────────────┘
```

## 设计哲学总结

读完 Hermes 的完整源码后，我总结出几条反复出现的设计原则：

### 1. 积极但克制

审查代理被告知"什么都不做是错失"，但也被明确禁止捕获环境依赖和负面断言。Hermes 鼓励主动学习，但划定了清晰的边界。

### 2. 成本意识

前缀缓存共享、冻结快照、辅助模型做压缩、FTS5 替代 LLM 搜索——每一个设计决策都考虑了成本。自我进化不是奢侈功能，而是日常操作。

### 3. 可逆性优先

技能从不自动删除，只归档。记忆用 replace 而非覆盖。Curator 的操作有 dry-run 模式。Hermes 假定自己可能犯错，所以让每一步都可逆。

### 4. 个性化与通用性的平衡

技能包含用户偏好，但以类级技能的形式存在。不是"用户 A 的 Python 调试偏好"，而是"Python 调试"技能中嵌入的用户偏好。这使得技能可以在保持个性化的同时被 Curator 管理。

### 5. 纵深防御

安全扫描在写入时和加载时都执行。工具白名单在审查代理上执行。外部提供商与内置记忆分开。没有单点防御——每一层都假设上一层可能失败。

## 与其他 Agent 框架的对比

| 特性 | Hermes | Claude Code | OpenHands | Devin |
|------|--------|-------------|-----------|-------|
| 持久记忆 | 双轨文件 + Honcho | CLAUDE.md | 无 | 无 |
| 自动技能创建 | 有（后台审查） | 无 | 无 | 无 |
| 技能生命周期 | 有（Curator） | 无 | 无 | 无 |
| 会话搜索 | FTS5 | 无 | 无 | 无 |
| 进化式优化 | Darwinian Evolver | 无 | 无 | 无 |
| 开源 | 是 | 否 | 是 | 否 |

Hermes 的独特之处在于**内置了完整的学习闭环**。其他框架要么依赖外部 RAG，要么完全没有持久化学习。

## 局限性

公平起见，也要指出 Hermes 自我进化机制的局限：

1. **技能依赖 LLM 的上下文理解** — 如果技能太长，模型可能忽略部分内容。这不是 Hermes 的问题，是当前 LLM 的限制。

2. **审查质量取决于模型能力** — 审查代理用的模型如果不够聪明，可能误判什么该学什么不该学。

3. **没有跨用户学习** — 技能是个性化的，不能从一个用户迁移到另一个用户（除了通过 Hub 手动分享）。

4. **记忆没有语义检索** — 内置记忆是纯文本匹配，没有向量搜索。Honcho 提供了语义搜索，但需要额外部署。

5. **Darwinian Evolver 还很早期** — 作为可选技能，它的使用门槛还比较高，需要自定义评估器和变异器。

## 写在最后

Hermes Agent 的自我进化机制是开源 Agent 中为数不多真正把学习闭环做完整的。它不是一个炫酷的 demo——而是一套在工程约束下（成本、安全、可维护性）设计出来的实用系统。

如果你对 AI Agent 的自我进化感兴趣，我强烈建议读一读这几个文件：

- `agent/background_review.py` — 后台审查 prompt 是精华
- `agent/curator.py` — Curator 的策展逻辑
- `tools/memory_tool.py` — 记忆的安全扫描
- `tools/skill_usage.py` — 技能生命周期管理

代码在 [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)。

---

*本系列完结。感谢阅读。*
