---
layout: post
title: "Rust 应用性能监控：OpenTelemetry 实战指南"
date: 2026-03-14 08:03:40 +0800
categories: tech-translation
description: "本文介绍如何使用 OpenTelemetry 为 Rust 应用程序实现端到端的性能追踪和监控，包括完整的代码示例和 SigNoz 后端配置。"
original_url: https://signoz.io/blog/opentelemetry-rust/
source: Hacker News
---

本文翻译自 [Implementing OpenTelemetry in a Rust application for performance monitoring](https://signoz.io/blog/opentelemetry-rust/)，原载于 Hacker News。

![Monitor your Rust applications with SigNoz](https://signoz.io/img/blog/2024/12/opentelemetry-rust-cover.webp)

Rust 是一门注重性能和安全性的多范式编程语言，尤其在安全并发方面表现出色。在生产环境中运行 Rust 应用时，如何有效监控其性能表现是一个关键问题。OpenTelemetry 提供了一套完整的解决方案，可以帮助我们追踪 Rust 应用的性能问题和潜在 bug。

## OpenTelemetry 是什么？

OpenTelemetry 是云原生计算基金会（CNCF）旗下的开源项目，旨在标准化遥测数据（telemetry data）的生成和收集。遥测数据包括三个核心组成部分：

- **Logs（日志）**：应用运行时的文本记录
- **Metrics（指标）**：数值化的性能数据
- **Traces（追踪）**：请求在分布式系统中的完整调用链

![OpenTelemetry libraries](https://signoz.io/img/blog/2022/09/opentelemetry_architecture.webp)

_OpenTelemetry 库用于插桩应用代码，生成遥测数据后发送到可观测性工具进行存储和可视化_

OpenTelemetry 最大的优势在于**厂商中立**——你不会被锁定在任何特定的监控工具上，可以自由选择后端分析平台。这为构建可观测性框架提供了坚实的基础。

## 为什么选择 SigNoz？

在本教程中，我们使用 **SigNoz** 作为后端分析工具。SigNoz 是一个全栈开源 APM（应用性能监控）工具，具有以下特点：

- 原生支持 OpenTelemetry，直接使用 OTLP 数据格式
- 提供开箱即用的应用指标、日志和追踪图表
- 强大的查询和可视化能力
- 支持 self-host 或云服务两种部署方式

## 实战：为 Rust 应用集成 OpenTelemetry

### 前置准备

首先，注册一个 SigNoz Cloud 账户。你可以获得 30 天的免费试用，体验所有功能。当然，作为开源项目，你也可以选择 self-host 部署。

注册完成后，你会收到访问 SigNoz UI 的 URL 和相关的认证信息。

### Step 1: 配置 Cargo.toml 依赖

在你的 `Cargo.toml` 文件中添加 OpenTelemetry 相关依赖：

```toml
[dependencies]
opentelemetry = { version = "0.18.0", features = ["rt-tokio", "metrics", "trace"] }
opentelemetry-otlp = { version = "0.11.0", features = ["trace", "metrics"] }
opentelemetry-semantic-conventions = { version = "0.10.0" }
opentelemetry-proto = { version = "0.1.0"}
tokio = { version = "1", features = ["full"] }
tonic = { version = "0.8.2", features = ["tls-roots"] }
dotenv = "0.15"
```

**各依赖说明：**

- `opentelemetry`: 核心库，提供 tracing、metrics 等功能
- `opentelemetry-otlp`: OTLP 协议导出器，负责将追踪数据发送到 SigNoz
- `opentelemetry-semantic-conventions`: 定义标准的追踪属性名称（如 `service.name`）
- `tokio`: 异步运行时，OpenTelemetry 的异步操作依赖它
- `tonic`: 用于通过 gRPC 发送追踪数据
- `dotenv`: 从 `.env` 文件加载环境变量，保护敏感配置

### Step 2: 在 main.rs 中导入模块

```rust
use opentelemetry::global::shutdown_tracer_provider;
use opentelemetry::sdk::Resource;
use opentelemetry::trace::TraceError;
use opentelemetry::{
    global, sdk::trace as sdktrace,
    trace::{TraceContextExt, Tracer},
    Context, Key, KeyValue,
};
use opentelemetry_otlp::WithExportConfig;
use tonic::metadata::{MetadataMap, MetadataValue};
use dotenv::dotenv;
```

### Step 3: 初始化 Tracer

创建一个函数来初始化 OpenTelemetry 管道：

```rust
fn init_tracer() -> Result<sdktrace::Tracer, TraceError> {
    let signoz_ingestion_key = std::env::var("SIGNOZ_INGESTION_KEY")
        .expect("SIGNOZ_INGESTION_KEY not set");
    let mut metadata = MetadataMap::new();
    metadata.insert(
        "signoz-ingestion-key",
        MetadataValue::from_str(&signoz_ingestion_key).unwrap(),
    );
    opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(
            opentelemetry_otlp::new_exporter()
                .tonic()
                .with_metadata(metadata)
                .with_endpoint(std::env::var("SIGNOZ_ENDPOINT").expect("SIGNOZ_ENDPOINT not set")),
        )
        .with_trace_config(
            sdktrace::config().with_resource(Resource::new(vec![
                KeyValue::new(
                    opentelemetry_semantic_conventions::resource::SERVICE_NAME,
                    std::env::var("APP_NAME").expect("APP_NAME not set"),
                ),
            ])),
        )
        .install_batch(opentelemetry::runtime::Tokio)
}
```

**关键点解析：**

- `signoz_ingestion_key`: 从环境变量获取 SigNoz 的认证密钥
- `MetadataMap`: 将认证信息添加到遥测数据的元数据中
- `with_exporter`: 配置导出器，指定 SigNoz 的端点地址
- `with_trace_config`: 设置追踪配置，包括服务名称
- `install_batch`: 以批处理模式安装 tracer，使用 Tokio 作为异步运行时

### Step 4: 创建 .env 配置文件

在项目根目录创建 `.env` 文件：

```
PORT=1337
APP_NAME=rust-sample
SIGNOZ_ENDPOINT=https://ingest.us.signoz.cloud:443/v1/traces
SIGNOZ_INGESTION_KEY=XXXXXXXXXX
```

**配置说明：**

- `PORT`: 应用运行的端口
- `APP_NAME`: 你的 Rust 应用名称，会在 SigNoz 中显示
- `SIGNOZ_INGESTION_KEY`: SigNoz 提供的认证密钥（需要在 SigNoz 控制台生成）
- `SIGNOZ_ENDPOINT`: 数据接收端点，根据你选择的区域不同：

| 区域 | 端点 |
|------|------|
| US | ingest.us.signoz.cloud:443/v1/traces |
| IN | ingest.in.signoz.cloud:443/v1/traces |
| EU | ingest.eu.signoz.cloud:443/v1/traces |

### Step 5: 在 main 函数中初始化

将 `main` 函数改为异步，并加载配置：

```rust
#[tokio::main]
async fn main() {
    dotenv().ok();
    let _ = init_tracer();

    let tracer = global::tracer("global_tracer");
    let _cx = Context::new();

    tracer.in_span("operation", |cx| {
        let span = cx.span();
        span.set_attribute(Key::new("KEY").string("value"));

        span.add_event(
            format!("Operations"),
            vec![
                Key::new("SigNoz is").string("Awesome"),
            ],
        );
    });
    shutdown_tracer_provider()
}
```

**Span 操作说明：**

- `tracer.in_span`: 创建名为 "operation" 的 span，代表一个操作
- `span.set_attribute`: 为 span 设置属性，用于过滤和分组
- `span.add_event`: 添加事件，记录 span 生命周期中的特定时间点
- `shutdown_tracer_provider`: 关闭 tracer，确保所有数据发送完毕

### Step 6: 运行应用

```bash
cargo run
```

打开浏览器访问 `http://localhost:1337`，你的应用应该正常运行了。

![Rust app running](https://signoz.io/img/blog/2024/12/rust-app-running.webp)

### Step 7: 生成遥测数据

访问应用的首页，或者使用 curl 发送请求来生成追踪数据：

```bash
curl -d "name=test&number=42" \
-H "Content-Type: application/x-www-form-urlencoded" \
-X POST http://localhost:1337/post
```

## 在 SigNoz 中监控应用

现在登录 SigNoz 控制台，你可以看到应用的遥测数据。

### Services 视图

在 `Services` 标签页，你会看到你的 Rust 应用出现在被监控的服务列表中：

![Rust application being monitored](https://signoz.io/img/blog/2024/12/services-tab-rust.webp)

### Traces 视图

进入 `Traces` 标签页，选择你的 `rust-app`，可以查看追踪数据。你可以使用各种过滤器（标签、状态码、服务名、操作名）来深入分析：

![Use filters to analyze tracing data](https://signoz.io/img/blog/2024/12/traces-tab-rust.webp)

### Flamegraph 分析

SigNoz 提供了 Flamegraph（火焰图）和 Gantt 图，让你可以详细了解请求的执行情况，包括每个操作耗时和 span 属性：

![Flamegraphs for detailed trace analysis](https://signoz.io/img/blog/2024/12/flamegraphs-rust.webp)

点击 Spans 表中的任意 span，可以深入查看追踪详情，了解应用在不同操作和服务间的性能表现。

## 个人经验分享

在 Rust 项目中集成 OpenTelemetry 有几个值得注意的点：

1. **异步运行时选择**：确保 OpenTelemetry 的异步特性与你使用的运行时（Tokio、async-std 等）兼容
2. **版本一致性**：OpenTelemetry 的各个 crate 版本需要保持兼容，建议使用相同的 minor 版本
3. **资源管理**：记得在应用退出时调用 `shutdown_tracer_provider()`，否则可能丢失最后的遥测数据
4. **性能影响**：虽然 OpenTelemetry 设计轻量，但在高吞吐场景下建议采样而非全量追踪

## 总结

使用 OpenTelemetry 为 Rust 应用实现可观测性是一个明智的选择。它不仅提供了标准化的遥测数据收集方式，还让你拥有选择后端工具的自由。配合 SigNoz 这样的开源 APM 工具，你可以构建完整的监控体系，确保应用在生产环境中的稳定运行。

**关键要点：**

- OpenTelemetry 是 CNCF 旗下的开源标准，支持 logs、metrics、traces 三种遥测数据
- Rust 的 OpenTelemetry 集成需要配置 OTLP exporter 和适当的异步运行时
- SigNoz 提供开箱即用的可视化能力，支持 self-host 和云服务两种部署方式
- Span 是追踪的核心单元，通过属性和事件可以添加丰富的上下文信息

OpenTelemetry 是云原生应用可观测性的未来，拥有活跃的社区支持，覆盖了广泛的技术栈和框架。使用 OpenTelemetry，工程团队可以放心地为多语言、分布式应用实现可观测性。
