---
layout: post
title: "后台审查：Hermes 每次对话都在默默学习"
description: "Hermes 的后台审查机制是闭环学习的核心引擎。每轮对话结束后，它 fork 一个审查代理，回放对话并决定是否保存记忆或更新技能。审查代理继承父代理的前缀缓存降低成本，工具权限被限制为只能操作记忆和技能。最精彩的是它的审查 prompt——明确告诉 Agent 该学什么、不该学什么，以及为什么什么都不做是错失而非中性。"
date: 2026-05-21 10:20 +0800
categories: [AI, Agent, 开源]
tags: [Hermes, 自进化, 后台审查, Agent, prompt工程]
---

> 本文是「Hermes 自我进化机制深度解析」系列第三篇。[上一篇：记忆系统](/blog/hermes-self-evolution-2-memory)

前两篇我们看了闭环架构总览和记忆系统。这篇进入核心引擎——**后台审查**（Background Review）。

如果你只能记住 Hermes 自我进化的一件事，记住这个：**每一轮对话结束后，都有一个审查代理在默默回放你的对话，判断什么值得学习**。这是整个闭环的引擎。

## 触发时机

后台审查在主对话循环的末尾触发。看 `conversation_loop.py` 的关键代码：

```python
# 后台记忆/技能审查 — 在回复交付之后运行
# 所以它永远不会跟用户的任务抢模型资源
if final_response and not interrupted and (_should_review_memory or _should_review_skills):
    try:
        agent._spawn_background_review(
            messages_snapshot=list(messages),
            review_memory=_should_review_memory,
            review_skills=_should_review_skills,
        )
    except Exception:
        pass  # 后台审查是尽力而为
```

三个条件同时满足才会触发：
1. 有最终回复（不是空回复）
2. 对话没被中断
3. 达到了记忆审查或技能审查的间隔

审查间隔由 `_memory_nudge_interval` 和 `_skill_nudge_interval` 控制——不是每轮都审查，而是每隔几轮才触发。这既控制成本，又确保有足够的对话上下文供审查代理分析。

## Fork 一个审查代理

Hermes 不直接在主代理上运行审查——那样会干扰主对话的状态。它 **fork 一个全新的 AIAgent 实例**：

```python
review_agent = AIAgent(
    model=agent.model,
    max_iterations=16,          # 审查代理最多 16 轮工具调用
    quiet_mode=True,            # 静默模式
    platform=agent.platform,
    provider=agent.provider,
    base_url=_parent_runtime.get("base_url"),
    api_key=_parent_runtime.get("api_key"),
    parent_session_id=agent.session_id,
    skip_memory=True,           # 不触碰外部记忆提供商
)
```

这个设计有几个值得说的地方：

### 1. 继承父代理的运行时

审查代理使用与主对话**完全相同的模型、提供商、API 密钥和 base URL**。这不是偷懒——而是为了正确性。如果主对话用的是 OAuth 凭据（比如 Claude Pro 的会话登录），从环境变量重新解析凭据会失败，因为 OAuth token 是会话级的、无法重建的。

### 2. 前缀缓存共享

这是成本控制的关键：

```python
# 继承父代理缓存的系统提示词，字节级一致
review_agent._cached_system_prompt = agent._cached_system_prompt
# 固定 session_start 和 session_id，保证任何重建也一致
review_agent.session_start = agent.session_start
review_agent.session_id = agent.session_id
```

审查代理的 API 请求直接命中 Anthropic/OpenRouter 的前缀缓存。根据 PR #17276 的分析，这带来了约 **26% 的端到端成本降低**。

### 3. 工具白名单

审查代理的工具权限被严格限制：

```python
review_whitelist = {
    "memory",           # 记忆操作
    "skill_manage",     # 技能管理
    "skill_view",       # 查看技能
    "skills_list",      # 列出技能
    # ... 仅限记忆和技能相关工具
}
```

审查代理不能执行代码、不能写文件、不能上网——只能操作记忆和技能。这限制了审查的爆炸半径。

### 4. 跳过外部记忆提供商

`skip_memory=True` 确保 fork 不会触发 Honcho、Mem0 等外部提供商。审查代理通过直接绑定父代理的 `_memory_store` 来写入内置的 MEMORY.md/USER.md，但对外部提供商零副作用。

## 审查 Prompt：该学什么

审查代理的 prompt 是 Hermes 自我进化设计中**最值得细读的部分**。它不只是说"看看有什么值得学的"——它精确地定义了什么该学、什么不该学、以及为什么。

### 记忆审查

```
Review the conversation above and consider saving to memory if appropriate.

Focus on:
1. Has the user revealed things about themselves — their persona, desires,
   preferences, or personal details worth remembering?
2. Has the user expressed expectations about how you should behave, their work
   style, or ways they want you to operate?

If something stands out, save it using the memory tool.
If nothing is worth saving, just say 'Nothing to save.' and stop.
```

简洁、聚焦。只关注两类信号：用户身份和用户期望。

### 技能审查

技能审查 prompt 更长、更精确，我逐段看。

#### 开场态度

```
Review the conversation above and update the skill library. Be ACTIVE — most
sessions produce at least one skill update, even if small. A pass that does
nothing is a missed learning opportunity, not a neutral outcome.
```

"Be ACTIVE"——积极一点。什么都不做不是中性结果，是**错失了学习机会**。这个措辞影响审查代理的行为：它会更主动地寻找值得学习的内容。

#### 触发信号

```
Signals to look for (any one of these warrants action):
  • User corrected your style, tone, format, legibility, or verbosity.
    Frustration signals like 'stop doing X', 'this is too verbose',
    'don't format like this' — these are FIRST-CLASS skill signals,
    not just memory signals.
  • User corrected your workflow, approach, or sequence of steps.
  • Non-trivial technique, fix, workaround, or debugging path emerged.
  • A skill that was loaded turned out wrong, missing, or outdated.
```

四类信号：
1. **风格纠正** — "别用 emoji"、"太啰嗦了"
2. **流程纠正** — "先写测试再写代码"
3. **新技术** — 发现了一个 workaround
4. **技能过时** — 已有技能需要更新

特别注意：**用户的挫败感是头等技能信号**。"你老是做 Y，我烦死了"不是应该写入记忆的偏好——是应该嵌入技能的教训。

#### 优先级顺序

```
Preference order:
  1. UPDATE A CURRENTLY-LOADED SKILL — 被加载的技能优先更新
  2. UPDATE AN EXISTING UMBRELLA — 找到已有的类级技能来修补
  3. ADD A SUPPORT FILE — 在已有技能下加参考文件
  4. CREATE A NEW CLASS-LEVEL UMBRELLA — 实在没有才创建新技能
```

**创建新技能是最后手段。** 优先修补已有技能。这防止技能库膨胀——一个大的"Python 开发"技能比十个小技能好管理得多。

#### 类级命名约束

```
The name MUST be at the class level. The name MUST NOT be a specific PR
number, error string, feature codename, library-alone name, or
'fix-X / debug-Y / audit-Z-today' session artifact.
```

技能名必须是类级的——"python-debugging"可以，"fix-issue-1234"不行。如果名字只在今天的任务里有意义，那就是错的。

#### 用户偏好的归属

```
User-preference embedding: when the user expressed a style/format/workflow
preference, the update belongs in the SKILL.md body, not just in memory.
Memory captures 'who the user is'; skills capture 'how to do this class
of task for this user'.
```

这是一个关键区分。用户说"别用 print 调试"——记忆应该记住"用户偏好 pdb"，但**技能也应该编码这个偏好**。因为下次做 Python 调试任务时，Agent 是通过加载技能来知道怎么做的，不是通过记忆。

## 审查 Prompt：不该学什么

反模式清单是审查 prompt 里的重点：

```
Do NOT capture:
  • Environment-dependent failures: missing binaries, fresh-install errors,
    post-migration path mismatches, 'command not found', unconfigured
    credentials, uninstalled packages.
  • Negative claims about tools or features ('browser tools do not work',
    'X tool is broken', 'cannot use Y from execute_code').
  • Session-specific transient errors that resolved before the conversation
    ended.
  • One-off task narratives. A user asking 'summarize today's market' is
    not a class of work that warrants a skill.
```

每一条都来自实际的踩坑经验：

**环境依赖的失败**：今天少装了一个包，Agent 把"这个工具不好用"存成技能。三个月后你装了包，Agent 仍然拒绝使用。

**负面断言**：同上。"浏览器工具不好用"会固化为持久的自我限制。

**一次性错误**：如果重试就好了，教训是"可以重试"，不是原始错误。

**一次性任务**：问"今天天气怎样"不值得创建一个"天气查询"技能。

最后还有一个附带说明：

```
If a tool failed because of setup state, capture the FIX (install command,
config step, env var to set) — never 'this tool does not work' as a
standalone constraint.
```

如果工具因为配置问题失败了，记录**修复方法**（"需要运行 pip install X"），而不是记录**失败本身**（"X 工具不好用"）。

## 审查代理的运行

审查代理在守护线程（daemon thread）中运行，主对话不用等它：

```
用户消息 → 主对话循环 → 回复交付给用户
                          ↓
                    后台守护线程启动
                          ↓
                    Fork 审查代理
                          ↓
                    回放对话快照
                          ↓
                    决定是否保存记忆/技能
                          ↓
                    汇报操作摘要给用户
```

关键细节：

1. **对话快照**：审查代理拿到的是对话的**快照**（`messages_snapshot=list(messages)`），不是活的引用。这意味着主对话和审查互不干扰。

2. **操作摘要**：审查完成后，Hermes 会提取审查代理执行的操作，生成人类可读的摘要：

```python
def summarize_background_review_actions(review_messages, prior_snapshot):
    """提取人类可见的操作摘要。"""
    actions = []
    for msg in review_messages:
        if msg["role"] != "tool":
            continue
        data = json.loads(msg["content"])
        if data.get("success"):
            if "created" in data["message"]:
                actions.append(data["message"])
            elif "updated" in data["message"]:
                actions.append(data["message"])
    return actions
```

用户可能看到类似这样的通知："Memory updated"、"Skill 'python-debugging' updated"。

## Codex 运行时降级

一个有趣的边界情况：如果主代理使用的是 `codex_app_server` 运行时（在 Codex 的子进程中运行），审查代理会**降级到 `codex_responses` 模式**：

```python
if _parent_api_mode == "codex_app_server":
    _parent_api_mode = "codex_responses"
```

原因是 Codex app server 运行时把整个 Agent 循环交给 Codex 的子进程处理，绕过了 Hermes 自己的工具调度。审查代理需要 Hermes 自己的调度来执行 `memory` 和 `skill_manage` 工具，所以降级到直接调用 OpenAI Responses API。

## 组合审查 vs 分离审查

Hermes 实际上有两种审查 prompt：

1. **分离模式**：记忆审查（`_MEMORY_REVIEW_PROMPT`）和技能审查（`_SKILL_REVIEW_PROMPT`）各自独立
2. **组合模式**（`_COMBINED_REVIEW_PROMPT`）：同时审查记忆和技能

组合模式更常见，因为它一次审查就覆盖两个维度。代码中是这样判断的：

```python
if _should_review_memory and _should_review_skills:
    # 组合审查
elif _should_review_memory:
    # 仅记忆审查
elif _should_review_skills:
    # 仅技能审查
```

## 运行成本

你可能会担心：每次对话都 fork 一个审查代理，这不是很贵吗？

实际上成本很低：

1. **不是每次都触发**：有间隔控制
2. **前缀缓存命中**：继承父代理的系统提示词缓存
3. **辅助模型可选**：审查可以用便宜的模型
4. **最多 16 轮**：限制了最坏情况的成本
5. **尽力而为**：审查失败不影响主对话

## 小结

后台审查是 Hermes 自我进化的真正引擎。几个值得注意的设计点：

- **积极但克制**：鼓励主动学习，但明确禁止捕获环境依赖和负面断言
- **继承而非重建**：fork 共享前缀缓存，降低成本
- **白名单隔离**：审查代理只能操作记忆和技能，爆炸半径有限
- **优先修补而非创建**：防止技能库无限膨胀

下一篇：[技能进化：从经验中提炼可复用的知识](/blog/hermes-self-evolution-4-skills)

---

*Hermes Agent 是 Nous Research 的开源项目，代码在 [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)。*
