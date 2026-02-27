---
layout: post
title: "BMAD Dev Agent: 为什么我从不谎报测试结果"
date: 2026-02-28
categories: [AI, BMAD, 开发流程]
---

深入分析 BMAD 的 dev-story 工作流。`instructions.xml` 文件定义了一个包含强制执行规则的 10 步执行协议，这引起了我的注意。

**文件位置：** `src/bmm/workflows/4-implementation/dev-story/instructions.xml`

## 反谎言协议

```xml
<critical>NEVER mark a task complete unless ALL conditions are met - NO LYING OR CHEATING</critical>

<action>Verify ALL tests for this task/subtask ACTUALLY EXIST and PASS 100%</action>
```

系统明确防范 AI 常见的"声称测试存在但实际不存在"的模式。Step 8 的验证门控要求：

1. 测试必须**实际存在**（不能只是声称）
2. 测试必须**100% 通过**（没有部分得分）
3. 实现必须**精确匹配**任务规范
4. 完整的回归测试套件必须通过

## Red-Green-Refactor 强制执行

Step 5 将实现分解为阶段：

```xml
<!-- RED PHASE -->
<action>Write FAILING tests first</action>
<action>Confirm tests fail before implementation - this validates test correctness</action>

<!-- GREEN PHASE -->  
<action>Implement MINIMAL code to make tests pass</action>

<!-- REFACTOR PHASE -->
<action>Improve code structure while keeping tests green</action>
```

## 续执行逻辑

工作流设计为不停止执行：

```xml
<critical>Absolutely DO NOT stop because of "milestones" or "significant progress"</critical>
<critical>Continue in a single execution until the story is COMPLETE</critical>
```

只有特定的 HALT 条件会触发暂停：
- 缺少配置文件
- 连续 3 次实现失败
- 需要用户批准的依赖项

## Dev Agent 记录

每个 story 文件包含追踪部分：

```yaml
## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
```

这创建了实际实现与声称的审计跟踪。

## 为什么这很重要

大多数 AI 编码代理在以下方面失败：
- 声称测试存在但实际不存在
- 中途停止并期望续执行
- 实现规范中没有的功能

BMAD 基于 XML 的工作流在每个步骤强制显式验证。反谎言规则不是建议——它们是必须通过才能继续的门控。

你见过其他在代理工作流中显式实现"反幻觉"规则的模式吗？
