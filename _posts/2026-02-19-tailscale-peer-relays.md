---
layout: post
title: "Tailscale Peer Relays 正式发布：打造生产级网络中继"
date: 2026-02-19 08:37:29 +0800
categories: tech-translation
description: "Tailscale Peer Relays 现已正式发布，为解决复杂网络环境下的连接问题提供生产级的中继节点方案，支持静态端点配置和完整的可观测性集成。"
original_url: https://tailscale.com/blog/peer-relays-ga
source: Hacker News
---

本文翻译自 [Tailscale Peer Relays is now generally available](https://tailscale.com/blog/peer-relays-ga)，原载于 Hacker News。

## 当网络不那么「配合」时

Tailscale 运作得最好的时候，几乎让人感觉不到它的存在——设备直接互联，数据包走最短路径，性能根本不是需要担心的问题。

但现实世界的网络并不总是那么「配合」。防火墙、NAT（网络地址转换）以及云网络的各种限制，经常会阻断直接的点对点连接。当这种情况发生时，Tailscale 会依赖 DERP 中继来保证流量的安全可靠传输。

今天，我们很高兴地宣布 **Tailscale Peer Relays 已正式发布（GA）**。Peer Relays 将客户自部署、高吞吐量的中继能力带到了生产就绪状态，为你提供一个可以运行在任何 Tailscale 节点上的 tailnet 原生中继选项。

![Peer Relays 工作原理示意图](https://cdn.sanity.io/images/w77i7m8x/production/54ca4bc979f85ed7d8a2fa2fb1d78b431083dafc-1055x630.svg?w=3840&q=75&fit=clip&auto=format)

## 垂直扩展带来的吞吐量提升

我们对 Tailscale Peer Relays 做了显著的吞吐量改进，特别是在多个客户端同时通过中继转发时效果尤为明显：

- **更优的接口选择**：当单个中继内有多个接口或地址族可用时，连接客户端现在会选择更优的接口和地址族，这有助于提升整体连接质量
- **锁竞争优化**：中继节点的吞吐量显著提升，数据包处理更加高效
- **多 UDP socket 支持**：流量现在可以分散到多个 UDP socket 上

这些改进在日常 tailnet 流量中带来了明显的性能和可靠性提升。即使无法建立直接的点对点连接，Peer Relays 现在也能实现接近真正 mesh 网络的性能。

## 为受限云环境提供静态端点

在某些环境中——特别是公有云网络——自动端点发现并不总是可行的。实例可能位于严格的防火墙规则之后，依赖端口转发或对等公有子网中的负载均衡器，或者运行在根本无法开放任意端口的环境中。

**Peer Relays 现在集成了静态端点功能来解决这些限制。** 使用 `tailscale set` 命令的 `--relay-server-static-endpoints` 标志，Peer Relay 可以向 tailnet 广播一个或多个固定的 `IP:port` 对。

![AWS 环境下的静态端点配置](https://cdn.sanity.io/images/w77i7m8x/production/25965fd10d29e2384de6d8b1db1bd39cee38dd3d-1055x630.svg?w=3840&q=75&fit=clip&auto=format)

这些端点可以位于 AWS Network Load Balancer 等基础设施之后，使外部客户端即使在自动端点发现失败的情况下，也能通过 Peer Relay 中继流量。

> **个人观点**：这个功能对国内开发者特别实用。在使用阿里云、腾讯云等国内云厂商时，经常会遇到安全组限制、VPC 网络隔离等问题。静态端点的支持意味着你可以在负载均衡器后面部署中继节点，而不用担心复杂的网络配置。

对于许多用户来说，这也意味着 Peer Relays 可以替代 subnet router（子网路由器），解锁完整的 mesh 部署，同时享受 Tailscale SSH 和 MagicDNS 等核心功能。

## 增强的审计和可观测性

正式发布的 Tailscale Peer Relays 更深度地集成了 Tailscale 的可观测性工具，使中继行为清晰、可度量、可审计：

### tailscale ping 集成

Peer Relays 直接与 `tailscale ping` 集成，你可以：
- 查看是否正在使用中继
- 检查中继是否可达
- 测试中继对延迟和可靠性的影响

这大大减少了故障排查时的猜测工作。

### Prometheus 指标支持

Peer Relays 现在暴露客户端指标，例如：
- `tailscaled_peer_relay_forwarded_packets_total`：转发的数据包总数
- `tailscaled_peer_relay_forwarded_bytes_total`：转发的字节总数

这些指标可以被 Prometheus 和 Grafana 等监控系统采集，让你能够：
- 追踪中继使用情况
- 理解流量模式
- 检测异常
- 大规模监控 tailnet 健康状态

## 实际应用场景

Peer Relays 的正式发布使其成为在真实世界网络中扩展 Tailscale 的核心构建模块：

1. **高吞吐、低延迟连接**：当直连路径不可用时
2. **受限云环境部署**：通过静态端点支持
3. **私有子网中的完整 mesh**：控制入站/出站路径

同时，Peer Relays 不会牺牲 Tailscale 的基础保证：端到端加密、最小权限访问、简单可预测的操作。

## 如何开始

开始使用非常简单。Peer Relays 可以：

- 通过 CLI 在任何支持的 Tailscale 节点上启用
- 通过 ACL 中的 grant 进行控制
- 与现有的中继基础设施并行增量部署

```bash
# 在节点上启用 Peer Relay
tailscale set --relay-server-static-endpoints=1.2.3.4:41641
```

**Peer Relays 对所有 Tailscale 套餐可用，包括免费的个人版。**

---

## 总结

Tailscale Peer Relays 的正式发布解决了几个关键问题：

| 特性 | 解决的问题 |
|------|-----------|
| 高吞吐中继 | 直连不可用时的性能保障 |
| 静态端点 | 受限云环境（如 AWS NLB 后）的部署 |
| 可观测性集成 | 便于故障排查和监控 |

对于在复杂网络环境中使用 Tailscale 的团队来说，这是一个值得升级和尝试的功能。官方文档有更详细的配置说明，建议直接查阅获取最新信息。
