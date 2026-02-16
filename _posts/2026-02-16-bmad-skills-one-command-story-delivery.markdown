---
layout: post
title: "一条命令交付整个Epic？我把BMAD开发流程自动化了"
description: "用BMAD做开发的朋友，你是不是也厌倦了每个故事都要手动跑完一长串流程？我把这套流程封装成了Claude Code Skills，现在一条命令就能完成一个故事甚至整个Epic的交付。"
date: 2026-02-16 15:00:00 +0800
categories: [AI, 开发方法, 效率工具]
tags: [BMAD, Claude Code, 自动化, Skills, 开源项目]
---

**用 BMAD 做开发的朋友，你是不是也有这样的困扰：每个故事都要手动跑完「创建→开发→测试→审查→修复→更新状态」这一长串流程？更别说一个 Epic 动辄 5-10 个故事，重复操作让人心力交瘁……**

---

## BMAD 开发者的日常

如果你正在用 BMAD 方法论做开发，这套流程一定很熟悉：

```
/bmad-bmm-create-story 1.1   # 创建故事
/bmad-bmm-dev-story 1.1      # 开发实现
/bmad-bmm-qa-automate 1.1    # 运行测试
/bmad-bmm-code-review 1.1    # 代码审查
# 发现 HIGH/MEDIUM 问题？手动修复，再跑一遍测试……
# 最后别忘了更新 sprint-status.yaml
```

一个故事还好，要是 Epic 3 有 8 个故事呢？**8 × 6 = 48 次命令** 🤯

更崩溃的是：
- 忘了跑测试就提交了？
- 审查发现问题忘了修复？
- 状态文件忘了更新？

**这些「人工确认」环节，太容易出错了。**

---

## 我做了什么

于是我把这套流程封装成了 **Claude Code Skills**，一行命令搞定：

```bash
/bmad-story-deliver
```

就这一条，剩下的全交给 AI：

```
✅ [1/6] 创建用户故事
✅ [2/6] 开发实现
✅ [3/6] QA 自动化测试
✅ [4/6] 代码审查
✅ [5/6] 自动修复问题（如有）
✅ [6/6] 更新状态为 Done

🎉 故事 1.1 交付完成！
```

**是的，连状态都帮你更新了。**

---

## 三种模式，满足不同场景

我设计了三种 Skills，按需选择：

### 1️⃣ 快速模式：`/bmad-story-deliver`

**适合**：信任度高的项目、快速迭代

```bash
/bmad-story-deliver 1.1   # 交付指定故事
/bmad-story-deliver       # 自动选择编号最小的 backlog 故事
```

一个命令完成 6 步流程：
1. 创建用户故事
2. 开发实现
3. QA 自动化测试
4. 代码审查
5. 自动修复 HIGH/MEDIUM 问题
6. 更新状态为 Done

不传参数还能**自动选择下一个待开发的故事**。

---

### 2️⃣ 安全模式：`/bmad-story-worktree`

**适合**：需要隔离开发、强制测试通过的场景

```bash
/bmad-story-worktree 1.1
```

快速模式也会跑测试，但即使失败也不会阻止你继续。**安全模式则多了两层保障**：

- **独立 Worktree**：代码完全隔离，不影响主分支
- **测试不通过 = 不合并**：只有 QA 全部通过 + 无遗留 HIGH/MEDIUM 问题，才会合并

如果测试失败或有问题？**保留 worktree，等你手动处理完再继续。**

---

### 3️⃣ 批量模式：`/bmad-epic-worktree`

**适合**：整个 Epic 批量交付，真正解放双手

```bash
/bmad-epic-worktree 3     # 交付 Epic 3 的所有故事
/bmad-epic-worktree       # 自动选择编号最小且有未完成的 Epic
```

执行逻辑：
1. 收集 Epic 下所有未完成的故事
2. 按 Story 编号排序
3. **逐个**调用安全模式交付
4. 前一个完成才开始下一个
5. 任一失败则暂停，保留状态

**一条命令，交付整个 Epic。你可以去喝杯咖啡了 ☕**

---

## 对比一下

| 模式 | 运行测试 | 隔离开发 | 强制把关 | 适用场景 |
|------|----------|----------|----------|----------|
| 快速 | ✅ | ❌ | ❌ 测试失败也继续 | 快速迭代 |
| 安全 | ✅ | ✅ Worktree | ✅ 不通过不合并 | 稳妥交付 |
| 批量 | ✅ | ✅ Worktree | ✅ 不通过不合并 | 整 Epic 交付 |

---

## 快速上手

```bash
# 克隆仓库
git clone https://github.com/terryso/claude-bmad-skills.git

# 安装到你的 Claude Code
cp -r claude-bmad-skills/.claude/skills/* ~/.claude/skills/

# 开始使用
/bmad-story-deliver      # 交付一个故事
/bmad-epic-worktree      # 交付整个 Epic
```

---

## 写在最后

这个项目的核心理念很简单：**把重复的事情自动化，把确认的事情交给 AI**。

以前交付一个 Epic：
- 手动执行 40+ 次命令
- 多次人工确认测试结果
- 多次手动更新状态文件

现在：
```bash
/bmad-epic-worktree
```

**一条命令，搞定一切。**

---

**项目地址：** [github.com/terryso/claude-bmad-skills](https://github.com/terryso/claude-bmad-skills)

如果你也在用 BMAD 做开发，欢迎试用反馈！⭐ Star 支持一下就更棒了~

---

*你在 BMAD 开发中有什么效率痛点？欢迎在评论区分享。*
