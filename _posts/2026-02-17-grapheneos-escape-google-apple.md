---
layout: post
title: "GrapheneOS：彻底摆脱 Google 和 Apple 的隐私安全手机系统"
date: 2026-02-17 23:12:59 +0800
categories: tech-translation
description: "GrapheneOS 是一款基于 AOSP 的开源手机操作系统，专注于提供最高级别的隐私和安全保护，完全摆脱 Google 服务追踪，让你真正掌控自己的移动设备。"
original_url: https://blog.tomaszdunia.pl/grapheneos-eng/
source: Hacker News
---

本文翻译自 [GrapheneOS - break free from Google and Apple](https://blog.tomaszdunia.pl/grapheneos-eng/)，原载于 Hacker News。

## 缘起：从苹果生态到自由之路

就在一年前，我还深陷苹果生态圈。手机、笔记本、手表、平板、视频和音乐流媒体、云存储，甚至连钥匙追踪器都是苹果的。加上共享的家庭相册、日历和购物清单——一切都被绑定在一个厂商身上。

转折点来自一家叫 Plenti 的设备租赁公司。我随手搜了"samsung fold"，发现可以以每月 250-300 兹罗提（约 80 美元）租到 Galaxy Z Fold 6。折叠屏手机？太酷了！六个月的租期让我重新接触了 Android，也让我开始重新审视这个曾经被我遗忘的系统。

租期结束后，我放弃续租——Fold 6 折叠后太厚，戴壳会滑落，裸机又硌手。但有趣的是，我发现自己已经不想回到 iOS 了。就在这时，我读到一篇文章：GrapheneOS 团队因为系统的安全性太高，法国政府想要强制植入后门，甚至考虑对整个团队实施旅行禁令。

"一个欧洲国家**想要强制在系统中植入后门**，因为这系统太安全了，以至于无法监控用户。"这让我意识到——**这个系统一定有特别之处**！

## 什么是 GrapheneOS

GrapheneOS 是一款定制的**开源操作系统**，以**提供最高级别的隐私和安全**为设计理念。它基于 Android Open Source Project (AOSP)，但与普通手机系统有本质区别：

1. **完全移除 Google 服务集成**——避免大公司的追踪和数据收集
2. **内核和关键组件的深度加固**——最小化被黑客攻击的风险
3. **沙盒化运行 Google Play 服务**——可以选择性使用需要 GMS 的应用，但不给予广泛的系统权限
4. **支持 Verified Boot**——确保系统完整性，防止恶意篡改

目前，GrapheneOS 专注于支持 **Google Pixel** 系列手机，充分利用其专用的 Titan M 安全芯片。

## 为什么是 Pixel？

这确实有点讽刺——**一个摆脱 Google 服务的系统，偏偏要运行在 Google 的设备上**。但这是有技术原因的：

- **Verified Boot**：验证启动，确保系统未被篡改
- **Titan M**：专用安全芯片，保护敏感数据
- **IOMMU**：输入输出内存管理单元，隔离硬件访问
- **MTE**：内存标记扩展，防止内存安全漏洞

### 支持设备列表（2026年2月）

**推荐设备（已加粗）：**
- **Pixel 10 Pro Fold (rango)**
- **Pixel 10 Pro XL (mustang)**
- **Pixel 10 Pro (blazer)**
- **Pixel 10 (frankel)**
- **Pixel 9a (tegu)**
- **Pixel 9 Pro Fold (comet)**
- **Pixel 9 Pro XL (komodo)**
- **Pixel 9 Pro (caiman)**
- **Pixel 9 (tokay)**
- **Pixel 8a (akita)**
- **Pixel 8 Pro (husky)**
- **Pixel 8 (shiba)**

其他支持设备包括 Pixel Fold、Pixel Tablet、以及 Pixel 7/6 系列。

### 我的设备选择

我选择了 **Google Pixel 9a**，理由很简单：
- 提供长达 **7 年的系统支持**
- 价格亲民，约 1600 兹罗提（450 美元）
- 作为入门设备风险可控

唯一让我不满的是相机质量——之前用的是 iPhone 15 Pro 和 Galaxy Z Fold 6，确实被惯坏了。但**电池续航和整体性能让我非常满意**。

## 安装 GrapheneOS

### 准备工作

1. **一台支持的 Pixel 手机**（我的是 Pixel 9a）
2. **数据线**——必须支持数据传输，不能只是充电线
3. **电脑 + Chromium 内核浏览器**（Chrome、Brave、Edge 等）——推荐 Windows 10/11，驱动最省心

### 手机准备

1. **恢复出厂设置**（设置 → 系统 → 重置选项 → 清除所有数据）
2. **完成基础设置向导**，跳过 SIM 卡、Wi-Fi、关闭所有 Google 服务
3. **更新系统**（设置 → 系统 → 系统更新）
4. **开启开发者选项**（设置 → 关于手机 → 连续点击"版本号"7 次）
5. **启用 OEM 解锁**（设置 → 系统 → 开发者选项）

### 解锁 Bootloader

1. **关机**
2. **同时按住电源键 + 音量减**，进入 Fastboot Mode
3. **连接电脑**
4. **访问** [grapheneos.org/install/web](https://grapheneos.org/install/web)
5. 点击 **Unlock bootloader** 按钮
6. 在手机上用音量键选择 "Unlock the bootloader"，按电源键确认
7. 成功后显示 `Device state: unlocked`（红色）

### 刷入系统镜像

1. 点击 **Download release** 按钮下载系统镜像
2. 等待下载完成
3. 点击 **Flash release** 开始刷入
4. **耐心等待**，不要断开连接或触碰设备
5. 完成后手机会自动重启到 Fastboot Mode

### 重新锁定 Bootloader

**这一步至关重要**——锁定 Bootloader 才能启用 Verified Boot 的完整功能，检测并阻止任何对系统的修改。

在锁定前，建议先启动系统确认一切正常：

1. 在 Fastboot Mode 选择 **Start**，按电源键启动系统
2. 完成基础设置（语言、时区、Wi-Fi、指纹等）
3. 确认无误后，重新进入 Fastboot Mode
4. 点击 **Lock bootloader** 按钮
5. 在手机上确认锁定操作
6. 成功后显示 `Device state: locked`（绿色）

### 恢复 OEM 锁

1. 再次开启开发者选项
2. 关闭 OEM 解锁选项
3. 关闭开发者选项
4. 重启设备

## 我的使用策略

GrapheneOS 的使用方式没有标准答案，每个人都要在**便利性和隐私之间找到平衡**。以下是我的个人实践。

### 多用户配置

我创建了两个用户配置：

**Owner（主账户）**：
- 安装了 Google Play Store 和 Google Play Services
- 仅用于**必须依赖 GMS 的应用**：
  - mBank（非接触式 BLIK 支付需要 GMS）
  - Mój T-Mobile（运营商积分功能）

**Tommy（日常账户）**：
- 存放我的整个数字生活
- 无 Google 服务
- 绝大多数应用都在这里

这种分离的好处：
- 如果需要快速清除数据（比如过海关），只需删除 Tommy 配置
- Owner 账户看起来像普通手机，不会引起怀疑
- 遵循安全原则：**日常不使用管理员账户**

### Obtainium：开源应用聚合器

Obtainium 是我在 GrapheneOS 上的**主要应用管理工具**，相当于隐私友好的 Google Play Store，专门用于获取和更新开源应用。

**我的开源应用列表：**

| 应用 | 用途 |
|------|------|
| AntennaPod | 播客（正在从 Pocket Casts 迁移） |
| Bitwarden | 密码管理器 |
| Brave | 浏览器 |
| Breezy Weather | 天气 |
| Catima | 会员卡管理 |
| Collabora Office | 办公套件 |
| DAVx2 | 日历/联系人同步 |
| Ente Auth | 双因素认证 |
| Feeder | RSS 阅读器 |
| FUTO Keyboard | 键盘 + 离线语音输入 |
| Librera | 电子书阅读器 |
| Organic Maps | 基于 OpenStreetMap 的地图导航 |
| Signal | 即时通讯 |
| Thunderbird | 邮件客户端 |

强烈推荐 [这个视频教程](https://www.youtube.com/watch) 了解 Obtainium 的使用方法。

### Aurora Store：非开源应用的替代方案

对于必须使用但非开源的应用，我通过 **Aurora Store** 获取。它是一个开源的 Google Play Store 客户端，**无需 Google 账户即可下载应用**。

优势：
- **隐私**：使用匿名账户下载免费应用
- **安全**：从 Google 官方服务器下载原始 APK
- **自由**：绕过地区限制

缺点：
- 匿名账户有时会因下载限制失效
- 使用真实 Google 账户有封号风险
- 需要信任 Aurora Store 开发者

**我验证过无需 GMS 即可正常工作的应用：**
- Allegro（购物）
- Apple Music（是的，我还没放弃它）
- Bolt（打车）
- Booksy（理发预约）
- DeepL（翻译）
- Discord
- Duolingo（学意大利语）
- GitHub
- Lidl Plus（超市优惠）
- Messenger（无奈，有些朋友只用 FB）
- Reddit
- Reolink（家庭监控）
- Termius（SSH 客户端）
- TickTick（待办事项）

### 权限控制：GrapheneOS 的核心

GrapheneOS 允许**完全控制每个应用的权限**。普通 Android 默认给所有应用授予**网络**和**传感器**权限——但你有没有想过，**真的所有应用都需要网络访问吗？**

例如：
- **FUTO Voice Input**：使用本地 LLM 进行语音识别，根本不需要联网
- **FairScan**（文档扫描）、**Catima**（会员卡）、**Librera**（电子书）：这些应用**都不需要网络权限**！

管理权限的方法：
1. 长按应用图标 → 应用信息 → 权限
2. 查看 **Privacy Dashboard**（隐私仪表盘），了解应用实际使用权限的频率

### Private Space（私密空间）

除了多用户配置，GrapheneOS 还支持 **Private Space**——一个隔离的沙盒环境。我在这里放置需要 Google 服务的金融类应用：

- Google Drive
- IKO（银行）
- mBank（备用）
- mObywatel（电子身份证）
- Revolut
- Santander
- Play Store

## 总结

GrapheneOS 是一个**真正让你摆脱 Google 和 Apple 控制的操作系统**。它不是完美的——你需要在便利性和隐私之间做出妥协——但它给了你**选择的权利**。

**关键收获：**

1. **安全始于设备选择**——Pixel 系列因其安全芯片成为最佳选择
2. **分离是关键**——多用户配置和 Private Space 让你能够隔离风险
3. **开源优先**——Obtainium 让获取开源应用变得简单
4. **权限控制是基础**——审视每个应用的权限，不给不必要的访问
5. **没有完美的解决方案**——这是一场持续的博弈，需要根据自己的需求调整

**最重要的是**：GrapheneOS 的存在证明了我们不必被两大巨头绑架。自由，从来都需要主动争取。

---

*如果你想支持 GrapheneOS 项目，可以在[这里](https://grapheneos.org/donate)进行捐赠。开发团队正在做一件了不起的事情。*
