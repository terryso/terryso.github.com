---
layout: post
title: "Emacs Solo 两年：35 个模块、零外部包与完整重构"
date: 2026-03-10 20:41:31 +0800
categories: tech-translation
description: "作者分享了两年来维护一个零外部依赖的 Emacs 配置的心得，包含 35 个自写模块、架构重构，以及对 Emacs 内置功能的深度探索。"
original_url: https://www.rahuljuliato.com/posts/emacs-solo-two-years
source: Hacker News
---

本文翻译自 [Two Years of Emacs Solo: 35 Modules, Zero External Packages, and a Full Refactor](https://www.rahuljuliato.com/posts/emacs-solo-two-years)，原载于 Hacker News。

---

我维护 [Emacs Solo](https://github.com/LionyxML/emacs-solo) 已经有一段时间了。随着项目迎来两周年，是时候聊聊这个周期发生了什么。

对于还没接触过的人来说，Emacs Solo 是我日常使用的 Emacs 配置，它有一个铁律：**零外部包**。所有功能要么是 Emacs 内置的，要么是我在 `lisp/` 目录下自己写的。没有 `package-install`，没有 `straight.el`，没有指向 ELPA 或 MELPA 的 `use-package :ensure t`。只有 Emacs 和 Elisp。

为什么？部分原因是我想要真正理解 Emacs **开箱即用**到底能给你什么。部分原因是我希望我的配置能在 Emacs 版本升级时不至于崩溃。部分原因是我厌倦了处理包仓库、工作中途镜像挂掉、原生编译（native compilation）的问题，以及上游某个地方发生变化后我不得不去调试那一长串配置而不是做真正的工作。还有部分原因，老实说，这确实很好玩！

这篇文章会介绍最近的架构重构，逐一讲解核心配置的每个部分，介绍我写的全部 35 个独立模块，并分享我学到的东西。

我必须承认：这个配置很长。但它背后有一个原则——我只在 Emacs 核心没有某个功能时才添加它，而且当我添加时，我会尝试自己实现。这意味着代码有时很粗糙，但它**在我的掌控之中**。我写的，我理解，当它出错时，我确切知道去哪里找。我即将描述的重构让这个区别变得非常清晰：什么是"调整 Emacs 核心配置"，什么是"因为我离不开而自己写的黑魔法"。

## 重构：核心 vs. 扩展

这个周期最大的变化是**架构层面的**。Emacs Solo 曾经是一个巨大的 `init.el`，所有东西都塞在一起。这样能用，但有问题：

- 很难导航（即使用 `outline-mode`）
- 如果有人只想要其中一部分，比如我的 Eshell 配置或 VC 扩展，他们得翻几千行代码
- 很难分辨哪里是"配置内置 Emacs"的结束，哪里是"我自己的黑魔法重现"的开始

解决方案干净且简单：**把配置分成两层**。

### 第一层：`init.el`（Emacs 核心配置）

这个文件**只**配置内置的 Emacs 包和功能。这里的每个 `use-package` 块都有 `:ensure nil`，因为它指向的是随 Emacs 发布的东西。这是纯粹的、标准的 Emacs 定制。

设计理念是：**任何人都可以阅读 `init.el`，找到喜欢的部分，直接复制粘贴到自己的配置中**。没有依赖。没有设置。它就是能用，因为它配置的是 Emacs 已经有的东西。

### 第二层：`lisp/`（独立的扩展模块）

这些是我自己的实现：替代流行的外部包，重新设计成小而专注的 Elisp 文件。每个都是标准的 `provide`/`require` 模块。它们位于 `lisp/` 目录下，在 `init.el` 底部通过一个简单的代码块加载：

```elisp
(dolist (file '("emacs-solo-themes"
                "emacs-solo-mode-line"
                ;; ... 其他模块
                ))
  (require (intern file)))
```

如果你不想要某个模块，只需注释掉那行 `require`。如果你想在自己的配置中使用某个模块，只需把 `.el` 文件复制到你自己的 `lisp/` 目录然后 `require` 它。就这样。

这种分离让整个项目变得更容易维护、理解和分享。

## 核心：init.el 配置了什么

`init.el` 文件组织成清晰标记的部分（使用 outline-mode 友好的标题，所以你可以在 Emacs 内部折叠和导航它们）。下面是它涉及的每个内置包和功能，以及**为什么**。

### 通用 Emacs 设置

`emacs` use-package 块是最大的单一部分。它设置了大多数人想要的合理默认值：

- 按键重绑定：`M-o` 用于 `other-window`，`M-j` 用于 `duplicate-dwim`，`C-x ;` 用于 `comment-line`，`C-x C-b` 用于 `ibuffer`
- 窗口布局命令绑定在 `C-x w` 下（这些是即将到来的 **Emacs 31** 功能：`window-layout-transpose`、`window-layout-rotate-clockwise`、`window-layout-flip-leftright`、`window-layout-flip-topdown`）
- 命名框架：`C-x 5 l` 用于 `select-frame-by-name`，`C-x 5 s` 用于 `set-frame-name`，对多框架工作流很有用
- 禁用 `C-z`（挂起），因为在终端中不小心挂起 Emacs 从来不是什么有趣的事
- 合理的文件处理：备份和自动保存在 `cache/` 目录，`recentf` 用于最近文件，用 `uniquify` 清理缓冲区命名
- Tree-sitter（语法高亮）自动安装和自动模式（`treesit-auto-install-grammar t` 和 `treesit-enabled-modes t`，都是 Emacs 31 的功能）
- `delete-pair-push-mark`、`kill-region-dwim`、`ibuffer-human-readable-size`，所有这些小而提升生活质量的功能都在 Emacs 31 中

### Abbrev（缩写模式）

一个完整的 abbrev-mode 设置，带有自定义的占位符系统。你用 `###1###`、`###2###` 标记定义缩写，当缩写展开时，它会交互式地提示你填写每个占位符。`###@###` 标记告诉它展开后把光标放在哪里。

### Auth-Source

配置 `auth-source` 使用 `~/.authinfo.gpg` 存储凭据。简单但必不可少，如果你使用 Gnus、ERC 或任何面向网络的 Emacs 功能。

### Auto-Revert（自动刷新）

让缓冲区在文件在磁盘上改变时自动刷新。对任何 Git 工作流都必不可少。

### Conf / Compilation

配置文件模式设置和一个带有 ANSI 颜色支持的 `compilation-mode` 设置，这样编译器输出实际上看起来可读。

### Window

超越默认值的自定义窗口管理，因为 Emacs 开箱即用的窗口管理**很强大**但需要一点推动。

### Tab-Bar

用于工作区管理的 Tab-bar 配置。Emacs 从版本 27 开始就有标签了，一旦你正确配置它们，它们真的很有用。

### RCIRC 和 ERC

两个 IRC 客户端，都内置在 Emacs 中，都配置了。ERC 得到了更大的关注：日志、scrolltobottom、fill、匹配高亮，甚至内联图片支持（通过其中一个扩展模块）。

### Icomplete

这是 Emacs Solo 补全功能的所在。我没有使用 Vertico、Consult 或 Helm，而是使用 `icomplete-vertical-mode`，它内置在 Emacs 中。有了正确的设置，它出乎意料地强大：

```elisp
(use-package icomplete
  :ensure nil
  :config
  (setq icomplete-show-matches-on-no-input t
        icomplete-hide-common-prefix nil
        icomplete-compute-delay 0)
  :init
  (fido-vertical-mode 1))
```

### Dired

一个重度定制的 Dired 设置。自定义列表开关、人类可读的大小、与系统打开器集成（macOS 上的 `open`，Linux 上的 `xdg-open`），以及 Emacs 31 的 `dired-hide-details-hide-absolute-location` 选项。

### WDired

可写的 Dired，所以你可以通过直接编辑缓冲区来重命名文件。

### Eshell

这个我特别骄傲。Emacs Solo 的 Eshell 配置包括：

- **跨所有 Eshell 缓冲区的共享历史**：每个 Eshell 实例读取和写入一个合并的历史，所以你永远不会因为在不同缓冲区运行命令而丢失命令
- **自定义提示符**：多种提示符风格，可以用 `C-c t`（完整 vs. 最小）和 `C-c T`（更轻 vs. 更重的完整提示符）切换
- 一个带有快捷键提示的自定义**欢迎横幅**
- 100,000 条条目的历史大小，带去重

### Isearch

带有合理默认值的增强增量搜索。

### VC（版本控制）

这是最大的部分之一，也是我投入最多的部分。Emacs 内置的 `vc` 是一个令人难以置信的软件，大多数人忽略了它而选择 Magit。我不是说它能完全取代 Magit，但有了正确的配置，它能覆盖 95% 的日常 Git 操作：

- **从 vc-dir 进行 Git add/reset**：`S` 暂存，`U` 取消暂存，直接在 `vc-dir` 缓冲区中
- **Git reflog 查看器**：一个带有 ANSI 颜色渲染和导航快捷键的自定义 `emacs-solo/vc-git-reflog` 命令
- **浏览远程**：`C-x v B` 在浏览器中打开你的 GitHub/GitLab 仓库；带前缀参数时跳转到当前文件和行
- **跳转到当前 hunk**：`C-x v =` 打开 diff 缓冲区，滚动到包含当前行的 hunk
- **在修改的文件之间切换**：`C-x C-g` 让你通过 `completing-read` 浏览当前仓库中所有修改/未跟踪的文件
- **拉取当前分支**：一个专门用于 `git pull origin <current-branch>` 的命令

### Smerge / Diff / Ediff

合并冲突解决和差异查看。Ediff 配置为合理地分割窗口（并排，而不是在新框架中）。

### Eldoc

点处文档，带有 `eldoc-help-at-pt`（Emacs 31）用于自动显示文档。

### Eglot

随 Emacs 发布的 LSP 客户端。配置了：

- 未使用服务器的自动关闭
- 没有事件缓冲区日志（为了性能）
- 自定义服务器程序
- `C-c l` 下的快捷键，用于代码操作、重命名、格式化和内联提示
- 自动为所有 `prog-mode` 缓冲区启用，除了 `emacs-lisp-mode` 和 `lisp-mode`

### Flymake / Flyspell / Whitespace

诊断、拼写检查和空白可视化。全部内置，全部配置了。

### Gnus

Emacs 新闻阅读器和邮件客户端。配置为 IMAP/SMTP 使用。

### Org

Org-mode 配置，当然。

### Speedbar

侧边窗口中的文件树导航。在 Emacs 31 中，speedbar 获得了 `speedbar-window` 支持，所以它可以存在于你现有的框架内而不是生成一个新的。

### Time

带有多个时区的世界时钟，按 ISO 时间戳排序（Emacs 31）。

### Which-Key

快捷键发现。从版本 30 开始内置在 Emacs 中。

### Webjump

从 minibuffer 快速网络搜索。配置了有用的搜索引擎。

### 语言模式

我使用的每种语言的特定配置，组织成三个区域：

- **Common Lisp**：`inferior-lisp` 和 `lisp-mode`，带有自定义 REPL 交互、求值命令
- **非 Tree-sitter**：`sass-mode`，用于 tree-sitter 语法不可用时
- **Tree-sitter 模式**：`ruby-ts-mode`、`js-ts-mode`、`json-ts-mode`、`typescript-ts-mode`、`bash-ts-mode`、`rust-ts-mode`、`toml-ts-mode`、`markdown-ts-mode`（Emacs 31）、`yaml-ts-mode`、`dockerfile-ts-mode`、`go-ts-mode`

## 扩展：35 个独立模块

这是真正有趣的地方。每一个都是一个完整的、独立的 Elisp 文件，重新实现了你通常从外部包获得的功能。它们都在 `lisp/` 中，可以独立使用。

我称它们为"黑魔法重现"，秉持 Emacs Solo 的精神：它们不试图成为 MELPA 对应物的功能完整替代品。它们试图成为**小巧、可理解、对日常使用足够好**的东西，同时保持配置自包含。

### emacs-solo-themes

**基于 Modus 的自定义颜色主题。** 提供多种主题变体：Catppuccin Mocha、Crafters（默认）、Matrix 和 GITS。全部构建在 Emacs 内置的 Modus 主题之上，通过覆盖 face 实现，所以你获得 Modus 的可访问性和完整性，同时拥有不同的美学。

### emacs-solo-mode-line

**自定义模式行格式和配置。** 一个手工制作的模式行，准确显示我想要的内容：缓冲区状态指示器、文件名、主模式、Git 分支、行/列，没有别的。没有 `doom-modeline`，没有 `telephone-line`，只有格式字符串和 face。

### emacs-solo-movements

**增强的导航和窗口移动命令。** 用于在窗口之间移动、调整分割大小和更高效地导航缓冲区的额外命令。

### emacs-solo-formatter

**可配置的保存时格式化，带有格式化器注册表。** 你按文件扩展名注册格式化器（例如 `.tsx` 用 `prettier`，`.py` 用 `black`），模块自动挂钩到 `after-save-hook` 来格式化缓冲区。全部通过 `defcustom` 可控，所以你可以全局开关它。

### emacs-solo-transparency

**GUI 和终端的框架透明度。** 在你的 Emacs 框架上切换透明度。在图形和终端 Emacs 上都能工作，使用各自的适当机制。

### emacs-solo-exec-path-from-shell

**将 shell PATH 同步到 Emacs。** 经典的 macOS 问题：GUI Emacs 不继承你的 shell 的 `PATH`。这个模块用和 `exec-path-from-shell` 相同的方式解决它，但只用大约 20 行代码而不是一个完整的包。

### emacs-solo-rainbow-delimiters

**匹配分隔符的彩虹着色。** 用不同颜色为嵌套的括号、方括号和大括号着色，这样你可以直观地匹配嵌套层级。对任何 Lisp 都必不可少，在其他地方也有帮助。

### emacs-solo-project-select

**交互式项目查找器和切换器。** 一个用于查找和切换项目的 `completing-read` 接口，构建在 Emacs 内置的 `project.el` 之上。

### emacs-solo-viper-extensions

**Viper 的 Vim 风格快捷键和文本对象。** 如果你使用 Emacs 内置的 `viper-mode`（Vim 模拟层），这扩展了它的文本对象和额外的 Vim 风格命令。不需要 Evil。

### emacs-solo-highlight-keywords

**在注释中高亮 TODO 和类似关键词。** 让源代码注释中的 `TODO`、`FIXME`、`HACK`、`NOTE` 和类似关键词以独特的 face 突出显示。一个小改变，带来大不同。

### emacs-solo-gutter

**缓冲区中的 Git diff 边栏指示器。** 在边距中显示添加、修改和删除的行指示器，像 `diff-hl` 或 `git-gutter`。纯 Elisp，底层使用 `vc-git`。

### emacs-solo-ace-window

**带标签的快速窗口切换。** 当你有三个或更多窗口时，这会在每个窗口上叠加单字符标签，这样你可以用单个按键跳转到任何一个。流行的 `ace-window` 包的最小重新实现。

### emacs-solo-olivetti

**居中文档布局模式。** 用宽边距将文本在窗口中居中，像 `olivetti-mode`。非常适合散文写作、Org 文档，或任何你想要无干扰居中布局的时候。

### emacs-solo-0x0

**将文本和文件上传到 0x0.st。** 选择一个区域或文件并上传到 0x0.st 粘贴服务。URL 被复制到你的 kill ring。快速且对分享代码片段很有用。

### emacs-solo-sudo-edit

**通过 TRAMP 以 root 身份编辑文件。** 使用 TRAMP 的 `/sudo::` 前缀以 root 权限重新打开当前文件。`sudo-edit` 包的重新实现。

### emacs-solo-replace-as-diff

**带 diff 预览的多文件正则替换。** 跨多个文件执行搜索和替换，并在应用之前将更改作为 diff 查看。这个结果比预期更有用。

### emacs-solo-weather

**来自 wttr.in 的天气预报。** 从 wttr.in 获取天气数据并在 Emacs 缓冲区中显示。因为检查天气不应该需要离开 Emacs。

### emacs-solo-rate

**加密货币和法币汇率查看器。** 查询汇率并在 Emacs 内显示。当你需要知道一个比特币值多少钱但拒绝打开浏览器标签页时。

### emacs-solo-how-in

**查询 cheat.sh 获取编程答案。** 问"我如何在语言 Y 中做 X？"并从 cheat.sh 获得答案，直接显示在 Emacs 中。像 `howdoi` 但更简单。

### emacs-solo-ai

**AI 助手集成（Ollama、Gemini、Claude）。** 直接从 Emacs 向 AI 模型发送提示。支持多个后端：本地 Ollama、Google Gemini 和 Anthropic Claude。响应流式传输到缓冲区。没有 `gptel`，没有 `ellama`，只有 `url-retrieve` 和一些 JSON 解析。

### emacs-solo-dired-gutter

**Dired 缓冲区中的 Git 状态指示器。** 在 Dired 中的文件名旁边显示 Git 状态（修改、添加、未跟踪），使用边距中的彩色指示器。想想 `diff-hl-dired-mode` 但是自包含的。

### emacs-solo-dired-mpv

**使用 mpv 的 Dired 音频播放器。** 在 Dired 中标记音频文件，按 `C-c m`，通过 mpv 播放它们。你获得一个持久的 mpv 会话，可以从任何地方用 `C-c m` 控制。一个住在文件管理器里的小型音乐播放器。

### emacs-solo-icons

**Emacs Solo 的文件类型图标定义。** 将文件扩展名和主模式映射到 Unicode/Nerd Font 图标的图标注册表。这是接下来的三个模块构建的基础。

### emacs-solo-icons-dired

**Dired 缓冲区的文件类型图标。** 在 Dired 中的文件名旁边显示文件类型图标。使用 Nerd Font 字形。

### emacs-solo-icons-eshell

**Eshell 列表的文件类型图标。** 同上，但用于 Eshell 的 `ls` 输出。

### emacs-solo-icons-ibuffer

**ibuffer 的文件类型图标。** 同样用于缓冲区列表。

### emacs-solo-container

**Docker 和 Podman 的容器管理 UI。** 一个完整的 `tabulated-list-mode` 接口用于管理容器：列表、启动、停止、重启、删除、检查、查看日志、打开 shell。同时适用于 Docker 和 Podman。这个开始很小，后来成长为一个真正有用的工具。

### emacs-solo-m3u

**M3U 播放列表查看器和在线电台播放器。** 打开 `.m3u` 播放列表文件，浏览条目，用 mpv 播放。`RET` 播放，`x` 停止。非常适合在线电台流。

### emacs-solo-clipboard

**终端的系统剪贴板集成。** 让复制/粘贴在终端中运行的 Emacs 和系统剪贴板之间正确工作。解决永恒的终端 Emacs 剪贴板问题。

### emacs-solo-eldoc-box

**子框架中的 Eldoc 文档。** 在点附近的浮动子框架中显示 eldoc 文档，而不是回显区域。`eldoc-box` 包的重新实现。

### emacs-solo-khard

**Khard 联系人浏览器。** 从 Emacs 内浏览和搜索你的 khard 地址簿。小众，但如果你使用 khard 进行联系人管理，这很方便。

### emacs-solo-flymake-eslint

**ESLint 的 Flymake 后端。** 作为 Flymake 检查器为 JavaScript/TypeScript 文件运行 ESLint。现在 LSP 服务器原生处理 ESLint，默认禁用，但如果你喜欢单独的方法，仍然可用。

### emacs-solo-erc-image

**ERC 聊天缓冲区中的内联图片。** 当有人在 IRC 中发布图片 URL 时，这会获取并在 ERC 缓冲区中内联显示图片。一个小奢侈，让 IRC 感觉更现代。

### emacs-solo-yt

**使用 yt-dlp 和 mpv 的 YouTube 搜索和播放。** 从 Emacs 搜索 YouTube，浏览结果，通过 mpv 播放视频（或只是音频）。因为有时你需要背景音乐，而 YouTube 就在那里。

### emacs-solo-gh

**带 transient 菜单的 GitHub CLI 接口。** 一个基于 transient 的 `gh` CLI 工具菜单。浏览问题、拉取请求、运行操作，全部从结构化的 Emacs 接口，无需记住 `gh` 子命令。

## Emacs 31：展望未来

在整个配置中，你会看到标记为 `; EMACS-31` 的注释，标记即将到来（或已在开发分支上可用）的功能。一些亮点：

- **窗口布局命令**：`window-layout-transpose`、`window-layout-rotate-clockwise` 和翻转命令。终于有了重新排列窗口布局的一流支持
- **在模式中定义的 Tree-sitter 语法源**：不再需要为每种语言手动指定 `treesit-language-source-alist` 条目
- **`markdown-ts-mode`**：Tree-sitter 驱动的 Markdown，内置
- **Icomplete 改进**：缓冲区内调整、前缀指示器和更好的垂直渲染
- **框架内 Speedbar**：`speedbar-window` 让 speedbar 作为普通窗口存在于你的框架内
- **VC 增强**：`vc-dir-hide-up-to-date-on-revert`、`vc-auto-revert-mode`、`vc-allow-rewriting-published-history`
- **ERC 修复**：scrolltobottom/fill-wrap 依赖终于解决了
- **`native-comp-async-on-battery-power`**：不要在电池供电时浪费电量进行原生编译
- **`kill-region-dwim`**：智能 kill-region 行为
- **`delete-pair-push-mark`**：带 mark 推送的更好 delete-pair
- **世界时钟排序**：`world-clock-sort-order` 用于合理的时区显示

我标记这些不仅是为了我自己参考，也是为了让任何阅读配置的人都能确切看到哪些部分会随着 Emacs 31 稳定而变得更简洁或不必要。

## 我学到了什么

这个 Emacs Solo 的工作周期教会了我一些值得分享的东西。

**Emacs 给你的比你想的更多。** 每次我着手"重新实现"某个东西时，我发现 Emacs 已经内置了 70%。`vc` 比大多数人意识到的要强大得多。`icomplete-vertical-mode` 真的很好用。`tab-bar-mode` 是真正的工作区管理器。`proced` 是真正的进程管理器。"内置 Emacs"和"装了 50 个包的 Emacs"之间的差距比社区通常假设的要小。

**写自己的包是学习 Elisp 的最好方法。** 我在写 `emacs-solo-gutter` 和 `emacs-solo-container` 时学到的 Emacs Lisp 比我多年来调整别人的配置学到的还多。当你必须从头实现某样东西时，你被迫理解 `overlays`、`process filters`、`tabulated-list-mode`、`transient`、`child frames`，以及包通常向你隐藏的所有机制。

**小即是美。** `lisp/` 中的大多数模块都在 200 行以下。有些在 50 行以下。它们不试图处理每个边缘情况。它们处理**我的**边缘情况，这就够了。如果其他人需要不同的东西，代码简单到可以 fork 和修改。

**贡献上游是值得的。** 我作为变通方案构建的一些东西（比如 icomplete 垂直前缀指示器）变成了上游补丁。当你对某个功能足够深入以至于构建了变通方案时，你已经足够深入去提议一个修复。

## 结语

Emacs Solo 最初是一个个人挑战：我能不能有一个高效、现代的 Emacs 设置，而不安装任何外部包？

这个周期之后，答案是肯定的 **可以**。

它适合所有人吗？绝对不是。如果你对 Doom Emacs 或 Spacemacs 或你自己精心策划的包列表感到满意，那很好。那些都是优秀的选择。

但如果你对 Emacs 自己能做什么感到好奇，如果你想要一个你理解每一行的配置，如果你想要可以递给别人并说"直接放到 `~/.emacs.d/` 就能用"的东西，那么也许 Emacs Solo 值得一看。

仓库在这里：[https://github.com/LionyxML/emacs-solo](https://github.com/LionyxML/emacs-solo)

这很有趣。我在这个周期学到的比任何之前的都多。如果外面有人能发现哪怕一个模块或配置片段有用，我就很开心了。

这真的是全部意义所在。分享有用的东西。

---

## 总结

这篇文章展示了一个极简主义的 Emacs 使用哲学：

1. **零外部依赖** - 作者证明了一个高效的现代 Emacs 完全可以不依赖任何第三方包
2. **架构分层** - 将配置分为核心（init.el）和扩展（lisp/），清晰易懂
3. **深度挖掘内置功能** - Emacs 内置的 `vc`、`icomplete`、`tab-bar` 等被大多数人低估
4. **自己动手的价值** - 写自己的包是学习 Elisp 的最佳方式
5. **向上游贡献** - 当你深入到需要写变通方案时，你也已经有能力向官方提交改进

对于中国开发者来说，这篇文章的启发是：在追求"开箱即用"的发行版（如 Doom、Spacemacs）之前，不妨花时间深入了解 Emacs 原生能做什么。你可能会发现，自己需要的远比想象中少。
