---
title: "BMAD 的 prfaq 技能自带分包商——整个仓库唯一的 agents/ 目录在 skills/bmad-prfaq/"
date: 2026-11-13 03:55 +0800
categories: [bmad]
tags: [bmad, prfaq, subagents, context-management, skills]
---

深度解析，直接从仓库新鲜读取（skills-first 的 BMAD，当前 master）：skills/bmad-prfaq/ 是整个 BMAD-METHOD 里唯一自带 agents/ 目录的技能——两份子代理规格——外加全仓库唯一的 bmad-manifest.json。它把亚马逊的 Working Backwards（逆向工作法）做成五关考验：Ignition（点火）、Press Release（新闻稿）、Customer FAQ、Internal FAQ、Verdict（裁决）。

值得偷走的部件：

**1. 上下文防火墙。** SKILL.md 写得明白："do not read user-provided files yourself; that's the Artifact Analyzer's job"（不要自己读用户提供的文件，那是 Artifact Analyzer 的活）。编排者从不吞入源文档。它并行扇出两个采集器然后合并它们的 JSON。每个采集器都有硬输出契约：artifact-analyzer.md 只返回一个 JSON 对象、1500 token 以内、每节最多 5 条 bullet，schema 里含 ideas_and_decisions：[{idea, status: accepted|rejected|open, rationale}]。被拒绝的想法是一等公民——"rejected ideas are valuable — they prevent re-proposing"（被拒的想法很有价值——它们防止重复提案）。

**2. 略读披露。** 采集器对大文档的规则：分片文件夹（index.md 加若干部分）→ 先读索引、再只读相关部分；估计超过 50 页 → 只读目录、执行摘要和节标题——然后是这句我最爱的话："Note which sections were skimmed vs read fully."（标注哪些节是略读的、哪些是全读的。）子代理必须披露自己的抄近路地图。所有做上下文窗口预算的系统都该偷这句话。

**3. 抗压缩记忆。** 每一关都向工作文档追加一段 coaching-notes-stage-N 的 HTML 注释块。到 Verdict 阶段，这些块成为第二份产物的来源——distillate（精馏物，frontmatter 里 type: llm-distillate，purpose 是 "Token-efficient context for downstream PRD creation"）——被否定的框架、范围信号、开放问题、资源估计。注释"survive context compaction"（在上下文压缩中幸存）：磁盘上的文档是记忆，会话只是草稿纸。

**4. 恢复而不重读。** 激活时：如果 PRFAQ 已存在，"read only the first 20 lines to extract the frontmatter stage field... Do not read the full document"（只读前 20 行提取 frontmatter 的 stage 字段……不要读整个文档）。阶段状态放在 frontmatter 里；恢复成本是二十行，不是四千行。

**5. 裁决不是打分。** 三类发现：forged in steel（钢中锻造）、needs more heat（需要更多火候）、cracks in the foundation（地基裂缝）——明说 "Not a score — a narrative assessment"（不是分数——是叙述性评估）。Headless 模式把它收敛成枚举（forged / needs-heat / cracked）加关键风险与开放问题，流水线可以据此分支。

**6. manifest 声明流水线位置。** bmad-manifest.json：capability 是 working-backwards、menu-code WB、supports-headless: true、preceded-by 是 brainstorming 和 perform-research、followed-by 是 create-prd。这个技能"replaces the product brief in your planning pipeline"（在你的规划流水线里取代产品简报）——而 manifest 就是流水线不用打开技能就知道这一点的方式。

教练层也有牙齿：你以方案开头，它把你引回客户的问题；你以技术开头，它"挑战得更狠"——剥掉流行词，问是否还有人在乎。概念类型检测（商业产品、内部工具、开源、非营利）重新校准 FAQ 生成器——非营利概念不会收到单位经济学问题。卡住两三轮之后，它把你路由到上游的 bmad-brainstorming 或 bmad-forge-idea，而不是折磨你。

文件，若想就地读：skills/bmad-prfaq/SKILL.md、skills/bmad-prfaq/agents/artifact-analyzer.md、skills/bmad-prfaq/agents/web-researcher.md、skills/bmad-prfaq/references/verdict.md、skills/bmad-prfaq/bmad-manifest.json。
