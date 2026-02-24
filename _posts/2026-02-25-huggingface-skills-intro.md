---
layout: post
title: "Hugging Face Skills：让 AI 编程助手更懂机器学习"
date: 2026-02-25 04:24:53 +0800
categories: tech-translation
description: "Hugging Face 推出的 Skills 是一套标准化的 AI/ML 任务定义，支持 Claude Code、Cursor、Codex 等主流编程助手，让 AI 代理能够更好地完成数据集创建、模型训练和评估等机器学习工作流。"
original_url: https://github.com/huggingface/skills
source: Hacker News
---

本文翻译自 [Hugging Face Skills](https://github.com/huggingface/skills)，原载于 Hacker News。

## 什么是 Hugging Face Skills？

如果你是 AI 开发者，一定对各种 **coding agent（编程代理）** 不陌生——Claude Code、Cursor、OpenAI Codex、Google Gemini CLI 等工具正在改变我们写代码的方式。但这些通用的编程助手往往对机器学习领域的专业任务"不太懂行"。

Hugging Face Skills 就是为了解决这个问题而生的。它是一套标准化的 **AI/ML 任务定义**，专门用于数据集创建、模型训练、评估等机器学习工作流。更重要的是，它兼容所有主流的编程代理工具。

简单来说，Skills 让你的 AI 编程助手"学会"了 Hugging Face 的生态系统。

## Skills 的工作原理

从实践角度看，每个 Skill 都是一个**自包含的文件夹**，打包了指令、脚本和资源。核心文件是 `SKILL.md`，包含：

- **YAML 前置信息**：名称和描述
- **详细指导**：编程代理在执行任务时遵循的步骤

值得一提的是，"Skills" 这个术语来自 Anthropic，其他工具有不同的叫法：
- OpenAI Codex 使用 `AGENTS.md` 文件
- Google Gemini 使用 `gemini-extension.json` 定义 "extensions"

但 Hugging Face 这个仓库**兼容所有格式**，一处定义，多处使用。

## 安装方式

### Claude Code

```bash
# 1. 注册插件市场
/plugin marketplace add huggingface/skills

# 2. 安装特定的 skill
/plugin install <skill-name>@huggingface/skills

# 例如安装 Hugging Face CLI skill
/plugin install hugging-face-cli@huggingface/skills
```

### OpenAI Codex

Codex 会通过 `AGENTS.md` 文件自动识别 skills：

```bash
codex --ask-for-approval never "Summarize the current instructions."
```

### Gemini CLI

```bash
# 本地安装
gemini extensions install . --consent

# 或从 GitHub URL 安装
gemini extensions install https://github.com/huggingface/skills.git --consent
```

### Cursor

仓库包含 Cursor 插件配置文件（`.cursor-plugin/plugin.json` 和 `.mcp.json`），可以通过 Cursor 的插件流程安装。

## 可用的 Skills 一览

目前仓库提供了以下 Skills：

| Skill 名称 | 功能描述 |
|-----------|---------|
| `hugging-face-cli` | 使用 hf CLI 执行 Hub 操作：下载模型/数据集、上传文件、管理仓库、运行云端计算任务 |
| `hugging-face-datasets` | 创建和管理数据集：初始化仓库、定义配置、流式更新数据行、基于 SQL 的数据查询和转换 |
| `hugging-face-evaluation` | 管理模型评估结果：从 README 提取评估表格、导入 Artificial Analysis API 分数、使用 vLLM/lighteval 运行自定义评估 |
| `hugging-face-jobs` | 在 Hugging Face 基础设施上运行计算任务：执行 Python 脚本、管理定时任务、监控任务状态 |
| `hugging-face-model-trainer` | 使用 TRL 训练或微调语言模型：支持 SFT、DPO、GRPO 和奖励建模，包含 GGUF 转换、硬件选择、成本估算等 |
| `hugging-face-paper-publisher` | 发布和管理研究论文：创建论文页面、关联模型/数据集、生成专业的 markdown 研究文章 |
| `hugging-face-tool-builder` | 构建 Hugging Face API 操作的可复用脚本，适合链式 API 调用或自动化重复任务 |
| `hugging-face-trackio` | 使用 Trackio 追踪和可视化 ML 训练实验：通过 Python API 记录指标，支持实时仪表板 |

## 实际使用示例

安装 Skill 后，直接在给编程代理的指令中引用即可：

- "使用 HF LLM trainer skill 估算 70B 模型需要的 GPU 内存"
- "使用 HF model evaluation skill 在最新的 checkpoint 上运行 `run_eval_job.py`"
- "使用 HF dataset creator skill 起草新的 few-shot 分类模板"
- "使用 HF paper publisher skill 索引我的 arXiv 论文并关联到我的模型"

编程代理会自动加载对应的 `SKILL.md` 指令和辅助脚本来完成任务。

## 如何贡献自定义 Skill

1. 复制现有的 Skill 文件夹（如 `hf-datasets/`）并重命名
2. 更新 `SKILL.md` 的前置信息：

```yaml
---
name: my-skill-name
description: 描述这个 Skill 的功能和适用场景
---

# Skill 标题
详细指导 + 示例 + 边界约束
```

3. 添加或编辑相关的脚本、模板和文档
4. 在 `.claude-plugin/marketplace.json` 中添加条目
5. 运行验证脚本重新生成元数据
6. 在编程代理中重新安装或重新加载 Skill

## 个人观点

这套 Skills 体系让我想到了"**给 AI 装上专业技能包**"的概念。通用的编程助手很强，但在特定领域（如机器学习）往往会"力不从心"。Hugging Face 通过标准化的 Skill 定义，让 AI 代理能够：

1. **理解领域知识**：知道如何正确使用 hf CLI、如何配置训练参数
2. **遵循最佳实践**：自动应用 ML 工程中的规范和约定
3. **复用工作流**：将复杂的多步骤任务打包成可复用的"技能"

对于国内的 AI 开发者，这个思路非常值得借鉴。无论你用的是 LangChain、LlamaIndex 还是其他 agent 框架，都可以考虑为自己的业务场景定义类似的"技能包"。

## 总结

Hugging Face Skills 的核心价值在于：

- **跨平台兼容**：一次定义，Claude、Cursor、Codex、Gemini 都能用
- **专业领域支持**：让通用编程助手具备 ML 专家能力
- **开源可扩展**：可以自由贡献和定制自己的 Skills
- **实用性强**：覆盖了从数据集管理到模型训练的完整 ML 工作流

如果你在用 AI 编程助手做机器学习开发，强烈建议试试这套 Skills——它能让你的 AI 助手从"能写代码"升级为"懂机器学习工程"。
