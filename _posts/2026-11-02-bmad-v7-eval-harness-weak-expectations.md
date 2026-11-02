---
title: "BMAD V7 的自评 harness：弱断言比没有断言更糟"
description: "深读 BMAD-METHOD 的 bmad-eval 技能——四种评测模式、state_prefix 单发模拟中途回合、强/弱断言分类法、三次运行才算定论、基线失守直接退役。一份把'仪器纪律'写进评分规则的评测框架。"
date: 2026-11-02
categories: [Agent运维]
tags: [BMAD, 评测, Agent技能, 仪器纪律, Claude]
---

今天深读的是 BMAD V7 里一个此前没写过的角落：`skills/bmad-eval/`。它不是"介绍 BMAD 有哪些 agent"那种入门内容，而是一套完整的技能自评 harness——给自己的 agent 技能跑评测、出报告，而且把评分规则的纪律性写到了近乎苛刻。

## 四种模式，各答一个问题

| 模式 | 回答的问题 |
|---|---|
| baseline | 同样的输入下，这个技能打得过裸模型吗？ |
| variant | 某一节内容真的有用，还是删掉也不影响？ |
| quality | 输出达到命名评分表的要求了吗？ |
| trigger | 描述文本会在该触发的查询上触发、在不该触发时保持安静吗？ |

baseline 是长期地板：技能的存在理由就是产出裸模型产不出的东西。variant 用一个"最小 stripped 版本"和完整版对跑，专门检验疑似仪式性的章节——两边打平，那一节就是装饰，删掉。

## case 格式与 state_prefix 技巧

一个 case 就是技能目录 `evals/cases.json` 里的一条 JSON：输入 + 评分表（rubric）+ 可选的 `state_prefix` + 可选的夹具文件。`state_prefix` 是最聪明的一笔——一段方括号引语，前缀到输入前面，一次性把技能"放"到工作流中途：

```
[the skill has already worked through discovery; on turn 4 the user was asked about stakeholders and responded:] User said: "just me and a PM"
```

多轮技能因此可以单发测试：想测哪个中途时刻（澄清轮、纠错轮、中断恢复），就写哪个前缀，不需要搭对话模拟器。

## 强断言 vs 弱断言：这份文件的核心

`references/eval-format.md` 里的分类法值得整段抄：

- **"弱断言比没有断言更糟，因为盖在它上面的绿勾读起来像证据，实际是噪声。"**
- 只查文件名的断言是弱的——"brief.md 存在"对一个空文件也通过；存在性必须配内容检查。
- 全主观措辞（"质量高"）不可评分；同义反复（任何理解了提示词的输出都自动满足的条件）什么也证明不了。

强断言的形态则全部是"错误输出过不去"的：

- 否定性断言："不引入无关章节的内容"；
- 只读强制："输入 brief.md 与夹具逐字节一致，transcript 中没有任何 Write/Edit 指向它"；
- 双向保真："memlog 里的每个决策都反映在 brief 里，且 brief 里的每个论断都能在输入或 memlog 中找到"。

过程纪律（phase 顺序、工具调用模式、副产物存在性）直接从 transcript 确定性读出，评分器引用证据而不是行使判断。

## 数字与机制

- `--runs` 默认 1，runner 自己把这叫 quick look——**3 次以上才算 settled**；`aggregate_benchmark.py` 报均值、样本标准差、min/max/delta。
- 每个 case 在 clean room 里跑：项目外的临时目录、从零构建的环境，宿主配置、历史运行、已装技能都无法污染结果。
- 退出码有文档：0 完整运行、1 有 case 报错或超时、3 没有记录 harness。
- 运行目录永不删除、覆盖、轮换——每次运行是带时间戳的独立目录。

## 最狠的一条

baseline 模式的原话："当技能不再打得过裸模型时，正确的动作是**退役它，而不是再打一个补丁**。"这个 harness 不是为了让技能好看而存在的：为平凡原因通过的评测会被点名标记，评分器不给部分分，举证责任压在"通过"一边。

## 为什么我推荐这份文件

给任何 agent 技能写评测的人，强/弱断言分类法可以直接偷走。它讲的道理和仪器纪律同源：一个不会失败的检查，不是宽松的检查，是不构成证据的检查。绿勾和证据之间的距离，就是弱断言占据的那段空间。
