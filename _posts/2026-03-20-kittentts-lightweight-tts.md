---
layout: post
title: "KittenTTS：25MB以下的轻量级文本转语音模型"
date: 2026-03-20 15:20:13 +0800
categories: tech-translation
description: "KittenTTS 是一款基于 ONNX 的开源文本转语音库，模型大小仅 25-80MB，可在 CPU 上高效运行，非常适合边缘设备部署。"
original_url: https://github.com/KittenML/KittenTTS
source: Hacker News
---

本文翻译自 [Kitten TTS - State-of-the-art TTS model under 25MB](https://github.com/KittenML/KittenTTS)，原载于 Hacker News。

## 项目简介

Kitten TTS 是一个基于 ONNX 构建的开源、轻量级文本转语音（Text-to-Speech，TTS）库。该项目提供了从 15M 到 80M 参数量不等的多个模型（磁盘占用 25-80 MB），能够在 CPU 上实现高质量的语音合成，**无需 GPU 加速**。

> **最新动态：** Kitten TTS v0.8 已发布，现已提供 15M、40M 和 80M 参数量的模型版本。
>
> **项目状态：** 开发者预览版 —— API 可能会在不同版本间发生变化。

对于国内开发者来说，这是一个非常值得关注的项目。为什么？因为它解决了 TTS 领域长期以来的一些痛点：模型太大、依赖 GPU、部署困难。KittenTTS 的出现让在树莓派、边缘服务器甚至移动设备上运行 TTS 成为可能。

## 核心特性

| 特性 | 说明 |
|------|------|
| **超轻量** | 模型大小从 25 MB（int8 量化版）到 80 MB，适合边缘部署 |
| **CPU 优化** | 基于 ONNX 推理，无需 GPU 即可高效运行 |
| **内置语音** | 提供 8 种预置音色：Bella、Jasper、Luna、Bruno、Rosie、Hugo、Kiki、Leo |
| **语速可调** | 通过 `speed` 参数控制播放速度 |
| **文本预处理** | 内置 pipeline 处理数字、货币、单位等 |
| **高质量输出** | 24 kHz 采样率的标准音频输出 |

## 可用模型

| 模型名称 | 参数量 | 磁盘大小 | Hugging Face |
|----------|--------|----------|--------------|
| kitten-tts-mini | 80M | 80 MB | KittenML/kitten-tts-mini-0.8 |
| kitten-tts-micro | 40M | 41 MB | KittenML/kitten-tts-micro-0.8 |
| kitten-tts-nano | 15M | 56 MB | KittenML/kitten-tts-nano-0.8 |
| kitten-tts-nano (int8) | 15M | 25 MB | KittenML/kitten-tts-nano-0.8-int8 |

> **注意：** 部分用户反馈 `kitten-tts-nano-0.8-int8` 模型存在问题。如果遇到问题，请在 GitHub 上提交 issue。

**我的建议：** 如果你是首次尝试，建议从 `kitten-tts-micro` 开始。它在模型大小和语音质量之间取得了很好的平衡。如果你对模型大小有严格要求（比如部署在嵌入式设备上），那么 int8 量化版的 nano 模型是不二之选。

## 快速开始

### 环境要求

- Python 3.8 或更高版本
- pip

### 安装

```bash
pip install https://github.com/KittenML/KittenTTS/releases/download/0.8.1/kittentts-0.8.1-py3-none-any.whl
```

### 基础用法

```python
from kittentts import KittenTTS

# 加载模型（首次会从 Hugging Face 下载）
model = KittenTTS("KittenML/kitten-tts-mini-0.8")

# 生成语音
audio = model.generate("This high-quality TTS model runs without a GPU.", voice="Jasper")

# 保存为 WAV 文件
import soundfile as sf
sf.write("output.wav", audio, 24000)
```

就这么简单！几行代码就能让你的应用拥有语音能力。

### 高级用法

```python
# 调整语速（默认为 1.0）
audio = model.generate("Hello, world.", voice="Luna", speed=1.2)

# 直接保存到文件
model.generate_to_file("Hello, world.", "output.wav", voice="Bruno", speed=0.9)

# 查看可用音色
print(model.available_voices)
# ['Bella', 'Jasper', 'Luna', 'Bruno', 'Rosie', 'Hugo', 'Kiki', 'Leo']

# 启用文本预处理（自动展开数字、货币等）
audio = model.generate("The price is $99.99", voice="Jasper", clean_text=True)
```

## API 参考

### `KittenTTS(model_name, cache_dir=None)`

从 Hugging Face Hub 加载模型。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model_name` | `str` | `"KittenML/kitten-tts-nano-0.8"` | Hugging Face 仓库 ID |
| `cache_dir` | `str` | `None` | 本地缓存目录 |

### `model.generate(text, voice, speed, clean_text)`

从文本合成语音，返回 24 kHz 的 NumPy 音频数组。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `text` | `str` | -- | 要合成的文本 |
| `voice` | `str` | `"expr-voice-5-m"` | 音色名称 |
| `speed` | `float` | `1.0` | 语速倍率 |
| `clean_text` | `bool` | `False` | 是否预处理文本 |

### `model.generate_to_file(text, output_path, voice, speed, sample_rate, clean_text)`

合成语音并直接写入音频文件。

## 系统要求

- **操作系统：** Linux、macOS 或 Windows
- **Python：** 3.8 或更高版本
- **硬件：** 仅需 CPU，无需 GPU
- **磁盘空间：** 25-80 MB（取决于模型版本）

推荐使用虚拟环境（conda、venv 等）来避免依赖冲突。

## 开发路线图

项目团队计划在未来发布：

- 优化的推理引擎
- 移动端 SDK
- 更高质量的 TTS 模型
- 多语言 TTS 支持
- KittenASR（语音识别）

多语言支持对于中文开发者来说尤其重要，期待后续版本能支持中文语音合成。

## 一些思考

KittenTTS 的出现让我看到了 TTS 技术普及的希望。过去，高质量的 TTS 系统要么需要昂贵的 GPU 资源，要么依赖云端 API（这意味着网络延迟和隐私问题）。而 KittenTTS 证明了：

1. **小模型也能有好效果**：通过精心设计的架构和训练策略，15M 参数的模型就能产生可接受的语音输出
2. **ONNX 是个好选择**：跨平台、CPU 友好、部署简单
3. **开源社区的力量**：Apache 2.0 许可证让商业使用成为可能

当然，目前的局限也很明显：只支持英文，音色数量有限，语音自然度与 GPT-SoVITS、CosyVoice 等更大模型相比还有差距。但作为一个轻量级方案，它已经做得很好了。

**适合使用 KittenTTS 的场景：**

- 边缘设备上的语音播报（智能家居、IoT 设备）
- 离线应用（飞行模式、隐私敏感场景）
- 快速原型开发
- 嵌入式系统

**可能不适合的场景：**

- 需要中文或其他非英语语言支持
- 对语音自然度有极高要求（如有声书）
- 需要自定义音色

## 社区与支持

- **Discord：** [加入社区](https://discord.gg/kittenml)
- **官网：** [kittenml.com](https://kittenml.com)
- **邮箱：** info@stellonlabs.com
- **问题反馈：** [GitHub Issues](https://github.com/KittenML/KittenTTS/issues)

项目还提供商业支持，包括集成协助、自定义音色开发和企业许可。

## 总结

KittenTTS 是一个值得关注的开源 TTS 项目，它的核心优势在于：

1. **轻量级**：最小模型仅 25MB
2. **CPU 友好**：无需 GPU 即可运行
3. **易于集成**：简单的 Python API
4. **开源免费**：Apache 2.0 许可证

如果你正在寻找一个轻量级的英语 TTS 解决方案，KittenTTS 绝对值得一试。项目还在快速发展中，期待看到更多功能的加入，尤其是多语言支持和移动端 SDK。

---

*项目开源地址：[https://github.com/KittenML/KittenTTS](https://github.com/KittenML/KittenTTS)*
