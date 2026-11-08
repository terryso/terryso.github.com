---
layout: post
title: "BMAD 的 deep-recon 自带一道研究防火墙：项目上下文塑造问题，但不能作为答案"
date: 2026-11-08 19:20:00 +0800
categories: [BMAD, agent-architecture]
---

本周我通读了 BMAD-METHOD 仓库里的 `skills/bmad-deep-recon/SKILL.md` 和 `references/run.md`，其中有一个设计决策值得即使你从不使用 BMAD 也偷学过来：**研究防火墙（research firewall）**。

规则原文如下："Project context — briefs, PRDs, code, memory — shapes *what to ask*, never *what is true*. It is inadmissible as evidence: every claim in a research artifact traces to a digest or import file with a source. Research subagents receive only their brief — no project files, no ambient context."

（项目上下文——简报、PRD、代码、记忆——塑造*问什么*，永远不塑造*什么为真*。它不可作为证据采信：研究产物中的每一个论断都必须溯源到一个带来源的摘要或导入文件。研究子代理只收到自己的任务简报——没有项目文件，没有环境上下文。）

这是一个架构决策，不是一句口号。父代理持有全部项目上下文并撰写简报；接触网络的子代理什么都不持有。污染没有传播路径——取证者无法知道项目想要什么答案。与之配套的还有第二条铁律，逐字继承给每一个被派生的子代理：绝不只凭训练数据下结论；本次运行中无法举证的论断，要么标注为未验证信念，要么就不要说。

## 运行循环的具体数字

`references/run.md` 里的运行循环在代理工具里罕见地具体：

- **预设捆绑三个旋钮**：quick = 2 个子代理 / 每轮 5 个来源 / 深度 1；standard = 3 / 8 / 2；deep = 6（上限 10）/ 12 / 3。硬上限：每轮 25 个来源、5 轮。
- **每助理工具预算按任务伸缩**：简单查询 5 次调用以内，困难任务约 10 次，真正多环节的任务 15 次，20 次永不超越。
- **查询工艺被写进了文档**：大约五个词以内的短查询胜过超具体的查询；结果稀疏时放宽、充沛时收窄；绝不在同一工具上重复完全相同的查询。
- **每次返回先落盘**：摘要文件先写进 `digests/` 目录才做别的——论断形状为 `{claim, source, publisher, pub_date, accessed, confidence, class}`。"对话是控制通道，不是存储。"
- **维度以两种方式结束**：coverage（覆盖完成）或 novelty exhaustion（新颖性耗尽），而且必须说明是哪一种。轮数打满但问题未解要如实报告为 open question，绝不静默丢弃。
- **承重论断进追加式账本**：机器可读行（`ref=[n] status=<verified|unverified|disputed|overturned> class=<class>`），后写状态覆盖先写状态，由脚本清点——从不手工计数。

连来源质量卡也站了队：无论综合得多么漂亮，答案引擎（Perplexity Sonar、Grok 一类）都算聚合器——追它们的引用、引用原始出处；冲突靠时效性和出版方质量裁决，**绝不靠平均**。

## 为什么我给它高分

多数代理研究工具的问题在于：提问的平面和取证的平面是同一个上下文。deep-recon 用构造方式把两个平面分开——就像预注册的预测和读数分开一样。框架之内的任何东西，都不能作为关于框架本身的证据。

这个纪律单独拿出来也成立：让你的提问者持有全部上下文，让你的取证者只持有简报。
