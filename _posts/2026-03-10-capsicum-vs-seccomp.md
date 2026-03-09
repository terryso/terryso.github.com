---
layout: post
title: "Capsicum vs seccomp：进程沙箱的两种哲学"
date: 2026-03-10 01:08:07 +0800
categories: tech-translation
description: "本文对比了 FreeBSD 的 Capsicum 和 Linux 的 seccomp-bpf 两种进程沙箱技术，探讨它们截然不同的设计哲学：一个是移除所有权限后精确授权，另一个是通过过滤器限制系统调用。"
original_url: https://vivianvoss.net/blog/capsicum-vs-seccomp
source: Hacker News
---

本文翻译自 [Capsicum vs seccomp: Process Sandboxing](https://vivianvoss.net/blog/capsicum-vs-seccomp)，原载于 Hacker News。

## 权限继承问题

当一个进程被攻破——无论是缓冲区溢出、畸形数据包，还是心怀叵测的依赖库——攻击者获得了代码执行权。接下来会发生什么，完全取决于这个进程"能触达什么"。而在标准 Unix 系统上，这个答案自 1969 年以来就没变过：**用户能碰的一切**。

每个文件。每个 socket。每个设备。被攻破的进程继承了启动它的用户的全部"环境权限"（ambient authority）。

这不是 bug，而是 Unix 最初的安全模型。在"用户"意味着贝尔实验室的研究人员、可以信任他们不会运行来自互联网的恶意代码的年代，这个模型表现卓越。遗憾的是，互联网另有打算。

两个操作系统决定修复这个问题。它们选择了截然相反的哲学：**一个把房间的门拆掉了，另一个雇了个保安拿着名单检查**。

### 环境权限问题示意

想象 `tcpdump` 这样的网络抓包工具被攻破了：

- tcpdump **需要**：1 个抓包设备 + 1 个输出文件
- tcpdump **获得**：root 能碰的一切

"需要"和"获得"之间的差距，就是攻击面。Unix 从 1969 年就这样运行。

## FreeBSD：Capsicum

2010 年，剑桥大学的 Robert Watson 和 Jonathan Anderson 发表了一篇论文，获得了 USENIX Security 的最佳学生论文奖。核心洞察简单得令人惊讶：与其列出进程"不能做什么"，不如**移除一切，然后精确地交还它需要的**。

这就是 [Capsicum](https://www.cl.cam.ac.uk/research/security/capsicum/)，2014 年在 FreeBSD 10.0 中默认编译进内核。核心 API 就一个函数：`cap_enter()`。一个系统调用。**不可逆**。

```c
#include <sys/capsicum.h>

int main(void)
{
    int fd = open("/var/log/capture.pcap", O_WRONLY);

    /* 限制 fd：只能写入和 seek */
    cap_rights_t rights;
    cap_rights_init(&rights, CAP_WRITE, CAP_SEEK);
    cap_rights_limit(fd, &rights);

    /* 进入 capability 模式。没有回头路 */
    cap_enter();

    /*
     * 进程失去了对所有全局命名空间的访问权
     * 没有文件系统。没有新 socket。不能创建新进程
     * 剩下的：只有已经持有的文件描述符
     * 并且只具有上面明确授予的权限
     */

    write_packets(fd);
    return 0;
}
```

没有 `cap_exit()`。没有提权路径，没有权限恢复机制，也没有给想要回权限的进程准备的申请表。内核设置一个标志，这个标志不会被取消。

进程进入了一个只包含其已打开文件描述符的世界，且只限于明确授予的操作。文件系统、网络、进程表：它们不只是变得不可访问——**对于沙箱内的进程来说，它们压根不存在**。

这个模型是**减法**。从拥有一切开始，移除一切，精确地交还需要的。进程无法逃脱，不是因为过滤器阻挡了它，而是因为**门已经不存在了**。很难绕过一个不存在的东西。

## Linux：seccomp-bpf

Linux 的答案分两步走。2005 年，Andrea Arcangeli 添加了 [seccomp](https://man7.org/linux/man-pages/man2/seccomp.2.html) 严格模式：只允许 4 个系统调用（read、write、exit、sigreturn），其他任何调用都会杀死进程。优雅，确实。但对于需要干实际活的程序来说，也几乎完全不可用。

2012 年，Will Drewry 在 Linux 3.5 中引入了 [seccomp-bpf](https://man7.org/linux/man-pages/man2/seccomp.2.html)：一个 BPF 程序在运行时检查每个系统调用，决定允许、拒绝还是杀死进程。这确实有用了。但这也是根本不同的哲学。

```c
#include <seccomp.h>

int main(void)
{
    /* 默认：任何未明确允许的系统调用都杀死进程 */
    scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_KILL);

    /* 白名单：只允许这些系统调用 */
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(read), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(write), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(close), 0);
    seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit_group), 0);

    /* 加载过滤器 */
    seccomp_load(ctx);

    /*
     * 从这里开始：
     *   - 只有列表中的系统调用能工作
     *   - 但是：所有现有的 fd 保留完整权限
     *   - 允许的 read() 可以读取任何打开的 fd
     *   - 过滤器检查的是调用，不是目标
     */

    write_packets(fd);
    return 0;
}
```

这个模型是**过滤**。进程保留完整的环境权限。一个过滤器坐在进程和内核之间，检查每个调用是否在名单上。保安在门口查你的名字，但他不检查你进去后干什么。

Docker 默认的 seccomp 配置文件阻止大约 44 个（共 300+）系统调用。剩下的 256 个直接通过。白名单和黑名单的区别，就像"你可以进 3 号和 7 号房间"与"除了 12 和 15 号房间，其他都能进"。当大楼不断加盖新楼层时，后者的危险与日俱增。

### 核心差异对比

| 特性 | Capsicum | seccomp-bpf |
|------|----------|-------------|
| 模型 | 减法（移除访问） | 过滤（检查调用） |
| 文件描述符限制 | cap_rights_limit() | 不支持 |
| 沙箱入口 | 1 个系统调用 | BPF 程序 |
| 运行时开销 | 可忽略（1 个标志位） | 每次调用都要评估 |
| 实际应用 | tcpdump, dhclient, Chromium, hastd, gzip | Docker, Chromium, Firefox, systemd, Android |

两种方式都提升了安全性。真正的问题是架构层面的。

## 同一个浏览器，两种哲学

最有说服力的对比不是理论上的，而是 **Chromium**。

每个网页浏览器都面临同样的威胁：在一个能访问本地系统的进程里渲染来自互联网的不信任内容。解决方案都是沙箱。Chromium 把渲染器进程沙箱化，这样被攻破的标签页无法读取你的文件、偷走会话 cookie、或转向网络攻击。

**在 FreeBSD 上**，Chromium 使用 Capsicum。渲染器打开它需要的资源（字体、共享内存、到浏览器进程的 IPC 通道），然后调用 `cap_enter()`。从那一刻起，渲染器存在于一个只包含其已打开文件描述符的世界，且只限于它需要的操作。攻击者攻破渲染器后，继承的是一个只能通过管道和浏览器对话、能画像素的进程。其他什么都不存在。

**在 Linux 上**，Chromium 使用 seccomp-bpf 结合命名空间。渲染器加载一个 BPF 过滤器来阻止危险的系统调用，然后进入受限命名空间。工程设计合理，效果也不错。但 BPF 程序必须枚举每个应该被阻止或允许的系统调用。新内核版本添加新系统调用。每个新系统调用默认都是使用黑名单的 seccomp 配置文件的漏洞。过滤器是一份活文档，必须持续维护。

同一个浏览器。同一个威胁模型。同一个问题。Capsicum 不关心内核添加多少系统调用。在 `cap_enter()` 之后，新添加的打开文件的系统调用不工作，因为进程处于 capability 模式。限制是结构性的，不是枚举性的。内核可以增加一千个新系统调用，沙箱依然有效，因为沙箱不是一份"你不能做的事"的清单，而是**根本没有做这些事的能力**。

## 实践证据

FreeBSD 基础系统默默展示了 Capsicum 的可能性：

- **tcpdump**：打开抓包设备和输出文件，限制它们的权限，进入 capability 模式。被攻破的 tcpdump 无法读取 `/etc/shadow`，无法打开反向 shell，无法访问网络。攻击面：一个只读的 BPF 设备和一个只写的输出文件。

- **dhclient**：打开 socket，打开租约文件，进入 capability 模式。这个以 root 运行、处理来自不可信源的网络输入的 DHCP 客户端，被沙箱化到只包含它需要的资源。而在大多数 Linux 发行版上，被攻破的 dhclient 可以读取 dhclient 用户能读的任何东西——鉴于它通常以 root 运行——就是一切。

FreeBSD 基础系统中启用 Capsicum 的工具清单很有启发性：tcpdump、dhclient、hastd、auditdistd、gzip 和 OpenSSH。这些恰恰是攻击者首选的目标：面向网络、解析不可信输入、经常以 root 运行。在 FreeBSD 上，它们恰恰是被攻破后能提供最少东西的工具。

## 时间线

```
2005: seccomp strict (Arcangeli) - 只允许 4 个系统调用
2010: Capsicum 论文 (Watson, Anderson) - USENIX Security 最佳学生论文
2012: seccomp-bpf (Drewry) - Linux 3.5
2014: Capsicum 默认启用 - FreeBSD 10.0
```

## 关键要点

两种方法都实质性地提升了安全性。seccomp-bpf 每天保护着数百万容器、手机和浏览器。否定它将是无知的。但问题一如既往是架构层面的：**你更愿意修补过滤器，还是移除需要过滤的东西？**

Capsicum 消除环境权限。seccomp 限制它。一个把门锁上然后从铰链上拆掉。另一个雇个保安，然后希望名单是完整的。

**不存在的门无法被打开。这倒是挺让人安心的。**

---

> **技术细节补充**：
> - Capsicum 在 capability 模式下允许约 190 个（共约 567 个）系统调用
> - Docker 默认 seccomp 配置阻止约 44 个（共 300+ 个）系统调用
> - Capsicum 开销：每个进程一个内核标志位，可忽略
> - seccomp-bpf：运行时对每个系统调用进行过滤器评估
> - CVE-2022-30594 曾完全绕过 Linux 5.17.2 之前的 seccomp。Capsicum 的模型不受此类攻击影响，因为根本没有过滤器可以暂停
> - Linux 也在进步：Landlock（2021 年合并入 5.13）添加了更接近 Capsicum capability 模型的文件系统沙箱
> - 原始 [Capsicum 论文](https://www.cl.cam.ac.uk/research/security/capsicum/)（Watson, Anderson 等，USENIX Security 2010）仍然是 capability 模型的权威解释
