---
layout: post
title: "一种优雅的 TCP 打洞算法"
date: 2026-03-15 16:15:32 +0800
categories: tech-translation
description: "本文介绍了一种无需基础设施的 TCP 打洞算法，通过确定性算法从时间戳推导所有元数据，让两个位于 NAT 后的主机能够直接建立连接。"
original_url: https://robertsdotpm.github.io/cryptography/tcp_hole_punching.html
source: Hacker News
---

本文翻译自 [A most elegant TCP hole punching algorithm](https://robertsdotpm.github.io/cryptography/tcp_hole_punching.html)，原载于 Hacker News。

## 什么是 TCP 打洞？

TCP 打洞（TCP Hole Punching）是一种让两台位于 NAT 路由器后面的计算机建立直连的技术。这项技术听起来很美好，但实际实现却有一堆前置条件：

* 双方必须知道彼此的 WAN IP（公网 IP）
* 必须知道正确的外部端口
* 必须在**完全相同的时间**发起连接

在实际应用中，这通常意味着你需要：
- 使用 STUN 服务器查询 WAN IP
- 进行 NAT 类型枚举和端口预测
- 用 NTP 同步时间
- 通过某个「信道」交换所有必要的元数据（WAN IP、端口预测、未来的 NTP 打洞时间）

这一长串基础设施和代码——既复杂又容易出错。如果你只是想测试你的打洞算法是否有效呢？你根本不关心软件的其他部分。本文就介绍了一种简洁的解决方案。

## 第一部分：选择时间桶（Bucket）

要绕过打洞算法对固定基础设施的依赖，一个简单的方法是使用**确定性算法**，从单一参数推导出所有元数据。

首先，基于 Unix 时间戳选择一个起始参数。我们需要一个双方无需通信就能达成一致的数字。但是，正如分布式系统理论告诉我们的——网络中没有真正的「现在」。所以我们用一点数学技巧来创造「现在」：

```python
now = timestamp()
max_clock_error = 20s  # 时间戳可能的最大偏差
min_run_window = 10s   # 双方运行程序的总时间窗口
window = (max_clock_error * 2) + 2
bucket = int((now - max_clock_error) // window)
```

这段代码的核心思想是：定义一个可接受的时间窗口。即使双方时钟有偏差，只要落在同一个窗口内，量化后就能得到相同的「桶号」。这就是我们所说的「桶」。

## 第二部分：选择端口

现在双方共享同一个桶号，我们可以用它来推导出一组共享端口。这里的核心假设是：**本地端口等于外部端口**。

许多家用路由器会尝试在外部映射中保留源端口，这个特性叫做「等差映射（equal delta mapping）」。虽然不是所有路由器都支持，但为了算法的简洁性，我们牺牲了一定的覆盖范围。

为了在双方不通信的情况下生成相同的端口列表，我们用桶号作为伪随机数生成器的种子：

```python
large_prime = 2654435761
stable_boundary = (bucket * large_prime) % 0xFFFFFFFF
```

这里的 `0xFFFFFFFF` 限制了边界数的范围，防止溢出 PRNG 接受的种子范围。使用质数是因为：如果乘数与模数有公因数，可能的数字空间会缩小。质数确保数字空间包含唯一的元素。

接下来基于这个种子计算端口范围。在我的代码中，我生成 16 个端口，并丢弃无法绑定的。手动选择随机端口时，难免会与系统中现有程序的端口冲突。

## 第三部分：Socket 和网络编程

在深入之前，让我们回顾一下 TCP 打洞的 Socket 配置要求。有非常特定的选项必须设置：

```python
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
```

TCP 打洞涉及**激进地重用 socket 地址**。正常情况下，TCP 连接失败后你会关闭 socket。但在 TCP 打洞中，任何形式的清理都会破坏协议。清理意味着调用 `close()`，而 `close()` 可能会发送 RST 包，告诉远程路由器「连接有问题，忽略它」。

如果你关闭 socket，操作系统也会开始自己的清理过程。Socket 会进入 `TIME_WAIT` 等状态，即使你设置了正确的 socket 选项，也很难可靠地重用同一地址。

> 💡 **重要提示**：TCP 打洞唯一正确的模型是使用**非阻塞 socket**。你不能使用阻塞 socket，因为你需要能够快速发送 SYN 包而不必等待响应。

异步网络（async networking）在这里也不行。异步网络会阻止你的软件精确控制时序，而 TCP 打洞对时序极其敏感。如果包交换偏差哪怕几毫秒，整个协议都可能失败。

我认为最好的实现方式是：**使用非阻塞 socket 配合 select 进行轮询**。这让你能正确处理每个连接状态，而不影响时序。

```python
for ... sel.register(s, selectors.EVENT_WRITE | selectors.EVENT_READ)
```

打洞的具体实现：我们在 `(dest_ip, port)` 元组上调用 `connect_ex`，配合 0.01 秒的休眠，直到过期（`src_port == dest_port`）。实际的打洞过程并不特别优雅——你只是在疯狂发送 SYN 包。但这部分需要足够激进来创建远程映射，又不能太激进导致 CPU 占满。我使用 0.01 秒的休眠来平衡。

## 第四部分：选择获胜连接

在这个算法中，我们使用多个端口，所以可能返回多个成功的连接。问题是：双方如何选择**同一个**连接？

我的方法是让双方选择一个「领导者」和「跟随者」。WAN IP 数值较大的一方是领导者。领导者在某个连接上发送单个字符，然后干净地关闭其他连接：

```python
winner.send(b"$")
# ...
loser.shutdown(socket.SHUT_RDWR)
loser.close()
```

跟随者使用 select 轮询事件。如果发现事件，调用 `recv(1)` 来选择那个连接（获胜者）。

为什么用单个字符？因为 TCP 是流式协议。如果「成功」分隔符是一个单词，跟随者就必须实现缓冲读取器算法来确保收到完整内容——我不想引入这种复杂性。单个字符是原子的。

## 第五部分：完整实现

我向你展示：一个简单的 TCP 打洞算法，**只需要目标 IP 就能使用**。由于协议是确定性的，测试时不需要任何基础设施，主机之间也不需要交换元数据。

主机仍然可以使用 NTP 进行时间同步（推荐，但可选——虚拟机中的旧操作系统可能无法很好地维持时间）。

假设另一个进程会协调运行这个工具。不过，只要命令落在 10 秒的 `min_run_window` 内，你也可以轻松地在多个终端自己运行所有内容。

完整的 `tcp_punch.py` 代码可以在[原文](https://robertsdotpm.github.io/cryptography/tcp_hole_punching.html)查看。

你可以运行 `tcp_punch.py 127.0.0.1` 来感受代码的工作方式。

---

## 要点总结

1. **确定性算法的优势**：通过时间戳量化和伪随机数生成器，双方无需通信就能推导出相同的元数据，大大简化了测试流程。

2. **NAT 映射假设**：算法假设路由器使用「等差映射」，虽然牺牲了部分兼容性，但换来了代码的简洁性。

3. **非阻塞 Socket 是关键**：TCP 打洞对时序极其敏感，必须使用非阻塞 socket 配合 select 轮询，不能用阻塞 socket 或异步框架。

4. **避免 Socket 清理**：不要随意关闭 socket，RST 包会破坏打洞过程。

5. **领导者-跟随者模式**：通过 WAN IP 大小确定角色，用单字符消息原子性地选择唯一连接。

这个算法虽然不能覆盖所有 NAT 类型，但作为测试和学习 TCP 打洞原理的工具，它展现了网络编程的精妙之处。
