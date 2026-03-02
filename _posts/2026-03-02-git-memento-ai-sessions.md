---
layout: post
title: "用 Git Notes 记录 AI 编程会话 - git-memento 工具介绍"
date: 2026-03-02 16:03:55 +0800
categories: tech-translation
description: "git-memento 是一个 Git 扩展工具，可以将 AI 编程助手（如 Codex、Claude Code）的会话记录自动附加到 git commit 上，让你追溯每个代码变更背后的完整思考过程。"
original_url: https://github.com/mandel-macaque/memento
source: Hacker News
---

本文翻译自 [git-memento](https://github.com/mandel-macaque/memento)，原载于 Hacker News。

## 为什么需要这个工具？

随着 AI 编程助手（如 GitHub Copilot、Claude Code、Cursor）越来越普及，我们每天都在与 AI 协作写代码。但问题来了：当你回顾几个月前的代码时，还能记得当时和 AI 讨论了什么吗？为什么选择了这个方案而不是那个？

`git-memento` 解决的就是这个问题——它把 AI 编程会话的完整对话记录保存为 git notes，永久附加到对应的 commit 上。这样，代码审查、问题排查、或者半年后回顾代码时，你都能看到完整的决策过程。

## 核心功能

`git-memento` 的设计目标很清晰：

- **不改变现有工作流**：继续用 `git commit -m` 或编辑器写提交信息
- **自动附加会话记录**：通过 `git notes` 机制存储 AI 对话
- **多 AI 提供商支持**：目前支持 Codex 和 Claude Code，可扩展
- **人类可读的 Markdown 格式**：笔记内容格式清晰易读

## 快速上手

### 安装

一行命令安装：

```bash
curl -fsSL https://raw.githubusercontent.com/mandel-macaque/memento/main/install.sh | sh
```

### 初始化配置

在每个仓库中初始化 memento 设置：

```bash
# 默认使用 Codex
git memento init

# 或指定使用 Claude Code
git memento init claude
```

`init` 命令会将配置存储在本地 git 元数据（`.git/config`）中。

### 基本使用

提交代码时附上 AI 会话：

```bash
# 指定会话 ID 提交
git memento commit <session-id> -m "实现用户认证功能"

# 多行提交信息
git memento commit <session-id> -m "实现用户认证功能" -m "包含 OAuth2.0 和 JWT 支持"

# 不指定 -m 会打开编辑器
git memento commit <session-id>
```

修改提交（amend）时：

```bash
# 保留原有会话记录
git memento amend -m "修复认证 bug"

# 追加新的会话记录
git memento amend <new-session-id> -m "修复认证 bug"
```

### 团队协作

与团队成员共享会话记录：

```bash
# 推送 notes 到远程仓库
git memento share-notes

# 推送代码的同时同步 notes
git memento push

# 从远程同步并合并 notes
git memento notes-sync
```

## 实用命令

### 审计会话覆盖情况

检查某个提交范围内的会话记录完整性：

```bash
git memento audit --range main..HEAD
git memento audit --range origin/main..HEAD --strict --format json
```

- 报告缺失会话记录的提交
- 验证会话元数据格式
- `--strict` 模式下，格式不正确会导致命令失败

### 诊断工具

检查仓库配置和同步状态：

```bash
git memento doctor
```

### 配置 rebase/amend 时的 notes 继承

```bash
git memento notes-rewrite-setup
```

这会设置：
- `notes.rewriteRef=refs/notes/commits`
- `notes.rewriteMode=concatenate`
- `notes.rewrite.rebase=true`
- `notes.rewrite.amend=true`

## GitHub Actions 集成

这个工具最强大的一点是提供了 GitHub Action，有两种模式：

### 模式一：自动评论（comment）

在 PR 中自动将 AI 会话记录渲染为评论，方便代码审查：

```yaml
name: memento-note-comments

on:
  push:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: write
  pull-requests: read

jobs:
  comment-memento-notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: mandel-macaque/memento@v1
        with:
          mode: comment
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### 模式二：CI 门禁（gate）

强制要求所有提交都必须有会话记录，否则 CI 失败：

```yaml
name: memento-note-gate

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read

jobs:
  enforce-memento-notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: mandel-macaque/memento/install@v1
        with:
          memento-repo: mandel-macaque/memento

      - uses: mandel-macaque/memento@v1
        with:
          mode: gate
          strict: "true"
```

## 配置选项

通过环境变量配置 AI 提供商：

```bash
# 选择 AI 提供商
MEMENTO_AI_PROVIDER=claude  # 默认是 codex

# Codex 配置
MEMENTO_CODEX_BIN=codex
MEMENTO_CODEX_GET_ARGS="sessions get {id} --json"
MEMENTO_CODEX_LIST_ARGS="sessions list --json"

# Claude Code 配置
MEMENTO_CLAUDE_BIN=claude
MEMENTO_CLAUDE_GET_ARGS="sessions get {id} --json"
MEMENTO_CLAUDE_LIST_ARGS="sessions list --json"
```

## 技术实现

- **存储方式**：使用 `git notes add -f -m "<markdown>" <commit-hash>` 存储会话
- **多会话支持**：使用明确的分隔符标记不同会话
  - `<!-- git-memento-sessions:v1 -->`
  - `<!-- git-memento-session:start -->`
  - `<!-- git-memento-session:end -->`
- **开发语言**：F# + TypeScript，使用 NativeAOT 编译为单文件可执行程序

## 个人思考

这个工具解决了 AI 编程时代的一个真实痛点：**可追溯性**。

传统软件开发中，我们有代码注释、commit message、code review 记录。但当 AI 参与编程后，大量的决策过程隐藏在人机对话中，这些信息如果丢失，对代码维护是很大的损失。

`git-memento` 的设计思路值得借鉴：

1. **利用 Git 原生机制**：git notes 是一个被低估的功能，它可以在不修改 commit hash 的情况下附加任意元数据
2. **不侵入工作流**：开发者不需要改变习惯，工具在后台自动完成记录
3. **团队友好**：支持 notes 的推送、同步和合并

对于重度使用 AI 编程助手的团队，这个工具值得尝试。特别是在需要严格代码审计的场景（金融、医疗等），保留 AI 会话记录可以作为代码审查的重要补充。

## 总结

`git-memento` 是一个实用的 Git 扩展，核心价值在于：

- 永久保存 AI 编程会话记录到 git notes
- 支持团队协作和同步
- 提供 GitHub Action 实现自动化评论和 CI 门禁
- 支持 Codex 和 Claude Code，可扩展其他 AI 提供商

如果你在团队中使用 AI 编程工具，这或许是提升代码可维护性的一个好选择。
