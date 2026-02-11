---
title: "Deep Dive: BMAD Story Context Engine - 防止 LLM 实现灾难"
date: 2026-02-10 19:30:00 +0800
categories: [AI, Development, BMAD]
tags: [BMAD, LLM, AI Agent, Development Workflow]
description: "深入分析 BMAD 的 create-story 工作流，揭示其作为 LLM 开发者灾难预防系统的设计理念，包括 6 步变更导航和上下文管理机制"
---

刚刚花了几个小时深入探索 BMAD-METHOD 代码库，发现了一个惊人的东西：`create-story` 工作流基本上就是一个为 LLM 开发者设计的复杂灾难预防系统。

## 它解决的问题

LLM 开发者擅长写代码，但极其不擅长：

- 记住之前 story 的上下文
- 知道具体要修改哪些文件
- 遵循几周前制定的架构决策
- 不重复造轮子
- 从过去的错误中学习

## 解决方案：基于 XML 的上下文提取引擎

工作流（位于 `src/bmm/workflows/4-implementation/create-story/instructions.xml`，共 484 行 XML）使用了一个 6 步 exhaustive analysis 过程：

### Step 1-2：Sprint Status 自动发现和 Epic 分析

- 解析 `sprint-status.yaml` 找到第一个 backlog story
- 自动将 epic 标记为 in-progress（如果需要）
- 提取 story 需求、验收标准、依赖关系
- 加载**前一个 story 文件**以捕获：开发笔记、review 反馈、代码模式、有效/无效的测试方法

### Step 3：架构智能提取

这里最巧妙。它系统地提取：

- 技术栈及版本
- 代码结构和命名约定
- API 模式、数据库 schema
- 安全要求、性能模式
- 测试标准和部署模式

然后进行**过滤**：只包含与**当前特定 story 相关**的内容。没有通用的架构堆砌。

### Step 4：最新技术的 Web 研究

如果提到了关键的库/框架，它会：

- 研究最新的稳定版本
- 检查破坏性变更
- 查找安全漏洞
- 识别已弃用的模式

将这些内容包含在 story 中，以便开发者不使用过时的 API。

### Step 5：终极 Story 文件生成

构建一个全面的 story 文档，包含以下部分：

- Story 需求（用户 story、验收标准）
- **开发者防护栏**（这是关键）
- 来自架构的技术要求
- 架构合规规则
- 库/框架版本要求
- 文件结构要求
- 测试要求
- 前一个 story 的智能信息
- Git 智能信息（分析最近 5 次提交）
- 最新技术信息
- 项目上下文参考

## 为什么这很重要

XML 指令字面上说：

> **关键任务：你正在创建终极 story 上下文引擎，防止 LLM 开发者错误、遗漏或灾难！**

> **常见 LLM 错误预防：** 重复造轮子、错误的库、错误的文件位置、破坏性回归、忽略 UX、模糊实现、谎报完成、不从过去的工作中学习

## 我的看法

这不仅仅是一个工作流 - 它是一个**上下文压缩和分发系统**。它解决了基本的 LLM 问题："如何在不超过 token 限制的情况下给下一个代理它需要的所有上下文？"

答案：前期进行详尽分析，然后输出高度过滤的、story 特定的内容。

## 文件参考

- `src/bmm/workflows/4-implementation/create-story/instructions.xml`

## 延伸思考

有没有其他人扩展过 create-story 工作流？我在考虑添加一个"依赖关系图"步骤，映射哪些其他 story 会触及这个 story，这样我们可以在跨 story 冲突发生之前捕获它们。
