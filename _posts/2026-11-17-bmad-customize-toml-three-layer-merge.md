---
title: "BMAD 的 customize.toml 合并：每技能三层，以及键控数组悄悄变成追加的那个陷阱"
description: "BMAD 的自定义是每技能三层的 TOML 合并，核心 40 行却有两个完全不报错的失败模式：键控数组里一条漏写 code 的覆盖让替换悄悄变成追加，home 目录的旧根还能遮蔽项目配置、只留一条 STDERR。覆盖没生效时它怎么告诉你，才是品质。"
date: 2026-11-17 05:10:00 +0800
categories: [bmad]
tags: [deep-bmad, customization, toml, merge-semantics, code-reading]
---

我进入 bmad-code-org/BMAD-METHOD 仓库时，以为"自定义"就是改提示词。不是。它是一个三层 TOML 合并，核心只有 40 行代码，却有两个完全不报错的失败模式。

**三层结构。** 每个可自定义的技能都带一个 `skills/<name>/customize.toml`，文件头写得很直白："DO NOT EDIT -- overwritten on every update"（不要编辑——每次更新都会被覆盖）。你的改动放在 `_bmad/custom/<skill>.toml`（团队层，提交进仓库）和 `_bmad/custom/<skill>.user.toml`（用户层，gitignore）。解析器是 `skills/bmad/scripts/resolve_customization.py`；合并核心是 `skills/bmad/scripts/config_utils.py` 里的 `structural_merge()`：

```python
def structural_merge(base, override):
    if isinstance(base, dict) and isinstance(override, dict):
        result = dict(base)
        for key, value in override.items():
            result[key] = structural_merge(result[key], value) if key in result else value
        return result
    if isinstance(base, list) and isinstance(override, list):
        return _merge_arrays(base, override)
    return override
```

标量：覆盖方胜出。字典：递归合并。数组：要看情况——有趣的地方正在这里。

**陷阱一：静默的追加回退。** `_merge_arrays()` 调用 `_detect_keyed_merge_field(base + override)`，检查两侧**每一个**元素是否都是携带 `code` 或 `id` 的字典。是：键控合并——同键原地替换，新键追加。任何一个元素缺这个键：直接 `list(base) + list(override)` 纯追加。于是一个菜单覆盖里有一条漏写 `code`，不会报错、不会警告——你的 `[[agent.menu]]` 替换变成了追加重复项，PM 把每项能力都展示两遍。检测作用在合并后的联合列表上，所以一条畸形覆盖连基础层里本来合规的条目也一起拖垮了。规则：覆盖的每个菜单项都带上 `code`；然后用解析器的 `--key agent.menu` 在信任这次编辑之前验证输出。

**陷阱二：根目录遮蔽。** `find_project_root()` 从 cwd 向上找 `_bmad/`，而且 `_bmad/` 在每一层深度都刻意压过 `.git`（子模块带 `.git` 却不拥有你的覆盖配置）。候选根目录按 cwd、脚本自身安装路径、技能目录排序。如果你在 home 下装过一份、存在 `~/_bmad` 式的目录，home 的覆盖可能遮蔽项目里的那份——唯一的信号是 `warn_on_masked_override()` 打在 **STDERR** 上的一条提示，指向被拒绝的根。只读 stdout 上的 JSON 的话，你看到的是一次干净合并，悄悄忽略了你的文件。显式传 `--project-root`；两个流都读。

**你实际能改到什么**（来自 `skills/bmad-agent-pm/customize.toml`，字段原文）：标量 `icon`、`role`、`identity`、`communication_style`、`*_template`、`on_complete`；追加数组 `activation_steps_prepend` / `activation_steps_append`、`principles`，以及 `persistent_facts`——每条事实要么是字面句子（"我们组织只用 AWS——不要提议 GCP 或 Azure。"），要么是带 glob 支持的 `file:` 引用，文件内容在激活时作为静态上下文加载。菜单是我读的这个技能里唯一的键控数组；每项恰好持有 `skill`（调用注册技能）或 `prompt`（内联执行）之一。

**我最尊敬的部分：** `skills/bmad-customize/SKILL.md` 拒绝在"写完文件"处结束。第 6 步会运行解析器，把覆盖落地后的合并输出**展示**给你看，点名失败三连（"字段名写错、合并模式选错（标量 vs 数组）、或者作用域放错"），就算解析器完全缺失，技能也回退到按同样成文规则的手工合并。验证靠重算，是一等公民步骤而不是事后补丁。甚至还有一条诚实条款：当目标的 customize.toml 没有暴露你想要的东西——"直说。不要发明字段。"

当前仓库树：29 个技能目录中 26 个带 customize.toml（三个 bmod-\* 元技能没有）。放置的经验法则来自技能本身：政策和组织规范放提交的团队 toml，个人语调放 gitignore 的用户 toml，覆盖保持稀疏——永远不要整份复制基础文件。

一句话总结这次阅读：一个自定义系统的品质，不在于它能改多少，而在于你的覆盖没生效时，它用几条流、几行 stderr 把"为什么"告诉你。
