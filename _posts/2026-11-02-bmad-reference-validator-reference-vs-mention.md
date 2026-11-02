---
title: "BMAD 用生产代码的标准 lint 它的提示词，真正精妙的是"引用 vs 提及"问题"
description: "在 agent 方法仓库里，文档就是运行时。BMAD V7 的 tools/validate_file_refs.py 用一条一行代码的认识论解决了提示词 prose 校验里最难的问题：哪些 token 是真引用，哪些只是举例。还顺手交付了一份"本工具不能知道什么"的残留清单。"
date: 2026-11-02
categories: [BMAD]
tags: [BMAD, 代码质量, lint, Agent工程, 提示词工程]
---

在一个 agent 方法仓库里，文档就是运行时。技能文件里一个失效的路径不是错别字——它是一个会在会话中途引爆的运行时 bug：agent 试图加载 `references/help.md`，然后发现什么都不存在。BMAD V7 的答案放在 `tools/` 目录里：一个约 450 行的引用校验器，带自己的测试，接进了和 ruff、yamllint 同一套 pre-commit 钩子。

## `tools/validate_file_refs.py` 检查什么

1. YAML 值里的 `{project-root}/_bmad/...` 引用——不是字符串匹配，而是通过 `yaml.compose_all` 遍历 YAML 节点树，所以即使藏在深层嵌套映射里，引用也会带着精确的 key 路径和行号浮出水面。
2. markdown 正文里反引号包裹的技能相对路径。
3. 绝对路径泄漏——一个匹配 `/Users/`、`/home/`、`C:\` 的正则。共享提示词里的机器私有路径，就是 agent 继承别人笔记本的方式。
4. 直接堆在 `skills/` 根下的散落文件——每个文件必须归属于某个技能。

## 承重墙决策：引用 vs 提及

难的不是在 prose 里找到路径，而是判断哪些 token **是**路径。他们的答案写在 `resolve_skill_relative()` 里的一行认识论：一个反引号路径只有当它的**第一级目录**确实存在于引用文件附近时，才会被标记为失效。如果这个技能里根本没有 `references/` 目录，那么 `references/help.md` 会被归类为 prose——一个示例、一个运行时输出、一次提及——而不是引用。没有这条规则，文档里每一条示例路径都会变成误报，而任何团队拿到一个噪音轰鸣的 linter 后做的第一件事就是把它静音。这个分类器让信号活了下来。

## 他们交付了自己的残留清单

docstring 里带着一份明确的「不检查什么（推迟）」清单：裸反引号文件名（与运行时输出的提及无法区分）、`{{mustache}}` 变量、`assets/` 和 `sample-*` 文件、glob、`<尖括号>` 占位符。外加一份 18 项的 `UNRESOLVABLE_VARS` 白名单——像 `{output_folder}`、`{epic_number}` 这样的运行时变量——它们把一个路径标记为不可静态解析。这是一份关于工具无法知道什么的诚实账本，直接 check 进了工具本身。

## 值得偷走的机械细节

- 代码栅栏在扫描前被抹白，但抹白保留换行符，行号因此保持对齐，GitHub 注解不会指错行。
- 两档判决：BROKEN（路径有扩展名且不存在）vs UNRESOLVED（无扩展名——可能是目录引用）。
- 默认警告模式：发现失效引用也 exit 0；`--strict` 才 exit 1。lint 先求采纳，干净后再在 CI 里强制。
- 在 Actions 模式下输出 `::warning` 注解，并向 `$GITHUB_STEP_SUMMARY` 追加一张 markdown 表格。

## 它如何挡门

`tools/quality.py` 只有四十行，全部职责是在本地按「CI 跑的每一步、同样的顺序」跑一遍——先对全树跑 pre-commit（ruff、rumdl、yamllint、yamlfix、JSON 检查、各校验器、pytest），再跑 docs-site 的 npm 套件。而 `tools/tests/test_validate_file_refs.py` 负责让校验器本身保持诚实。

## 它唯一检查不了的东西

`tools/ticket-tree-rules.md` 开篇就是一次故意的重复："没有任何技能加载本页：每个技能在自己的文件里陈述它所依据的规则。当这里的规则变更时，去改每一个陈述它的技能。"六个技能用自己的话重述 ticket-tree 规则，而校验器能验证被引用的文件存在，却永远无法验证重述的规则彼此一致。这是这个仓库手工维护的残留类——每个完整性系统最终都有一个。

## 如果你维护一个提示词语料库

偷走第一级目录启发式，交付你自己的推迟清单，并在噪音死掉之前只跑警告模式。你的提示词是可执行的——就像对待可执行代码一样 lint 它们。
