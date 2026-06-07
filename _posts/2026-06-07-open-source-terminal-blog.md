---
layout: post
title: "我把博客开源了：一个把终端搬进浏览器的技术博客"
description: "terry.so 博客正式开源。不是套了个深色主题就说终端风——顶部状态栏模拟 tmux pane 路径、底部状态栏是 Vim 模式行、搜索框长得像 grep、文章列表像 ls 输出、frontmatter 直接渲染成 YAML、闪烁光标始终在线，整套交互都是 Vim 键位。AI 是锦上添花，终端才是本体。"
date: 2026-06-07 10:00:00 +0800
categories: [开源, 博客]
tags: [开源, TanStack Start, RAG, pgvector, Lovable, 终端风, 博客]
---

> 仓库地址：[github.com/terryso/hack-buffer](https://github.com/terryso/hack-buffer)
> 线上地址：[blog.suchuanyi.dev](https://blog.suchuanyi.dev)

---

## 先说结论：这不是一个「深色主题」博客

很多人做「终端风」，就是在白色博客上换成深色背景加个等宽字体，完了。这个博客不是这样做的。

打开 [blog.suchuanyi.dev](https://blog.suchuanyi.dev)，你看到的不是一个换了皮的 WordPress。你会看到一个**在浏览器里运行的终端 IDE**。每一个 UI 元素都有对应的终端隐喻，不是装饰，是交互逻辑本身。

---

## 顶部状态栏：你的 tmux pane

导航栏模仿的是 tmux 的 pane 标题行。左边是站点名 `terry.so` 前面带一个绿色圆点 `●`，然后是当前路径：

```
● terry.so  ~/posts/open-source-terminal-blog  main*
```

`~/` 后面跟着你当前所在的路径段，最后一截高亮显示——就像你在 tmux 里看到的 pane 标题一样。末尾的 `main*` 表示当前分支有未提交的改动（当然是假的，但感觉对了）。

右边是状态信息：GitHub Fork 链接、`⌘K` 命令面板入口，还有一个绿色脉冲圆点配 `CONNECTED` 字样——你的终端连上了远程服务器那种感觉。

整个导航栏是 sticky 的，磨砂玻璃效果（`backdrop-blur`），往下滚也不会消失。

---

## 底部状态栏：Vim 的 mode line

页面最底部固定了一行状态栏，完全模仿 Vim 的底部 mode 行：

```
[NORMAL]  index.md          g home  t tags  a about  ⌘K palette  UTF-8  14:32
```

- 左边是 `NORMAL` 模式标签（绿色高亮），像 Vim 的 `-- INSERT --`
- 旁边是当前文件名，比如 `index.md` 或 `posts/open-source-terminal-blog.md`
- 右边是快捷键提示和系统信息：编码（UTF-8）、当前时间（实时更新）

这不是静态装饰。时间每秒刷新，文件名跟随路由切换，`NORMAL` 标签一直告诉你「你不在输入模式」。

---

## Vim 键位：全程不用鼠标

这是我最喜欢的部分。整个站点的导航可以用 Vim 键位操作：

| 按键 | 动作 |
|---|---|
| `g` | 回首页（连续按两次 `gg` 跳到第一页） |
| `t` | 标签页 |
| `a` | 关于页 |
| `⌘K` | 命令面板 |
| `h` / `←` / `[` | 上一页 |
| `l` / `→` / `]` | 下一页 |
| `G`（大写） | 跳到最后一页 |
| `/` | 聚焦搜索框（Vim 搜索的肌肉记忆） |
| `ESC` | 关闭命令面板 |

在首页翻页的时候，`h` 和 `l` 的体验和 Vim 里左右移动光标一模一样。`gg` 跳回第一页，`G` 跳到最后一页——完全复刻 Vim 的行首行尾。

搜索框按 `/` 聚焦，这是 Vim 里搜索的键位。搜索结果出来之后可以 `ESC` 关掉。整套键盘流可以完全不用鼠标浏览整个博客。

---

## 命令面板：终端里的模糊搜索

`⌘K` 打开命令面板。外观是一个 `$` 开头的终端输入框，底下列出可用命令：

```
$ type a command...
  :home
  :tags
  :about
```

输入几个字母自动过滤，Enter 执行第一个匹配项，ESC 关闭。和 VS Code 的命令面板一样好用，但长得像你的 shell。

---

## 首页：`ls` 你的文章列表

首页不是传统博客那种大图卡片布局。它更像是在终端里 `ls -la` 你的文章目录：

```
$ ls -la ~/articles | sed -n '1,10p'
```

上面这行是真的渲染在页面上的，作为 banner 的一部分。每个文章条目是一个网格行：

```
01  文章标题                                UPDATED: 2026-05-30
    文章描述文字...                          SIZE: 12KB
    #tag1  #tag2  #tag3                     READ: 8MIN
```

左边是序号（两位数，零填充），中间是标题 + 描述 + 标签，右边是文件元信息——就像 `ls -la` 的输出列。标签用 `#` 前缀，加了细边框，像终端里的 badge。

右上角显示当前页码和总数：`PAGE 01/04 · TOTAL 37`，用大写字母和零填充——信息密度拉满，但不会觉得乱。

---

## 文章页：YAML frontmatter 直接渲染

打开一篇文章，正文上方不是传统的「作者 + 日期」元信息块。你看到的是一段**被渲染的 YAML frontmatter**：

```yaml
---
title:   "文章标题"
date:    2026-06-07
category:[开源, 博客]
tags:    [开源, TanStack Start, pgvector]
status:  published
---
```

绿色分隔线、等宽字体、键值对网格布局——就像你在终端里 `cat` 一个 Markdown 文件，frontmatter 原样输出。`status: published` 用绿色高亮，暗示这篇文章已经 merge 了。

这个设计不是偶然的。写博客的人天天和 frontmatter 打交道，把它直接展示出来，读者一眼就知道「这是一篇 Markdown 文件」，而不是一个 WordPress 页面。

---

## 搜索框：长得像 `grep`

首页的 AI 搜索框不是一个普通的输入框。它长这样：

```
$ grep -r  问点啥...例如 swift agent 集成  /
```

左边是绿色的 `$` 提示符，紧跟着 `grep -r`，然后才是输入区域。右边有个 `kbd` 标签提示按 `/` 可以聚焦——还是 Vim 的搜索键。

搜索中的状态是 `embedding query...`，搜索结果标题行显示匹配数：`// 3 matches`，每条结果前面有相似度百分比。搜索失败的时候是 `err: ...`。

整个搜索体验就像你在终端里跑了一个命令，然后看着输出一行一行出来。

---

## 配色系统：oklch + 语义 token

终端风的灵魂不只是等宽字体，还有配色。

整个博客的颜色系统用 `oklch` 色彩空间定义，只有六个 token：

| Token | 值 | 用途 |
|---|---|---|
| background | `oklch(0.16 0.01 260)` | 深蓝黑底 |
| foreground | `oklch(0.96 0.005 260)` | 接近白色的前景文字 |
| surface | `oklch(0.21 0.012 260)` | 卡片/面板背景 |
| border | `oklch(0.30 0.012 260)` | 微妙的分隔线 |
| muted | `oklch(0.62 0.01 260)` | 次要信息 |
| accent | `oklch(0.78 0.18 145)` | **终端绿**——所有可交互元素的颜色 |

accent 是那个标志性的终端绿，用在链接、提示符、YAML 分隔线、闪烁光标、状态指示灯、快捷键高亮……所有需要「跳出来」的地方。统一、克制、不花哨。

组件层**不写任何裸色值**。所有颜色都走这六个 token。想换一套配色？改 `styles.css` 里六行代码，全站跟着变。

选中文字的高亮也是绿色的——`::selection` 用了 `color-mix` 把 accent 和透明度混合，选中效果像终端里高亮了一行输出。

---

## 闪烁光标：一直在线

页面标题末尾有一个闪烁的下划线 `_`，用 CSS `step-end` 动画实现，一秒闪烁一次——和终端里光标的节拍一模一样。

这个光标不是装饰。它在告诉读者「这个页面是活的，你可以输入」。首页标题「Agent 内核深潜」后面跟着 `cursor-blink`，搜索框打开的时候也是这种节奏。整个站点的交互节奏是统一的。

---

## 404 页面：`cat: post not found`

文章找不到的时候，你看到的不是一个大大的 404 插画。你看到的是：

```
$ cat: post not found
cd ~/
```

`cd ~/` 是一个可点击的链接，带你回首页。就像你在终端里 `cat` 了一个不存在的文件，然后 `cd` 回到 home 目录。

---

## 文章内容的排版细节

正文用 sans-serif 字体（Inter），行高 1.75，但标题全部回到等宽字体。这是刻意的设计——**结构信息用 mono，阅读内容用 sans**。代码块背景比页面底色更深一层（`oklch(0.13)`），有细边框和圆角，代码高亮用 `github-dark` 主题。

引用块的左边是绿色竖线，背景有 6% 的绿色透明叠加。分隔线是虚线（`dashed`），不是实线——像终端里的注释行。

列表的 marker（`disc` / `decimal`）全部用 accent 绿色。链接有下划线但透明度 40%，hover 的时候变成实色——微妙但有反馈。

表格强制等宽字体，字号缩小到 `0.875rem`，表头有 surface 背景。整个表格看起来像终端里的 `ps` 或 `top` 输出。

---

## 顺便说一下 AI 功能

说了这么多终端风，AI 功能其实是锦上添花。但既然做了，也挺好用：

1. **TL;DR** —— 每篇文章自动生成三句话中文摘要（Gemini Flash）
2. **语义相关推荐** —— 文章底部自动推荐 3 篇最相关的旧文（pgvector 余弦相似度）
3. **自然语言搜索** —— 首页 `grep` 框输入自然语言，按语义返回结果

三个功能全部通过 Lovable AI Gateway 调用，项目里没有任何 API Key。同步管线用内容哈希做增量闸门，没变过的文章不重算、不花钱。一行脚本触发：`./scripts/sync-posts.sh prod`。

不想用 AI？`VITE_ENABLE_AI=false` 一行关掉，退化成纯静态博客。

---

## 技术栈一览

| 层 | 选型 |
|---|---|
| 框架 | TanStack Start（React 19、SSR、文件路由） |
| 构建 | Vite 7 |
| 样式 | Tailwind v4 + shadcn/ui，oklch 色彩 token |
| 后端 | Supabase（Postgres + pgvector + RLS） |
| AI | Lovable AI Gateway（Gemini embedding + Flash 摘要） |
| 部署 | Cloudflare Workers |
| 内容 | Markdown，`gray-matter` 解析 |

首屏 < 100KB，SSR 输出，每个路由都有 canonical / OG / JSON-LD。

---

## Fork 指南

如果你想基于这个博客做自己的：

1. **Fork 仓库** → [github.com/terryso/hack-buffer/fork](https://github.com/terryso/hack-buffer/fork)
2. **在 Lovable 导入** → 自动拿到 Supabase 项目和 AI Gateway
3. **替换 `content/posts/`** → 放你自己的 Markdown（frontmatter：title / date / description / tags）
4. **改品牌** → `__root.tsx`（站点信息）、`about.tsx`（自我介绍）、`SiteShell.tsx`（站名和导航）、`styles.css`（配色 token）
5. **改同步脚本** → `scripts/sync-posts.sh` 换成你的域名
6. **部署 + 同步** → Publish 之后跑 `./scripts/sync-posts.sh prod`

终端风的 UI 和 Vim 键位不需要任何后端依赖。即使你完全不用 AI 功能，这套终端交互体验也是开箱即用的。

---

## 最后

这个博客最大的亮点不是 AI，不是 RAG，不是增量同步。是**你打开它的那一刻，感觉像在终端里读文章**。顶部路径栏、底部模式行、Vim 键位、grep 搜索框、YAML frontmatter 渲染、闪烁光标——整套 UI 都在说同一件事：这里属于程序员。

AI 是工具，终端是审美，开源是态度。

仓库在这里：**[github.com/terryso/hack-buffer](https://github.com/terryso/hack-buffer)**

有问题开 Issue，或者直接在博客上按 `/` 搜——毕竟它自己就能搜。
