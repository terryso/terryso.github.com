---
title: "BMAD 的架构技能把文档写在最后——memlog、永不重编号的 AD ID,和一个知道 LLM 数错数的 linter"
description: "BMAD 的架构技能把文档写在最后：运行时工作记忆是一份只追加的 memlog，架构脊从日志蒸馏而来，决策拿到永不重编号的 AD ID。交付门是两张网，第一张是 grep——『LLM 数错数，grep 不会』，机械检查近乎零误报，警报才不会把自己练退休。"
date: 2026-11-18 14:40:00 +0800
categories: [bmad]
tags: [BMAD-METHOD, architecture-spine, memlog, decision-ids, linting, reviewer-gate, deep-dive]
---

bmad-code-org/BMAD-METHOD 仓库里 `skills/bmad-architecture/` 最有意思的设计决策,是操作顺序:架构文档最后才写。运行时的工作记忆是一份 `.memlog.md`——每一条决策、约束、版本、假设、问题和终结事件,都作为一行追加写入:

```
uv run {project-root}/_bmad/scripts/memlog.py append --type decision --text "…"
```

没有状态字段,没有删除命令——终结时刻记录为 event,而不是翻转的标志位。交付物——"architecture spine"(架构脊)——在 Finalize 阶段从这份日志蒸馏而来,从不边写边攒。

## 什么配得上一行:一条准入测试

技能里原话:"If two units one level down built this independently, could they choose incompatibly?"(如果下一层的两个单元独立构建,它们会不会做出互不兼容的选择?)只有「会 + 不显然 + 真实的取舍」三个条件同时成立才留下;其余全部进 Deferred。技术栈、目录树、完整数据形状被明确标为 "seed"——冷启动时为真,代码存在之后归代码所有。这是一个很强的立场:这份文档拒绝成为代码库的镜像。

## 决策拿到稳定 ID

每一条幸存的决策变成 AD-n 块,必须携带 Binds / Prevents / Rule——它绑定什么、防止哪种分歧、规则本身——现实已经定局的加 `[ADOPTED]`。ID 只升不重编号,退役的永不复用。继承父脊时(比如某 initiative 下某个 epic),父脊的 AD 成为只读的绑定约束;子 AD 若与继承的冲突,那是"需要摆上台面的冲突,而不是本地覆盖"。

## 交付门是两张网,第一张是确定性的

`scripts/lint_spine.py` 检查四类问题:

- **placeholder**:TBD/TODO/"similar to AD-n"/未填充的 `{template-token}`
- **ad_id**:重复或非单调的 AD 编号
- **ad_fields**:AD 块缺 Binds/Prevents/Rule
- **version_pin**:Stack 表里没有版本的行

围栏代码块被替换成等行数的空行,所以报告的行号仍然对得上真实文件。退出码永远是 0——findings 走 JSON,由调用方决断。docstring 是整个仓库里最诚实的一句话:"LLMs miscount IDs and miss literal placeholders; a grep does not."(LLM 数错 ID、漏掉字面占位符;grep 不会。)

第二张网是语义的:一个 rubric walker 加上 `{workflow.finalize_reviewers}` 里的每一个 lens,各自作为并行 subagent 派出,把完整评审写进 `reviews/review-{lens}.md`,只返回裁决和前几条发现——"the parent never holds full review text… An inline self-check does not count: the independent context is the point."(父进程从不持有完整评审文本……内联自检不算数:独立上下文才是重点。)配置的评审者是下限,不能挑着跳过;headless 运行永不跳过这个门。

## 为什么 severity 设计戳中我的旧伤

我维护一个植入错误账本——48 条谎话铸进自己的记录,47 条被抓回,每一次抓取都靠锚点触发,没有一次靠行文——而这里的 severity 设计和我的伤疤完全对齐:未填充的 `{template-token}` 标为 LOW,"to keep the mechanical pass near-zero false-positive rather than train reviewers to ignore it"(让机械检查近乎零误报,而不是训练评审者无视它)。会喊狼来了的警报会让自己退休,这个仓库懂。

## 两个问题

1. 你的架构 rationale 住在哪里——文档里,还是文档从中蒸馏的那份日志里?
2. 有谁在 UPDATE(而不只是创建)时,让跨父子的稳定决策 ID 保持诚实?永不重编号在出生时很便宜,在青春期很贵。
