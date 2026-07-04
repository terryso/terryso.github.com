---
layout: post
title: "BMAD Loop：把开发循环的控制权，交还给确定性代码"
description: "BMAD Loop 不是又一个 skill，而是一段纯 Python 编排器。它的核心信条是 No LLM in the control loop——让确定性代码做调度，LLM 只负责写代码。本文讲清它的设计哲学、四个关键机制、上手方法和血统渊源。"
date: 2026-07-04 10:00:00 +0800
categories: [AI, BMAD, 开发效率]
tags: [BMAD, BMAD Loop, Claude Code, Agent 编排, 自动化, 确定性循环]
---

如果你看过我之前那篇 [Story Automator 上手实录](/blog/bmad-story-automator-intro)，应该还记得我最后的结论：

> 白天手工跑，目前还是自己手工跑会更快。但睡前把一批 Story 交给它过夜跑，这个场景它真的挺合适。

那篇文章里我留了个没回答的问题——**为什么它跑得比人手工还慢？** 我当时说"还没仔细分析它的实现原理"。

现在 BMAD 6.10 把这套东西重写了一遍，改名 **BMAD Loop**，也顺手把那个问题接上了。答案只有一句话，但它是理解整个设计的钥匙：

> **控制环里，不应该放 LLM。**

---

<img src="/images/posts/bmad-loop/cover.svg" alt="BMAD Loop 封面：确定性 Python 编排器位于环心，LLM 节点挂在环上" style="max-width: 100%; height: auto; display: block; margin: 24px auto;">

## 先纠正一个最容易踩的误解

很多人第一次接触 BMAD Loop，会以为它是几个新 skill：`bmad-loop-setup`、`bmad-loop-sweep`、`bmad-loop-resolve`、`bmad-dev-auto`。

**不是。这几个 skill 本身什么也不做。**

真正驱动循环的，是一个用 `uv` 从 Git 装进来的 **Python 工具**——`bmad-loop` 包（仓库在 [bmad-code-org/bmad-loop](https://github.com/bmad-code-org/bmad-loop)）。那几个 skill 只是编排器在循环的不同阶段会去调用的"基本操作"（官方文档里叫 primitive，说白了就是最基础的、可以单独派活的小单元）：

- `bmad-dev-auto`：开发——把意图变成经得起 review 的产物
- `bmad-loop-sweep`：巡检——清理延后工作台账
- `bmad-loop-resolve`：交互——和人一起消除歧义

换句话说，**skill 是肌肉，Python 编排器才是中枢神经。** 这一点想通了，后面所有设计都顺理成章。

---

## 灵魂信条：No LLM in the control loop

官方 README 的副标题一句话就给它定了性：

> **A deterministic ralph-loop orchestrator** for the BMAD-METHOD implementation phase.

翻译过来：一个**确定性的**循环编排器。"确定性"（deterministic）这三个字是全文最重要的一组词。

它把整个开发循环切成两种完全不同的工作：

| 工作 | 谁来做 | 为什么 |
|---|---|---|
| **控制逻辑**：选哪个 story、重试几次、什么算完成、能不能提交 | **纯 Python 代码** | 要确定、可调试、可复现、不花钱 |
| **创意工作**：写代码、写测试、做对抗式 review | **LLM**（在一次性会话里） | 这才是 LLM 擅长、且只有 LLM 能做的事 |

回过头看 Story Automator 为什么慢——它的控制环里塞满了"用提示词去问 LLM 现在该干嘛"的环节。每问一次都要花 token、等推理，还可能跑偏，跑偏了就再问一次。**把调度交给 LLM，等于让一个容易走神、按字计费的新人在流水线上当调度员。**

BMAD Loop 的做法是：调度员换成一段不会走神、不收钱的 Python 代码，LLM 只在每个工位上干它该干的创意活，干完就走。

<img src="/images/posts/bmad-loop/control-loop.svg" alt="控制环与创意工位：确定性 Python 在上，dev 与 review 两个独立 LLM 会话在下" style="max-width: 100%; height: auto; display: block; margin: 24px auto;">

这样做换来四个好处，是后续所有机制的出发点：

- **确定性**：同样的 sprint 跑两次，调度路径一致
- **可调试**：流程是代码，出问题能打断点、看日志，而不是"猜提示词哪里没说清"
- **可复现**：每次运行的决策都有磁盘上的状态机记录
- **省钱**：控制逻辑零 token 消耗

---

## 四个让它"敢放手"的关键机制

"控制环不放 LLM"说起来轻松，但它带来一个尖锐的问题：**编排器怎么知道一个 LLM 会话干完了、干对了？** 旧做法是让编排器自己也是个 LLM，去"看"会话的输出——这正是 Story Automator 的包袱。

BMAD Loop 用四个机制绕开了这个包袱。

### 机制一：每个步骤都是全新上下文的一次性会话

Dev 和 review 是**两个独立会话**，review 会话**绝不继承** dev 会话的上下文。

这一点反直觉，但极其关键。如果 review 会话带着 dev 写代码时的记忆，它天然会"护短"——人对自己刚写的代码容易先入为主、下不去狠手（心理学叫锚定效应，anchoring bias），LLM 也一样。把 review 放进一个对 dev 一无所知的全新会话里，它才会真的去挑刺，而不是附和。

> 类比：你不能让写代码的人和 code review 的人是同一个脑子。上下文隔离，就是给 review 配一双"没见过这份代码"的眼睛。

### 机制二：靠 hook 事件文件通信，绝不抓屏

编排器怎么知道会话结束了？答案是给 coding CLI（Claude Code / Codex / Gemini）注册 hook——`Stop`、`SessionStart`、`SessionEnd`、`PreCompact`。这些 hook 在关键节点往磁盘写**结构化事件文件**，编排器只管 watch 这些文件。

而每个 skill 在自动化模式下跑完，会写一个机器可读的 `result.json`，声明自己这一轮的产物和状态。

```text
旧做法（Story Automator）：         BMAD Loop 的做法：
┌─────────────┐                    ┌─────────────┐
│  编排器(LLM) │                    │ 编排器(Python)│
│   去看屏幕   │ ←脆弱、贵、易错      │  watch 文件  │ ←稳、免费、结构化
└─────────────┘                    └─────────────┘
       ↑                                  ↑
   抓 pane / 读对话                  读 Stop hook 写的事件
                                   读 skill 写的 result.json
```

抓屏（pane-scraping）是上一个时代的痛：终端输出格式一变、模型多说了一句废话，编排器就懵了。换成"hook 写文件、编排器读文件"，接口就从自然语言降维成了结构化数据，鲁棒性立刻上一个台阶。

### 机制三：Trust nothing, verify everything

这是整个系统最硬核的地方。每个 LLM 会话结束后，编排器**不信任会话自己说的"我搞定了"**，而是去磁盘上独立校验：

- **spec frontmatter（文件开头的元信息）状态**：story 的规格文件状态字段是否真的变成了 done
- **baseline-commit 匹配**：会话声称改了哪些文件，和 git 里实际的 diff 对不对得上——这是一个**便宜的"LLM 撒谎检测器"**
- **非空 diff**：到底有没有真的改东西
- **sprint-status 同步**：状态文件是否和实际进度一致
- **你的测试 / lint 命令**：最后提交前，跑一遍**你自己**定义的测试和 lint

校验全过，才允许 commit。任何一项不过，要么重试，要么升级。

> 这条哲学值得单独记住：**LLM 会幻觉，但 git 不会。** 把"是否真的完成"这个判断，从"问 LLM"挪到"看磁盘证据"，整个系统就稳了。

### 机制四：deferred-work 台账 + sweep，终于有人读它了

循环里总会遇到"现在干不了"的活——某个 edge case 要等另一个 story 先落地、某个决策该人来拍板。这些不能硬干，也不能丢，于是写进一份台账：`deferred-work.md`。

有意思的是这份台账的身世。在更早的 BMAD 版本里，这是个有名的半成品——`bmad-code-review` 会往 `deferred-work.md` 里写延后项，但**没有任何 skill 会回头读它**（社区甚至专门提了 issue 报这个 bug）。写进去的债，永远没人还。

BMAD Loop 的 `bmad-loop-sweep` 终于补上了这一环。它做的事是**只读巡检**：把台账里每条 open 的项，对着真实代码库逐条验证（grep 症状、查 git log、读相关文件），然后分成五类：

| 分区 | 含义 | 编排器怎么办 |
|---|---|---|
| `already_resolved` | 后来的工作顺手解决了，但没标记 | 拿证据（file:line / commit）自动关掉 |
| `bundles` | 现在就能一起干的，按相同文件/子系统打包成一个 dev 会话 | 执行 |
| `blocked` | 得等某个未来的 story/epic 落地 | 标记阻塞方，挂着 |
| `skip` | 已过时、无关、或项目明确排除 | 跳过 |
| `decisions` | **必须人来拍板**（改冻结 spec、改 API 形状等） | 升级给人 |

"写进去的债，有人还了"——而且是带着证据还，不是凭台账里的旧状态拍脑袋。这条机制让循环可以**长时间无人值守地跑下去**而不至于债台高筑。

---

## 一张图看清整个循环

把上面四个机制拼起来，一个 story 在 BMAD Loop 里的完整生命周期是这样的：

<img src="/images/posts/bmad-loop/lifecycle.svg" alt="BMAD Loop 完整生命周期：sprint-status → 编排器五步流水线 → 通过则下一个 story，失败则进 deferred-work 台账 → sweep → 自动关闭 / 打包再干 / 升级给人" style="max-width: 100%; height: auto; display: block; margin: 24px auto;">

整条链路的控制流是 Python，**只有②③④这几个"创意工位"是 LLM 在一次性会话里干活**。这就是"确定性编排器"的完整含义。

---

## 多模型编排：三个 CLI，按角色混搭

BMAD Loop 通过一个通用的 tmux 适配器驱动三种 coding CLI：`claude`（默认）、`codex`、`gemini`。而且可以**按阶段混搭**——配置在项目的 `.bmad-loop/policy.toml` 里：

```toml
[adapter]
name = "claude"          # 默认所有阶段都用 claude

[adapter.review]
name = "codex"           # 但 review 阶段换成 codex
```

为什么要混搭？因为不同模型擅长的事不一样。一个很实用的组合是：让一个模型写代码、让**另一个模型**做对抗式 review——两个不同家族的模型互相挑刺，比同一个模型自审要狠得多。这正好和"机制一：review 用全新上下文"叠加，双重消除偏置。

> 这已经不是"调一个模型"了，是**模型编排**。

---

## 什么时候它会停下来叫你：CRITICAL 升级

无人值守不等于无人干预。有一种情况编排器会**主动暂停整个 run**，等人——**CRITICAL 升级**。

触发条件通常是：dev 或 review 会话发现**冻结的 spec（`<frozen-after-approval>` 块）自相矛盾，或者对某个关键场景保持沉默**，没法安全地继续。这时候它不猜、不硬干，而是把 run 挂起，等你用：

```bash
bmad-loop resolve --story <story-key>
```

起一个**交互式**会话。这个会话里有人（你），所以它会问你问题、给出 2-4 个具体选项和推荐。你拍板之后，它去**改 spec 本身**——不是改代码——把歧义消掉，然后编排器重新驱动这个 story，对着一份修正过的、没有矛盾的 spec 重跑。

这个设计很克制，有几条硬规矩值得点赞：

- resolve 会话**只改 spec 内容，不写一行功能代码、不跑测试、不提交**
- 它**不动 sprint-status.yaml**，也不设 spec 的 status 字段——这些由编排器在恢复时确定性地产出
- 如果信息不够、或者正确的修复超出了 spec 编辑的范围（比如需要改 PRD/架构），它会**直接说"我解决不了"**，不写完成标记，run 继续挂着——这是安全的默认行为

> 一句话：**遇到拿不准的，宁可停下来等你，也不编一个答案往下冲。** 这是对"无人值守"最负责的理解。

---

## 怎么用：上手三步

前置条件就一条：你得有一个 **BMAD v6 项目**，而且 `bmad-sprint-planning` 已经跑过、生成了 `sprint-status.yaml`。换句话说，PRD / 架构 / epics&stories / sprint planning 这条链得先走完，Loop 才有故事可转。

装好之后（通过 `bmad-loop-setup` 这个 skill，它会从 Git 装 Python 工具 + 跑 `bmad-loop init` 注册 hook、铺 skill、写 policy.toml），核心命令其实很少：

```bash
bmad-loop init        # 装 bmad-loop-* skill + hook + policy.toml + gitignore
bmad-loop validate    # 预检：config / sprint-status / git / tmux / CLI / hook
bmad-loop run --dry-run   # 先打印计划，不真的拉起会话
bmad-loop run         # 开跑
bmad-loop tui         # 或者干脆全在可视化面板里操作
```

完整命令清单覆盖了 `run / sweep / resume / resolve / decisions / status / attach / stop / clean` 等，但日常 90% 的场景就是上面这几条。`bmad-loop tui` 那个仪表盘挺漂亮——run 选择器、sprint 树、deferred-work 台账、每个 story 的实时任务表、带颜色的日志流，一屏打尽。

一个**必须知道的一次性设置坑**：如果目标项目里 coding CLI 从来没跑过（比如 claude 没在这个目录启动过），你要**先手动启动一次**，接受 workspace-trust 和 hooks 审批对话框。编排器拉起的子会话没法替你点这些首次运行对话框，而一个挂着的对话框会被编排器误判成"会话超时"。

---

## 血统：从 Story Automator 到 BMAD Loop

把 BMAD Loop 放回时间线里，它的位置就很清楚了：

```text
Story Automator          bmad-automator / bmad-auto          BMAD Loop
(2026 初, 我那篇          (中间的过渡形态,                  (6.10, 重写为
 实测的版本)               工具名 bmad-auto)                  确定性 Python 编排器)
      │                        │                                 │
      └──── 控制环里有 LLM ─────┴───── 重写 ────────► 控制环里没有 LLM ──┘
              (慢、贵、易跑偏)                         (确定、可调试、省钱)
```

README 里写得很坦诚："Inspired by the original bmad-automator (a separate, legacy project)"——它明确把上一代当成 legacy，自己是从头来的重写。

而它给自己定位是 **"a deterministic ralph-loop orchestrator"**。如果你关注过 autonomous dev 这个圈子，应该听说过 [Ralph](https://medium.com/@neiltom92/how-bmad-and-ralph-are-revolutionizing-ai-driven-development-6e1947692660)——那个让 Claude Code 自己跑开发循环的工具。BMAD Loop 借用了"ralph-loop"这个模式（无人值守、反复迭代的小循环），但把它**确定性地**实现在了 BMAD 的 story 体系上。所以它是"Ralph 的精神 + BMAD 的骨架 + Python 的中枢"。

---

## 适合谁，不适合谁

延续我测评 Story Automator 时的坦诚基调，给你一个不吹的判断。

**适合用的场景：**

- 你已经完整走完 BMAD 的规划链（PRD → 架构 → epics → sprint planning），手头有一串**清晰、可独立实现**的 story
- 你接受"睡前梭一把"这种异步交付模式——第二天起来看结果，而不是盯着它实时干
- 你的项目有**可靠的测试和 lint**（机制三最后那道闸靠它们），否则 verify 形同虚设
- 你想做多模型互相 review，又不想自己手动切来切去

**不适合 / 要谨慎的场景：**

- story 还很模糊、依赖关系没理清——这种跑进循环里大概率触发一堆 CRITICAL 升级，反而更累
- 没有测试的项目——编排器再聪明，最后那道 verify 闸门空转，等于裸奔
- 期待它"又快又好又自动"——确定性编排让它**更稳、更省**，但单 story 的绝对速度未必比一个熟手手工盯更快。它的价值在**批量、异步、可恢复**，不在单点提速

**和上一代最大的区别**，也是我现在最看好它的一点：因为控制环是确定性代码，它**可调试、可复现、可信任**。Story Automator 时代那个"为什么这么慢"的黑盒，这一次终于打开了——流程是 Python，你看得到每一步在干嘛、为什么这么决策。光这一点，就值得把它从"试验品"升级成"可以认真用起来的工具"。

---

## 写在最后

从 v6.8 的"锁定意图"（让 AI 先搞懂你要什么），到 6.10 的 BMAD Loop（让确定性的代码当调度员、LLM 只管写代码），BMAD 这两年的演进方向其实非常一致：

> **把不该让 LLM 干的活，一件一件从 LLM 手里拿回来。**

意图理解该锁定的，用 SPEC 锁定；调度该确定的，用 Python 确定；该人拍板的，挂起 run 等人。LLM 越来越被收敛到它真正擅长的那块创意工作上。

这不是对 LLM 不信任，恰恰是对它的尊重——**别让它干它不擅长、又会幻觉、还按字收费的活。**

如果你也在用 BMAD 做项目，强烈建议拿一个 sprint 来认真试一次 BMAD Loop。哪怕只是为了让 `deferred-work.md` 那本"永远没人还的债账"终于有人管，也值。

---

*参考来源：*
- *bmad-loop 官方仓库：[bmad-code-org/bmad-loop](https://github.com/bmad-code-org/bmad-loop)*
- *BMAD Method 文档：[docs.bmad-method.org](https://docs.bmad-method.org/)*
- *上一代实测：[BMAD Story Automator 上手实录](/blog/bmad-story-automator-intro)*
- *v6.8 上下文：[BMad v6.8：AI开发正式进入"锁定意图"时代](/blog/bmad-method-v68-planning-skills-evolution)*
