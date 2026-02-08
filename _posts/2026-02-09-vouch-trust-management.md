---
layout: post
title: "Vouch：开源项目的信任管理系统，应对 AI 时代的垃圾贡献"
date: 2026-02-09 05:12:28 +0800
categories: tech-translation
description: "Mitchell Hashimoto 新作 Vouch，通过担保机制构建开源项目的信任网络，有效抵御 AI 生成的低质量贡献。"
original_url: https://github.com/mitchellh/vouch
source: GitHub
---

本文翻译自 [Vouch](https://github.com/mitchellh/vouch)，由 HashiCorp 创始人 Mitchell Hashimoto 开发。

## 什么是 Vouch？

Vouch 是一个**项目信任管理系统**。在参与项目的某些特定部分之前，贡献者必须被**担保（vouched for）**。同样，项目也可以明确**谴责（denounce）**某些用户，阻止他们与项目互动。

这个系统是通用设计的，理论上可以用于任何代码托管平台上的任何项目，但它开箱即用提供了 **GitHub 集成**，包括 GitHub Actions 和 CLI 工具。

担保名单存储在一个简单的扁平文件中，使用最小化的格式，可以用标准的 POSIX 工具和任何编程语言轻松解析，无需外部依赖库。

### 信任网络的构想

**Vouch 名单还可以形成一个信任网络。** 你可以配置 Vouch 读取其他项目的担保或谴责用户名单。这样，具有相同价值观的项目可以共享他们的信任决策，在整个生态系统中构建一个更大、更全面的信任网络。在一个项目中已被证明值得信赖的用户，可以自动在另一个项目中被视为可信，以此类推。

> **注意**：这是一个实验性系统，目前被 Ghostty 终端模拟器项目使用。开发者将继续根据实际经验和反馈来改进这个系统。

## 为什么要创建 Vouch？

开源项目一直运作在"**信任但验证**"的模式下。

历史上，理解代码库、实现更改并提交审查所需的努力，足够高以至于自然地过滤掉许多来自不合格人员的低质量贡献。在我 20 多年的开源生涯中，这种模式对我以及大多数其他项目都足够有效。

但**形势已经改变了**——尤其是随着 AI 工具的出现，人们可以轻而易举地创建看起来合理但实际质量极低的贡献，而几乎不需要任何真正的理解。贡献者不能再因为提交变更的门槛很低而被信任。

然而，开源仍然建立在信任之上！每个项目都有一个明确的可信个体群体（维护者），以及一个更大的潜在可信个体群体（以任何形式活跃的社区成员）。因此，让我们转向**显式信任模型**，可信个体可以为他人担保，而被担保的个人就可以开始贡献。

## 谁来担保？

**谁**以及**如何**担保或谴责某人，完全由集成该系统的项目决定。此外，被担保或被谴责的人会有什么**后果**，也完全由项目决定。实施一个适合你的项目和社区的政策。

## 如何使用

### GitHub 集成

通过提供的 GitHub Actions，将 Vouch 集成到 GitHub 项目中非常简单。通过选择使用哪些 Actions，你可以完全控制用户如何被担保，以及他们可以或不能做什么。

这个仓库本身就是一个完整的 Vouch 集成示例！

| Action | 触发事件 | 描述 |
| --- | --- | --- |
| check-pr | `pull_request_target` | 在 PR 打开或重新打开时检查作者是否被担保。Bot 和有写权限的协作者自动允许。可选择自动关闭来自未担保或被谴责用户的 PR。 |
| manage-by-discussion | `discussion_comment` | 让协作者通过讨论评论来担保、谴责或取消担保用户。更新担保文件并提交更改。 |
| manage-by-issue | `issue_comment` | 让协作者通过 issue 评论来担保或谴责用户。更新担保文件并提交更改。 |

### CLI 工具

CLI 实现为 Nushell 模块，只需要 Nushell 即可运行，没有其他外部依赖。

#### 本地命令

**检查用户的担保状态：**
```nu
# 退出码：0 = 已担保, 1 = 已谴责, 2 = 未知
vouch check someuser
```

**添加用户到担保名单：**
```nu
# 预览新文件内容（默认）
vouch add someuser

# 原地写入文件
vouch add someuser --write
```

**谴责用户：**
```nu
# 预览新文件内容
vouch denounce badactor

# 添加理由
vouch denounce badactor --reason "提交了 AI 生成的垃圾内容"

# 原地写入文件
vouch denounce badactor --write
```

#### GitHub 集成命令

需要 `GITHUB_TOKEN` 环境变量。如果未设置但有 `gh` CLI，会使用 `gh auth token` 获取的 token。

**检查 PR 作者是否被担保：**
```nu
# 检查 PR 作者状态（试运行）
vouch gh-check-pr 123 --repo owner/repo

# 自动关闭未担保的 PR（试运行）
vouch gh-check-pr 123 --repo owner/repo --auto-close

# 真正关闭未担保的 PR
vouch gh-check-pr 123 --repo owner/repo --auto-close --dry-run=false

# 允许未担保用户，只阻止被谴责者
vouch gh-check-pr 123 --repo owner/repo --require-vouch=false --auto-close
```

**通过 issue 评论管理贡献者状态：**
```nu
# 试运行（默认）
vouch gh-manage-by-issue 123 456789 --repo owner/repo

# 实际执行操作
vouch gh-manage-by-issue 123 456789 --repo owner/repo --dry-run=false
```

响应有写权限协作者的评论：
- `vouch` — 担保 issue 作者
- `vouch @user` — 担保特定用户
- `vouch <理由>` — 带理由担保 issue 作者
- `vouch @user <理由>` — 带理由担保特定用户
- `denounce` — 谴责 issue 作者
- `denounce @user` — 谴责特定用户
- `denounce <理由>` — 带理由谴责 issue 作者
- `denounce @user <理由>` — 带理由谴责特定用户

### Library 模块

该模块还导出一个 `lib` 子模块用于脚本编程：

```nu
use vouch/lib.nu *

let records = open VOUCHED.td
$records | check-user "mitchellh" --default-platform github  # "vouched", "denounced", 或 "unknown"
$records | add-user "newuser"                                # 返回更新后的表格
$records | denounce-user "badactor" "reason"                 # 返回更新后的表格
$records | remove-user "olduser"                             # 返回更新后的表格
```

## 担保文件格式

担保名单存储在 `.td` 文件中（Trustdown，信任标记的缩写，类似于 Markdown）。默认在 `VOUCHED.td` 或 `.github/VOUCHED.td` 查找。

```
# 注释以 # 开头
username
platform:username
-platform:denounced-user
-platform:denounced-user reason for denouncement
```

- 每行一个用户名（不带 `@`），按字母顺序排序
- 可选指定平台前缀：`platform:username`（如 `github:mitchellh`）
- 用 `-` 前缀谴责用户
- 可在用户名后用空格添加详细信息

模块导出 `from td` 和 `to td` 命令，因此 Nushell 的 `open` 命令原生支持 `.td` 文件，可以解码为结构化表格，并编码回文件格式，保留注释和空白。

## 技术亮点

1. **零依赖**：CLI 使用 Nushell 实现，无需外部依赖
2. **可解析性**：文件格式设计为可用任何语言解析
3. **跨平台信任网络**：项目间可共享信任决策
4. **GitHub 原生集成**：通过 Actions 和 CLI 无缝集成
5. **灵活配置**：项目可自定义担保策略和后果

## 个人思考

Mitchell 作为 HashiCorp 的创始人，对开源生态有着深刻的理解。Vouch 这个项目反映了一个现实问题：AI 工具的普及降低了提交 PR 的门槛，但也带来了大量低质量贡献。

传统的"trust but verify"模式在面对 AI 批量生成的贡献时显得力不从心。Vouch 通过引入显式的信任机制，让社区中有声望的成员成为"信任节点"，为新人背书，这种设计很巧妙：

- **社交工程 + 技术手段**：不是纯技术过滤，而是利用社区的信任网络
- **可组合的信任**：项目间可以共享担保名单，形成跨项目的信任网络
- **保留灵活性**：不强制规定担保规则，由各项目自行决定

`.td` 格式（Trustdown）也很有意思，Mitch 打算将其正式化为一个规范，让不同的信任系统可以互操作。这让人联想到 PGP 的信任网络模型，但更简化且针对现代开源协作场景。

对于维护者来说，这个工具可以有效抵御 AI 垃圾贡献的冲击；对于贡献者来说，获得一个担保者的认可比盲目提交 PR 更有意义——这回归了开源社区"人"的本质。

## 关键要点

- Vouch 通过担保机制建立开源项目的显式信任模型
- 使用简单的 `.td` 文件格式存储担保名单，支持跨项目信任网络
- 提供 GitHub Actions 集成和 Nushell CLI 工具
- 有效应对 AI 时代低质量贡献泛滥的问题
- 信任网络可组合，项目间可共享信任决策
- Mitchell Hashimoto 的实验性项目，目前用于 Ghostty 终端模拟器

GitHub 仓库：[mitchellh/vouch](https://github.com/mitchellh/vouch)
