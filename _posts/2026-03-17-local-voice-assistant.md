---
layout: post
title: "构建可靠且好用的本地化语音助手实践指南"
date: 2026-03-17 02:32:58 +0800
categories: tech-translation
description: "本文详细介绍了如何使用 Home Assistant 和本地 LLM 构建一个完全本地化的语音助手系统，涵盖硬件选型、模型选择、Prompt 优化以及各种实用功能的实现。"
original_url: https://community.home-assistant.io/t/my-journey-to-a-reliable-and-enjoyable-locally-hosted-voice-assistant/944860
source: Hacker News
---

本文翻译自 [My Journey to a reliable and enjoyable locally hosted voice assistant](https://community.home-assistant.io/t/my-journey-to-a-reliable-and-enjoyable-locally-hosted-voice-assistant/944860)，原载于 Home Assistant Community。

## 背景

作者一直关注 Home Assistant 在语音助手方面的进展。他们之前使用 Google Home（通过 Nest Mini），现在已经切换到完全本地的语音助手，后端使用 local-first + llama.cpp（之前是 Ollama）。

## 问题所在

在过去一两年里，作者发现通过 Nest Mini 使用的 Google Assistant 变得越来越"笨"，而且没有带来任何新功能。经常遇到"抱歉，我帮不了你"或"我不知道答案，但根据 XYZ 来源..."这样的回复。整体能用，但不可靠，回答随意问题时很麻烦。

此外，还有隐私方面的担忧——家里到处都是联网的麦克风，而且每次 AWS 或其他服务宕机时，就无法用语音控制家里的灯了。

## 硬件配置

### 语音硬件

- 1 个 HA Voice Preview Edition Satellite
- 2 个 Satellite1 Small Squircle 外壳
- 1 个 Pixel 7a 作为卫星/集线器，使用 View Assist

### 语音服务器硬件

- 带 USB4 的 Beelink MiniPC（只要有 USB4，具体型号不重要）
- USB4 eGPU 外壳

### GPU 性能对比

| GPU | 支持模型规模 | 响应时间（Prompt 缓存后） | 备注 |
|-----|------------|------------------------|------|
| RTX 3090 24GB | 20B-30B MoE, 9B Dense | 1-2 秒 | 高效快速运行此设置最优的模型 |
| RX 7900XTX 24GB | 20B-30B MoE, 9B Dense | 1-2 秒 | 高效快速运行此设置最优的模型 |
| RTX 5060Ti 16GB | 20B MoE, 9B Dense | 1.5-3 秒 | 足够快，响应 <3 秒 |
| RX 9060XT 16GB | 20B MoE, 9B Dense | 1.5-4 秒 | 足够快，响应 <4 秒 |
| RTX 3050 8GB | 4B Dense | 3 秒 | 适合运行基本功能的小模型 |

## 模型选择

作者测试了多个模型，以下是一些关键能力对比：

| 模型 | 多设备工具调用 | 上下文理解 | 解析误听命令 | 忽略误触发 |
|------|------------|----------|------------|----------|
| GGML GPT-OSS:20B MXFP4 | 🟢 | 🟢 | 🟢 | 🟢 |
| Unsloth Qwen3.5-35B-A3B MXFP4_MOE | 🟢 | 🟡 | 🟡 | 🟢 |
| Unsloth Qwen3-VL:8B-Instruct Q6_K_XL | 🟢 | 🟢 | 🟡 | 🟡 |
| Unsloth GLM 4.7 Flash (30B) Q4_K_XL | 🟡 | 🟢 | 🔴 | 🟡 |

**能力说明：**
1. 处理"打开风扇并关闭灯"这类命令
2. 理解当前位置，当房间只有一个灯时不再问"哪个灯？"
3. 解析误听的命令（如把"pan"理解为"fan"）并正确执行
4. 可靠地忽略误触发产生的无用输入

## 语音服务器软件

### 模型运行器

推荐使用 **llama.cpp** 以获得最佳性能。

### 语音转文字（Speech to Text）

| 软件 | 模型 | 备注 |
|------|------|------|
| Wyoming ONNX ASR | Nvidia Parakeet V2 | 通过 OpenVINO 分支运行，CPU 推理时间优化到约 0.3 秒 |
| Rhasspy Faster Whisper | Nvidia Parakeet V2 | 直接通过 ONNX CPU 运行，比 OpenVINO 慢 |

### 文字转语音（Text to Speech）

| 软件 | 备注 |
|------|------|
| Kokoro TTS | 支持混合多个声音/语调获得理想输出，处理各种文本效果好 |
| Piper (CPU) | 有多种声音可选，通用文本可以，但对货币、电话号码、地址处理不佳 |

### Home Assistant LLM 集成

- [LLM Conversation](https://github.com/skye-harris/hass_local_openai_llm) - 改进基础对话体验
- [LLM Intents](https://github.com/skye-harris/llm_intents) - 为 Assist 提供额外工具（网络搜索、地点搜索、天气预报）

## 入门经验

作者最初尝试使用 Ollama 内置的模型。每隔几周就会连接 Ollama 到 HA，启动 Assist 试用，每次都很失望——基本工具调用都无法正常工作。

**关键发现**：Ollama 官网上展示的模型远不是可以运行的全部。更糟糕的是，默认的 `:4b` 模型通常是低量化版本（Q4_K），会导致很多问题。当作者学会使用 HuggingFace 查找更高量化的 GGUF 模型后，Assist 的表现立即大幅提升，工具调用也没有问题了。

## Prompt 的重要性

这是最关键的发现：**Prompt 会决定你的语音体验成败**。默认的 HA Prompt 效果有限，因为 LLM 需要大量指导才能知道何时做什么。

### Prompt 优化方法

作者通过以下方式改进 Prompt：
1. 将当前 Prompt 放入 ChatGPT
2. 描述当前行为和期望行为
3. 反复尝试直到获得一致的理想结果

**示例 Prompt 结构**（参考 [作者的 Gist](https://gist.github.com/NickM-27/b83d2c8434cb7b01f27adf85638b1df1)）：

```markdown
# Identity
You are 'Robot', a versatile AI assistant...

# Response Format
- Speak in natural, conversational tone suitable for TTS
- Be concise, clear, and professional
- Be efficient and direct

# Weather
When asked about weather, ALWAYS call the weather tool...

# Handling Unclear Requests
When input is unclear, respond with "Can you repeat that?"
NEVER provide examples or list options...
```

### 优化天气查询

第一个挑战是让 LLM 调用天气服务。作者发现，为每个重要服务设置专门的 `#` 标题部分配合项目符号列表效果最好。

然后需要让天气响应格式化成想要的样子，不要额外评论如"听起来是个美好的夏日！"这类内容。给出具体的输出示例最有效。

### 消除 Emoji 问题

很多响应会以笑脸结尾，这对 TTS 不友好。需要在 Prompt 中添加专门的部分来完全消除这个问题。

## 自动化解决方案

有些功能通过 LLM 直接执行不是最佳方案。作者以音乐播放为例，创建了句子触发自动化：

```yaml
alias: Music Shortcut
triggers:
  - trigger: conversation
    command:
    - Play {music}
    id: play
  - trigger: conversation
    command: Stop playing
    id: stop
actions:
  - choose:
    - conditions:
      - condition: trigger
        id: play
      sequence:
      - action: music_assistant.play_media
        data:
          media_id: "{{ trigger.slots.music }}"
        target:
          entity_id: "{{ target_player }}"
      - set_conversation_response: Playing {{ trigger.slots.music }}
variables:
  satellite_player_map: |
    {{
    {
    "assist_satellite.home_assistant_voice_xyz123": "media_player.my_desired_speaker",
    }
    }}
  target_player: |
    {{ satellite_player_map.get(trigger.satellite_id, "media_player.default_speaker") }}
```

## 自定义唤醒词训练

默认的唤醒词选项不能满足家庭需求。作者选择了"Hey Robot"作为唤醒词。

使用 [microWakeWord-Trainer-Nvidia-Docker](https://github.com/TaterTotterson/microWakeWord-Trainer-Nvidia-Docker) 在 GPU 上训练，只需约 30 分钟，效果相当不错。虽然有些误触发，但整体比率与被替换的 Google Home 相似。

## 高级功能实现

### 天气查询覆盖

作者发现使用 `What is the weather?` 会得到无意义的回答，但 `What is the weather today?` 能正确使用 llm_intents。原因是 Home Assistant 有本地的 `HassGetWeather` intent，但没有暴露天气实体。

解决方案是创建自动化覆盖本地 intent：

```yaml
alias: Override HassGetWeather
triggers:
  - trigger: conversation
    command:
    - What is the weather
    - What's the weather
    - How is the weather
actions:
  - action: weather.get_forecasts
    target:
      entity_id: weather.forecast
    data:
      type: hourly
    response_variable: hourly_forecast
  # ... 格式化预报数据
  - action: ai_task.generate_data
    data:
      task_name: Summarize Weather
      instructions: |
        You are a weather forecaster. Summarize the forecast
        in one to two sentences...
  - set_conversation_response: "{{ summary.data }}"
```

### 处理不清晰请求

假期家庭来访暴露了唤醒词激活的问题。更大的问题是误触发时 LLM 总是以问题结束，造成循环。作者优化了 Prompt：

```yaml
# Handling Unclear Requests

When you receive input, FIRST determine if it is a request directed at you:

## Identify Questions First (Highest Priority)
- If input contains any question (question marks, interrogative phrasing)
  treat it as a request for information and ANSWER IT

## When to Remain Silent
- If input is a complete STATEMENT (not a question) that appears to be
  conversation not directed at you: respond "Sorry." without follow-up

## When to Ask for Repetition
- If input seems garbled but appears to be an attempt to ask something:
  respond "Can you repeat that?"

## When to Ask for Specific Clarification
- If you understand user wants to do something but don't know which device:
  ask ONLY the question: "Which room?" or "Which device?"
- NEVER provide examples or say "for example" when asking for clarification
```

### 摄像头分析

作者创建了一个脚本，结合 Frigate 和 Home Assistant 集成来分析摄像头画面。这使得可以问 Home Assistant "谁在我门口？"或"后院有什么动静？"这类问题。

该脚本会：
1. 获取当前摄像头图像
2. 发送给 AI Task（需要视觉能力模型）
3. 结合 Frigate 的对象检测信息
4. 生成自然的语音回复

## 总结

作者坦言不推荐普通 Home Assistant 用户尝试这套方案，需要大量耐心和研究来理解问题并找到解决方案。但好处是——大部分方面都可以调整优化。

**最终目标已经实现**：拥有一个更好用的本地语音助手，没有隐私顾虑，核心任务可靠处理。

---

## 关键要点

1. **模型选择很关键**：不要只看 Ollama 官网的模型，去 HuggingFace 找高质量量化的 GGUF 模型
2. **Prompt 决定体验**：花时间打磨 Prompt，给出具体示例，为不同场景设置专门指令
3. **上下文窗口管理**：暴露的实体描述 + 工具描述 + Prompt 不能超过模型的上下文窗口
4. **善用自动化**：某些功能用句子触发自动化可能比让 LLM 处理更可靠
5. **硬件投入**：16GB 显存的 GPU 可以运行不错的模型，24GB 会更从容
6. **语音链路优化**：使用 OpenVINO 优化的 STT 可以将推理时间降到 0.3 秒

对于想动手的读者，建议从硬件评估开始，根据自己的期望（响应速度、功能复杂度）选择合适的 GPU 和模型组合。整个系统的调优是一个持续迭代的过程，但完全本地化的语音控制体验是值得的。
