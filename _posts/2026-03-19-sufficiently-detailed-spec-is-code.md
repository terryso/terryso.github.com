---
layout: post
title: "足够详细的规范文档就是代码"
date: 2026-03-19 15:43:15 +0800
categories: tech-translation
description: "作者 Gabriella Gonzalez 指出，试图通过规范文档来生成代码的「agentic coding」主张存在根本性谬误：足够精确的规范文档本质上就是代码，而且这种方式并不能可靠地生成可工作的实现。"
original_url: https://haskellforall.com/2026/03/a-sufficiently-detailed-spec-is-code
source: Hacker News
---

本文翻译自 [A sufficiently detailed spec is code](https://haskellforall.com/2026/03/a-sufficiently-detailed-spec-is-code)，原载于 Hacker News。

---

这篇文章本质上就是下面这幅漫画的详细展开：

![漫画](https://www.commitstrip.com/en/2016/08/25/a-very-comprehensive-and-precise-spec/)

很长一段时间以来，我都不需要写这样的文章。如果有人提起从规范文档生成代码的想法，我只需要分享上面这张图片，通常就能说明问题。

然而，**agentic coding（智能体编程）** 的倡导者们声称找到了一种「反重力」的方法——可以纯粹从规范文档生成代码。更重要的是，他们把水搅得足够浑，以至于我认为上面这幅漫画值得补充一些评论，来说明他们的主张为什么具有误导性。

根据我的经验，他们的倡导基于两个常见的误解：

- **误解一：规范文档比对应的代码更简单**

  这个误解常用于向相信 agentic coding 是「下一代外包」的人推销。他们梦想工程师变成管理者，编写规范文档然后外包给一群 AI 智能体去执行——但这只有在「描述工作比做工作更便宜」的情况下才行得通。

- **误解二：规范工作必须比编码工作更深思熟虑**

  这个误解常用于回应那些担心 agentic coding 会产生难以维护的垃圾代码的怀疑者。论点是：通过规范文档过滤工作会提高质量，促进更好的工程实践。

下面我将用具体例子来解释为什么我认为这些是误解。

## 披着外衣的代码

让我们从 OpenAI 的 [Symphony](https://github.com/openai/symphony) 项目开始，OpenAI 将其吹捧为从规范文档生成项目的示例。

Symphony 项目是一个智能体编排器（agent orchestrator），声称是从一个「规范文档」（[SPEC.md](https://github.com/openai/symphony/blob/b0e0ff0082236a73c12a48483d0c6036fdd31fe1/SPEC.md)）生成的——我之所以给「规范」加引号，是因为这个文件与其说是规范，不如说是 markdown 形式的伪代码。

仔细看这份文档，你会发现它包含类似这样的内容：

**数据库模式的散文式描述：**

> 4.1.6 Live Session (Agent Session Metadata)
>
> State tracked while a coding-agent subprocess is running.
>
> Fields:
> - session_id (string, <thread_id>-<turn_id>)
> - thread_id (string)
> - turn_id (string)
> - codex_app_server_pid (string or null)
> - last_codex_event (string/enum or null)
> - ...

**代码的散文式描述：**

> 8.3 Concurrency Control
>
> Global limit:
> - available_slots = max(max_concurrent_agents - running_count, 0)
>
> 8.4 Retry and Backoff
>
> Backoff formula:
> - Normal continuation retries after a clean worker exit use a short fixed delay of 1000 ms.
> - Failure-driven retries use delay = min(10000 * 2^(attempt - 1), agent.max_retry_backoff_ms).

**专门为了「保姆式」指导模型代码生成的冗余章节：**

> 6.4 Config Fields Summary (Cheat Sheet)
>
> This section is intentionally redundant so a coding agent can implement the config layer quickly.

**甚至是真正的代码：**

```python
function start_service():
  configure_logging()
  start_observability_outputs()
  start_workflow_watch(on_change=reload_and_reapply_workflow)

  state = {
    poll_interval_ms: get_config_poll_interval_ms(),
    max_concurrent_agents: get_config_max_concurrent_agents(),
    running: {},
    claimed: set(),
    retry_attempts: {},
    completed: set(),
    ...
  }
```

我觉得 agentic coding 的倡导者们把这种东西当作代码的替代品来推销，实在是有点虚伪——因为这个规范文档读起来就像是代码（在某些情况下就是代码）。

别误会：我不是说规范文档永远不应该包含伪代码或参考实现；这在规范工作中相当常见。但是，当你的规范文档读起来像代码时，你不能声称它是代码的替代品。

我提到这个是因为我认为 Symphony 很好地说明了第一个误解：

> **误解一：规范文档比对应的代码更简单**

如果你试图让规范文档精确到足以可靠地生成可工作的实现，**你就必然要把文档扭曲成代码**，或者与代码高度相似的东西（比如高度结构化和形式化的英文）。

[Dijkstra 解释了为什么这是不可避免的](https://www.cs.utexas.edu/~EWD/transcriptions/EWD06xx/EWD667.html)：

> 我们现在已经知道，接口的选择不仅仅是（固定量的）劳动分工，因为跨接口协作和通信的工作也必须加上。我们从清醒的经验中知道——改变接口很容易增加围栏两边的工作量（甚至剧烈增加）。因此现在更倾向于所谓的「窄接口」。
>
> 问题是，虽然改用人类母语进行人机通信会大大增加机器的负担，但我们必须挑战「这会简化人类生活」的假设。
>
> 简短回顾数学史就能证明这种挑战是多么有道理。希腊数学停滞不前，因为它仍然是一种口头、图画式的活动；穆斯林「代数学」在 timidly 尝试符号主义后，当它回归修辞风格时就消亡了；现代文明世界只有在西欧能够摆脱中世纪经院哲学的枷锁——一种对口头精确性的徒劳追求！——才能出现，这要归功于像 Vieta、笛卡尔、莱布尼茨和（后来的）布尔这样的人精心设计的有意识的形式符号主义。

Agentic coders 正在艰难地认识到：你无法逃避工程劳动所需的「窄接口」（即：代码）；你只能把那种劳动转化为表面上不同的东西，但它仍然需要同样的精确性。

## 不稳定性

而且，从规范生成代码甚至**不能可靠地工作**！

我实际尝试了 Symphony 的 [README](https://github.com/openai/symphony/blob/b0e0ff0082236a73c12a48483d0c6036fdd31fe1/README.md) 建议的做法：

> 告诉你最喜欢的 coding agent 用你选择的编程语言构建 Symphony：
>
> 「根据以下规范实现 Symphony：https://github.com/openai/symphony/blob/main/SPEC.md」

我让 Claude Code 用我选择的语言（Haskell，如果你从我博客的名字猜不到的话）构建 Symphony，结果并不顺利。你可以在我的 [Gabriella439/symphony-haskell 仓库](https://github.com/Gabriella439/symphony-haskell) 找到结果。

不仅存在多个 bug（我必须提示 Claude 修复，你可以在提交历史中找到这些修复），而且即使当事情「工作」时（意思是：没有错误消息），codex 智能体只是默默地空转，对以下示例 Linear 任务没有任何进展：

> 创建一个新的空白仓库
>
> 不需要创建 GitHub 项目。只需创建一个空白 git 仓库。

换句话说，Symphony 的「对口头精确性的徒劳追求」（借用 Dijkstra 的话）**仍然**无法可靠地生成可工作的实现。

这个问题也不限于 Symphony：即使是像 YAML 这样众所周知的规范也存在同样的问题。[YAML 规范](https://yaml.org/spec/1.2.2/) 非常详细，被广泛使用，甚至包含一个[一致性测试套件](https://github.com/yaml/yaml-test-suite)，但绝大多数 YAML 实现仍然不完全符合规范。

Symphony 可以尝试通过扩展规范来解决不稳定性，但它已经很长了——达到了 **Elixir 实现大小的 1/6**！如果规范再扩展，他们就会重演博尔赫斯的《论科学的精确性》短篇小说：

> ……在那个帝国，制图艺术达到了如此完美，以至于一个省份的地图就占据了一整座城市，而帝国的地图则占据了一整个省份。后来，这些过分精确的地图不再令人满意，制图师公会制作了一幅与帝国大小相同的帝国地图，点对点重合。后来的几代人不像他们的祖先那样热衷于制图学研究，看到那张巨大的地图毫无用处，便毫不留情地把它交给了烈日和严寒的摧残。在西方的沙漠里，至今仍有那张地图的残垣断壁，被野兽和乞丐栖息；在这片土地上，地理学再无其他遗迹。

## 垃圾内容

规范工作本来应该比编码**更难**。通常我们在做工作之前编写规范文档的原因是鼓励通过沉思和批判的视角来看待项目，因为一旦编码开始，我们就会切换档位，变得被行动偏见所驱动。

那么为什么我说这也是一个误解：

> **误解二：规范工作必须比编码工作更深思熟虑**

问题在于，由于科技公司推动减少和贬低劳动力，这种深思熟虑已不再是我们可以理所当然的事情。当你从「我告诉人们规范工作应该比编码更容易」这个前提出发时，你就注定要失败。如果你优化的是交付速度，就不可能做规范写作所需的困难和令人不适的工作。

这就是为什么你会得到像 Symphony 「规范」这样的东西——表面上看起来像规范文档，但在仔细审查下就会瓦解。

事实上，Symphony 规范读起来就像是 AI 写的垃圾内容。[第 10.5 节](https://github.com/openai/symphony/blob/b0e0ff0082236a73c12a48483d0c6036fdd31fe1/SPEC.md#105-approval-tool-calls-and-user-input-policy) 是一个特别典型的例子：

> linear_graphql 扩展合约：
> - Purpose: 使用 Symphony 配置的 tracker auth 对 Linear 执行原始 GraphQL 查询或变更...
> - Availability: 只有当 tracker.kind == "linear" 且配置了有效的 Linear auth 时才有意义...
> - Preferred input shape: {...}
> - query 必须是非空字符串
> - query 必须恰好包含一个 GraphQL 操作
> - ...

这是一堆「规范形式」的句子，读起来像是智能体的工作产品：缺乏连贯性、目的或对大局的理解。

这样的规范文档**必然是垃圾**，即使是由人写的，因为他们优化的是交付时间而不是连贯性或清晰度。在当前的工程环境中，我们不能再理所当然地认为规范是深思熟虑和精心设计的结果。

## 结语

规范从来就不是为了节省时间的。如果你优化的是交付时间，直接编写代码可能比通过中间规范文档更好。

更一般地说，「垃圾进，垃圾出」的原则在这里适用。不存在这样一个世界：你输入一份缺乏清晰度和细节的文档，然后让 coding agent 可靠地填补那些缺失的清晰度和细节。Coding agents 不是读心者，即使他们是，如果你自己的想法都是混乱的，他们也做不了多少。

---

## 核心要点

1. **精确的规范就是代码**：如果你想让规范精确到能生成可工作的实现，它本质上就会变成代码或伪代码。你不能通过换一种表达形式来逃避编程所需的精确性。

2. **AI 代码生成仍然不可靠**：即使有详细的规范文档，AI 仍然无法可靠地生成正确的实现。YAML 这样成熟的规范尚且如此，更不用说一般的项目规范了。

3. **规范的目的是深思熟虑，而非省时**：编写规范的真正价值在于强制我们深入思考问题，而不是作为一种「更简单的编程方式」来节省时间。

4. **警惕 AI 生成的「规范形式」内容**：很多所谓的规范文档只是看起来像规范的文字堆砌，缺乏真正的连贯性和深度思考。
