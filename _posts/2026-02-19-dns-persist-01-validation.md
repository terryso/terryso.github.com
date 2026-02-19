---
layout: post
title: "DNS-PERSIST-01：基于 DNS 的证书验证新范式"
date: 2026-02-19 10:50:47 +0800
categories: tech-translation
description: "Let's Encrypt 推出基于 IETF 草案标准的全新 DNS 验证方式，通过持久化授权记录简化证书颁发流程，特别适合 IoT、多租户平台和批量证书操作场景。"
original_url: https://letsencrypt.org/2026/02/18/dns-persist-01.html
source: Hacker News
---

本文翻译自 [DNS-PERSIST-01: A New Model for DNS-based Challenge Validation](https://letsencrypt.org/2026/02/18/dns-persist-01.html)，原载于 Hacker News。

---

当你向 Let's Encrypt 申请证书时，我们的服务器会通过 ACME challenge（挑战）来验证你对证书中主机名的控制权。对于需要通配符证书（wildcard certificates）或不愿意将基础设施暴露到公网的用户来说，DNS-01 挑战类型长期以来一直是唯一选择。

DNS-01 工作良好，广泛支持且久经考验，但它也有运维成本：DNS 传播延迟、续期时需要重复更新 DNS 记录，而且自动化通常需要在整个基础设施中分发 DNS 凭据。

我们正在实现一种新的 ACME 挑战类型：**DNS-PERSIST-01**，基于新的 IETF 草案规范。顾名思义，它使用 DNS 作为验证机制，但用绑定到特定 ACME 账户和 CA 的持久化授权记录，替代了重复的控制权证明。该草案指出，这种方法"特别适合传统挑战方法不适用的环境，如 IoT 部署、多租户平台和需要批量证书操作的场景"。

## DNS-01：重复证明控制权

使用 DNS-01 时，验证依赖于我们生成的一次性令牌。你的 ACME 客户端在 `_acme-challenge.<YOUR_DOMAIN>` 发布一个包含该令牌的 TXT 记录，我们查询 DNS 确认它与预期值匹配。因为每次授权都需要新令牌，DNS 更新成为证书颁发工作流的一部分。

好处是每次成功验证都提供新鲜证明：你当前控制着被颁发域名的 DNS。实际上，这通常意味着：

- DNS API 凭据存在于你的颁发管道某处
- 验证尝试涉及等待 DNS 传播
- DNS 更改频繁发生——在大型部署中有时一天多次

许多用户接受这些权衡，但其他人更希望将 DNS 更新和敏感凭据排除在颁发路径之外。

**DNS-PERSIST-01 采取不同的验证方式。** 不再为每次颁发发布新的挑战记录，而是以 TXT 记录的形式发布一个持久授权，标识 CA 和你授权为该域名颁发的特定 ACME 账户。

对于主机名 example.com，记录位于 `_validation-persist.example.com`：

```
_validation-persist.example.com. IN TXT (
  "letsencrypt.org;"
  " accounturi=https://acme-v02.api.letsencrypt.org/acme/acct/1234567890"
)
```

一旦此记录存在，就可以重复用于新证书颁发和所有后续续期。从运维角度看，这把 DNS 更改从关键路径中移除了。

## 安全和运维权衡

使用 DNS-01 时，敏感资产是 DNS 写权限。在许多部署中，DNS API 凭据分发到颁发和续期管道各处，增加了攻击者可能入侵它们的地方。DNS-PERSIST-01 则将授权直接绑定到 ACME 账户，允许初始设置后更严格控制 DNS 写权限。

权衡在于：因为授权记录持久存在，保护 ACME 账户密钥成为核心关注点。

> **个人见解**：这是一个有趣的安全模型转换。DNS-01 的安全假设是"谁能改 DNS 谁就能拿证书"，而 DNS-PERSIST-01 变成了"谁持有 ACME 账户密钥谁就能拿证书"。对于已经部署了密钥管理基础设施的团队来说，这可能更容易保护。

## 控制范围和生命周期

DNS-PERSIST-01 还引入了明确的范围控制。不带额外参数时，授权仅适用于验证的完全限定域名（FQDN）并无限期有效。

### 通配符证书

添加 `policy=wildcard` 扩大授权范围，包括验证的 FQDN、通配符证书如 `*.example.com`，以及后缀匹配验证 FQDN 的子域名：

```
_validation-persist.example.com. IN TXT (
  "letsencrypt.org;"
  " accounturi=https://acme-v02.api.letsencrypt.org/acme/acct/1234567890;"
  " policy=wildcard"
)
```

### 可选过期时间

对于不满意授权无限期持续的用户，可以包含可选的 `persistUntil` 时间戳。这限制了记录可用于新验证的时长，但也意味着必须在过期前更新或替换。使用此功能的用户应确保有足够的提醒或监控，以免授权意外过期。时间戳表示为自 1970-01-01 以来的 UTC 秒数：

```
_validation-persist.example.com. IN TXT (
  "letsencrypt.org;"
  " accounturi=https://acme-v02.api.letsencrypt.org/acme/acct/1234567890;"
  " persistUntil=1767225600"
)
```

### 授权多个 CA

可以通过在 `_validation-persist.<YOUR_DOMAIN>` 发布多个 TXT 记录来同时授权多个 CA，每个记录包含你打算授权的 CA 的 issuer-domain-name。在验证时，每个 CA 查询相同的 DNS 标签，只评估匹配自己 issuer-domain-name 的记录。

## 推出时间表

CA/Browser Forum 投票 SC-088v3 定义了"3.2.2.4.22 DNS TXT Record with Persistent Value"，于 2025 年 10 月一致通过，IETF ACME 工作组同月采纳了该草案。虽然文档仍是活跃的 IETF 草案，但这里描述的核心机制预计不会有重大变化。

草案规范的支持现已在 Pebble 中提供——这是我们生产 CA 软件 Boulder 的精简版本。lego-cli 客户端实现也在进行中，方便用户实验和采用。

- **Staging 推出**：计划 2026 年 Q1 末
- **Production 推出**：目标 2026 年 Q2 某个时间

---

## 总结

DNS-PERSIST-01 代表了 ACME 证书验证的一次重要演进：

1. **运维简化**：一次设置，长期有效，消除续期时的 DNS 更新
2. **安全重心转移**：从保护 DNS 凭据转向保护 ACME 账户密钥
3. **灵活的范围控制**：支持单域名、通配符和可选过期时间
4. **特别适合大规模场景**：IoT、多租户平台、批量操作

对于已经在使用 DNS-01 且运行良好的用户，不必急于迁移。但对于需要简化自动化流程或希望减少 DNS 凭据暴露面的场景，DNS-PERSIST-01 提供了一个值得关注的替代方案。
