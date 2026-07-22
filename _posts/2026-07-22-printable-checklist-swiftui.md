---
layout: post
title: "十一年后，我用 SwiftUI 重写了「闪印」，还给它加上了 AI"
date: 2026-07-22 17:30:00 +0800
categories: tech
description: "PrintableCheckList 是一款本地优先的 iOS 可打印清单 App。这次重写保留了旧版数据迁移、编辑、预览和打印，又加入 BYOK AI 生成、联网查证与可选 iCloud 同步。"
tags: [Swift, SwiftUI, iOS, AI, iCloud, 打印, 开源]
---

2015 年，我做过一款很小的 iOS App，中文名叫「闪印」。它只解决一件事：把旅行、采购或工作清单整理好，预览，然后打印到纸上。

旧版用 Objective-C 和 Storyboard 开发，后来陆续支持了 iPad、iPhone Xs Max 和 iCloud。它没有复杂的账号系统，也不试图成为项目管理工具。清单建好，纸张打出来，任务就完成了。

十一年后，我重新打开这个项目，决定用 SwiftUI 把它重写一遍。新版项目叫 [PrintableCheckList-SwiftUI](https://github.com/terryso/PrintableCheckList-SwiftUI)，代码已经开源。

这次重写不是给旧界面换一层 SwiftUI。我要保留原来的用途，也要回答一个新问题：如果 AI 能帮人省掉大量录入工作，一份「可打印清单」今天应该怎么做？

## 它现在能做什么

PrintableCheckList 仍然可以完全手动使用。你可以创建多份清单，一次粘贴多行内容，编辑、删除或拖动排序，再生成带方框的打印预览，通过 iOS 系统打印控制器输出。

AI 是可选的快捷入口。比如输入：

> 生成一份带孩子去北海道旅行 7 天的冬季行李清单，需要考虑滑雪和儿童常用药。

App 会返回清单标题和项目。结果不会立刻写入数据，而是先进入编辑页；你可以改标题、删掉不需要的内容、补上个人物品，确认以后再保存。AI 也能给现有清单补充遗漏项，不必每次从头生成。

整个过程可以概括为：

```text
输入主题
  ↓
按需联网搜索
  ↓
模型返回结构化 JSON
  ↓
去重、限长、清理序号
  ↓
用户检查和修改
  ↓
保存到本地 → 预览 → 打印
```

这里最重要的一步不是「生成」，而是生成后的确认。模型负责减少输入，用户仍然决定最后打印什么。

## 清单不只是待办事项

接入 AI 时，我很快遇到一个看似简单的问题：用户说「全球票房前十名」时，他要的是十部电影，不是「查询票房」「核对排名」之类的十个任务。

因此，内置提示词会区分两类内容：

- 准备事项、操作步骤和计划，要生成简短、可执行的清单项；
- 排行榜、目录和资料列表，要直接返回条目本身，并保留顺序和用户指定的数量。

模型必须返回固定的 JSON 结构。App 还会清理 Markdown 围栏、编号和重复内容，限制标题与项目长度。补充已有清单时，已经存在的项目也会被过滤掉。

这些处理不显眼，却决定了 AI 生成的内容能不能真正进入一个普通 App，而不是停留在聊天窗口里。

## 给时效性问题增加联网查证

旅行行李清单通常不需要搜索，但「最新票房排行」「最近发布的产品」或「当前汇率」不同。只靠模型已有知识，很容易得到过期答案。

PrintableCheckList 提供三种搜索模式：

- **自动**：识别排行、新闻、天气、价格等时效性主题，只在需要时搜索；
- **始终搜索**：每次生成前都先查资料；
- **关闭**：直接使用模型生成。

目前 GLM 通过 Web Search API 搜索，OpenAI 通过 Responses API 的 Web Search 搜索。搜索结果会先整理成一段带来源的材料，再交给清单生成器。结果页显示来源链接，但来源不会混进最终的清单项。

DeepSeek 和自定义 OpenAI 兼容服务仍可生成清单，只是不启用这条原生搜索路径。这样没有假设所有 `/chat/completions` 服务都支持同一种联网工具。

## BYOK：API Key 留在用户设备上

新版采用 BYOK（Bring Your Own Key）模式。用户可以选择 GLM、OpenAI、DeepSeek，或填写自己的 OpenAI 兼容服务地址和模型名称。

API Key 存在 iOS Keychain，访问级别为 `WhenUnlockedThisDeviceOnly`。普通配置存入 `UserDefaults`，但不会包含 Key。生成请求和必要的搜索请求由设备直接发给用户选择的服务商，不经过开发者服务器。

没有配置 AI 也不影响手工创建、编辑、预览和打印。我坚持保留这条边界。AI 应该缩短输入时间，不应该变成打开清单 App 的通行证。

## 本地优先，也照顾旧用户的数据

每次编辑都会先保存到设备的 `Application Support/PrintableCheckList/projects.json`。没有网络时，清单的创建、修改和打印都能继续使用。

可选的 iCloud 路径使用 `NSUbiquitousKeyValueStore`，沿用旧版的 `keyProjects`。代码也保留了原来的 bundle identifier，并实现了 `NSKeyedArchiver` 迁移：旧 Objective-C 里的 `Project` 和 `Item` 会转换成新的 `Codable` Swift 模型；旧 ID 不是 UUID 时，则生成稳定的 UUID。

这部分比重新画界面麻烦得多，却是一次真正的 App 更新必须承担的责任。重写代码不应该等于让用户重新输入数据。

需要说明的是，未签名模拟器不能代替真实 iCloud 环境。仓库已经覆盖旧数据导入和同步逻辑测试，但签名真机上的 iCloud 端到端验证仍然是发布前检查项。

## 打印仍然是主角

虽然新版加入了 AI，项目名称里的 `Printable` 没有变。

预览页使用 SwiftUI 显示标题、项目和空白方框；真正打印时，App 生成一段经过 HTML 转义的排版内容，再交给 `UIPrintInteractionController`。iPad 上还单独处理了打印弹窗的锚点，避免 popover 因缺少来源视图而崩溃。

测试中还会把默认中文旅行清单交给打印格式化器，确认它能排在一张 A4 纸内。相比「按钮能点」，这更接近 PrintableCheckList 真正要完成的事情。

## 工程本身也换了一种维护方式

新版最低支持 iOS 17，使用 SwiftUI 和 Swift Concurrency。工程文件由 XcodeGen 根据 `project.yml` 生成，`.xcodeproj` 不进入版本库。生成、构建、测试、模拟器运行和归档分别有独立脚本，日常开发不必手动维护 Xcode 工程里的文件引用。

截至 2026 年 7 月 22 日，我在 iPhone 16 Pro / iOS 18.5 模拟器上执行了完整测试：42 个测试用例中，41 个通过，1 个 Keychain 用例因为无签名模拟器缺少 entitlement 而按预期跳过。覆盖范围包括：

- 清单的创建、编辑、排序、持久化和旧数据迁移；
- 打印内容转义与 A4 分页；
- AI 配置、Key 隔离、响应解析、去重和错误映射；
- GLM 与 OpenAI 的联网搜索请求和来源解析；
- 手工创建、AI 新建、AI 补充、取消、失败重试和设置页等 UI 流程。

## 本地运行

需要 macOS、Xcode、iOS 模拟器和 [XcodeGen](https://github.com/yonaskolb/XcodeGen)。克隆后运行：

```bash
git clone https://github.com/terryso/PrintableCheckList-SwiftUI.git
cd PrintableCheckList-SwiftUI
./Scripts/generate.sh
./Scripts/build.sh
```

执行完整测试：

```bash
./Scripts/test.sh
```

安装并启动模拟器版本：

```bash
./Scripts/run-simulator.sh
```

AI 配置不是运行项目的前提。你可以先把它当作一款普通的本地清单 App，之后再决定要不要填入自己的 API Key。

## 写在最后

软件重写很容易让人只关注新框架、新界面和新功能。但回到 PrintableCheckList，真正不能丢的只有两件事：旧数据还在，清单还能顺利打印。

SwiftUI 让界面和状态管理简单了很多，AI 让创建清单更快，联网搜索让时效性内容有了核对来源。不过这些能力最后都服务于一个很朴素的动作：拿起一张纸，照着清单去做事。

项目地址：[github.com/terryso/PrintableCheckList-SwiftUI](https://github.com/terryso/PrintableCheckList-SwiftUI)
