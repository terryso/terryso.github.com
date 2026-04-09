---
layout: post
title: "BMAD 技能验证系统：14 条确定性规则捕获真实 Bug"
description: "深入解析 BMAD 技能验证系统的 14 条确定性规则，涵盖 SKILL.md 验证、Agent 触发器匹配、命令一致性检查等，展示如何用正则表达式作为快速预检来捕获 LLM 工作流中的结构性错误。"
date: 2026-03-22
categories: [BMAD, AI Agents, Validation]
tags: [bmad, validation, deterministic, skills, llm-workflows]
---

BMAD 的技能验证系统（`tools/validate-skills.js`）实现了 14 条确定性规则，作为基于推理的验证的"快速预检"补充。这不只是代码检查——它能捕获会破坏 LLM 工作流的真实结构性 Bug。

## 核心哲学：确定性优先，推理其次

```javascript
/**
 * Deterministic Skill Validator
 *
 * Validates 14 deterministic rules across all skill directories.
 * Acts as a fast first-pass complement to the inference-based skill validator.
 */
```

为什么用确定性规则？因为正则表达式不会产生幻觉。当你能用简单的模式匹配捕获结构性错误时，就应该这么做——更快、更便宜，而且 100% 一致。

## 14 条规则详解

### SKILL-01 到 SKILL-07：SKILL.md 验证

**SKILL-01**：SKILL.md 必须存在
```javascript
if (!fs.existsSync(skillMdPath)) {
  findings.push({
    rule: 'SKILL-01',
    severity: 'CRITICAL',
    detail: 'SKILL.md not found in skill directory.',
  });
}
```

**SKILL-02/03**：Frontmatter 必须包含 `name` 和 `description`
- 缺少这些意味着 Agent 无法发现该技能

**SKILL-04**：名称格式验证
```javascript
const NAME_REGEX = /^bmad-[a-z0-9]+(-[a-z0-9]+)*$/;
```
- 必须小写、连字符分隔、无空格
- 示例：`bmad-create-story`、`bmad-dev-story`

**SKILL-05**：名称必须与目录匹配
- 防止 `bmad-create-story/` 目录中出现 `name: bmad-make-story`

**SKILL-06**：描述质量检查
```javascript
if (!/use\s+when\b/i.test(description) && !/use\s+if\b/i.test(description)) {
  // Must contain trigger phrase
}
```
- 必须包含 "Use when" 或 "Use if"——告诉 Agent 何时调用

**SKILL-07**：正文内容必填
- 仅有 frontmatter 的 SKILL.md 毫无用处——需要实际的指令内容

### WF-01/WF-02：工作流文件规范

非 SKILL.md 文件（如 workflow.md、step 文件）不应在 frontmatter 中包含 `name` 或 `description`：

```javascript
if ('name' in fm) {
  findings.push({
    rule: 'WF-01',
    severity: 'HIGH',
    detail: 'frontmatter contains `name` — this belongs only in SKILL.md.',
  });
}
```

为什么？因为这些元数据字段会导致 Agent 发现时的混乱——只有入口文件（SKILL.md）才应定义技能的身份。

### PATH-02：禁止 `installed_path` 变量

```javascript
if (/installed_path/i.test(line)) {
  findings.push({
    rule: 'PATH-02',
    severity: 'HIGH',
    detail: '`installed_path` reference found in content.',
    fix: 'Use relative paths (`./path` or `../path`) instead.',
  });
}
```

这捕获了一个常见错误：使用绝对安装路径，当技能安装到不同位置时就会失效。

### STEP-01/STEP-06/STEP-07：步骤文件验证

**STEP-01**：步骤文件名格式
```javascript
const STEP_FILENAME_REGEX = /^step-\d{2}[a-z]?-[a-z0-9-]+\.md$/;
```
- 合法：`step-01-load-context.md`、`step-02a-analyze.md`
- 非法：`Step1.md`、`step-1.md`、`step-01_load.md`

**STEP-06**：步骤文件不应有 `name`/`description`
- 步骤的元数据是冗余的——步骤从父技能继承

**STEP-07**：步骤数必须在 2-10 之间
```javascript
if (stepCount > 0 && (stepCount < 2 || stepCount > 10)) {
  const detail = stepCount < 2
    ? `Only ${stepCount} step file found — consider inlining into workflow.md.`
    : `${stepCount} step files found — more than 10 risks LLM context degradation.`;
}
```

这是一个实用约束：少于 2 步不需要单独的文件；超过 10 步则有 LLM 上下文退化的风险。

### SEQ-02：禁止时间估算

```javascript
const TIME_ESTIMATE_PATTERNS = [
  /takes?\s+\d+\s*min/i,
  /~\s*\d+\s*min/i,
  /estimated\s+time/i,
  /\bETA\b/
];
```

为什么？因为 AI 执行速度差异太大。"这需要 5 分钟"对某些模型/用户来说永远是不准确的。

## Frontmatter 解析器

验证器包含一个支持多行的 frontmatter 解析器：

```javascript
function parseFrontmatterMultiline(content) {
  // 处理如下 YAML：
  // description: |
  //   This is a long description
  //   that spans multiple lines

  let currentKey = null;
  let currentValue = '';

  for (const line of fmBlock.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && line[0] !== ' ' && line[0] !== '\t') {
      // 列 0 处的新键
      if (currentKey !== null) {
        result[currentKey] = stripQuotes(currentValue.trim());
      }
      currentKey = line.slice(0, colonIndex).trim();
      currentValue = line.slice(colonIndex + 1);
    } else if (currentKey !== null) {
      // 续行
      currentValue += '\n' + line;
    }
  }
}
```

## 命令行使用

```bash
# 验证所有技能，人类可读格式
node tools/validate-skills.js

# 验证单个技能
node tools/validate-skills.js path/to/skill-dir

# 严格模式（HIGH+ 级别错误时退出码为 1）
node tools/validate-skills.js --strict

# JSON 输出，适用于 CI
node tools/validate-skills.js --json
```

## GitHub Actions 集成

验证器会自动生成 GitHub Actions 标注：

```javascript
if (process.env.GITHUB_ACTIONS) {
  const level = f.severity === 'LOW' ? 'notice' : 'warning';
  console.log(`::${level} file=${ghFile},line=${line}::${escapeAnnotation(...)}`);
}
```

以及步骤摘要：
```javascript
if (process.env.GITHUB_STEP_SUMMARY) {
  let summary = '## Skill Validation\n\n';
  summary += '| Skill | Rule | Severity | File | Detail |\n';
  // ...
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
```

## 为什么这很重要

在构建 LLM 驱动的工作流时，结构性 Bug 是致命的：

1. **错误的技能名称** → Agent 找不到它
2. **缺少描述触发词** → Agent 不知道何时使用
3. **步骤过多** → 上下文溢出，Agent 忘记前面的步骤
4. **绝对路径** → 在你的机器上能运行，在其他地方就挂了

这些不是理论上的担忧——它们是 BMAD 团队真实遇到并修复的 Bug。这 14 条规则编码了关于什么会真正破坏 LLM 工作流的宝贵经验。

## 文件引用验证（配套工具）

BMAD 还包含 `validate-file-refs.js` 用于跨文件引用验证：

- 验证 `{project-root}/_bmad/` 引用能解析到真实文件
- 捕获损坏的 `exec="..."` 目标
- 检测绝对路径泄漏（`/Users/`、`/home/`、`C:\`）
- 验证 CSV 工作流文件引用

这两个验证器共同构成了一个确定性安全网，在结构性 Bug 到达 LLM 之前将其捕获。

---

**源码**：[tools/validate-skills.js](https://github.com/bmad-code-org/BMAD-METHOD/blob/master/tools/validate-skills.js)

**核心洞察**：对于结构性问题，确定性验证比基于推理的验证更快、更便宜、更可靠。能使用正则/模式的地方就用，把 LLM 推理留给无法模式匹配的部分。
