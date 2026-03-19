---
layout: post
title: "GreenBoost：用 DDR4 内存和 NVMe 扩展你的 GPU 显存"
date: 2026-03-19 20:51:07 +0800
categories: tech-translation
description: "GreenBoost 是一个 Linux 内核模块，通过 DMA-BUF 技术将 GPU 显存透明扩展到系统 DDR4 内存和 NVMe 存储，让你能在 12GB 显存的消费级显卡上运行 32GB 的大语言模型。"
original_url: https://gitlab.com/IsolatedOctopi/nvidia_greenboost
source: Hacker News
---

本文翻译自 [GreenBoost — 3-Tier GPU Memory Extension for Linux](https://gitlab.com/IsolatedOctopi/nvidia_greenboost)，原载于 Hacker News。

---

## 背景：消费级显卡的显存困境

作者手里有一张 RTX 5070，12GB 显存。想跑 `glm-4.7-flash:q8_0` 这个 31.8GB 的模型，但传统方案都不太理想：

- **CPU Offload**：把层卸载到 CPU 内存，token/s 会掉 5-10 倍，因为 CPU RAM 没有 CUDA 一致性
- **更小的量化**：用 q4_0 量化，模型推理能力明显下降
- **买更大的显卡**：48GB 的显卡价格比一整台工作站还贵

于是作者做了一个替代方案：**通过 DMA-BUF 把溢出的显存路由到 DDR4，让 GPU 通过 PCIe 4.0 直接访问系统内存，无需 CPU 拷贝**。

## GreenBoost 是什么

GreenBoost 是一个 **Linux 内核模块 + CUDA 用户空间 shim**，它可以在不修改推理软件的情况下，透明地扩展 GPU 显存。

**重要说明**：GreenBoost 并不替换或修改 NVIDIA 官方内核驱动（`nvidia.ko`、`nvidia-uvm.ko`）。它作为完全独立的内核模块加载，工作在 CUDA 分配层而非驱动层。

### 系统要求

作者的测试环境：
- CPU: i9-14900KF
- GPU: RTX 5070 12GB (Blackwell, compute capability 12.0)
- 内存: 64GB DDR4-3600
- SSD: Samsung 990 EVO Plus 4TB NVMe
- 系统: Ubuntu 26.04, kernel 6.19, NVIDIA driver 580.x

## 技术原理

### 1. 内核模块 (`greenboost.ko`)

使用 buddy 分配器分配固定的 DDR4 页面（2MB 复合页面以提高效率），并将其导出为 DMA-BUF 文件描述符。GPU 可以通过 `cudaImportExternalMemory` 将这些页面导入为 CUDA 外部内存。

从 CUDA 的角度看，这些页面就像设备可访问的内存——它根本不知道这些数据实际存储在系统 RAM 中。PCIe 4.0 x16 链路处理实际的数据传输（~32GB/s）。

还有一个 sysfs 接口（`/sys/class/greenboost/greenboost/pool_info`）让你实时监控使用情况。一个看门狗内核线程监控 RAM 和 NVMe 压力，在情况危险之前向用户空间发送信号。

### 2. CUDA Shim (`libgreenboost_cuda.so`)

通过 `LD_PRELOAD` 注入，拦截以下函数：
- `cudaMalloc`, `cudaMallocAsync`, `cuMemAllocAsync`
- `cudaFree`, `cuMemFree`

**工作流程**：
- 小于 256MB 的分配直接走真正的 CUDA 运行时
- 大的分配（KV cache、溢出的模型权重）被重定向到内核模块，然后导入回 CUDA 设备指针

**一个技术难点**：Ollama 内部通过 `dlopen` + `dlsym` 解析 GPU 符号，这会绕过 LD_PRELOAD。为了处理这个问题，shim 还会拦截 `dlsym` 本身（使用带 GLIBC 版本标签的 `dlvsym` 来获取真正的指针而不会递归），返回 hook 后的 `cuDeviceTotalMem_v2` 和 `nvmlDeviceGetMemoryInfo`。没有这个技巧，Ollama 只能看到 12GB，会把层放到 CPU 上。

## 三层内存架构

| 层级 | 设备 | 容量 | 带宽 | 用途 |
|------|------|------|------|------|
| T1 | RTX 5070 VRAM | 12 GB | ~336 GB/s | 热层、活跃计算 |
| T2 | DDR4 池 | 51 GB | ~32 GB/s (PCIe 4.0) | KV cache、冷权重 |
| T3 | NVMe swap | 64 GB | ~1.8 GB/s | 安全溢出（很少触及） |

对于 32GB 的模型：T1 存放热层，T2 存放其余部分。T3 作为安全网存在，但在实际使用中，模型 + 32K 上下文的 KV cache 可以舒适地放在 T1+T2 中。

## 性能实测

测试模型：`glm-4.7-flash:q8_0`，RTX 5070

| 配置 | Decode tok/s | TTFT |
|------|-------------|------|
| Ollama + GreenBoost shim（基线） | 2–5 | 5–15s |
| + kvpress 50% KV 压缩 | 4–8 | 3–10s |
| ExLlamaV3 + GreenBoost cache | 8–20 | 2–8s |
| ModelOpt FP8（16GB 模型） | 10–25 | 1–5s |
| ExLlamaV3 EXL3 2bpw（8GB，全 VRAM） | 25–60 | 0.5–2s |

**瓶颈分析**：PCIe 4.0 链路（~32GB/s）是模型溢出 VRAM 时的瓶颈。最佳策略是通过 EXL3 量化或 ModelOpt PTQ 缩小模型，让它能放入显存，然后用 GreenBoost 的 DDR4 池专门放 KV cache。

## 安装与使用

```bash
git clone https://gitlab.com/IsolatedOctopi/nvidia_greenboost.git
cd nvidia_greenboost

# 自动检测 GPU VRAM、RAM 大小、CPU P/E 核拓扑、NVMe 容量
# 并在安装时计算最优参数：
sudo ./greenboost_setup.sh full-install

# 重启后验证一切正常：
sudo ./greenboost_setup.sh diagnose
```

安装程序会构建内核模块和 shim，设置 NVMe swap 文件，配置 Ollama 的 systemd 环境，并应用 sysctl 调优。

### 快速使用示例

```bash
# 正常运行 Ollama — GreenBoost 是透明的
ollama run glm4:latest

# ExLlamaV3 + GreenBoost DDR4 KV cache offload:
./tools/greenboost-exllama.sh --model /opt/models/glm-4.7-flash-exl3

# 将 HuggingFace 模型转换为 EXL3 格式 (4bpw → ~16GB):
./tools/convert_to_exl3.sh --model THUDM/glm-4.7-flash-hf --bpw 4.0

# FP8 量化（32GB → ~16GB，无需重训练）:
python tools/greenboost-ptq.py --model THUDM/glm-4.7-flash-hf --quant fp8

# 运行时 KV cache 压缩基准测试:
./tools/greenboost-kvpress.sh --model THUDM/glm-4.7-flash-hf --benchmark

# 实时监控内存层:
watch -n1 'cat /sys/class/greenboost/greenboost/pool_info'
```

## 打包的推理库

为了充分利用扩展内存，GreenBoost 打包了几个开源库，通过统一的 `optimize-model` 命令集成：

- **ExLlamaV3**：高性能推理引擎，原生支持 GreenBoost KV cache 层。KV 张量直接从 `/dev/greenboost` 分配为零拷贝 mmap → numpy → PyTorch 张量
- **kvpress**：运行时 KV cache 压缩（ExpAttn、SnapKV、KnormPress），在推理时应用，无需重训练
- **NVIDIA ModelOpt**：训练后量化（FP8、INT4-AWQ、NVFP4），只需校准步骤（~512 样本）
- **TensorRT-Edge-LLM**：桌面 RTX GPU 的 TRT 引擎导出
- **Unsloth + LoRA**：参数高效微调，通过 4-bit 基础量化和 rank-16 适配器将 30B 模型放入 12GB VRAM

## GreenBoost 不是什么

- **不是 NVIDIA 驱动的替代品**。`nvidia.ko`、`nvidia-uvm.ko` 和所有 NVIDIA 官方模块继续正常运行。GreenBoost 加载在它们旁边。
- **不是虚拟 GPU**。它不暴露新的 GPU 设备或改变计算工作方式，只影响 CUDA 内存分配的路由方式。
- **不是绕过驱动限制的黑客手段**。它使用的 DMA-BUF + 外部内存导入路径是 CUDA 的文档化功能。
- **没有 NVIDIA 驱动无法工作**。

## 已知限制

- 仅在 kernel 6.19（Ubuntu 26.04）上测试过。更早的内核可能缺少模块依赖的某些导出符号
- `dlsym` hook 是针对 Ollama 解析 CUDA 符号的方式定制的。其他推理引擎（llama.cpp、vllm）可能需要不同的处理
- T3 NVMe 层对随机访问很慢。如果工作负载频繁触及 T3，性能会显著下降
- 主要在 Blackwell（compute capability 12.0）上测试。Ada Lovelace 和 Ampere 理论上应该能工作

## 个人思考

这个项目展示了一个很有意思的思路：**在 CUDA 分配层而不是驱动层做扩展**。通过 DMA-BUF + `cudaImportExternalMemory` 这套 CUDA 原生支持的机制，实现了对推理软件的完全透明。

对于国内用消费级显卡跑大模型的开发者来说，这个方案比纯 CPU offload 要快得多。不过 PCIe 4.0 的 ~32GB/s 带宽相比显存的 ~336GB/s 还是差了一个数量级，所以最佳策略还是量化到能放进显存，然后用 DDR4 池专门放 KV cache。

另外，这个项目只支持 Linux，Windows 用户可能要等等看有没有类似的实现了。

---

**总结**：GreenBoost 通过三层内存架构（VRAM → DDR4 → NVMe）和透明的 CUDA shim，让消费级显卡也能跑超出显存容量的大模型。核心是利用 DMA-BUF 让 GPU 直接访问系统内存，避免 CPU 拷贝开销。对于显存有限但想跑大模型的开发者，值得一试。

*License: GPL v2，作者：Ferran Duarri*
