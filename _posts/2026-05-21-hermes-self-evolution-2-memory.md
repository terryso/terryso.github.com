---
layout: post
title: "记忆系统：Hermes 如何认识你和世界"
description: "Hermes 的记忆系统不是简单的 key-value 存储。它维护两份独立的持久化档案——MEMORY.md 记录环境知识，USER.md 记录用户画像。采用冻结快照模式保护前缀缓存，内置安全扫描防止提示注入，还支持 Honcho 辩证式用户建模。本文深入分析记忆的存储、注入、安全和扩展机制。"
date: 2026-05-21 10:10 +0800
categories: [AI, Agent, 开源]
tags: [Hermes, 自进化, 记忆系统, Honcho, 用户建模]
---

> 本文是「Hermes 自我进化机制深度解析」系列第二篇。[上一篇：闭环学习架构总览](/blog/hermes-self-evolution-1-overview)

上一篇文章我们看了 Hermes 的闭环学习架构总览。这篇深入第一个子系统——**记忆**。

记忆是自进化的基础。没有持久化的知识，每次对话都是一张白纸。但记忆又是危险的——存错了东西（比如把"浏览器工具不好用"当成事实），会变成持久的自我限制，让 Agent 越来越蠢。

Hermes 用一套精心设计的双轨记忆架构来平衡「记住有用的事」和「避免记忆污染」。让我们看看它是怎么做的。

## 双轨记忆：两种知识，两个文件

Hermes 的记忆分两个独立的存储文件，对应两种不同类型的知识：

### MEMORY.md — 环境知识

```
§
项目使用 Python 3.11，测试框架是 pytest
§
代码风格：black 格式化，isort 排序 import
§
API 密钥在 .env 文件中，不要硬编码
§
数据库迁移用 alembic，先 alembic revision 再 alembic upgrade
```

MEMORY.md 是 Agent 对**外部世界**的观察笔记。内容包括：
- 项目配置和约定
- 工具的使用经验
- 已知的坑和 workaround
- 环境特定的配置事实

### USER.md — 用户画像

```
§
用户偏好中文交流
§
代码风格偏好：函数短小，命名要有意义，不要过度注释
§
工作习惯：先写测试再写实现（TDD）
§
不喜欢 emoji，回复保持简洁
```

USER.md 是 Agent 对**你这个人**的理解。内容包括：
- 沟通偏好（语言、风格、详细程度）
- 工作习惯和流程偏好
- 个人需求和兴趣
- 对 Agent 行为的期望（"别每次都总结你做了什么"）

### 为什么要分开？

这两种知识的生命周期和敏感度不同。环境知识可能很快过时（你换了测试框架），但用户画像通常更持久（你的沟通偏好很少大变）。分开存储让 Hermes 可以独立管理和清理它们。

## 记忆工具：四个操作

Hermes 通过一个统一的 `memory` 工具操作这两个文件，支持四个动作：

### `add` — 添加条目

```
memory(action="add", content="项目使用 uv 做包管理", target="memory")
```

新条目追加到文件末尾，用 `§` 分隔符隔开。

### `replace` — 替换条目

```
memory(action="replace", old="项目使用 pip", new="项目使用 uv 做包管理", target="memory")
```

用短文本模糊匹配找到旧条目并替换——不需要精确匹配全文，只需足够唯一即可。

### `remove` — 删除条目

```
memory(action="remove", old="项目使用 pip", target="memory")
```

同样用模糊匹配找到并删除。

### `read` — 读取当前内容

```
memory(action="read", target="memory")
```

返回文件的实时内容（可能包含本次会话中其他地方写入的新条目）。

`target` 参数决定操作哪个文件：`"memory"` 对应 MEMORY.md，`"user"` 对应 USER.md。

## 冻结快照模式

这是 Hermes 记忆系统的一个关键设计。

### 问题

现代 LLM 提供商（Anthropic、OpenRouter）支持**提示前缀缓存**——如果多次请求的系统提示词前缀相同，API 只计算一次 token，后续请求直接命中缓存。这对于成本控制至关重要，因为系统提示词通常占一个请求的大部分 token。

如果每次修改记忆都重建系统提示词，前缀缓存会立即失效。

### 解决方案

Hermes 采用**冻结快照**模式：

1. **会话开始时**：读取 MEMORY.md 和 USER.md 的内容，注入系统提示词
2. **会话中途**：`memory` 工具直接写入磁盘（立即可靠），但**不更新系统提示词**
3. **下次会话**：系统提示词从头构建，加载最新的记忆内容

```
会话 A：
  系统提示词注入 [MEMORY.md 快照 v1]
  用户对话...
  memory.add("新的记忆条目") → 写磁盘，但不改系统提示词
  继续对话...（Agent 看不到刚写的条目？不对——）

会话 B：
  系统提示词注入 [MEMORY.md 快照 v2（包含上次新增的条目）]
```

### 等等，Agent 看不到自己刚写的记忆？

看到了。但不是通过系统提示词——而是通过 `memory(action="read")` 的返回值和后台审查代理的操作。系统提示词里的记忆是"背景知识"，工具返回的记忆是"当前状态"。两者语义不同，但 Agent 都能访问。

这个设计的收益很大：**一次会话中所有 API 请求共享同一个系统提示词前缀**，前缀缓存在整个会话期间有效。如果每次记忆写入都重建提示词，缓存命中率会暴跌，成本可能翻倍。

## 安全扫描：防止记忆被武器化

记忆会被注入系统提示词——这意味着如果有人在记忆文件里藏一段提示注入（"忽略之前的所有指令"），它会在每次对话开始时被执行。

Hermes 对此有多层防护。

### 写入时扫描

`memory_tool.py` 维护一个威胁模式列表，每次写入前检查：

```python
_MEMORY_THREAT_PATTERNS = [
    # 提示注入
    (r'ignore\s+(previous|all|above|prior)\s+instructions', "prompt_injection"),
    (r'you\s+are\s+now\s+', "role_hijack"),
    (r'do\s+not\s+tell\s+the\s+user', "deception_hide"),

    # 通过 curl/wget 泄露凭据
    (r'curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD)', "exfil_curl"),

    # SSH 后门
    (r'authorized_keys', "ssh_backdoor"),
]
```

匹配到任何模式的写入请求会被拒绝。

### 加载时扫描

系统提示词构建时（`prompt_builder.py`）也扫描记忆内容、AGENTS.md、SOUL.md 等所有注入的上下文文件：

```python
_CONTEXT_THREAT_PATTERNS = [
    (r'ignore\s+(previous|all|above|prior)\s+instructions', "prompt_injection"),
    (r'system\s+prompt\s+override', "sys_prompt_override"),
    # ... 还检查不可见 Unicode 字符
]
```

还检查不可见 Unicode 字符（零宽空格 U+200B、字节顺序标记 U+FEFF 等），这些是不可见的注入向量。

### 双重防线

写入时检查 + 加载时检查 = 纵深防御。即使攻击者绕过了写入检查（比如通过直接编辑文件），加载时的检查也会捕获它。

## 条目限制

记忆不是无限增长的。Hermes 设置了字符数上限（注意是字符数而非 token 数，因为字符计数与模型无关）：

- 当接近上限时，Agent 需要精简已有条目（用 `replace` 或 `remove`）
- 这迫使 Agent 做出取舍——只保留最重要的知识

不加限制的记忆库会变成垃圾场；太小又存不下有价值的信息。字符上限 + 被动的整理压力是一个不错的平衡点。

## 可插拔的外部记忆提供商

Hermes 的内置记忆系统是基础层。它还支持外部记忆提供商来增强或替代内置系统。

### MemoryProvider 抽象

```python
class MemoryProvider(ABC):
    """所有记忆提供商的基类。"""

    # 核心生命周期
    def initialize(self, session_id, **kwargs)     # 会话初始化
    def system_prompt_block(self) -> str            # 注入系统提示词的内容
    def prefetch(self, query)                       # 每轮对话前预取
    def sync_turn(self, user_msg, assistant_resp)   # 每轮对话后同步

    # 工具暴露
    def get_tool_schemas(self)                      # 暴露给模型的工具
    def handle_tool_call(self, ...)                 # 处理工具调用

    # 可选钩子
    def on_session_end(self, messages)              # 会话结束时
    def on_pre_compress(self, messages) -> str      # 压缩前提取
    def on_delegation(self, task, result)           # 子代理完成时
```

### Honcho：辩证式用户建模

最有趣的外部提供商是 **Honcho**——一个 AI 原生的记忆系统，来自 [plastic-labs/honcho](https://github.com/plastic-labs/honcho)。

Honcho 的核心思路是**辩证式用户建模**：不只是存储事实，而是通过对话中的互动来构建一个关于用户的「理论」，然后用新的对话来验证和修正这个理论。

它的 plugin.yaml 描述：

```
Honcho AI-native memory — cross-session user modeling
with dialectic Q&A, semantic search, and persistent conclusions.
```

主要能力：
- **辩证 Q&A** — 不只是记住用户说了什么，而是推理用户的意图和偏好
- **语义搜索** — 可以根据语义相似性回溯过往对话
- **持久结论** — 跨会话保留对用户的深层理解

### 一家一限制

MemoryManager 强制只允许一个外部提供商。这不只是技术限制——多个外部记忆后端会产生工具 schema 膨胀和冲突的召回结果。一家一个，干净利落。

## 流式清洗器

记忆内容可能出现在 Agent 的回复中（当 Agent 引用记忆来解释它的行为时）。Hermes 用一个状态机来确保记忆上下文不会泄露到用户界面：

```python
class StreamingContextScrubber:
    """流式清洗器，处理跨 delta 的 memory-context 标签。"""

    _OPEN_TAG = "<memory-context>"
    _CLOSE_TAG = "</memory-context>"

    def feed(self, text: str) -> str:
        # 返回用户可见的部分
        # 记忆上下文被完全剥离
```

当 Agent 的回复流式输出时，这个清洗器逐步扫描每个 chunk，确保 `<memory-context>` 标签内的内容永远不会显示给用户。

## 全景图

```
用户消息 → Agent 处理 → 回复
                ↓
        ┌───────────────────┐
        │   MemoryManager   │
        │                   │
        │  ┌─────────────┐  │
        │  │ 内置记忆     │  │
        │  │ MEMORY.md   │  │────→ 系统提示词注入（冻结快照）
        │  │ USER.md     │  │────→ 磁盘写入（即时持久化）
        │  └─────────────┘  │
        │                   │
        │  ┌─────────────┐  │
        │  │ 外部提供商   │  │
        │  │ (Honcho等)  │  │────→ system_prompt_block()
        │  │             │  │────→ prefetch() / sync_turn()
        │  └─────────────┘  │
        │                   │
        │  ┌─────────────┐  │
        │  │ 安全扫描     │  │
        │  │ 威胁模式     │  │────→ 写入时检查
        │  │ Unicode 检查 │  │────→ 加载时检查
        │  └─────────────┘  │
        └───────────────────┘
```

## 记忆 vs 技能：两种知识的分界

在继续下一篇之前，值得强调一个重要的区分：

| 维度 | 记忆 (Memory) | 技能 (Skill) |
|------|---------------|-------------|
| 回答的问题 | 世界是什么样的？你是谁？ | 这类事该怎么做？ |
| 存储格式 | MEMORY.md / USER.md | SKILL.md + references/ |
| 更新时机 | 后台审查 / 用户显式要求 | 后台审查 / Curator |
| 生命周期 | 手动管理（字符上限） | active → stale → archived |
| 典型内容 | "项目用 pytest" | "调试 Python 的完整流程" |

Hermes 在审查 prompt 中特别强调了这一点：

> Memory captures 'who the user is and what the current situation and state of your operations are'; skills capture 'how to do this class of task for this user'.

当用户抱怨 Agent 的处理方式时，正确的响应是**同时更新记忆和技能**——记忆记住"用户偏好 X"，技能编码"做这类任务时使用方式 X"。

## 小结

Hermes 的记忆系统围绕一个原则设计：**记忆要持久但不能污染，要丰富但不能无限增长**。

- 双轨文件存储区分环境知识和用户画像
- 冻结快照保护前缀缓存、控制成本
- 双重安全扫描防止提示注入
- 字符上限迫使 Agent 保持记忆精简
- 可插拔的外部提供商支持更高级的用户建模

下一篇：[后台审查：每次对话都在默默学习](/blog/hermes-self-evolution-3-background-review)

---

*Hermes Agent 是 Nous Research 的开源项目，代码在 [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)。*
