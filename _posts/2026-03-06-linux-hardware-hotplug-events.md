---
layout: post
title: "Linux 硬件热插拔事件详解：深入内核与 udev 的通信机制"
date: 2026-03-06 05:45:31 +0800
categories: tech-translation
description: "本文深入探讨 Linux 系统中硬件热插拔事件的底层实现机制，详细解析内核如何通过 netlink 协议与 udev 通信，以及 udev 如何向用户空间程序广播这些事件。"
original_url: https://arcanenibble.github.io/hardware-hotplug-events-on-linux-the-gory-details.html
source: Hacker News
---

本文翻译自 [Hardware hotplug events on Linux, the gory details](https://arcanenibble.github.io/hardware-hotplug-events-on-linux-the-gory-details.html)，原载于 Hacker News。

---

某天，我突然想知道如何在 Linux 电脑上检测 USB 设备的插入和拔出。对于大多数用户来说，这个问题可以通过 libusb 解决。然而，我当时研究的用例实际上可能不想依赖 libusb，这让我掉进了一个文档匮乏的兔子洞。

## udev 是什么？

通过浏览 libusb 的源代码，我们发现有两个热插拔后端：`linux_netlink.c` 和 `linux_udev.c`。它们有什么区别？

如果我们查看引入这些文件的原始 commit，提交说明这样写道：

> **为 Linux 后端添加热插拔支持。**
>
> 在 Linux 上有两种方式配置热插拔支持：udev 和 netlink。强烈建议在使用 udev 的系统上使用 udev 支持。我们在配置时默认 --with-udev=yes 来强化这个建议。要启用 netlink 支持，请使用 --with-udev=no 运行 configure。如果启用了 udev 支持，所有设备枚举都通过 udev 完成。

我之前当然接触过 udev（通常是在修改 USB 设备权限以便不用 `root` 就能访问它们的场景），但现在是时候深入了解它到底做什么了。

幸运的是，Free Electrons / Bootlin 有很好的历史记录。简单来说：**内核使用 netlink 告诉 udev 关于设备的信息，udev 对这些设备进行必要的处理，然后 udev 将这些事件重新广播给其他所有感兴趣的程序。**

libusb 如此强烈推荐使用 udev 机制的原因是为了避免竞态条件（race condition）。例如，udev 可能正在修改 Unix 权限、上传固件或进行 USB 设备的 mode-switching。

但是...我们如何监听这些重新广播的事件？能不能不链接 libudev 就做到？这里实际使用了什么 IPC 机制？事实证明，udev 和 libudev 早已被整合进 systemd 了。我们需要深入代码一探究竟。

## netlink 协议简介

在继续之前，有必要简要介绍一下 netlink。Netlink 是一个 Linux 特有的"网络协议"，通常用于内核与用户空间之间的通信，使用 BSD sockets API。它特别适合内核向用户空间发送通知（与需要用户空间发起的系统调用不同）。

Netlink 传输数据报（类似 UDP），但也可以传递辅助数据（类似 Unix domain sockets）。Netlink 还支持某种程度有限的多播能力，即多个程序可以接收来自同一源的事件。

## 示例代码

有了代码作为参考会更容易理解：

```c
#define _GNU_SOURCE
#include <ctype.h>
#include <stdio.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <poll.h>
#include <arpa/inet.h>
#include <sys/socket.h>

// 定义 netlink 数据类型，这样就不需要 linux 特定的头文件来编译
#define NETLINK_KOBJECT_UEVENT 15
#define MONITOR_GROUP_KERNEL 1
#define MONITOR_GROUP_UDEV 2

struct sockaddr_nl {
    sa_family_t nl_family;
    unsigned short nl_pad;
    uint32_t nl_pid;
    uint32_t nl_groups;
};

// MurmurHash2 (直接复制)
uint32_t MurmurHash2 ( const void * key, int len, uint32_t seed ) {
    const uint32_t m = 0x5bd1e995;
    const int r = 24;
    uint32_t h = seed ^ len;
    const unsigned char * data = (const unsigned char *)key;

    while (len >= 4) {
        uint32_t k = *(uint32_t*)data;
        k *= m;
        k ^= k >> r;
        k *= m;
        h *= m;
        h ^= k;
        data += 4;
        len -= 4;
    }

    switch(len) {
    case 3: h ^= data[2] << 16;
    case 2: h ^= data[1] << 8;
    case 1: h ^= data[0];
        h *= m;
    };

    h ^= h >> 13;
    h *= m;
    h ^= h >> 15;

    return h;
}

// ... (其余辅助函数省略)

struct udev_packet_header {
    // 包含 "libudev" 和 null 终止符
    char libudev_magic[8];
    // 包含 0xfeedcafe (大端序)
    uint32_t magic;
    // 此头部的大小，*本机*字节序
    uint32_t header_sz;

    // 属性（null 终止字符串）的偏移量，*本机*字节序
    uint32_t properties_off;
    // 属性的大小，*本机*字节序
    uint32_t properties_len;

    // 用于过滤的哈希等，大端序
    uint32_t subsystem_hash;
    uint32_t devtype_hash;
    uint32_t tag_bloom_hi;
    uint32_t tag_bloom_lo;
};

int main(int argc, char **argv) {
    // ... 主函数实现

    // 打开 netlink socket
    int nlsock = socket(AF_NETLINK, SOCK_RAW | SOCK_CLOEXEC, NETLINK_KOBJECT_UEVENT);

    // 绑定 netlink socket 到我们感兴趣的事件
    struct sockaddr_nl sa_nl;
    memset(&sa_nl, 0, sizeof(sa_nl));
    sa_nl.nl_family = AF_NETLINK;
    if (!udev_mode)
        sa_nl.nl_groups = MONITOR_GROUP_KERNEL;
    else
        sa_nl.nl_groups = MONITOR_GROUP_UDEV;
    bind(nlsock, (struct sockaddr *)&sa_nl, sizeof(sa_nl));

    // 接收并处理事件...
}
```

完整代码可以在原文中找到。

## 监听内核事件

要监听内核正常发送给 udev 的事件，我们需要创建一个 `AF_NETLINK` socket，协议为 `NETLINK_KOBJECT_UEVENT`（TCP 和 UDP 通常不使用 protocol 参数所以是 0，但这里我们需要指定）：

```c
int nlsock = socket(AF_NETLINK, SOCK_RAW | SOCK_CLOEXEC, NETLINK_KOBJECT_UEVENT);
```

然后我们需要使用 `bind` 系统调用指定要监听的 netlink 多播组：

```c
struct sockaddr_nl sa_nl;
memset(&sa_nl, 0, sizeof(sa_nl));
sa_nl.nl_family = AF_NETLINK;
sa_nl.nl_groups = MONITOR_GROUP_KERNEL;
bind(nlsock, (struct sockaddr *)&sa_nl, sizeof(sa_nl));
```

这里我们要的是 `MONITOR_GROUP_KERNEL`，即 `1`。这个值在内核中是硬编码的。

就这样！此时，`recv`、`recvmsg` 等系统调用就可以用来获取数据了。

### 内核事件消息格式

来自内核的消息由一系列 null 终止的字符串组成。以下是一个例子（消息中没有换行符，但为了可读性添加了换行）：

```
add@/devices/pci0000:00/0000:00:08.1/0000:04:00.3/dwc3.1.auto/xhci-hcd.2.auto/usb4/4-1/4-1.4␀
ACTION=add␀
DEVPATH=/devices/pci0000:00/0000:00:08.1/0000:04:00.3/dwc3.1.auto/xhci-hcd.2.auto/usb4/4-1/4-1.4␀
SUBSYSTEM=usb␀
MAJOR=189␀
MINOR=386␀
DEVNAME=bus/usb/004/003␀
DEVTYPE=usb_device␀
PRODUCT=b95/1790/200␀
TYPE=0/0/0␀
BUSNUM=004␀
DEVNUM=003␀
SEQNUM=7176␀
```

第一行由"动作"、`@` 和 `sysfs` 下的设备路径组成（即通常位于 `/sys/devices/pci…`）。其余行包含依赖于内核中各个驱动和子系统的键值对。udev 被期望将这些信息与它知道的规则进行匹配，以设置新设备。

## 监听 udev 重广播事件

回想一下，内核事件并不是我们真正感兴趣的。我们想要的是 **udev 版本** 的事件。浏览 libudev 的源代码，我们可以看到 udev 事件**也是**使用 netlink 广播的。尽管 netlink 通常用于与内核通信，但 `NETLINK_KOBJECT_UEVENT` 允许用户空间到用户空间的通信。我们只需将示例程序中的多播组改为 `MONITOR_GROUP_UDEV`，即 `2`。

如果我们 `hexdump` 收到的消息，它们看起来像这样：

```
00000000:   6c 69 62 75 64 65 76 00 fe ed ca fe 28 00 00 00     libudev.....(...
00000010:   28 00 00 00 2f 02 00 00 a9 30 e9 67 00 00 00 00     (....0.g....
00000020:   02 08 20 08 00 40 10 09 55 44 45 56 5f 44 41 54     .. ..@..UDEV_DAT
00000030:   41 42 41 53 45 5f 56 45 52 53 49 4f 4e 3d 31 00     ABASE_VERSION=1.
00000040:   41 43 54 49 4f 4e 3d 61 64 64 00 44 45 56 50 41     ACTION=add.DEVPA
...
```

除了键值字符串外，现在还有一个二进制头部。

## udev 数据包格式详解

这可能是你来这里想看的部分。

udev 的数据包格式是有版本号的，过去至少 10-15 年中常用的版本是 `0xfeedcafe`。在 GitHub 上搜索还发现了一个版本 `0xcafe1dea`，但目前不清楚两个版本之间的过渡是什么时候发生的。似乎没有任何向后或向前兼容性的考虑。

udev 的数据包格式代码在[这里](https://github.com/systemd/systemd/blob/main/src/libudev/libudev-device.c)。以下是我自己整理的等效版本：

```c
struct udev_packet_header {
    // 包含 "libudev" 和 null 终止符
    char libudev_magic[8];
    // 包含 0xfeedcafe (大端序)
    uint32_t magic;
    // 此头部的大小，*本机*字节序
    uint32_t header_sz;

    // 属性（null 终止字符串）的偏移量，*本机*字节序
    uint32_t properties_off;
    // 属性的大小，*本机*字节序
    uint32_t properties_len;

    // 用于过滤的哈希等，大端序
    uint32_t subsystem_hash;
    uint32_t devtype_hash;
    uint32_t tag_bloom_hi;
    uint32_t tag_bloom_lo;
};
```

这个头部中有几个字段使用 udev 进程的本机字节序。这可能会在跨字节序的 qemu-user 进程中造成问题，但我个人没有测试过。似乎没有明确的处理这种情况的条款，但 `header_sz` 可以用来嗅探适当的字节序。

`header_sz` 不被 libudev 使用，只有 `properties_off` 被使用。在实践中，这两个字段包含相同的值。

udev 传输几个哈希值，以便消息接收者可以使用 BPF 进行过滤。这避免了内核不必要地唤醒不感兴趣的进程，这可能会节省性能或功耗。上面的示例程序没有这样做。

- `subsystem_hash` 是 `SUBSYSTEM=` 键值的 MurmurHash2 哈希。如果键不存在，值为 0。
- `devtype_hash` 是 `DEVTYPE=` 键值的 MurmurHash2 哈希。如果键不存在，值为 0。
- `tag_bloom_hi` 和 `tag_bloom_lo` 组成 `TAG=` 键中条目的 64 位布隆过滤器（通常用 `:` 字符分隔）。如果没有键存在，值为 0。布隆过滤器是一种特殊的基于哈希的数据结构，它可以返回"这个元素肯定不在集合中"或"这个元素可能在集合中，但也可能是假阳性"。在这种情况下，它允许 BPF 预先过滤掉肯定不包含正确 `TAG` 的事件。

布隆过滤器使用 4 个小哈希，每个小哈希取自 tag 的 MurmurHash2 的不同位片。这在上面的示例代码中显示：

```c
const uint32_t mask = 0b111111;
bloom_filter |= 1ULL << ((taghash >> 0) & mask);
bloom_filter |= 1ULL << ((taghash >> 6) & mask);
bloom_filter |= 1ULL << ((taghash >> 12) & mask);
bloom_filter |= 1ULL << ((taghash >> 18) & mask);
```

## 安全考虑

这些 udev netlink 消息应该带有发送进程的凭证（进程 ID、用户 ID、组 ID）。libudev 不会接受没有这些凭证的消息。`SO_PASSCRED` 选项用于启用接收凭证，如 Linux 上 Unix domain sockets 的 man page 所述。

内核消息的这些值都是 0。这对 udev 检查以避免因伪造消息而采取行动很重要。

从 udev 发往普通用户空间程序的消息也被期望来自 uid 0，或者与用户命名空间相关的东西（我没有完全理解）。我也不明白为什么随机程序需要检查这个，因为 netlink 通常只允许 uid 0 发送消息。

## 个人感想

这篇文章让我对 Linux 系统底层的设备管理有了更深的理解。作为一个经常需要与硬件交互的开发者，知道 `udev` 背后的工作原理非常有价值：

1. **netlink 是个强大的 IPC 机制** - 它不仅仅用于网络配置，还是内核与用户空间通信的重要桥梁
2. **设计决策的权衡** - libusb 推荐使用 udev 而非直接监听内核事件，是为了避免与 udev 的设备初始化过程产生竞态条件
3. **性能优化的细节** - udev 数据包中的哈希和布隆过滤器是为了支持 BPF 过滤，这是一个很巧妙的性能优化设计

如果你需要在生产环境中监听硬件事件，强烈建议使用 libudev 而不是直接解析这些数据包格式——毕竟这些内部实现细节可能会在没有通知的情况下改变。

## 关键要点

- Linux 硬件热插拔事件通过 **netlink** 协议传递，使用 `NETLINK_KOBJECT_UEVENT`
- 有两个多播组：`MONITOR_GROUP_KERNEL (1)` 监听原始内核事件，`MONITOR_GROUP_UDEV (2)` 监听 udev 处理后的事件
- 内核事件是简单的 null 终止字符串列表
- udev 事件有额外的二进制头部，包含版本魔数 `0xfeedcafe` 和用于 BPF 过滤的哈希/布隆过滤器
- 出于安全考虑，消息应该携带发送进程的凭证

---

*本文根据原文进行了适当改编，保留了技术准确性的同时增加了对中文开发者更友好的解释。*
