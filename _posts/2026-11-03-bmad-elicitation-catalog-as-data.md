---
title: "BMAD 把 71 种引导方法存成 CSV 数据行，而 CLI 拒绝把它们整个倒进你的上下文"
description: "BMAD-METHOD V7 的 advanced-elicitation 技能里，从第一性原理到事前验尸，每种推理技法只是 methods.csv 里的一行数据。一个约 240 行、零第三方依赖的查询 CLI 负责按类别计数、索引、单行取用和随机抽取——不带 --category 就拒绝执行，退出码 2。多样性靠轮转采样算法保证，定制走覆盖层而非分叉，一切改动必须经过用户明确接受。上下文节俭是一种设计契约。"
date: 2026-11-03
categories: [Agent运维]
tags: [BMAD, 提示工程, 上下文管理, CLI设计, Agent架构]
---

在 BMAD-METHOD 的 V7 技能库里，藏着一个 `bmad-advanced-elicitation`——有意思的不是它有 71 种方法，而是它的**存储决策**。从第一性原理（"assumptions → truths → new approach"）到事前验尸（"failure scenario → causes → prevention"），每种技法都只是 `assets/methods.csv` 里的一行：一段描述、一个类别、一个由宿主 LLM 在运行时解释的 `output_pattern`。**没有任何按方法拆分的提示词文件。方法就是数据。**

## 目录被刻意挡在上下文之外

查询 CLI（`scripts/pick_methods.py`，约 240 行、只用标准库、要求 Python ≥3.11）提供类别计数、过滤索引、按名字或编号的单行取用、随机抽取——但如果你不带 `--category` 就请求 `list`，它会拒绝：

```
error: `list` needs --category (one or more) — or --all to dump the whole
catalog on purpose.
```

退出码 2。文档字符串说得直白："把完整目录倒进上下文必须永远是一个显式、刻意的选择。"对比一下大多数 Agent 框架的默认做法——把整个工具箱塞进系统提示词，然后指望模型挑得准。在这里，完整转储是一个你必须"认真想用"的旗标。

## 多样性是工程出来的，不是许愿出来的

换一批（reshuffle）走 `random -n 5 --spread`：`spread_sample` 在打乱后的类别之间轮转抽取—— offered 的五个方法永远从五个不同角度进攻，`--exclude` 把已经提供过的行排除在外。选择协议是写给 LLM 而不是人类的：先挑 2–4 个契合目标的类别，`list` 它们，手选五个方法；换一批时，带 spread 盲抽。

## 定制是覆盖层，不是分叉

`--extra` 行按方法名**替换**出厂行（继承其目录编号），否则追加为下一个空闲编号——团队自创的方法（比如某个 "Regulatory Inversion"）成为一等公民，且始终可按编号寻址。而整个引擎挂在一个 HALT 契约后面："除非用户接受提案，否则永不改动工作成果。如果被拒绝，就把提案整个丢弃。"引导在最近的输出上逐次复合，每次一 pass、每次都要被接受。它是一个独立技能，不属于任何 agent 的人设——PRD 技能的问候语里写着，在任何小节停顿处都可以调用它。

## 想要数字的人，这里有数字

- **71 种方法，12 个类别**（core 11、collaboration 12、creative 9、risk 7、advanced 8、technical 6……）
- 退出码 **0/1/2**（成功 / 无匹配 / 用法错误）
- `-n` 会**钳制**到池大小（负数或超界都不崩）
- spread 采样在 **20 个随机种子**下有测试
- CSV 以 **utf-8-sig** 读取——因为总有一天会有人用 Excel 编辑它

## 可泛化的模式

当你的 Agent 拥有一个庞大的技法目录时，不要把目录放进提示词——**部署一套查询纪律**。提供计数、提供索引、让完整转储必须显式、让编号在定制之后保持稳定。BMAD 把这条用在了头脑风暴方法上；同样的形状适用于工具目录、检查清单库、任何"71 个模型偶尔才需要的东西"。
