---
layout: post
title: "GLM-OCR：面向复杂文档理解的 0.9B 参数 OCR 模型"
date: 2026-02-12 00:48:40 +0800
categories: tech-translation
description: "GLM-OCR 是一款基于 GLM-V 架构的多模态 OCR 模型，仅需 0.9B 参数即可在 OmniDocBench V1.5 上取得 94.62 分的综合排名第一成绩。"
original_url: https://github.com/zai-org/GLM-OCR
source: GitHub
---

本文翻译自 [GLM-OCR](https://github.com/zai-org/GLM-OCR)，原载于 GitHub。

## 模型概述

GLM-OCR 是一款面向复杂文档理解的多模态 OCR 模型，基于 GLM-V 编码器—解码器架构构建。它引入了 Multi-Token Prediction（MTP）损失与稳定的全任务强化学习训练策略，以提升训练效率、识别精度与泛化能力。

模型集成了三个核心组件：
- **CogViT 视觉编码器**：在大规模图文数据上预训练
- **轻量跨模态连接器**：带高效的 token 下采样能力
- **GLM-0.5B 语言解码器**：负责生成最终的文本输出

结合基于 PP-DocLayout-V3 的"两阶段"流程（先做版面分析，再进行并行识别），GLM-OCR 能在多样化文档布局下提供稳健且高质量的 OCR 表现。

## 核心特性

### 1. 业界领先的效果

在 OmniDocBench V1.5 上取得 **94.62 分**，综合排名第一。同时在以下主流文档理解基准上达到 SOTA 水平：
- 公式识别
- 表格识别
- 信息抽取

### 2. 面向真实场景优化

这个特性特别值得关注。很多 OCR 模型在实验室数据集上表现不错，但一到真实业务场景就"翻车"。GLM-OCR 针对实际业务需求进行优化，在以下场景中依然保持稳定表现：
- 复杂表格（多层嵌套、合并单元格）
- 代码密集文档（各种编程语言混合）
- 印章和手写内容
- 其他高难度版面场景

### 3. 高效推理

总参数量仅 **0.9B**，这个规模非常友好：
- 支持通过 vLLM、SGLang 与 Ollama 部署
- 显著降低推理时延与算力成本
- 适用于高并发服务与端侧部署

### 4. 上手简单

- 全面开源
- 提供完整的 [SDK](https://github.com/zai-org/GLM-OCR) 与推理工具链
- 支持便捷安装、一行调用
- 可与现有生产流程顺滑集成

## 模型下载

| 模型    | 下载链接                                                                                                                    | 精度 |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | ---- |
| GLM-OCR | [🤗 Hugging Face](https://huggingface.co/zai-org/GLM-OCR)<br> [🤖 ModelScope](https://modelscope.cn/models/ZhipuAI/GLM-OCR) | BF16 |

## 快速开始

### 安装 SDK

```bash
pip install glmocr

# 或从源码安装
git clone https://github.com/zai-org/glm-ocr.git
cd glm-ocr && pip install -e .

# 从源码安装 transformers（推荐）
pip install git+https://github.com/huggingface/transformers.git
```

### 部署方式

GLM-OCR 提供两种使用方式：

#### 方式 1：智谱 MaaS API（推荐快速上手）

适合不想自己部署 GPU 服务器的场景。

1. 在 https://open.bigmodel.cn 获取 API Key
2. 配置 `config.yaml`：

```yaml
pipeline:
  maas:
    enabled: true  # 启用 MaaS 模式
    api_key: your-api-key  # 必填
```

配置完成！当 `maas.enabled=true` 时，SDK 作为轻量级封装：
- 将文档转发到智谱云端 API
- 直接返回结果（Markdown + JSON 版面详情）
- 无需本地处理，无需 GPU

#### 方式 2：使用 vLLM / SGLang 自部署

适合需要完全掌控、数据隐私要求高的场景。

**使用 vLLM：**

```bash
# 安装 vLLM
pip install -U vllm --extra-index-url https://wheels.vllm.ai/nightly

# 启动服务（开启 MTP 获得更好的推理性能）
vllm serve zai-org/GLM-OCR \
  --allowed-local-media-path / \
  --port 8080 \
  --speculative-config '{"method": "mtp", "num_speculative_tokens": 1}'
```

**使用 SGLang：**

```bash
# 安装 SGLang
docker pull lmsysorg/sglang:dev

# 启动服务（开启 MTP 获得更好的推理性能）
python -m sglang.launch_server \
  --model zai-org/GLM-OCR \
  --port 8080 \
  --speculative-algorithm NEXTN \
  --speculative-num-steps 1
```

启动服务后，配置 `config.yaml`：

```yaml
pipeline:
  maas:
    enabled: false  # 禁用 MaaS 模式
  ocr_api:
    api_host: localhost
    api_port: 8080
```

### 使用示例

#### 命令行

```bash
# 解析单张图片
glmocr parse examples/source/code.png

# 解析目录
glmocr parse examples/source/

# 指定输出目录
glmocr parse examples/source/code.png --output ./results/

# 开启 debug 日志（包含 profiling）
glmocr parse examples/source/code.png --log-level DEBUG
```

#### Python API

```python
from glmocr import GlmOcr, parse

# 便捷函数
result = parse("image.png")
result = parse(["img1.png", "img2.jpg"])  # list 会被当作同一文档的多页
result = parse("https://example.com/image.png")
result.save(output_dir="./results")

# 类接口
with GlmOcr() as parser:
    result = parser.parse("image.png")
    print(result.json_result)
    result.save()
```

#### Flask 服务

```bash
# 启动服务
python -m glmocr.server

# 调用 API
curl -X POST http://localhost:5002/glmocr/parse \
  -H "Content-Type: application/json" \
  -d '{"images": ["./example/source/code.png"]}'
```

### 输出格式

GLM-OCR 支持两种输出格式：

**JSON 格式**（结构化数据）：

```json
[[{ "index": 0, "label": "text", "content": "...", "bbox_2d": null }]]
```

**Markdown 格式**（可直接阅读）：

```markdown
# 文档标题

正文内容...

| Table | Content |
| ----- | ------- |
| ...   | ...     |
```

## 模块化架构

GLM-OCR 使用可组合模块，便于自定义扩展：

| 组件                  | 说明                         |
| --------------------- | ---------------------------- |
| `PageLoader`          | 预处理与图像编码             |
| `OCRClient`           | 调用 GLM-OCR 模型服务        |
| `PPDocLayoutDetector` | 基于 PP-DocLayout 的版面分析 |
| `ResultFormatter`     | 后处理与输出 JSON/Markdown   |

你也可以通过自定义 pipeline 扩展行为：

```python
from glmocr.dataloader import PageLoader
from glmocr.ocr_client import OCRClient
from glmocr.postprocess import ResultFormatter

class MyPipeline:
  def __init__(self, config):
    self.page_loader = PageLoader(config)
    self.ocr_client = OCRClient(config)
    self.formatter = ResultFormatter(config)

  def process(self, request_data):
    # 实现你自己的处理逻辑
    pass
```

## 个人见解

GLM-OCR 的几个亮点值得特别关注：

1. **参数量与性能的平衡**：0.9B 参数在 OCR 模型中属于轻量级，但性能却能达到 SOTA 水平。这意味着部署成本大幅降低，对于资源受限的场景特别友好。

2. **真实场景优化**：很多 OCR 模型在学术论文上表现不错，但处理实际业务中的复杂表格、代码文档时效果大打折扣。GLM-OCR 明确针对这些场景进行了优化，这是一个很务实的做法。

3. **多部署方式**：无论是云端 API、本地 vLLM/SGLang，还是 MLX（Apple Silicon），都提供了完整的支持。这种灵活性对于不同规模和需求的项目都很重要。

4. **SDK 设计**：提供 CLI、Python API 和 Flask 服务三种使用方式，覆盖了从快速测试到生产集成的各种场景。

## 适用场景

基于 GLM-OCR 的特性，以下场景特别适合使用：

- **文档数字化**：处理大量扫描文档、PDF 文件
- **表格数据提取**：从财务报表、统计表格中提取结构化数据
- **代码文档处理**：识别技术文档、代码截图中的内容
- **票据处理**：发票、收票、合同等票据的识别
- **知识库构建**：将纸质或图片资料转化为可搜索的数字格式

## 总结

GLM-OCR 是一款"小而美"的 OCR 模型。它在保持轻量级（0.9B 参数）的同时，通过创新的 MTP 损失和强化学习训练策略，在复杂文档理解任务上达到了 SOTA 水平。

对于需要处理中文文档、特别是包含复杂表格和代码的场景，GLM-OCR 是一个值得尝试的选择。它提供了从云端 API 到本地部署的多种使用方式，SDK 设计简洁，上手容易。

项目已完全开源，遵循 Apache License 2.0（代码）和 MIT License（模型），可以在 [GitHub](https://github.com/zai-org/GLM-OCR) 上获取完整代码和文档。

## 相关资源

- GitHub: https://github.com/zai-org/GLM-OCR
- Hugging Face: https://huggingface.co/zai-org/GLM-OCR
- ModelScope: https://modelscope.cn/models/ZhipuAI/GLM-OCR
- API 文档: https://docs.bigmodel.cn/cn/guide/models/vlm/glm-ocr
