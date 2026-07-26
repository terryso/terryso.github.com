---
layout: post
title: "一台电脑上，怎样让两个 Codex CLI 账号互不干扰"
description: "Codex CLI 默认只有一套本地状态，但可以用独立的 CODEX_HOME 目录分别登录个人和工作账号。本文说明这个办法能解决什么、不能解决什么，以及为什么绝不能靠复制 auth.json。"
date: 2026-07-26 10:00:00 +0800
categories: [AI, 开发者工具]
tags: [Codex CLI, OpenAI, 终端, 账号隔离, 开发工具]
---

![两套独立的 Codex CLI 环境：各自的终端、状态目录与锁定边界，彼此没有连接](/images/posts/codex-cli-separate-accounts/isolated-environments.png)

*两个账号应各自使用独立的本地状态目录；它们可以同时工作，但不共享认证和会话。*

一个人同时有个人和工作两个 OpenAI 账号时，最容易踩的坑不是登录，而是登录之后。默认情况下，Codex CLI 把认证、配置、会话和本地状态都放在同一个目录。后一次登录会让下一次启动的 CLI 使用新的身份；MCP、插件和会话历史也混在一起。

我在 macOS 上用 `codex-cli 0.145.0` 核对过这个行为。Codex 的配置源码把 `CODEX_HOME` 定义为全部本地状态的根目录：默认是 `~/.codex`，设置后会改用指定目录。[源码中的说明](https://github.com/openai/codex/blob/main/codex-rs/core/src/config/mod.rs) 也说明日志和 SQLite 状态会随这个目录变化。

这意味着可以把“个人”和“工作”当成两套独立的 CLI 环境，而不是在同一套配置里反复登录、退出。

## 这不是原生的多账号切换

先把边界说清楚。Codex CLI 还没有类似 `--account work` 的正式账号选择器；官方仓库中相应的功能请求仍是开放状态。[该请求](https://github.com/openai/codex/issues/4432) 本身也把现状描述为：默认只有一个本地状态目录，多账号只能换目录、换认证文件或重新登录。

所以 `CODEX_HOME` 的作用不是把两个账号放进一个账号列表里。它做的是把两套状态彻底分开：

- 个人账号有自己的认证、配置、MCP、Skills、插件和会话记录；
- 工作账号也有自己的一套；
- 两个终端可以同时运行，各自读取自己的 SQLite 状态库；
- 已经启动的 Codex 不会在运行中切换身份。要换账号，必须从对应入口启动新的 CLI 进程。

这比手动替换 `~/.codex/auth.json` 稳妥得多，也更容易查清一条会话究竟用了哪个身份。

## 建两个独立目录，再分别登录

下面示例用两个目录保存状态。目录名只表示用途，不会把账号名称传给 OpenAI：

```bash
mkdir -p "$HOME/.codex-profiles/personal" "$HOME/.codex-profiles/work"

# 首次使用个人环境时登录个人账号
CODEX_HOME="$HOME/.codex-profiles/personal" codex login

# 首次使用工作环境时登录工作账号
CODEX_HOME="$HOME/.codex-profiles/work" codex login
```

以后从相同的入口启动即可：

```bash
# 个人环境
CODEX_HOME="$HOME/.codex-profiles/personal" codex

# 工作环境
CODEX_HOME="$HOME/.codex-profiles/work" codex
```

登录完成后，分别检查状态：

```bash
CODEX_HOME="$HOME/.codex-profiles/personal" codex login status
CODEX_HOME="$HOME/.codex-profiles/work" codex login status
```

如果日常经常在两个环境间切换，可以给终端写两个别名或两个很短的启动脚本。关键不是别名的名字，而是每个入口固定指向一个目录。涉及外部操作，例如创建 PR、发消息或使用带权限的 MCP 工具时，先看当前终端来自哪个入口。

## 不要复制或软链接 `auth.json`

看上去最快的做法，是先在默认目录登录一次，再把 `auth.json` 复制到另一个目录。这个方法不可靠。

![一个凭据保险箱分出两条路径：正常刷新的文件保持高亮，复制出的文件破裂并出现警告](/images/posts/codex-cli-separate-accounts/copied-credentials-expire.png)

*复制的认证文件可能在另一个副本刷新 refresh token 后失效；两个目录应分别登录。*

Codex 使用的 OAuth refresh token 可能是一次性的：当一个副本刷新 token 后，另一个副本里的旧 token 会失效。官方仓库已有复现说明：复制认证文件后，第一次可能还能使用缓存的 access token，之后可能出现 401。[问题 #15410](https://github.com/openai/codex/issues/15410) 还明确指出，用软链接或复制文件来共享 ChatGPT 订阅认证都不是稳定方案。

每个目录各自执行一次 `codex login`。不要从另一套环境复制认证文件，也不要把认证文件纳入 Git、网盘同步或备份脚本。

## 配置隔离带来的实际影响

账号隔离不是只多两个 `auth.json`。新目录一开始没有你原来配置过的 MCP server、插件、Skills、偏好设置或历史会话。这既是代价，也是这个办法有用的原因。

我通常会把配置分成两类：

1. 与身份无关、也不含密钥的通用设置，可以用一个受版本控制的模板维护；
2. 包含公司地址、MCP OAuth 登录状态、访问令牌或本机路径的设置，只放在对应环境里。

这样做的好处是，工作账号不会意外加载个人的高权限工具，个人会话也不会写进公司的历史记录。代价是第一次使用时要分别安装或配置真正需要的工具。

要注意，本文只讨论从终端启动的 Codex CLI。桌面端、IDE 扩展和其他 GUI 进程未必会继承终端环境变量；不能因为 CLI 被隔离，就假定它们也已经切换到同一账号。它们应单独核对登录状态和凭据位置。

## 适合的使用场景和不适合的使用场景

这个办法适合把合法且明确授权的身份分开，例如个人订阅与公司账号、两个客户提供的独立账号，或需要避免配置互相污染的测试环境。

它不应用于自动探测额度、在账号受限后自动切到下一个账号，或把多个账号的额度当作一份可轮换的资源。OpenAI 的服务条款禁止规避速率限制、使用限制和保护措施；个人账号也不应与他人共享凭据。[OpenAI Terms of Use](https://openai.com/es-US/policies/row-terms-of-use/)

如果目标只是让日常开发时的个人、工作上下文互不干扰，两个目录、两次独立登录和两个固定启动入口已经够用。它没有魔法，也不会扩大任何一个账号的权限或额度；它只是把本来会混在一起的本地状态分开保存。

---

**来源与核验范围：**本文基于 `codex-cli 0.145.0` 在 macOS 上的本地检查，以及 OpenAI 公开的 [Codex 配置源码](https://github.com/openai/codex/blob/main/codex-rs/core/src/config/mod.rs)、[多账号需求讨论](https://github.com/openai/codex/issues/4432)、[认证文件复制问题](https://github.com/openai/codex/issues/15410) 和 [服务条款](https://openai.com/es-US/policies/row-terms-of-use/)。Codex 的行为和条款可能更新；实际配置前请以本机 `codex --help` 与当前条款为准。
