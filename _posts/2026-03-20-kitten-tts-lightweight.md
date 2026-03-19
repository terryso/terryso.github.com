---
layout: post
title: "Kitten TTS：超轻量级 CPU 文本转语音库"
date: 2026-03-20 03:03:53 +0800
categories: tech-translation
description: "Kitten TTS 是一个基于 ONNX 的开源文本转语音库，模型体积仅 25-80MB，无需 GPU 即可在 CPU 上高效运行，非常适合边缘部署场景。"
original_url: https://github.com/KittenML/KittenTTS
source: Hacker News
---

本文翻译自 [Kitten TTS](https://github.com/KittenML/KittenTTS)，原载于 Hacker News。

## 项目简介

Kitten TTS 是一个基于 ONNX 构建的开源、轻量级文本转语音（Text-to-Speech, TTS）库。它的模型参数量从 15M 到 80M 不等（磁盘占用 25-80MB），能够在 CPU 上提供高质量的语音合成，完全不需要 GPU。

> **最新消息：** Kitten TTS v0.8 已发布 —— 现已提供 15M、40M 和 80M 参数的模型版本。
>
> **项目状态：** 开发者预览版 —— API 可能会在版本间发生变化。

## 核心特性

- **超轻量级** —— 模型大小从 25MB（int8 量化）到 80MB，非常适合边缘设备部署
- **CPU 优化** —— 基于 ONNX 的推理引擎，无需 GPU 即可高效运行
- **8 种内置语音** —— Bella、Jasper、Luna、Bruno、Rosie、Hugo、Kiki 和 Leo
- **可调节语速** —— 通过 `speed` 参数控制播放速度
- **文本预处理** —— 内置管道处理数字、货币、单位等
- **24kHz 输出** —— 标准采样率的高质量音频

## 可用模型

| 模型 | 参数量 | 大小 | 下载地址 |
|---|---|---|---|
| kitten-tts-mini | 80M | 80 MB | [KittenML/kitten-tts-mini-0.8](https://huggingface.co/KittenML/kitten-tts-mini-0.8) |
| kitten-tts-micro | 40M | 41 MB | [KittenML/kitten-tts-micro-0.8](https://huggingface.co/KittenML/kitten-tts-micro-0.8) |
| kitten-tts-nano | 15M | 56 MB | [KittenML/kitten-tts-nano-0.8](https://huggingface.co/KittenML/kitten-tts-nano-0.8-fp32) |
| kitten-tts-nano (int8) | 15M | 25 MB | [KittenML/kitten-tts-nano-0.8-int8](https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8) |

> **注意：** 部分用户反馈 `kitten-tts-nano-0.8-int8` 模型存在问题。如果遇到问题，请[提交 issue](https://github.com/KittenML/KittenTTS/issues)。

## 在线演示

你可以直接在浏览器中体验 Kitten TTS：[Hugging Face Spaces Demo](https://huggingface.co/spaces/KittenML/KittenTTS-Demo)

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

model = KittenTTS("KittenML/kitten-tts-mini-0.8")
audio = model.generate("This high-quality TTS model runs without a GPU.", voice="Jasper")

import soundfile as sf
sf.write("output.wav", audio, 24000)
```

### 高级用法

```python
# 调节语速（默认值：1.0）
audio = model.generate("Hello, world.", voice="Luna", speed=1.2)

# 直接保存到文件
model.generate_to_file("Hello, world.", "output.wav", voice="Bruno", speed=0.9)

# 查看可用语音
print(model.available_voices)
# ['Bella', 'Jasper', 'Luna', 'Bruno', 'Rosie', 'Hugo', 'Kiki', 'Leo']
```

## API 参考

### `KittenTTS(model_name, cache_dir=None)`

从 Hugging Face Hub 加载模型。

| 参数 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `model_name` | `str` | `"KittenML/kitten-tts-nano-0.8"` | Hugging Face 仓库 ID |
| `cache_dir` | `str` | `None` | 本地缓存模型文件的目录 |

### `model.generate(text, voice, speed, clean_text)`

将文本合成为语音，返回 24kHz 的 NumPy 音频数组。

| 参数 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `text` | `str` | -- | 要合成的输入文本 |
| `voice` | `str` | `"expr-voice-5-m"` | 语音名称 |
| `speed` | `float` | `1.0` | 语速倍数 |
| `clean_text` | `bool` | `False` | 预处理文本（展开数字、货币等） |

### `model.generate_to_file(text, output_path, voice, speed, sample_rate, clean_text)`

合成语音并直接写入音频文件。

| 参数 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `text` | `str` | -- | 要合成的输入文本 |
| `output_path` | `str` | -- | 音频文件保存路径 |
| `voice` | `str` | `"expr-voice-5-m"` | 语音名称 |
| `speed` | `float` | `1.0` | 语速倍数 |
| `sample_rate` | `int` | `24000` | 音频采样率（Hz） |
| `clean_text` | `bool` | `True` | 预处理文本 |

### `model.available_voices`

返回可用语音名称列表：`['Bella', 'Jasper', 'Luna', 'Bruno', 'Rosie', 'Hugo', 'Kiki', 'Leo']`

## 系统要求

- **操作系统：** Linux、macOS 或 Windows
- **Python：** 3.8 或更高版本
- **硬件：** 在 CPU 上运行；无需 GPU
- **磁盘空间：** 25-80 MB（取决于模型版本）

建议使用虚拟环境（conda、venv 或类似工具）以避免依赖冲突。

## 开发路线图

- [ ] 发布优化后的推理引擎
- [ ] 发布移动端 SDK
- [ ] 发布更高质量的 TTS 模型
- [ ] 发布多语言 TTS
- [ ] 发布 KittenASR（语音识别）
- [ ] 需要其他功能？[告诉我们](https://github.com/KittenML/KittenTTS/issues)

## 商业支持

团队为需要将 Kitten TTS 集成到产品中的企业提供商业支持，包括集成协助、定制语音开发和企业许可。

## 社区与支持

- **Discord：** [加入社区](https://discord.com/invite/VJ86W4SURW)
- **网站：** [kittenml.com](https://kittenml.com)
- **邮箱：** info@stellonlabs.com
- **问题反馈：** [GitHub Issues](https://github.com/KittenML/KittenTTS/issues)

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 开源。

---

## 个人点评

Kitten TTS 的出现填补了一个重要的市场空白 —— 在边缘设备和资源受限环境中实现高质量语音合成。虽然目前市面上已有许多优秀的 TTS 方案（如 Coqui TTS、Bark、VITS 等），但它们往往需要 GPU 才能获得理想的性能。

Kitten TTS 的几个亮点值得国内开发者关注：

1. **部署成本低**：无需 GPU，单机即可运行，非常适合中小型项目
2. **模型体积小**：25MB 的 int8 量化版本甚至可以集成到移动应用中
3. **API 简洁**：几行代码就能上手，学习曲线平缓
4. **开源免费**：Apache 2.0 许可证，商业使用友好

目前项目仍处于开发者预览阶段，API 可能会有变动，建议在生产环境使用前密切关注版本更新。期待后续的多语言支持和移动端 SDK，这将为更多应用场景打开可能性。
