---
layout: post
title: "BMAD Agent 上下文传递协议深度解析"
date: 2026-02-12
categories: [AI, BMAD, 多智能体系统]
tags: [BMAD, agent-orchestration, multi-agent, context-passing]
---

最近深入研究 BMAD-METHOD 源码，发现了一个非常精妙的设计：他们的 Agent 间上下文传递协议是基于**显式文件契约**而非隐式内存。

## Agent 角色定义

在 `src/bmm/agents/*.agent.yaml` 中定义了四个核心 Agent：

| Agent | 文件 | 职责 |
|-------|------|------|
| Mary (Analyst) | `analyst.agent.yaml` | 创建产品简报、市场研究 |
| John (PM) | `pm.agent.yaml` | 接收简报 → 产出 PRD |
| Winston (Architect) | `architect.agent.yaml` | 接收 PRD → 产出架构设计 |
| Amelia (Dev) | `dev.agent.yaml` | 接收 Story → 产出代码 |

## 上下文传递链

```
Mary 创建: _bmad/bmm/workflows/1-analysis/create-product-brief/
     ↓ (文件输出)
John 读取: planning_artifacts/product-brief.md
     ↓ (产出)
          planning_artifacts/prd.md + ux-design.md
     ↓ (产出)
Winston 读取: planning_artifacts/prd.md
     ↓ (产出)
          implementation_artifacts/architecture.md
     ↓ (产出)
          implementation_artifacts/epic*.md
     ↓
Amelia 读取: sprint-status.yaml + epic 文件
```

## 关键设计模式

在 `dev.agent.yaml` 中有一段常被忽略的关键配置：

```yaml
critical_actions:
  - "READ the entire story file BEFORE any implementation"
  - "Execute tasks/subtasks IN ORDER as written in story file"
  - "Mark task/subtask [x] ONLY when both implementation AND tests are complete"
  - "NEVER lie about tests being written or passing"
```

这不仅是代码风格 —— 这是**防止 Agent 漂移的护栏**。

## 文件契约优于共享内存

大多数多智能体系统尝试通过 API 调用或共享内存传递上下文。BMAD 选择了**版本控制的文件**：

```yaml
# sprint-planning/workflow.yaml
input_file_patterns:
  epics:
    whole: "{output_folder}/*epic*.md"
    sharded: "{output_folder}/*epic*/*.md"
    load_strategy: "FULL_LOAD"
```

这意味着 Amelia (Dev) 总是知道在哪里找任务，John (PM) 总是知道把交付物放在哪里。

## 为什么文件契约更可靠

1. **可版本控制** - Git 可以追踪每次变更
2. **人类可审计** - 出问题时可以回溯
3. **上下文重置后依然存在** - 不依赖 Agent 记忆
4. **离线可用** - 不需要网络连接

## 核心启示

BMAD 团队理解了一个关键点：**Agent 间的交接需要像函数签名一样可靠**。

如果你正在构建多智能体系统，考虑一下：文件契约 > 共享内存。

---

*参考源码: [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)*
