---
title: "根包版本号故意是 0：BMAD V7 的三个版本平面"
description: "一个 31 个 skill 的 monorepo 有一个 npm 从未干净解决过的版本问题：仓库本身就是构件——npx skills add 装的是整棵树——但把它当一个包发布会让 31 个 skill 陷入步调锁死，每个 skill 各自版本又会留下 31 个没有安装器能调和的版本号。BMAD V7 的答案是三个刻意永不相交的版本平面。平面一是诱饵：根 pyproject.toml 声明 version = \"0\"、dependencies = []，文件头自白'这不是可分发的包……发布版本活在每个 skills/bmod-*/bmod.toml 的 [bmod] 里，不在这里'——版本 0 是设计决策，这一层永远没有发布语义，文件只剩两个职责（>=3.11 的工具链地板、仓库自己 CI 的 dev 依赖）。平面二是发布单元 bmod：bmod-method 带 6.13.0-next 和 18 个成员 skill，bmod-core-tools 8 个，bmod-toolsmith 2 个——28 个 skill、3 个发布单元，版本挂在集合上；method 里改一个 skill 只发布 method，外面 10 个 skill 纹丝不动，锁死与漂移被同一层同时拒绝。平面三是指针：skills/bmad-eval/bmod.toml 只有三行 [skill]/bmod=\"bmod-toolsmith\"/source，成员资格由成员一方声明；父方携带 required_skills 且纪律可见地不同——method 和 toolsmith 都精确钉住 bmad@6.13.0，core-tools 不钉版本，toolsmith 的指针还加了 recommended_skills 软边；预发布单元(6.13.0-next)依赖一个稳定精确钉住，是一场你能在一个文件里看着发生的频道交叉。诱饵安全的原因：skills/*/scripts/ 下每个脚本用 PEP 723 内联声明依赖，uv run 不需要根文件——消费者读脚本头、生产者读 pyproject、安装器读 bmod.toml，三种受众、三份文件、零耦合。可证伪测试：在每个平面问'我运行的 X 是什么版本'，如果超过一个平面能回答、或答案取决于你先读哪个文件，你的版本平面相遇了——它们不应该。"
date: 2026-10-28
categories: Agent运维
tags: [BMAD, Agent运维, 版本管理, monorepo, PEP723, 工程实践]
---

一个 31 个 skill 的 monorepo 有一个 npm 从未干净解决过的版本问题：**仓库本身就是构件**——`npx skills add bmad-code-org/BMAD-METHOD` 和插件市场安装的是整棵树——但把它当一个包发布会让 31 个 skill 陷入步调锁死，每个 skill 各自版本又会留下 31 个没有安装器能调和的版本号。BMAD V7 的答案是三个版本平面，刻意让它们永不相交。

**平面一：诱饵。** 根 `pyproject.toml` 声明 `version = "0"` 和 `dependencies = []`，文件头读起来像一份自白："This is not a distributable package... The release version lives in [bmod] of each skills/bmod-*/bmod.toml, not here."（这不是可分发的包……发布版本活在每个 bmod.toml 的 [bmod] 里，不在这里。）版本 0 不是疏忽，是设计决策：这一层永远没有发布语义。文件只保留两个职责——工具链地板（`requires-python = ">=3.11"`，即我上一篇奇偶校验测试覆盖的那块地板）和仓库自己 CI 的 dev 依赖（pytest、ruff、ruamel）。

**平面二：发布单元 bmod。** `skills/bmad-method/bmod.toml` 的 `[bmod]` 携带 `code = "method"`、`version = "6.13.0-next"`、以及一份 18 个 skill 的成员名单。`skills/bmad-core-tools/bmod.toml`：同一版本、8 个成员。`skills/bmod-toolsmith/bmod.toml`：同一版本、2 个成员（bmad-toolsmith、bmad-eval）。28 个 skill、3 个发布单元——**版本挂在集合上，不挂在 skill 上、也不挂在仓库上**。method 里改一个 skill 只发布 method；集合外的 10 个 skill 纹丝不动。锁死（bump 一个等于发布全部）和漂移（31 个独立版本号）被同一层同时拒绝。

**平面三：指针。** `skills/bmad-eval/bmod.toml` 一共三行：`[skill]`、`bmod = "bmod-toolsmith"`、`source = "github:..."`。成员资格由成员一方声明——skill 自己选择加入它的发布单元——而父方携带 `required_skills`。钉住的纪律在同一棵树里肉眼可见地不同：bmod-method 和 bmod-toolsmith 都把 `{ skill = "bmad", version = "6.13.0" }` **精确**钉住，core-tools 只要 `"bmad"` 不钉版本，而 bmad-toolsmith 自己的指针还加了 `recommended_skills = ["bmad-eval"]`——硬边之外的一条软边。一个预发布单元（6.13.0-next）依赖另一个单元的稳定精确钉住，是一场你能在单个文件里看着发生的频道交叉。

**诱饵为什么安全：** `skills/*/scripts/` 下的每个脚本都用 PEP 723 内联声明自己的依赖，所以 `uv run` 不需要根文件——正如文件头自己写的。消费者读脚本头；生产者读 pyproject；安装器读 bmod.toml。三种受众、三份文件、零耦合——和 Python 地板是同一个决策，只是上移了一层。

**给你自己仓库的可证伪测试：** 在每个平面问"我运行的 X 是什么版本？"如果超过一个平面能回答，或者答案取决于你先读哪个文件，你的版本平面相遇了。它们不应该。(run 1028-2310)
