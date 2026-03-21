---
layout: post
title: "BMAD Skill Validation System: 14 Deterministic Rules That Catch Real Bugs"
date: 2026-03-22
categories: [BMAD, AI Agents, Validation]
tags: [bmad, validation, deterministic, skills, llm-workflows]
---

BMAD's skill validation system (`tools/validate-skills.js`) implements 14 deterministic rules that act as a "fast first-pass" complement to inference-based validation. This isn't just linting - it catches real structural bugs that would break LLM workflows.

## The Philosophy: Deterministic First, Inference Second

```javascript
/**
 * Deterministic Skill Validator
 *
 * Validates 14 deterministic rules across all skill directories.
 * Acts as a fast first-pass complement to the inference-based skill validator.
 */
```

Why deterministic? Because regex patterns don't hallucinate. When you can catch structural errors with simple pattern matching, you should - it's faster, cheaper, and 100% consistent.

## The 14 Rules Broken Down

### SKILL-01 to SKILL-07: SKILL.md Validation

**SKILL-01**: SKILL.md must exist
```javascript
if (!fs.existsSync(skillMdPath)) {
  findings.push({
    rule: 'SKILL-01',
    severity: 'CRITICAL',
    detail: 'SKILL.md not found in skill directory.',
  });
}
```

**SKILL-02/03**: Frontmatter must have `name` and `description`
- Missing these means the skill can't be discovered by agents

**SKILL-04**: Name format validation
```javascript
const NAME_REGEX = /^bmad-[a-z0-9]+(-[a-z0-9]+)*$/;
```
- Must be lowercase, hyphen-separated, no spaces
- Pattern: `bmad-create-story`, `bmad-dev-story`

**SKILL-05**: Name must match directory
- Prevents `bmad-create-story/` containing `name: bmad-make-story`

**SKILL-06**: Description quality check
```javascript
if (!/use\s+when\b/i.test(description) && !/use\s+if\b/i.test(description)) {
  // Must contain trigger phrase
}
```
- Requires "Use when" or "Use if" - tells agents WHEN to invoke

**SKILL-07**: Body content required
- SKILL.md with only frontmatter is useless - needs actual instructions

### WF-01/WF-02: Workflow File Hygiene

Non-SKILL.md files (like workflow.md, step files) should NOT have `name` or `description` in frontmatter:

```javascript
if ('name' in fm) {
  findings.push({
    rule: 'WF-01',
    severity: 'HIGH',
    detail: 'frontmatter contains `name` — this belongs only in SKILL.md.',
  });
}
```

Why? Because these metadata fields cause confusion in agent discovery - only the entrypoint (SKILL.md) should define the skill's identity.

### PATH-02: No `installed_path` Variable

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

This catches a common mistake: using absolute installation paths that break when skills are installed in different locations.

### STEP-01/STEP-06/STEP-07: Step File Validation

**STEP-01**: Step filename format
```javascript
const STEP_FILENAME_REGEX = /^step-\d{2}[a-z]?-[a-z0-9-]+\.md$/;
```
- Valid: `step-01-load-context.md`, `step-02a-analyze.md`
- Invalid: `Step1.md`, `step-1.md`, `step-01_load.md`

**STEP-06**: Step files shouldn't have `name`/`description`
- Step metadata is noise - steps inherit from parent skill

**STEP-07**: Step count must be 2-10
```javascript
if (stepCount > 0 && (stepCount < 2 || stepCount > 10)) {
  const detail = stepCount < 2
    ? `Only ${stepCount} step file found — consider inlining into workflow.md.`
    : `${stepCount} step files found — more than 10 risks LLM context degradation.`;
}
```

This is a practical constraint: fewer than 2 steps doesn't need a separate file; more than 10 risks LLM context degradation.

### SEQ-02: No Time Estimates

```javascript
const TIME_ESTIMATE_PATTERNS = [
  /takes?\s+\d+\s*min/i,
  /~\s*\d+\s*min/i,
  /estimated\s+time/i,
  /\bETA\b/
];
```

Why? AI execution speed varies too much. "This takes 5 minutes" is always wrong for some models/users.

## The Frontmatter Parser

The validator includes a multiline-aware frontmatter parser:

```javascript
function parseFrontmatterMultiline(content) {
  // Handles YAML like:
  // description: |
  //   This is a long description
  //   that spans multiple lines

  let currentKey = null;
  let currentValue = '';

  for (const line of fmBlock.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && line[0] !== ' ' && line[0] !== '\t') {
      // New key at column 0
      if (currentKey !== null) {
        result[currentKey] = stripQuotes(currentValue.trim());
      }
      currentKey = line.slice(0, colonIndex).trim();
      currentValue = line.slice(colonIndex + 1);
    } else if (currentKey !== null) {
      // Continuation line
      currentValue += '\n' + line;
    }
  }
}
```

## CLI Usage

```bash
# Validate all skills, human-readable
node tools/validate-skills.js

# Single skill
node tools/validate-skills.js path/to/skill-dir

# Strict mode (exit 1 on HIGH+)
node tools/validate-skills.js --strict

# JSON output for CI
node tools/validate-skills.js --json
```

## GitHub Actions Integration

The validator automatically generates GitHub Actions annotations:

```javascript
if (process.env.GITHUB_ACTIONS) {
  const level = f.severity === 'LOW' ? 'notice' : 'warning';
  console.log(`::${level} file=${ghFile},line=${line}::${escapeAnnotation(...)}`);
}
```

And step summaries:
```javascript
if (process.env.GITHUB_STEP_SUMMARY) {
  let summary = '## Skill Validation\n\n';
  summary += '| Skill | Rule | Severity | File | Detail |\n';
  // ...
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
```

## Why This Matters

When building LLM-powered workflows, structural bugs are deadly:

1. **Wrong skill name** → Agent can't find it
2. **Missing description trigger** → Agent doesn't know when to use it
3. **Too many steps** → Context overflow, agent forgets earlier steps
4. **Absolute paths** → Works on your machine, breaks everywhere else

These aren't theoretical concerns - they're real bugs that the BMAD team encountered and fixed. The 14 rules encode hard-won lessons about what actually breaks LLM workflows.

## File Reference Validation (Companion Tool)

BMAD also includes `validate-file-refs.js` for cross-file reference validation:

- Validates `{project-root}/_bmad/` references resolve to real files
- Catches broken `exec="..."` targets
- Detects absolute path leaks (`/Users/`, `/home/`, `C:\`)
- Validates CSV workflow-file references

Together, these two validators form a deterministic safety net that catches structural bugs before they reach the LLM.

---

**Source**: [tools/validate-skills.js](https://github.com/bmad-code-org/BMAD-METHOD/blob/master/tools/validate-skills.js)

**Key Insight**: Deterministic validation is faster, cheaper, and more reliable than inference-based validation for structural issues. Use regex/patterns for what you can, reserve LLM inference for what you can't.
