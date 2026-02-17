---
layout: post
title: "GrapheneOS：逃离谷歌生态的隐私安卓指南"
date: 2026-02-18 01:38:43 +0800
categories: tech-translation
description: "一份详尽的 GrapheneOS 入门指南，涵盖从设备选择、系统安装到日常使用的完整流程，帮助你摆脱谷歌追踪，重获数字隐私自主权"
original_url: https://blog.tomaszdunia.pl/grapheneos-eng/
source: Hacker News
---

本文翻译自 [GrapheneOS - How I De-Googled My Phone](https://blog.tomaszdunia.pl/grapheneos-eng/)，原载于 Hacker News。

## 缘起：从果粉到安卓隐私党

一年前，我还深陷苹果生态系统无法自拔。手机、笔记本、手表、平板、流媒体、云存储，甚至钥匙追踪器，全部来自同一家厂商。加上家庭共享相册、日历、购物清单——逃离果园似乎遥不可及。

转折点来自一家叫 Plenti 的设备租赁公司。我随手搜索" samsung fold "，发现 Galaxy Z Fold 6 月租只需 250-300 兹罗提（约 80 美元）。折叠屏手机一直让我很好奇，但动辄上万元的售价和屏幕耐久性让我望而却步。租半年试试？就这样，我迈出了逃离果园的第一步。

六个月后，Fold 6 的缺点逐渐显现：折叠后太厚、无法使用保护壳、裸机手感硌手。但更重要的是，我重新喜欢上了 Android。

恰在此时，我读到一篇关于 GrapheneOS 的文章：法国政府试图在该系统中植入后门，因为它太安全了，无法监控用户。这反而证明了它的价值——**一个连政府都想攻破的系统，必然有其过人之处**。

## GrapheneOS 是什么？

GrapheneOS 是一个**基于 AOSP（Android Open Source Project）的开源操作系统**，专注于提供**最高级别的隐私和安全保护**。

核心特点：

- **彻底移除谷歌服务**：系统层面不集成任何 Google 服务，避免被追踪和数据收集
- **内核加固（Hardening）**：对内核和关键组件进行安全加固，降低漏洞攻击风险
- **沙盒化的 Google Play**：可以在隔离环境中运行 Google Play 服务，按需使用而不授予广泛权限
- **Verified Boot**：利用 Pixel 的 Titan M 安全芯片实现完整的数据保护

有趣的是，这个**摆脱谷歌服务的系统，却只能在谷歌设备上获得完整支持**。原因在于 Pixel 系列独有的安全特性：Verified Boot、Titan M 芯片、IOMMU、MTE 等。

## 设备选择

支持列表（2026年2月）：

**推荐设备**（加粗）：
- Pixel 10 Pro Fold / Pro XL / Pro / 普通版
- Pixel 9a / 9 Pro Fold / 9 Pro XL / 9 Pro / 9
- Pixel 8a / 8 Pro / 8

其他支持：Pixel Fold、Pixel Tablet、Pixel 7a/7 Pro/7、Pixel 6a/6 Pro/6

我的选择是 **Pixel 9a**——当时最新、支持长达 **7 年**、价格约 1600 兹罗提（450 美元）。虽然相机不如 iPhone 15 Pro 或 Fold 6，但续航和性能让我惊喜。如果你想入门 GrapheneOS，这是一条推荐的路径。

## 安装指南

### 准备工作

1. **手机**：支持的 Pixel 设备
2. **数据线**：必须支持数据传输（最好用原装线）
3. **电脑**：安装 Chromium 内核浏览器（Chrome、Brave、Edge 等），推荐 Windows 10/11（驱动最简单）

### 手机准备

1. 恢复出厂设置：设置 → 系统 → 重置选项 → 恢复出厂设置
2. 完成初始设置直到看到主屏幕（跳过 SIM、Wi-Fi，关闭所有谷歌服务）
3. 更新系统：设置 → 系统 → 系统更新
4. 启用开发者选项：设置 → 关于手机 → 版本号（点击7次）
5. 开启 OEM 解锁：设置 → 系统 → 开发者选项 → OEM 解锁

### 解锁 Bootloader

1. 关机后，同时按住**电源键 + 音量减**进入 Fastboot Mode
2. 连接电脑，访问 [grapheneos.org/install/web](https://grapheneos.org/install/web)
3. 点击 "Unlock bootloader"，选择设备并连接
4. 在手机上用音量键选择 "Unlock the bootloader"，按电源键确认
5. 看到 `Device state: unlocked`（红色）即成功

### 刷入系统

1. 在网站上点击 "Download release" 下载系统镜像
2. 下载完成后点击 "Flash release"
3. 等待完成，手机会自动重启回 Fastboot Mode

### 重新锁定 Bootloader

锁定 Bootloader 至关重要——它启用 Verified Boot 功能，防止系统分区被篡改。

1. 在 Fastboot Mode 选择 "Start" 启动系统
2. 完成基本设置（语言、时区、Wi-Fi、指纹）
3. 确认一切正常后，再次进入 Fastboot Mode
4. 点击网站上的 "Lock bootloader"，在手机上确认
5. 看到 `Device state: locked`（绿色）即成功

### 恢复 OEM 锁

1. 再次启用开发者选项
2. 关闭 OEM 解锁选项
3. 完全关闭开发者选项
4. 重启设备

## 我的 GrapheneOS 使用哲学

GrapheneOS 本质上是一个**隐私与便利之间的权衡**。它让你看到传统 Android 隐藏的控制选项，但也需要你主动做出选择。

### 双用户配置

我创建了两个用户配置：

**Owner（主账户）**：
- 安装 Google Play 服务（通过系统自带 App Store）
- 仅保留必须依赖 GMS 的应用：mBank（NFC 非接触支付）、Mój T-Mobile

**日常使用账户**：
- 所有数字生活：浏览器、密码管理器、通讯软件
- 无 Google 服务

这样的好处：需要时可以快速删除日常账户，留下一个看起来"正常"的手机。虽然这是极端场景（如边境检查），但安全的基本原则是**不日常使用管理员账户**。

### Obtainium：开源应用聚合器

Obtainium 是我在 GrapheneOS 上的主力应用商店，专门用于获取开源 APK 并自动更新。

我使用的开源应用：

| 应用 | 用途 |
|------|------|
| AntennaPod | 播客 |
| Bitwarden | 密码管理 |
| Brave | 浏览器 |
| Breezy Weather | 天气 |
| Catima | 会员卡 |
| DAVx2 | 日历/联系人同步 |
| Ente Auth | 双因素认证 |
| Feeder | RSS 阅读 |
| FUTO Keyboard | 输入法（配合离线语音输入） |
| Organic Maps | 地图导航（基于 OpenStreetMap） |
| Signal | 即时通讯 |
| Thunderbird | 邮件客户端 |

### Aurora Store：匿名获取闭源应用

对于必需的闭源应用，我使用 Aurora Store——一个 Google Play 的开源前端。

优点：
- 无需 Google 账号即可下载免费应用（匿名账户）
- 直接从 Google 服务器下载原始 APK
- 可绕过地区限制

缺点：
- 匿名账户有时会达到下载限制
- 使用个人 Google 账号有被封禁风险

已验证无需 GMS 正常运行的应用：Allegro、Apple Music、Bolt、Discord、Duolingo、GitHub、Reddit、Reolink、Synology Photos 等。

### 权限控制：隐私的基石

GrapheneOS 允许完全控制每个应用的权限。

关键发现：
- 传统 Android 默认授予所有应用 **网络** 和 **传感器** 权限
- 但很多应用根本不需要网络（如 FUTO 语音输入、文档扫描器、电子书阅读器）
- 几乎没有应用需要访问所有传感器

每个应用安装后，我立即检查：长按图标 → 应用信息 → 权限。这是 GrapheneOS 加固的基础。

### 私密空间（Private Space）

GrapheneOS 的私密空间类似于三星的 Secure Folder，是一个沙盒化的隔离环境。

我在私密空间中放置：
- 需要部分 Google 服务的金融应用（银行、投资）
- Google Drive（工作需要）
- mObywatel（波兰电子身份证）

## 总结

GrapheneOS 是一个优秀的系统，让我们有机会**部分摆脱 Google（Android）和 Apple（iOS）的掌控**。虽然我使用才三个月，但它已经彻底改变了我的移动设备使用习惯。

如果你也关心数字隐私，不妨试试——即使只是在一台闲置的 Pixel 上体验一下，也会让你对"智能手机"有全新的认识。

---

**关键要点：**

1. GrapheneOS 只能通过 Web 安装器在 Pixel 设备上安装，过程安全且可逆
2. 双用户配置可以有效隔离需要 GMS 的应用
3. Obtainium + Aurora Store 可以替代大部分 Google Play 功能
4. 权限控制是隐私保护的核心——每个应用都需要审查
5. 这不是全有或全无的选择——可以渐进式地减少对 Google 的依赖
