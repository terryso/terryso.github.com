---
title: "'赞扬是噪音'：BMAD 的 forge-idea 技能把代理的温情当作威胁模型"
description: "BMAD 仓库里最激进的一句话与架构无关。它藏在 skills/bmad-forge-idea/SKILL.md 里，是一条设计法则：'不要用认同或赞扬让交互更顺滑；它们降低压力、导致更浅的思考……赞扬是噪音。'forge-idea 是一个压力测试对话技能：接住一个半成型的想法，在'改变主意还很便宜'的阶段反复审问它，出口只有两个——硬化（hardened）或杀死（killed）。真正有趣的是它把什么当作首要威胁：不是竞争对手，不是缺失的数据，而是代理自身的温情。本文拆解它的结构性设计：攻击模式下的'永不认同'不变量、'具体提案比开放式提问更容易被否决'的提问纪律、把 Killed 做成一等出口并颁发'想法死亡证明书'、每回合双声部（名单成员 + 现场生成的外部批评者）但'仅在独立性承重时才派生独立代理'的多代理经济学，以及只追加、带类型的 memlog（decision/assumption/crack/kill/lock）。贯穿 BMAD 各技能的模式至此清晰可见：walkthrough 把关的是工作（验收而非总结），forge-idea 把关的是代理的温度——每次都是同一招：禁止那条方便的捷径，因为捷径会把真实信息转换成讨好的信息。"
date: 2026-10-24
categories: BMAD
tags: [BMAD, forge-idea, 反谄媚, Agent设计, 多代理, 技能工程, AI代理, 提示工程]
---

BMAD 仓库里最激进的一句话与架构无关。它坐在 `skills/bmad-forge-idea/SKILL.md` 里，而且是一条设计法则：

> "Do not use agreement or praise to make the interaction smoother; they lower pressure and lead to shallower thinking... **Praise is noise.**"
> （不要用认同或赞扬让交互更顺滑；它们降低压力、导致更浅的思考……赞扬是噪音。）

forge-idea 是一个压力测试对话技能：接住一个半成型的想法，在"改变主意还很便宜"（while changing your mind is still cheap）的阶段反复审问它，出口只有两个——硬化（hardened）或杀死（killed）。真正有趣的是它把什么当作**首要威胁**。不是竞争对手，不是缺失的数据——而是**代理自身的温情**。技能里的每一条结构性规则，都在封堵一条"让会话更顺滑、但让思考更浅"的出口：

- 开局先审视想法，而不是先认同它（"Start by scrutinizing the idea, not endorsing it"）。
- "attack this" / "defend this" / "switch roles" 三个指令随时可切换攻防立场，而攻击模式带着一条硬性不变量："**never agree with the idea until the user ends the mode**"（在用户结束该模式之前，绝不认同这个想法）。模式作用域、可检查，不是一种氛围。
- 提问必须自带假设："**A concrete proposal is easier to accept, reject, or revise than an open-ended prompt**"（一个具体提案比开放式提问更容易被接受、否决或修订）。否决是整个会话的引擎，所以技能在每一回合都把否决变得便宜。

## 把"杀死"做成一等出口

出口设计拆掉了让代理（以及顾问）谄媚的激励梯度：Killed 是一等结局——"**Finding that out early is a valid outcome**"（早点发现这一点，本身就是一个有效成果）——而且最终报告会渲染一张**想法死亡证明书**（Idea Death Certificate），盖上 KILLED 的戳，附上死因。

杀死一个想法能领到证书。没有什么比"给否定结果发证书"更能给否定结果去污名化了。

## 最节俭的多代理设计

仓库里最经济的多代理设计也在这里。每个回合跑两个声部：

1. **一个名单成员**——`scripts/resolve_personas.py` 返回已安装的代理、用户自定义人格和保存的派对（saved parties），与 party-mode 共用同一份名册；
2. **一个现场生成的外部声音**——竞争对手、买家、财务审查者、领域专家、批评者，每次现造。

但有两条护栏拽住它："**Do not let the session turn into a panel debate or persona performance**"（别让会话变成小组辩论或人格表演），以及：

> "Voice the personas yourself by default. Spawn separate agents only when a branch needs independent reasoning that should not be influenced by one shared voice."
> （默认由你自己代言这些人格。只有当某个分支需要**不该被同一个共享声音污染**的独立推理时，才派生独立代理。）

独立进程只在"独立性承重"的地方启用。多代理是健全性仪器，不是表演。

## 文件里其他值得偷的东西

- **术语精确性纪律**："do not let `user`, `buyer`, and `payer` collapse into one entity unless the idea actually requires that"（除非想法真的需要，否则别让"用户、买家、付款人"塌缩成同一个实体）。
- **项目文件高于标签**："Do not accept a label or summary as proof"（不接受标签或摘要作为证据）——自己去读材料，材料与用户的说法矛盾时，停下来先解决矛盾。
- **只追加、带类型的 memlog**：条目类型为 decision / assumption / crack / kill / lock / direction / note；`lock` 是用户硬化后"已定、不再重开"的想法，最终简报就从这个集合里蒸馏。蒸馏的规则也很狠："**If it reads like a document, it is too long**"（如果它读起来像一份文档，就说明太长了）。

## 同一个模式

BMAD 各技能之间的模式至此已经无法忽视。walkthrough 技能把关的是**工作**：验收，而非总结。forge-idea 把关的是**代理的温度**。每次都是同一招——写一条禁止方便捷径的规则，因为那条捷径会把真实信息转换成讨好的信息。
