---
layout: post
title: "在 Apple Silicon 上运行 NVIDIA PersonaPlex 7B：纯 Swift + MLX 实现实时语音对话"
date: 2026-03-05 16:18:51 +0800
categories: tech-translation
description: "本文介绍如何在 Apple Silicon 上使用 Swift 和 MLX 框架运行 NVIDIA 的 PersonaPlex 7B 模型，实现全双工语音对话——无需 ASR→LLM→TTS 三阶段流水线，一个模型直接音频输入输出。"
original_url: https://blog.ivan.digital/nvidia-personaplex-7b-on-apple-silicon-full-duplex-speech-to-speech-in-native-swift-with-mlx-0aa5276f2e23
source: Hacker News
---

本文翻译自 [NVIDIA PersonaPlex 7B on Apple Silicon: Full-Duplex Speech-to-Speech in Native Swift with MLX](https://blog.ivan.digital/nvidia-personaplex-7b-on-apple-silicon-full-duplex-speech-to-speech-in-native-swift-with-mlx-0aa5276f2e23)，原载于 Hacker News。

---

想象一下，你对着笔记本说话，它直接回复——不是通过"语音转文字→大模型思考→文字转语音"这样的三阶段流水线，而是一个能同时听和说的单一模型，速度快于实时，在生成过程中流式输出音频块。这正是本周在 **qwen3-asr-swift** 中实现的功能，完全运行在 Apple Silicon 上。

**qwen3-asr-swift** 这个 Swift/MLX 语音库现在支持通过 NVIDIA 的 **PersonaPlex 7B** 进行全双工语音对话——速度超过实时（约 68ms/步，**RTF 0.87**），同时还支持 ASR、TTS 和多语言合成。音频输入，音频输出，Apple Silicon 上的原生 Swift 实现。4-bit 量化模型（约 5.3 GB）托管在 [aufklarer/PersonaPlex-7B-MLX-4bit](https://huggingface.co/aufklarer/PersonaPlex-7B-MLX-4bit)。

## 从转录到对话的演进之路

这个库最初并不是作为语音对话引擎开发的。它始于一个语音识别移植项目——证明 Apple Silicon 的统一内存和 MLX 的 Metal 加速能够原生运行严肃的语音模型，不需要 Python，不需要服务器，不需要在 CPU 和 GPU 之间复制张量。

首先是 **ASR**——Qwen3-ASR 0.6B，量化到 4-bit，将语音转为文字。这建立了 MLX 的基本模式：KV cache、RoPE、量化推理。然后是 **TTS**——Qwen3-TTS 0.6B，添加了 Mimi 音频编解码器和 10 种语言的流式音频生成。接着是**多语言合成**——CosyVoice3 0.5B，引入了跨 9 种语言的 DiT flow matching。

现在：**语音到语音**。PersonaPlex 7B 直接接收音频输入并产生音频输出。没有转录步骤。没有文字中介。全双工——它同时听和说。

## 为什么选择 PersonaPlex？一个模型替代三个

传统的语音助手流水线是这样的：

```
用户说话 → [ASR] → 文字 → [LLM] → 文字 → [TTS] → 助手说话
```

三个模型，三次交接，累积延迟。每一步都会丢失信息——ASR 丢弃了韵律和情感，TTS 必须从扁平文字中重建它们。

PersonaPlex 将其折叠为一个模型：

```
用户说话 → [PersonaPlex 7B] → 助手说话
```

模型直接处理音频 token——17 个并行流，频率 12.5 Hz（每 80ms 一帧）。它基于 Kyutai 的 **Moshi** 架构，与他们实时语音 demo 背后的技术相同。NVIDIA 在此基础上扩展了 18 个可控语音预设和基于角色的系统提示。

## 模型：从 16.7 GB 压缩到 5.3 GB

NVIDIA 原始的 PersonaPlex 是一个 16.7 GB 的 PyTorch checkpoint。我们将其转换为 **MLX 优化**的 safetensors 格式，对 7B 时序 transformer 和 Depformer 都进行了 4-bit 量化：

**总下载量：约 5.3 GB。** 发布在 [aufklarer/PersonaPlex-7B-MLX-4bit](https://huggingface.co/aufklarer/PersonaPlex-7B-MLX-4bit)。

转换脚本（`scripts/convert_personaplex.py`）处理所有工作：从 `nvidia/personaplex-7b-v1` 下载、分类约 2000 个权重键、将两个 transformer 量化到 4-bit、提取语音预设，以及可选上传到 HuggingFace。

## 单一模型如何处理语音对话

这就是实现单模型语音对话的关键：PersonaPlex 不是通过单独的转录和合成阶段，而是通过一个统一流水线处理 17 个并行 token 流。

```
[用户音频 24kHz] → Mimi 编码器 → 16 个 codebook token @ 12.5Hz
                                          ↓
            时序 Transformer（32层，4096维，7B 参数，4-bit）
                17 个流求和：文字 + 8 个用户音频 + 8 个助手音频
                                          ↓
            Depformer（6层，1024维，每个 codebook 独立权重，4-bit）
                16 个顺序步骤 → 8 个助手音频 codebook token
                                          ↓
[助手音频 24kHz] ← Mimi 解码器 ← 8 个 codebook token @ 12.5Hz
```

## 复用 Mimi 编解码器

这正是构建库（而非独立移植）的价值所在。PersonaPlex 使用与 Kyutai 的 Moshi 完全相同的 Mimi 音频编解码器。我们从之前的 TTS 工作中已经有了一个完整、经过测试的 Mimi 实现：SEANet 编码器/解码器、流式卷积、8 层 transformer 瓶颈、Split RVQ。我们直接将其复制到 PersonaPlex 目标中。核心编解码器零改动。

HuggingFace 下载器、WAV I/O、KV cache、RoPE、SwiGLU 和 RMSNorm 也是如此——所有这些都在之前三个模型中经过实战检验。

## Depformer：每步权重切换

最创新的组件是 Depformer，它按顺序生成音频 codebook——一次一个，每个时间步 16 步。每步通过 `MultiLinear` 模式使用**不同的权重**：

```swift
public func callAsFunction(_ xs: MLXArray, step: Int) -> MLXArray {
    let start = step * outDim
    let end = start + outDim
    let w = weight[start..<end, 0...]  // 为此步切片权重
    if let s = scales, let b = biases {
        // 4-bit 量化路径
        return quantizedMM(xs, w, scales: s[start..<end, 0...],
                           biases: b[start..<end, 0...],
                           transpose: true, groupSize: groupSize, bits: bits)
    }
    return xs.matmul(w.T)
}
```

一个权重张量，没有模块开销，只是切片和乘法。通过 4-bit 量化，Depformer 从约 2.4 GB 降到约 650 MB——3.7 倍压缩，在 ASR 往返测试中没有可测量的质量损失。

## 系统提示：区分闲聊和有用的回复

PersonaPlex 接受文本系统提示来引导对话行为。没有聚焦的指令，模型会漫无目的地闲聊——它在开放式对话上训练，被问到发货问题时可能会开心地讨论烹饪。

通过 CLI（`--list-prompts`）或 API 可以使用多个预设，包括通用助手（默认）、客服代理和教师。自定义提示也可以预分词后直接传入。

差异是显著的。同样的输入——"你能保证替换件明天发货吗？"：

**无提示：** *"那么，你喜欢什么类型的烹饪——户外烧烤？我不能确定，但如果你今天订购……"*

**有提示：** *"我不能承诺具体时间，但我们会尽力明天发货。这是最高优先级之一，所以是的，我们会尽快完成并在第一时间发出。"*

## 性能：真实数据

以下是 PersonaPlex 在 M2 Max（64 GB）上的运行数据，以及库中其他模型的对比：

| 模型 | 参数量 | 量化 | 内存 | RTF |
|------|--------|------|------|-----|
| Qwen3-ASR 0.6B | 0.6B | 4-bit | ~1.2 GB | 0.03 |
| Qwen3-TTS 0.6B | 0.6B | 4-bit | ~1.8 GB | 0.35 |
| CosyVoice3 0.5B | 0.5B | 4-bit | ~1.0 GB | 0.40 |
| **PersonaPlex 7B** | 7B | 4-bit | ~5.3 GB | **0.87** |

关于 RTF（实时因子）：低于 1.0 意味着比实时更快——模型产生输出的速度比你听的速度快。两个 transformer 都量化到 4-bit 后，PersonaPlex 现在**比实时更快**运行，约 68ms/步——轻松低于 12.5 Hz 下的 80ms 帧预算。

## 往返验证：一个库，端到端

在同一个库中拥有 ASR、TTS 和语音到语音的一个优势：端到端测试变得简单。我们通过 ASR 往返来验证 PersonaPlex 输出：

```swift
import Qwen3ASR
import PersonaPlex

// 转录输入
let asrModel = try await Qwen3ASRModel.fromPretrained()
let inputTranscript = asrModel.transcribe(audio: inputAudio, sampleRate: 16000)
// → "你能保证替换件明天发货吗？"

// 生成语音回复
let ppModel = try await PersonaPlexModel.fromPretrained()
let responseAudio = ppModel.respond(userAudio: inputAudio, voice: .NATM0)

// 转录回复以验证
let responseTranscript = asrModel.transcribe(audio: responseAudio, sampleRate: 16000)
// → "我不能承诺具体时间，但我们会尽力明天发货..."
```

这就是我们 E2E 测试的工作方式——库通过检查往返转录中的主题相关关键词来验证 PersonaPlex 输出。离线（`respond()`）和流式（`respondStream()`）路径都这样测试。

## 流式支持已就绪

回顾这个库的发展轨迹——ASR、流式 TTS、多语言合成，现在是语音到语音——清晰的方向一直是**流式语音处理**。在这个版本中，PersonaPlex 支持它了。

`respondStream()` 返回一个 `AsyncThrowingStream<AudioChunk>`，在生成过程中发出音频块。每个块约 2 秒的 24kHz 音频，通过 Mimi 的流式解码器增量解码：

```swift
let stream = model.respondStream(userAudio: audio, voice: .NATM0)
for try await chunk in stream {
    playAudio(chunk.samples)  // 立即播放，24kHz 单声道
    if chunk.isFinal { break }
}
```

从 CLI 使用：

```bash
.build/release/audio respond --input question.wav --stream --verbose --output response.wav
```

## 性能优化

四项优化将 PersonaPlex 推向实时：

1. **eval() 整合**：将每个生成步骤的 GPU 同步屏障从 3 个减少到 1 个，让 MLX 的惰性求值图融合更多操作。

2. **批量音频提取**：在 Mimi 解码期间，用单个 `.asArray(Float.self)` 替换了 384K 次单独的 `.item(Float.self)` 调用。

3. **预填充批处理**：将语音提示（50 帧）和非语音预填充作为单批次前向传播运行，替代了约 300 个单独步骤。

4. **编译时序 transformer**：通过 `compile(shapeless: true)` 将每步约 450 次 Metal 内核调度融合为优化内核——通过 `model.warmUp()` 或 `--compile` 标志启用。

这些遵循了我们在 TTS 移植中验证的相同模式——整合 eval 屏障、尽可能批处理、编译自回归循环。时序 transformer 编译使用显式的 `[MLXArray]` 输入/输出处理 KV cache 数组（避免会导致 `shapeless: true` 崩溃的 Slice 操作），RoPE 偏移作为 `MLXArray` 输入传递而非被烘焙为常量的 Int。

## 立即体验

```bash
# 克隆并构建
git clone https://github.com/ivan-digital/qwen3-asr-swift
cd qwen3-asr-swift
swift build -c release

# 语音到语音（首次运行下载约 5.3 GB）
.build/release/audio respond --input your_audio.wav --output response.wav --voice NATM0

# 流式语音到语音（生成过程中发出音频块）
.build/release/audio respond --input your_audio.wav --stream --output response.wav

# 使用编译的时序 transformer（Metal 内核融合）
.build/release/audio respond --input your_audio.wav --compile --stream --output response.wav

# 或使用其他模型：
.build/release/audio transcribe audio.wav                              # ASR
.build/release/audio speak "Hello world" --output hello.wav           # TTS
.build/release/audio speak "Hallo Welt" --engine cosyvoice --language german  # 多语言 TTS
```

量化模型在 [aufklarer/PersonaPlex-7B-MLX-4bit](https://huggingface.co/aufklarer/PersonaPlex-7B-MLX-4bit)。完整库源码在 [ivan-digital/qwen3-asr-swift](https://github.com/ivan-digital/qwen3-asr-swift)。

---

## 小结

这篇文章展示了在 Apple Silicon 上运行大型语音模型的令人兴奋的进展：

- **单模型架构**：PersonaPlex 将 ASR→LLM→TTS 三阶段流水线简化为一个端到端模型，大幅降低延迟
- **高效的 4-bit 量化**：将 16.7 GB 模型压缩到 5.3 GB，RTF 达到 0.87（比实时更快）
- **原生 Swift 实现**：完全基于 MLX 框架，无需 Python 依赖，适合 macOS/iOS 应用集成
- **流式处理**：支持实时音频块输出，适合对话场景

对于想在 Apple 设备上构建语音交互应用的开发者，这提供了一个值得关注的纯 Swift 解决方案。

*本文基于 NVIDIA（PersonaPlex）、Kyutai（Moshi 和 Mimi）、阿里 Qwen 团队（ASR 和 TTS 模型）、FunAudioLLM（CosyVoice）和 Apple 的 MLX 框架的工作。*
