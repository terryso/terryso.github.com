---
layout: post
title: "技能进化：从经验中提炼可复用的知识"
description: "Hermes 的技能是 Agent 的程序性记忆——描述如何完成一类任务的完整指南。技能有完整的生命周期管理：从使用中创建、在使用中改进、长时间不用自动归档。Curator 策展人在空闲时整理技能库，合并重叠、归档过期。Skills Hub 让社区共享技能成为可能。本文分析技能的创建、进化、维护和共享机制。"
date: 2026-05-21 10:30 +0800
categories: [AI, Agent, 开源]
tags: [Hermes, 自进化, 技能系统, Curator, SkillsHub]
---

> 本文是「Hermes 自我进化机制深度解析」系列第四篇。[上一篇：后台审查](/blog/hermes-self-evolution-3-background-review)

上一篇我们看了后台审查——每次对话后默默运行的 fork 代理。这篇看它的主要产出物：**技能**（Skills）。

如果说记忆是 Agent 的声明性知识（"世界是什么样的"），技能就是**程序性知识**——"这类事该怎么做"。技能是 Hermes 从经验中提炼的、跨会话可复用的操作指南。

## 技能是什么

一个技能就是一个目录，核心是 SKILL.md 文件：

```
~/.hermes/skills/
└── python-debugging/
    ├── SKILL.md              # 技能主体
    ├── references/            # 参考文档
    │   ├── common-errors.md
    │   └── pdb-cheatsheet.md
    ├── templates/             # 模板文件
    │   └── debug-config.yaml
    └── scripts/               # 可执行脚本
        └── verify-setup.py
```

### SKILL.md 的结构

```markdown
---
name: python-debugging
description: Python 调试的完整工作流
version: 0.3.0
---

# Python 调试

## 何时使用
当需要调试 Python 程序的运行时错误或意外行为时加载此技能。

## 用户偏好
- 用户偏好 pdb 而非 print 调试
- 错误信息需要包含完整的 traceback

## 推荐流程
1. 先复现错误
2. 在出错位置设置 pdb 断点
3. 逐步检查变量状态
4. 修复后写回归测试

## 已知陷阱
- 不要在异步代码中直接用 pdb，用 aiomonitor
- Docker 中需要 -it 标志才能交互调试

## 参考文档
- references/common-errors.md — 常见错误模式
- references/pdb-cheatsheet.md — pdb 命令速查
```

注意 SKILL.md 不是纯技术文档——它**包含用户偏好**。同一个"Python 调试"技能，对偏好 pdb 的用户和对偏好日志调试的用户，内容是不同的。这是 Hermes 技能系统的关键设计：**技能是个性化的**。

### 三种支持文件

技能目录下可以放三种支持文件：

| 类型 | 路径 | 用途 |
|------|------|------|
| 参考文档 | `references/<topic>.md` | 会话特定的细节、错误转录、API 文档摘要 |
| 模板 | `templates/<name>.<ext>` | 起始文件，复制后修改（配置模板、脚手架） |
| 脚本 | `scripts/<name>.<ext>` | 可直接运行的操作（验证脚本、探针） |

审查代理在添加支持文件时会通过 `skill_manage action=write_file` 操作，路径前缀决定文件类型。

## 技能的生命周期

技能不是静态的——它们有完整的生命周期：

```
创建 → active → stale → archived
              ↑        ↓
              └─ unpin ←┘
```

### Active（活跃）

默认状态。技能正常可用，出现在技能索引中。

### Stale（过时）

当技能**超过 30 天没被使用**（默认配置），自动转为 stale。stale 技能仍然可用，但标记为需要关注。

### Archived（归档）

当技能**超过 90 天没被使用**，自动归档。归档的技能被移到 `.archive/` 目录，不出现在技能索引中，但可以恢复。

### Pinned（置顶）

用户可以手动置顶重要技能。置顶的技能**永远不会被自动转为 stale 或 archived**。这是对"我知道这个技能很重要"的明确信号。

### 状态转换的代码

```python
STATE_ACTIVE = "active"
STATE_STALE = "stale"
STATE_ARCHIVED = "archived"
```

状态存储在 `.usage.json` 附属文件中，而不是 SKILL.md 的 frontmatter 里。这是一个有意的设计：**操作遥测数据与用户创作内容分开**，避免冲突压力。

## 使用追踪

技能的每次使用都被追踪。追踪数据存储在 `~/.hermes/skills/.usage.json`：

```json
{
  "python-debugging": {
    "view_count": 42,
    "last_viewed_at": "2026-05-20T14:30:00Z",
    "last_managed_at": "2026-05-15T09:00:00Z",
    "state": "active",
    "pinned": false,
    "provenance": "agent_created"
  }
}
```

追踪的字段：
- **view_count** — 被查看的次数（通过 `skill_view` 或 `/skill-name`）
- **last_viewed_at** — 最后一次被查看的时间
- **last_managed_at** — 最后一次被修改的时间
- **state** — 当前生命周期状态
- **pinned** — 是否被置顶
- **provenance** — 来源（`agent_created`、`bundled`、`hub_installed`）

### 原子写入

`.usage.json` 使用原子写入（tempfile + os.replace），避免并发写入导致数据损坏。还用文件锁（fcntl/Windows msvcrt）序列化跨进程的读写。

## Curator 策展人

光有创建没有清理，技能库会变成垃圾堆。Curator 是 Hermes 的自动策展系统。

### 触发条件

Curator 不是 cron 任务——它是**空闲触发**的。当三个条件同时满足时运行：

1. **Curator 启用**（默认启用）
2. **代理空闲超过 2 小时**（`min_idle_hours = 2`）
3. **距离上次策展超过 7 天**（`interval_hours = 168`）

首次安装后不会立即运行——它会在首次观察时种子一个 `last_run_at`，等一个完整周期后再做第一次策展。

### 工作内容

Curator fork 一个审查代理（与后台审查类似的机制），让它：

1. **合并重叠技能** — 如果两个技能覆盖相似的领域，建议合并
2. **归档过期技能** — 自动将 stale 技能转为 archived
3. **修补技能** — 根据最新的使用模式更新技能内容
4. **状态转换** — 基于 `.usage.json` 的时间戳更新生命周期状态

### 安全边界

Curator 有严格的安全边界：

```python
# 只操作代理创建的技能
def is_agent_created(skill_name):
    provenance = get_provenance(skill_name)
    return provenance == "agent_created"

# 不碰以下技能：
# 1. 内置技能（随 Hermes 发布）
# 2. Hub 安装的技能（通过 hermes skills install）
# 3. 用户置顶的技能（手动 pin）
```

**永远不自动删除——只归档。** 归档是可恢复的，删除不可逆。

### 状态持久化

Curator 的运行状态存储在 `~/.hermes/skills/.curator_state`：

```json
{
  "last_run_at": "2026-05-14T03:00:00Z",
  "last_run_duration_seconds": 45,
  "last_run_summary": "Archived 2 stale skills, updated 1 skill",
  "paused": false,
  "run_count": 12
}
```

用户可以手动控制 Curator：

```bash
hermes curator run           # 立即运行
hermes curator run --dry-run # 预览不执行
hermes curator pause         # 暂停
hermes curator resume        # 恢复
hermes curator pin <skill>   # 置顶技能
```

## 技能管理工具

Agent 通过 `skill_manage` 工具操作技能：

```python
# 创建新技能
skill_manage(action="create", name="python-debugging", description="...")

# 更新技能
skill_manage(action="update", name="python-debugging", content="...")

# 添加支持文件
skill_manage(action="write_file", name="python-debugging",
             file_path="references/common-errors.md", content="...")

# 删除技能
skill_manage(action="delete", name="python-debugging")
```

查看技能通过 `skill_view` 和 `skills_list`：

```python
# 查看技能内容
skill_view(name="python-debugging")

# 列出所有技能
skills_list()
```

## 技能包（Skill Bundles）

有时候一个任务需要同时加载多个技能。技能包让这变得简单：

```yaml
# ~/.hermes/skill-bundles/backend-dev.yaml
name: backend-dev
description: Backend feature work — code review, testing, PR workflow
skills:
  - github-code-review
  - test-driven-development
  - github-pr-workflow
instruction: |
  Extra guidance to inject above the skill bodies.
```

用 `/backend-dev` 一次加载所有三个技能。如果 bundle 和 skill 同名，bundle 优先。

## Skills Hub：社区共享

Hermes 有一个社区技能市场——Skills Hub（[agentskills.io](https://agentskills.io)）。

### 安装技能

```bash
hermes skills install <skill-name>       # 从 Hub 安装
hermes skills install github:user/repo   # 从 GitHub 安装
hermes skills search <query>             # 搜索技能
```

### 技能来源

| 来源 | 说明 | 信任级别 |
|------|------|---------|
| 内置 | 随 Hermes 发布 | `builtin` |
| Hub | 从 agentskills.io 安装 | `trusted` |
| GitHub | 从任意 GitHub repo | `community` |
| 本地 | 用户手动创建 | `user` |

### 安全检查

从外部安装的技能会经过安全扫描。Hermes 维护一个可信仓库列表（`TRUSTED_REPOS`），非可信来源的技能会被放入隔离区（quarantine）等待审查。

## 进化路径：一个技能如何成长

让我用一个完整的例子展示技能的进化过程：

### 第 1 天：首次创建

你在调试一个 Flask 应用，Hermes 帮你解决了几个问题。后台审查代理创建了一个技能：

```
~/.hermes/skills/python-debugging/
└── SKILL.md  (v0.1.0 — 基础调试流程)
```

### 第 3 天：用户纠正

你说"别用 print 调试"。后台审查更新技能：

```diff
## 推荐流程
-1. 在出错位置加 print 语句
+1. 在出错位置设置 pdb 断点
+
+## 用户偏好
+- 使用 pdb 而非 print 调试
```

### 第 10 天：积累经验

多次调试会话后，技能积累了常见错误模式和 workaround：

```
~/.hermes/skills/python-debugging/
├── SKILL.md  (v0.2.0 — 增加了用户偏好和陷阱)
└── references/
    ├── async-pdb.md        # 异步调试经验
    └── docker-debugging.md # Docker 中的调试方法
```

### 第 30 天：Curator 整理

Curator 发现另一个技能 `flask-errors` 与 `python-debugging` 重叠，建议合并。

### 第 60 天：深度进化

技能已经很成熟了：

```
~/.hermes/skills/python-debugging/
├── SKILL.md  (v0.4.0 — 完整的调试指南)
├── references/
│   ├── async-pdb.md
│   ├── docker-debugging.md
│   └── common-errors.md
├── templates/
│   └── debug-config.yaml
└── scripts/
    └── verify-setup.py
```

### 第 120 天（假设不再使用）

30 天没查看 → stale。90 天没查看 → archived。但如果用户之前 pin 了，就永远不会被归档。

## 技能 vs RAG vs Fine-tuning

最后对比一下技能系统和其他常见的 Agent 学习方式：

| 维度 | 技能系统 | RAG | Fine-tuning |
|------|---------|-----|-------------|
| 学习方式 | 经验提炼 | 向量检索 | 梯度更新 |
| 更新成本 | 极低（写文件） | 低（向量写入） | 高（需要训练） |
| 个性化 | 天然支持 | 需要额外设计 | 需要个人数据 |
| 可解释性 | 完全透明 | 较差 | 黑盒 |
| 实时性 | 即时生效 | 即时 | 需要重训练 |

技能系统的优势在于**低成本、可解释、个性化**。劣势在于它依赖 LLM 的上下文理解能力——如果技能太长，模型可能忽略部分内容。

## 小结

Hermes 的技能系统是一个完整的知识管理管道：

- **创建**：后台审查从对话中提炼可复用的操作模式
- **进化**：审查代理持续修补已有技能
- **追踪**：使用频率和生命周期状态独立管理
- **策展**：Curator 自动整理、归档、合并
- **共享**：Skills Hub 让社区技能流通

下一篇：[高级进化：压缩、搜索与达尔文优化](/blog/hermes-self-evolution-5-advanced)

---

*Hermes Agent 是 Nous Research 的开源项目，代码在 [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)。*
