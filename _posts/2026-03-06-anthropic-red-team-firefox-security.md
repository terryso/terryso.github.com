---
layout: post
title: "Anthropic 红队助力 Firefox 安全加固：AI 发现 22 个安全漏洞"
date: 2026-03-06 22:53:16 +0800
categories: tech-translation
description: "Anthropic 的前沿红队使用 Claude AI 在 Firefox 中发现了 14 个高危漏洞和 22 个 CVE，展示了 AI 辅助漏洞检测作为安全工程新工具的巨大潜力。"
original_url: https://blog.mozilla.org/en/firefox/hardening-firefox-anthropic-red-team/
source: Hacker News
---

本文翻译自 [Hardening Firefox with Anthropic's Red Team](https://blog.mozilla.org/en/firefox/hardening-firefox-anthropic-red-team/)，原载于 Hacker News。

---

![Firefox 安全加固](https://blog.mozilla.org/wp-content/blogs.dir/278/files/2026/03/Mozilla_Illustrations_Pixelgram_Lock_Square_1024x1024.png)

二十多年来，Firefox 一直是网络上最受审查和安全加固的代码库之一。开源意味着我们的代码是可见的、可审查的，并且不断接受全球社区的压测。

几周前，Anthropic 的前沿红队（Frontier Red Team）带着一种新的 AI 辅助漏洞检测方法的结果联系我们，发现了十几个可验证的安全漏洞，并提供了可重现的测试用例。我们的工程师验证了这些发现，并在最近发布的 Firefox 148 之前完成了修复。

对用户来说，这意味着 Firefox 拥有更好的安全性和稳定性。将新技术添加到我们的安全工具箱中，有助于我们在漏洞被实际利用之前识别并修复它们。

## 一种新兴技术，经 Firefox 工程师压力测试

AI 辅助的 bug 报告记录参差不齐，质疑是理所应当的。太多提交意味着误报，给开源项目带来额外负担。但 Anthropic 前沿红队提供给我们的东西不同。

Anthropic 的团队在使用 Claude 识别我们 JavaScript 引擎中的安全漏洞后，与 Firefox 工程师取得了联系。关键是，他们的 bug 报告包含最小化的测试用例，使我们的安全团队能够快速验证和重现每个问题。

**在数小时内**，我们的平台工程师开始修复问题，我们与 Anthropic 展开了紧密合作，将同样的技术应用于浏览器代码库的其他部分。总共，我们发现了 **14 个高危漏洞**并发布了 **22 个 CVE**。所有这些漏洞现在都已在最新版本的浏览器中修复。

除了 22 个安全敏感的 bug 外，Anthropic 还发现了 **90 个其他 bug**，其中大部分现已修复。许多低严重性的发现是断言失败，这与通过 fuzzing（模糊测试）传统发现的问题重叠，fuzzing 是一种自动化测试技术，向软件输入大量意外数据以触发崩溃和 bug。然而，模型还识别出了 fuzzer 以前未发现的独特类别的逻辑错误。

Anthropic 还发布了他们研究过程和发现的技术说明，我们邀请您在[这里](https://www.anthropic.com/research)阅读。

这一规模的发现反映了将严格的工程与新的分析工具相结合以实现持续改进的力量。我们将此视为明确证据：**大规模、AI 辅助的分析是安全工程师工具箱中强大的新补充**。Firefox 在几十年中经历了一些最广泛的 fuzzing、静态分析和定期安全审查。尽管如此，模型仍能够揭示许多以前未知的 bug。这类似于 fuzzing 的早期阶段；在广泛部署的软件中，可能存在大量现在可发现的 bug 积压。

Firefox 并非随机选择。它被选中是因为它是一个广泛部署且深度审查的开源项目——是新型防御工具的理想试验场。Mozilla 历史上一直领先于部署先进的安全技术来保护 Firefox 用户。本着同样的精神，我们的团队已经开始将 AI 辅助分析集成到我们的内部安全工作流程中，以便在攻击者之前发现并修复漏洞。

## 为用户公开构建

Firefox 一直倡导公开构建，并与我们的社区合作打造一个将用户放在首位的浏览器。这项工作反映了 Mozilla 长期以来致力于深思熟虑地应用新兴技术并服务于用户安全的承诺。

Anthropic 的前沿红队展示了这一领域的合作在实践中是什么样子：负责任地向维护者披露 bug，并共同努力使它们尽可能可操作。随着 AI 加速攻击和防御，Mozilla 将继续投资于确保 Firefox 不断变强、用户受到保护的工具、流程和合作。

---

## 关键要点

1. **AI 辅助漏洞检测是实战级工具**：这不是概念验证，而是真正发现了 22 个 CVE 和 90+ bug，证明了 AI 在安全工程中的实际价值。

2. **可重现性至关重要**：Anthropic 提供的 bug 报告包含最小化测试用例，这是区别于以往 AI bug 报告的关键——让工程师能快速验证和修复。

3. **发现了 fuzzing 遗漏的问题**：AI 模型识别出了一些传统 fuzzing 技术未曾发现的逻辑错误类别，说明这是对现有安全工具的补充而非替代。

4. **负责任的披露流程**：Anthropic 选择了 Firefox 这个"硬骨头"来验证技术能力，并遵循了负责任的漏洞披露原则，与厂商紧密合作。

5. **未来趋势**：Mozilla 已经开始将 AI 辅助分析集成到内部安全工作流程中，这预示着 AI 将成为安全工程的标准工具之一。

作为一个长期关注 AI 和安全交叉领域的开发者，我认为这个案例非常有意义。它不仅展示了 AI 在防御性安全中的潜力，更重要的是展示了一种可持续的合作模式：AI 公司提供技术能力，开源项目提供代码库和工程验证，最终用户受益于更安全的软件。这种"AI + 人类专家"的协作模式，可能就是未来安全工程的方向。
