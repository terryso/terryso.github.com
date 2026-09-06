---
title: "BMAD 的 checkpoint-preview：把人工评审当工作流，而不是暂停键"
date: 2026-09-06
categories: BMAD
tags: [BMAD, Agent工作流, 人工评审, 代码审查]
---

大多数代理框架把人工评审当作一次打断：代理停下，人类眯着眼看一遍 diff，批准，继续。BMAD-METHOD 为相反的方向专门做了一个技能——`src/bmm-skills/ship/bmad-checkpoint-preview/`——而它最有意思的地方在于它对"评审者注意力"这个稀缺资源所做的假设。

**流水线：** `[Orientation] → Walkthrough → Detail Pass → Testing`。每个步骤遵守一条单消息规则，叫 "front-load then shut up"（先端上来，然后闭嘴）：整个步骤的输出一次性以一条完整消息给出。不在步骤中途提问，不挤牙膏。

**找到要评审的东西靠的是级联，不是提问。** `step-01-orientation.md` 用五个阶段解析"改了什么"，命中即停：显式参数 → 近期对话 → 冲刺跟踪（扫描 `*sprint-status*` 里状态为 `review` 的故事）→ 当前 git 状态（"我看到 HEAD 是 `<branch>` 分支上的 `<sha>`——要评审的是这个改动吗？"）→ 询问。如果三轮对话过后仍然无法确定改动物，HALT（硬停）。指令措辞异常直白："Never ask extra questions beyond what the cascade prescribes"（不得提出级联规定之外的任何问题）。

**一条诚实的降级阶梯。** `review_mode` 取第一个匹配项：

- `full-trail` —— 规格文档里有 `## Suggested Review Order` 一节
- `spec-only` —— 有规格文档，但没有评审轨迹
- `bare-commit` —— 没有规格文档；意图来自提交信息。提交信息太短（少于 10 个词）？代理扫描 diff、起草一句意图，并标记 `[inferred]`（推断所得），让人类可以纠正它

diff 基线同样级联：规格文档 frontmatter 里的 `baseline_commit` → 对 main 的 merge-base → `HEAD~1`（并向用户说明只统计了最新一次提交）→ 算不出来就跳过统计并注明。

**表面积统计。** Orientation 阶段输出一行：`N files changed · M modules touched · ~L lines of logic · B boundary crossings · P new public interfaces`。"lines of logic"（逻辑行数）排除空行、导入和格式化改动——它近似的是思考量，不是打字量。boundary crossings（边界穿越数）统计跨越多个顶层模块的改动。而统管所有指标的规则是："Omit any metric you cannot compute rather than guessing"（算不出来的指标宁可省略，也不要瞎猜）。

**评审轨迹（review trail）才是真正的核心想法。** diff 天然按文件顺序到达——机械的，往往就是字母序。而一条轨迹是 2–5 个关注点（每个是一段内聚的设计意图，解释一簇改动背后的*为什么*），每个关注点配 1–4 个 `path:line` 停靠点，入口点排最前，外围件（测试、配置、类型）收尾。技能还明确警告：单一关注点的改动不要硬造分组。

作者没留轨迹？`generate-trail.md` 会从 diff 生成一条——并且开门见山地声明自己的质量档位："lower quality than an author-produced one, but far better than none"（低于作者手写的，但远好于没有）。它要求完整阅读被改动的文件而不是只看 hunk（周边代码能揭示 hunk 漏掉的意图），设有一个约 50k token 的预算，超限时退化为"最大 hunk 优先"。生成轨迹会被明确标注为生成物，然后在下游被当作真轨迹使用。

**Testing 步骤拒绝变成测试套件。** `step-04-testing.md` 写道："experiential, not analytical. The detail pass asked 'did you think about X?' — this says 'you could see X with your own eyes.'"（体验式，而非分析式。细节评审问的是"你想过 X 吗"——这一步说的是"你能亲眼看到 X"。）它不复刻 CI——它假设 CI 正常——目标是给出 2–5 条建议，格式为做什么 / 预期看到什么 / 为什么值得看，按"每单位努力的置信度"排序。没有可观察行为的改动会得到一句明确的"本次改动是内部实现"。"Do not invent observations"（不得编造观察项）。

## 可迁移的模式

这套东西不是 BMAD 专属的。当你的代理请求人类批准它的工作时，给评审者：

1. **按意图顺序设计的阅读路径**，而不是按文件顺序
2. **降级标签**，标在一切推断所得的东西上（`[inferred]`、"生成轨迹"）
3. **可观察的行为**（做 X，预期看到 Y），而不是断言

评审者的注意力才是稀缺资源。字母序的 diff 顺序，等于把这份注意力花在文件树那天碰巧排在前面的任何东西上。
