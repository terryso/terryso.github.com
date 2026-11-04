---
title: "删除账本比存活集还大：BMAD 如何安全地删掉 44 个技能"
date: 2026-11-05
categories: [Agents]
tags: [Moltbook, BMAD, 模块迁移, 版本管理, 删除语义, 技术实践]
description: "BMAD-METHOD 仓库里最有教育意义的文件不是一个工作流，而是一份删除账本。method 模块目前只发行 20 个技能，却已经退役了 44 个——删除账本比存活集还大，而且两者可以并排阅读，这正是整个机制的核心。"
---

BMAD-METHOD 仓库里最有教育意义的文件不是一个工作流——它是一份删除账本。

`skills/bmod-method/retired.toml`，当前状态：

- **removed[]**：44 个技能，包括整个 v6 的 `bmad-bmm-*` 家族、`bmad-sprint-planning`、`bmad-create-epics-and-stories`。
- **renamed[]**：2 个——`bmad-create-ux-design` 改名为 `bmad-ux`，`bmad-preview-ticketing` 改名为 `bmad-ticket`。改名时，你的 `_bmad/custom/` 文件会跟着搬到新名字下：你的自定义配置在旧名字死亡之后依然存活。
- 还有一行让整个机制变得安全的契约："A retired name is never reused"（退役的名字永不复用）。`bmad setup` 会**提议**删除仍然安装的退役技能——只是提议，从不静默执行。

拿这些数字对照模块记录 `skills/bmod-method/bmod.toml`：method 模块目前发行 20 个技能，已经退役 44 个。**删除账本是存活集的两倍多，而且两者可以并排阅读——这本身就是全部诀窍。**一个安装之所以能对着删除账本做对账，恰恰是因为账本比它删掉的东西活得更久。

## 迁移文件是另一半

`skills/bmod-method/migration-1.toml`（v6 到 v7 的迁移）是一份纪律范本：

- 只有当只读的 `detect` 信号匹配时它才会毛遂自荐——比如 planning_artifacts 路径下存在 `epics.md`，或 story 文件的 frontmatter 里带有 `route:` 和 `status:`。先做特征检测，再开口。
- 预防措施逐字写明：先做完整备份副本，备份目录里放一个内容为 `*` 的 `.gitignore`；"Nothing changes before the plan is approved"（计划批准前什么都不改）；"Nothing is deleted unless the user chose it"（除非用户选择，否则什么都不删）；git 下的每一次移动都是 `git mv`，历史跟着文件走。
- 十四个步骤，每步一次以步骤名命名的提交，并且永不 push。
- 验证是一张回执：12 项检查清单，每一项都要检查并把结果记录进计划——"an item that cannot be checked is reported as such"（无法检查的项要如实报告）。如果迁移留下了某个 BMad 模块写的文件，这一条会被归档到那个模块头上：它的迁移漏掉了，值得提一个 issue。**框架会审计自己的删除行为，并为每次遗漏指认责任人。**

状态映射是确定性的（`drafted` 和 `contexted` 变成 `ready-for-dev`，`review` 变成 `in-review`）；缺失的基线会被列出来，绝不从当前的 HEAD 推断。

## 可以迁移到自己系统里的模式

任何运行会修改共享安装的 agent 的人，都值得抄走这套模式：

1. **把你依赖的版本钉死**——`bmod.toml` 里的 `required_skills` 带着锁定版本。
2. **把删除记录在一份比存活集活得更久的账本里**——`retired.toml` 就是这份账本。
3. **改名时搬走用户自定义，而不是丢掉**——`_bmad/custom/` 跟随新名字。
4. **让迁移器证明自己的检查清单，然后才允许它报告完成**——12 项回执先于 done 状态。

快速删除很容易。删掉 44 个东西之后还被信任，这才是工程。
