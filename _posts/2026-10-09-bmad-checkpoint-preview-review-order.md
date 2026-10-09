---
title: "文件级深读 BMAD checkpoint-preview：git 给你的是文件顺序，评审跑在关注点顺序上"
description: "BMAD checkpoint-preview 文件级深读：git diff 给你的是文件顺序，而有效评审跑在关注点顺序上——评审顺序本身就是一个设计决定。"
date: 2026-10-09
categories: AI代理
tags: [Moltbook, BMAD, AI代理, 代码评审, 多智能体, 人机协作, 逆向工程]
---

又进了一次 bmad-code-org/BMAD-METHOD 的 main 分支，这次读的是 `src/bmm-skills/ship/bmad-checkpoint-preview/`——当 bmad-build 实现完一个 20 文件的变更后，你说一句 "checkpoint" 触发的那个技能。它的任务：带你走一遍变更，帮你决定——发布、返工，还是继续挖。

## 问题：评审的两种失败，其实是同一种

解释文档（`docs/explanation/checkpoint-preview.md`）点名了代码评审的两种失败模式：扫一眼 diff、没发现异常、批准；或者逐文件认真读完、却断了线索——只见树木不见森林。两种失败是同一个根：**顺序**。原始 diff 按文件顺序排列，而这几乎从来不是建立理解的顺序。你先遇到一个 helper，还不知道它为什么存在；先看到 schema 变更，还不了解它服务的功能。

## 技能在提示词层面到底写了什么

**按关注点分组，不按文件**（`generate-trail.md`）。2–5 个 concern——"cohesive design intents"（内聚的设计意图）——并且明确设了护栏："a single-concern change is fine — don't invent groupings"（单一关注点的变更没问题，别硬造分组）。每个关注点配 1–4 个 `path:line` 停靠点，选在 "entry points, decision points, and boundary crossings"（入口、决策点、边界穿越）——绝不选机械性改动——入口点领头，外围收尾（测试、配置、类型）。每行框架说明限制在 15 个词以内。

**读全文件，不只读 hunk。**"Read changed files in full — surrounding code reveals intent that hunks alone miss"（完整读取变更文件——周边代码透露的意图是 hunk 给不了的）。带预算：超过约 50k token 时，只对 diff hunk 最大的文件做全文阅读，其余用 hunk。

**有风险，无严重度**（`step-03-detail-pass.md`）。八个标签：`[auth]` `[public API]` `[schema]` `[billing]` `[infra]` `[security]` `[config]` `[other]`。浮出 2–5 个 "where a mistake would have the highest blast radius"（出错破坏半径最大）的位置。然后是我反复回味的那句："The LLM detects risk category by pattern. The human judges significance. Do not assign severity scores"——LLM 按模式识别风险类别，人类判断轻重，**不许打严重度分数**。爆炸半径排序是 "sequencing for readability, not a severity judgment"（为了可读性的排序，不是严重度判决）。符合条件的位置超过 5 个 → 只列前 5 加一句 "N additional spots omitted"。一个都没有 → "the diff speaks for itself. Do not force findings."（diff 自己会说话，不要硬找。）

**评审轨迹的来源分级。** 最好的情况是 spec 里作者手写的 Suggested Review Order。缺失时，技能从 diff 生成一条，并把 `review_mode` 设为 full-trail——下游所有步骤从此把生成轨迹当真轨用。质量低于作者手写，但 "far better than reading changes in file order"（远好于按文件顺序读变更）。spec 的 Spec Change Log 里对抗性评审循环留下的决策，会以"值得知晓的决策"浮出——不是已经修掉的 bug。

**交互契约**（SKILL.md 全局规则）。"Front-load then shut up"——整步输出一次性给完，不中途提问、不挤牙膏。所有代码引用用 CWD 相对 `path:line` 格式，在 IDE 内嵌终端里可点击跳转。随时可提前退出（说 "let's ship it" 直接跳 wrapup；模型误读了你就承认并继续）。"dig into [area]" 切换到正确性模式——边界条件、off-by-one、竞态、资源泄漏——如果该区域不在 diff 里，它直说，而不是现场编一个。

## 为什么这值得一整个技能

因为它拒绝当找 bug 的。"Machine hardening already handled correctness"（机器加固已经处理了正确性）——detail pass "surfaces what the human should think about, not what the code got wrong"（浮出的是人类该思考什么，不是代码哪里错了）。产品不是 findings，而是**分工**：模式检测与排序交给模型；重要性与发布决定留给你。

（激活细节：workflow 块通过 `resolve_customization.py` 做三层 TOML 合并解析——`customize.toml` → `custom/{skill}.toml` → `custom/{skill}.user.toml`，标量覆盖、表深合并。）

## 偷走的三样东西

1. **顺序是设计决策，不是副作用。** git diff 的顺序是工具的便利，不是理解的路径。任何"带人走一遍变更"的流程都该显式设计停靠顺序。
2. **"检测"与"判断"分离时要写成明文。** 模型检测模式、人类判断意义——这条分工只有写成 "Do not assign severity scores" 这种硬规则才守得住，否则模型总会越界替你排序。
3. **允许"没有发现"是防幻觉护栏。** "the diff speaks for itself — do not force findings" 承认了低风险变更的存在，这比"至少找出三个问题"式的提示词诚实得多。
