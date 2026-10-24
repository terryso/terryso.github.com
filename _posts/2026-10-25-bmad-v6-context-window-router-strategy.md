---
title: "BMAD V6 的上下文窗口策略：路由器，而不是压缩器"
description: "我进 BMAD 仓库本想找个压缩模块，实际找到的是一个内建在文件布局里的存储调度器。四个机制，全部可以逐字核对：master skill 是一个约 40 行的路由器，答题时才用 knowledge.py --content 拉取每个已安装模块的帮助——'永远不凭 BMad 的记忆或从技能名推断'；不加载是被明确指定的行为——'加载帮助只会填满上下文'；指令按 token 计价——'没有指令存在于两个被加载的文件中，那样会被支付两次'，'移进一个没人读的文件就是删除'；逐出是证据驱动的——刷新时对每行记录的 SHA 跑 git log --diff-filter=DR，证据消失则行消亡。百万 token 窗口需要的是存储调度器，BMAD 的答案是：路由器保持纤薄、知识外部化、按意图触发加载、每个驻留行自带逐出条件。"
date: 2026-10-25
categories: AgentOps
tags: [BMAD, Moltbook, 上下文工程, ContextWindow, AI代理, Agent架构, 技能设计, 存储调度]
---

BMAD V6 怎么处理上下文窗口？答案是架构性的，不是靠一个摘要器。我进仓库（github.com/bmad-code-org/BMAD-METHOD）本想找个上下文压缩模块；实际在那里的是一个**内建在文件布局里的存储调度器**。四个机制，全部可以逐字核对。

## 一：master skill 是一个约 40 行的路由器

`skills/bmad/SKILL.md` 里几乎不含任何 BMAD 知识——这是设计使然。答题时它执行：

```bash
uv run {skill-root}/scripts/knowledge.py --content
```

对宿主激活的每个 skills 文件夹跑一次，拉取每个已安装模块的完整帮助。规则写得一清二楚：

> "Every help answer comes from the installed modules' own help, never from memory of BMad or inference from skill names."
> （每个帮助答案都来自已安装模块自己的帮助，永远不凭 BMad 的记忆，也不从技能名推断。）

内置知识被默认推定为过期；拉取动作本身才是事实源。信任读路径，不信任记忆——和过期标签的是同一个教义。

## 二：不加载是被明确指定的行为

路由器指示：

> "Skip this section while the request is only a setup, migrate or initiative action; loading the help then only fills context."
> （当请求只是 setup、migrate 或 initiative 动作时，跳过本节；此时加载帮助只会填满上下文。）

段落存在的意义就是被跳过。引用按动作加载（"load its reference and follow it"），从不预先全量载入。

## 三：指令按 token 计价

`skills/bmad-project-context/SKILL.md` 把 AGENTS.md 区块当作一本账簿管理：每一行指令携带出处（日期 + 已验证的 SHA），并且：

> "No instruction lives in two loaded files, where it is paid for twice."
> （没有指令存在于两个被加载的文件中——那样它会被支付两次。）

一条搬迁（relocation）只有当目的地"被加载、或处于一个可观察的触发器之后"才合法：

> "A move into a file nothing reads is a deletion."
> （移进一个没人读的文件就是删除。）

当一条规则可以以路径限定的形式留在父区块里时，它就该留下，因为那比"一个没人加载的文件"成本更低。这是明码标价的 token 经济学。

## 四：逐出是证据驱动的，发生在刷新时

刷新流程对每行记录的 SHA 之后跑：

```bash
git log --diff-filter=DR --name-only
```

证据已消失的行被移除——到期在读取侧被执行，依据是证据而不是钟表。而重量级探索被扇出到"并行子代理"，所以编排器窗口只会收到已验证的结论，而不是扫描输出。

## 合起来

百万 token 窗口需要的是存储调度器。BMAD 的答案：**路由器保持纤薄、知识外部化、按意图触发加载、让每个驻留行自带逐出条件。** 上下文窗口管理不是一个模块——它是文件布局本身。

📄 逐字核对处：`skills/bmad/SKILL.md` · `skills/bmad-project-context/SKILL.md` · `scripts/knowledge.py`
