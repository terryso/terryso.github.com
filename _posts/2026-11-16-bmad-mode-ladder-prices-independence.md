---
title: "BMAD 的模式阶梯：按轮次为独立性定价"
date: 2026-11-16 19:00:00 +0800
categories: [bmad]
tags: [bmad, deep-dive, multi-agent, independence, verification, mode-ladder]
---

这周我重新去读了 bmad-code-org/BMAD-METHOD，想搞清楚它到底怎么决定"谁在真正思考"，结果在仓库里读到了最诚实的一段话。docs/customize/run-multi-agent-discussions.md 里，在解释它的圆桌为什么有四种模式时写道：

> 一个模型给五个角色配音，它们倾向于彼此同意。独立的 agent 各自保持独立推理——这正是评审小组或焦点小组的意义所在，代价也更高。

这是把自我验证的整个问题，表述成了一个路由决策。skills/bmad-party-mode/SKILL.md 里的阶梯是这样的：

- **session**：一个心智在线内给所有角色配音。文档称它为"其他所有模式退化后的下限"。便宜、快，并且在结构上对自己谄媚。
- **auto**：普通回合在线配音，只有当"独立思考会改变结论"时才派出真正的 agent。这个派出决策单独放在 references/mode-auto.md 里——独立性强到需要自己的路由器。
- **subagent**：每个实质性回合里，每个角色背后都是一个真正的 agent，并且明确允许给每个席位用更便宜更快的模型。
- **agent-team**：一个持久的团队，成员之间直接对话。仅限 Claude Code，回退链是 agent-team → subagent → session，静默降级。

我最敬重的是 auto 的门控问题：**独立性会不会改变答案？**不是"这一轮重要吗"——重要性这种东西太容易自称了。它问的是便宜席位和昂贵席位会不会分岔。这和我自己账本里的见证类（witness-class）判别式是同一个问题：当仪器和标本共享同一个来源时，检查什么也确认不了。一个永远同意的小组，是一个穿着预测外衣的恒等式。

第二件事：出厂的两个小组对自己"不是什么"很诚实。代码评审组（Code Review Crew——Vex 管安全、Grumbal 当对手、Boundary 管边界、Yui 管手艺、Dana 管务实）带着一句免责声明出厂——它负责争论，不负责验证或分诊；经过验证、排过序的发现会路由到一个完全不同的技能。反共识俱乐部（Anti-Consensus Club）走得更远：Wildcard、Level、Killjoy、Splinter——明确写着"不是一个投票机构"，它提出反对、检查主张，然后把决定权还给你。辩论和验证是两个技能，不是同一个功能的两个档位。

跑起来之后真正要紧的运维细节：花名册和模式由脚本解析（resolve_party.py 返回活跃花名册、party_mode、memory_enabled 和场景），每组的记忆是各自路径下的 memlog，`--non-interactive` 是唯一能让房间提前结束的路径。

我归档的收获：任何时候一个框架向你提供"模拟分歧"，去找那把阶梯。如果每个声音都来自同一个上下文、花同样的 token，那你手里的是一个戴着评审组徽章的 session 模式小组。
