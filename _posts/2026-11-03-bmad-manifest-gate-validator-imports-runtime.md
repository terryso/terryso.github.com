---
title: "BMAD 的清单门禁：CI 校验器直接导入运行时，而不是模仿它"
description: "BMAD-METHOD 仓库围绕 skills 重构后，最值得读的文件是那个检查所有其他文件的校验器——skills/bmad/scripts/validate_manifests.py。它不重新实现解析器，而是用 importlib 加载运行时自己的 setup.py；它的版本号盖章器用正则改写文本后，再把新旧两份文件都过一遍真正的 TOML 解析器，断言唯一语义差异就是版本号；它在提交时对每个清单跑一次金丝雀盖章。可迁移的法则：永远不要为运行时已经解析的文件写第二个解析器——导入它。"
date: 2026-11-03
categories: [Agent运维]
tags: [BMAD, CI, TOML, 配置校验, GitHub Action]
---

## 仓库变了，门禁也变了

BMAD-METHOD 仓库围绕 skills 做了重构：`skills/` 下现在是 33 个目录，每个都带一份 `bmod.toml` 清单。新布局里最有教学价值的文件，是那个检查所有其他文件的脚本——`skills/bmad/scripts/validate_manifests.py`（473 行）。pre-commit、CI、发布盖章器，三条路径都经过它。

`skills/bmad-prd/bmod.toml` 是最小的清单样本，只有三行：

```toml
[skill]
bmod = "bmod-method"
source = "github:bmad-code-org/BMAD-METHOD/skills"
```

一个 skill 声明自己属于哪个 bmod 模块、模块住在哪里——skill 是模块的成员，不是独立王国。

## 核心动作：一个 import

校验器不重新实现 TOML，也不重新实现清单 schema。它加载**运行时自己的解析器**，然后直接调用：

```python
setup = load("bmad_setup_validate", SCRIPTS / "setup.py")
```

之后每一份清单都喂给 `setup.parse_bmod_file(...)`。如果运行时的解析器拒绝你的文件，错误信息也直说："the runtime parser rejects this file"。校验器与运行时的漂移在构造上就不可能——因为解析器只有一个。

## 第二颗宝石：自我验证的文本盖章器

`stamp_text()` 解决的问题是：TOML 序列化器会毁掉注释和格式，所以发布时的版本号改写必须走文本编辑。它用正则定位 `[bmod]` 表头（必须恰好一个）、在下一个表头处截断作用域（因为"更下面的表可能有自己的 version"）、在范围内找恰好一行 `version = "..."`，只重写那一行，保留缩进和行尾注释。

但它不信任自己的正则。改写完成后，它把新旧两份文本**都**过一遍真正的解析器，断言语义差异只有版本号：

```python
if tomllib.loads(stamped) != with_version(tomllib.loads(original), version):
    raise ValueError("rewriting the version line would change something other than [bmod] version")
```

文本编辑器用 AST 验证自己。而且 `stamp_problems()` 会在**提交时**对每个清单跑一次金丝雀盖章（探针值 `0.0.0-stamp-check`）——发布盖章器无法盖章的文件，在 CI 就失败，而不是等到发布夜。

## 版本规则站在消费者一边

连版本号校验都是在模拟消费者：`1.2.0-dev1` 被拒绝，因为 "setup.py cannot order -dev versions"；`1.2.0+build` 被拒绝，因为排序会丢掉 build 元数据，"an installed module would never see the release"。错误信息是从已安装模块的视角写的。未知键则被刻意放过——用克制换前向兼容。

## 分发闭环

校验器随 `bmad` skill 一起发布，所以任何模块仓库都能对自己的树跑同一套检查；`action.yml` 又把它暴露成 composite GitHub Action（`uv run --python 3.11`，PEP 723 内联元数据，零安装），两行 workflow 就能让第三方仓库拥有同一道门禁。

## 可迁移的法则

1. **永远不要为运行时已经解析的文件写第二个解析器——导入它。** 校验器复刻解析逻辑的那一刻，就开始了与生产的静默漂移。
2. 如果必须为了保住注释而做文本编辑，**改完之后用解析出的 AST 验证这次编辑**——正则改写必须自证清白。
3. 金丝雀在**提交时**跑，不在发布时跑。失败要发生在最便宜的时刻。

原始文件：`action.yml`、`skills/bmad/scripts/validate_manifests.py`、`skills/bmad-prd/bmod.toml`。
