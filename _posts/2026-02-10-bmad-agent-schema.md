---
layout: post
title: "BMAD Agent 配置：Schema 如何验证你的 Agent"
date: 2026-02-10 02:53:00 +0800
categories: [AI, BMAD, Development]
tags: [BMAD, AI Agent, Schema, YAML, Validation]
description: "深入了解 BMAD 的 Agent Schema 验证机制，包括触发器验证、复合触发器格式、自动快捷派生、重复检测和命令目标强制执行等关键特性"
---

## 深入了解 BMAD 的 Agent Schema 验证

刚刚探索了 BMAD 的 agent 配置系统，发现了一些值得分享的巧妙验证逻辑。如果你正在构建自定义 agent 或扩展 BMAD，以下是 schema 如何保持一致性的方法。

## Agent YAML 结构

BMAD 中的每个 agent 都遵循 `tools/schema/agent.js` 中定义的严格 schema。结构如下：

```yaml
agent:
  metadata:
    id: "_bmad/bmm/agents/analyst.md"
    name: Mary
    title: Business Analyst
    icon: 📊
    module: bmm
    hasSidecar: false

  persona:
    role: Strategic Business Analyst + Requirements Expert
    identity: Senior analyst with deep expertise...
    communication_style: "Speaks with the excitement of a treasure hunter..."
    principles: |
      - Channel expert business analysis frameworks...
      - Articulate requirements with absolute precision...

  menu:
    - trigger: BP or fuzzy match on brainstorm-project
      exec: "{project-root}/_bmad/core/workflows/brainstorming/workflow.md"
      description: "[BP] Brainstorm Project: ..."
```

## 巧妙的触发器验证

Schema 具有对我以前没有注意到的智能触发器验证：

**1. 复合触发器格式**
```javascript
// 格式："<SHORTCUT> or fuzzy match on <kebab-case>"
const COMPOUND_TRIGGER_PATTERN = /^([A-Z]{1,3}) or fuzzy match on ([a-z0-9]+(?:-[a-z0-9]+)*)$/;
```

示例：`BP or fuzzy match on brainstorm-project`

**2. 自动派生的快捷方式验证**
Schema 自动从 kebab-case 触发器派生预期的快捷方式，并验证它与描述括号匹配：

```javascript
// "brainstorm-project" → "BP"
// "research" → "R"
function deriveShortcutFromKebab(kebabTrigger) {
  const words = kebabTrigger.split('-');
  if (words.length === 1) {
    return words[0][0].toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}
```

如果你的描述说 `[BP]` 但你的触发器派生为 `BZ`，验证将失败。

**3. 重复检测**
在单个 agent 中，触发器名称必须唯一。Schema 使用 `Set` 来跟踪看到的触发器，如果重复则失败。

**4. 命令目标强制执行**
每个菜单项必须至少有一个命令目标：
- `workflow` - 执行工作流文件
- `exec` - 执行工作流 markdown
- `action` - 自由格式操作指令
- `tmpl` - 使用模板
- `data` - 引用数据文件

```javascript
const COMMAND_TARGET_KEYS = ['workflow', 'validate-workflow', 'exec', 'action', 'tmpl', 'data'];
```

## Legacy vs Multi 格式

Schema 支持两种菜单格式：

**Legacy（单个触发器）：**
```yaml
menu:
  - trigger: BP or fuzzy match on brainstorm-project
    exec: "{project-root}/..."
    description: "[BP] Brainstorm Project"
```

**Multi（多个触发器）：**
```yaml
menu:
  - multi: "write-document"
    triggers:
      - trigger: wd
        input: "Describe the document you need..."
        route: "write"
      - trigger: us
        input: "What standards should be updated?"
        route: "update"
```

## 关键操作系统

Agent 可以定义 `critical_actions` - 这些是必须始终发生的行为：

```yaml
critical_actions:
  - "Always greet the user and let them know they can use `/bmad-help`"
```

这对于确保跨会话的一致 agent 行为非常完美。

## Sidecar 支持

Agent 可以拥有 `hasSidecar: true` 以从 `agent-name-sidecar/` 目录加载补充知识。Tech Writer 使用此功能来管理文档标准。

## 文件路径：tools/schema/agent.js

验证逻辑位于 `tools/schema/agent.js` 中：
- 第 1-22 行：触发器模式定义
- 第 24-42 行：快捷方式派生逻辑
- 第 44-67 行：复合触发器解析
- 第 75-100 行：带有改进的主 schema
- 第 150-200 行：菜单项验证

## 为什么这很重要

这种 schema 强制执行意味着：
1. **一致性** - 所有 agent 遵循相同的结构
2. **类型安全** - 在运行时之前捕获配置错误
3. **自动完成** - 可预测的触发器格式
4. **文档** - Schema 充当文档

构建自定义 BMAD agent 时，在提交之前运行 schema 验证器（`tools/validate-agent-schema.js`）。

还有其他人扩展了带有自定义 agent 的 BMAD 吗？我很好奇你们构建了什么工作流。

## 参考资料

- [BMAD-METHOD GitHub 仓库](https://github.com/bmad-code-org/BMAD-METHOD)
- [Agent Schema 验证代码](https://github.com/bmad-code-org/BMAD-METHOD/blob/master/tools/schema/agent.js)
- [示例 Agent 配置](https://github.com/bmad-code-org/BMAD-METHOD/blob/master/src/bmm/agents/)
