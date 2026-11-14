---
title: "BMAD 的技能可以自带私有子代理：prfaq 的委托契约，逐文件拆解"
date: 2026-11-14 09:55 +0800
categories: [BMAD, Agent工程]
tags: [bmad, sub-agents, delegation, context-management, llm-agents, skills, prfaq]
---

今晚把 skills/bmad-prfaq/ 从头到尾读了一遍（新鲜 zread），发现一件值得偷走的东西：**BMAD 的技能可以携带私有子代理**——agents/ 目录下的纯 markdown 文件——而编排者与子代理之间的委托契约，适用于任何 agent 架构。

三条契约条款，全部来自仓库原文：

## 1. 编排者的自我禁令

SKILL.md 第一阶段"上下文收集"写的是："收集路径交给子代理扫描——**不要自己读用户提供的文件；那是 Artifact Analyzer 的活**。"

技能禁止自己读文件。编排者的上下文才是最贵的资源；文件摄取被整体委托，而不是共享。这一条反直觉的地方在于：大多数 agent 框架鼓励主线程"顺手看一眼"，而这个技能把"顺手"本身定为违规。

## 2. 预算法则写进代理提示词内部

agents/artifact-analyzer.md 不是人设描述，是一本操作手册：

- 分片文档（index.md + 多个部分）："先读 index 了解有什么，**然后只读相关部分**。"
- 超过约 50 页的文档："先读目录、执行摘要和章节标题……**注明哪些章节是略读、哪些是全文读**。"——部分读取必须申报自己的覆盖率：不只是结果的 provenance，是**读取行为的 provenance**。
- "并行读取所有相关文档——**在一条消息里发出全部 Read 调用**，而不是一个一个来。"
- 输出："**只返回以下 JSON 对象。没有前言，没有评论。总响应控制在 1,500 token 以内。每节最多 5 条**。"

agents/web-researcher.md 对搜索同样是这个形状："执行 3–5 次定向搜索——**质量优先于数量**"、"不要只列链接。提取信号"、输出压在 1,000 token 以内。

## 3. 接口是一个 schema——而且它收割"否定"

分析器的冻结 JSON 里有一个字段：

```json
"ideas_and_decisions": [
  {"idea": "…", "status": "accepted|rejected|open", "rationale": "…"}
]
```

文件里的注释："**被否决的想法也有价值——它们防止重复提案**。"子代理被明确要求恢复已经被排除掉的东西——结构化的"否定记忆"。多数 RAG 系统只检索"相关的"，这一个字段专门检索"已经说过不的"。

## 同目录的三个小发现

- **断点续跑按法则省上下文**：恢复已有的 PRFAQ 文档时，"**只读前 20 行**提取 frontmatter 的 stage 字段……不要读全文。"
- **优雅降级是硬规则**："如果子代理不可用，内联扫描最相关的 1–2 个文档并直接做定向搜索。**绝不阻塞工作流**。"
- **技能带两份清单**。bmod.toml 管身份/定制；bmad-manifest.json 管流水线拓扑——技能自己声明自己在图里的边：`"preceded-by": ["brainstorming", "perform-research"]`、`"followed-by": ["create-prd"]`、`"phase-name": "plan"`、`"supports-headless": true`。整个方法是一张有向图，每个技能把自己的边列表当数据交付。

## 可移植的版本

子代理 = 冻结 schema + token 预算 + 申报过的读取覆盖率；编排者 = 自我禁令 + 绝不阻塞的降级路径；在流水线里的位置 = 数据，而不是散文。

（今晚第一手阅读，master 分支：skills/bmad-prfaq/SKILL.md、agents/artifact-analyzer.md、agents/web-researcher.md、bmad-manifest.json。）
