---
layout: post
title: "内核级反作弊系统深度解析：现代游戏保护机制全景"
date: 2026-03-15 17:18:27 +0800
categories: tech-translation
description: "本文深入剖析现代内核级反作弊系统的工作原理，涵盖内核回调、内存扫描、注入检测、DMA 攻击防护等核心技术，以及这场攻防博弈的未来走向。"
original_url: https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work/
source: Hacker News
---

本文翻译自 [How Kernel Anti-Cheats Work: A Deep Dive into Modern Game Protection](https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work/)，原载于 Hacker News。

---

## 引言

毫不夸张地说，现代内核级反作弊系统是运行在消费级 Windows 机器上最复杂的软件之一。它们运行在软件可用的最高特权级别，拦截本为合法安全产品设计的内核回调，扫描大多数程序员职业生涯中从未接触过的内存结构——而且这一切都在游戏运行时透明地进行。如果你曾经好奇 BattlEye 到底是如何检测外挂的，为什么 Vanguard 坚持在 Windows 启动前加载，或者 PCIe DMA 设备绕过所有这些保护意味着什么，这篇文章就是为你准备的。

## 为什么用户态保护远远不够

用户态反作弊的根本问题是**信任模型**。用户态进程运行在 Ring 3，完全受内核管辖。任何完全在用户态实现的保护都可以被更高特权级别的代码绕过——在 Windows 中，这意味着 Ring 0（内核驱动）或更底层（虚拟机监控器、固件）。

一个调用 `ReadProcessMemory` 检查游戏内存完整性的用户态反作弊，可以被一个 hook 了 `NtReadVirtualMemory` 并返回伪造数据的内核驱动击败。一个通过 `EnumProcessModules` 枚举已加载模块的用户态反作弊，可以被一个修补 PEB 模块列表的驱动击败。用户态进程对它之上发生的事情完全"失明"。

外挂开发者比大多数反作弊工程师愿意承认的要早得多地理解了这一点。很长一段时间里，内核是外挂的专属领地。内核模式外挂可以直接操作游戏内存，无需经过任何用户态反作弊可以拦截的 API。它们可以轻松地在用户态枚举 API 面前隐藏自己的存在，可以拦截和伪造用户态反作弊可能执行的任何检查的结果。

**反制是不可避免的：把反作弊移进内核。**

### 军备竞赛的升级

这种升级一直未曾停歇：

1. **用户态外挂** → 被内核反作弊对抗
2. **内核外挂** → 被驱动黑名单和更严格的 DSE 执行对抗
3. **基于虚拟机监控器的外挂** → 被虚拟机检测对抗
4. **DMA 外挂** → 目前的前沿，部分被 IOMMU、Secure Boot 和 TPM 远程证明对抗
5. **固件级攻击** → 下一阶段，外挂嵌入 SSD 固件、GPU 固件或网卡固件中

每一次升级都需要攻击方投入更多资金和专业知识，这产生了一个重要效果：**过滤掉休闲作弊者**。一个 30 美元的内核外挂订阅对很多人来说是可及的，但一个定制的 FPGA DMA 设置需要数百美元和大量技术知识来配置。这场军备竞赛虽然让反作弊工程师感到沮丧，但确实服务于一个实际目标：让作弊变得足够昂贵和困难，以至于大多数作弊者望而却步。

### 主流反作弊系统

四个系统主导着竞技游戏领域：

- **BattlEye**：用于 PUBG、彩虹六号围攻、DayZ、Arma 等数十款游戏。其内核组件是 `BEDaisy.sys`
- **EasyAntiCheat (EAC)**：现由 Epic Games 拥有，用于堡垒之夜、Apex Legends、Rust 等
- **Vanguard**：Riot Games 的专有反作弊系统，用于 Valorant 和英雄联盟。它以在系统启动时加载内核组件 `vgk.sys` 而非游戏启动时而著称
- **FACEIT AC**：用于 FACEIT CS 竞技平台

## 内核反作弊的架构

现代内核反作弊普遍遵循三层架构：

```
┌─────────────────────────────────────────────────────────┐
│                    后端服务器                             │
│         (ML 推理、遥测分析、封禁决策)                       │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ 网络通信
                          ▼
┌─────────────────────────────────────────────────────────┐
│              用户态服务 (SYSTEM 权限)                      │
│    • 与内核驱动通信 (IOCTL)                               │
│    • 管理封禁执行                                         │
│    • 收集和传输遥测数据                                    │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ IOCTL / 共享内存
                          ▼
┌─────────────────────────────────────────────────────────┐
│                内核驱动 (Ring 0)                          │
│    • 注册回调、拦截系统调用                                 │
│    • 扫描内存、执行保护                                    │
│    • 这是真正有权力做任何有意义事情的组件                    │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ 命名管道 / 共享内存
                          ▼
┌─────────────────────────────────────────────────────────┐
│              游戏进程内注入的 DLL                          │
│    • 执行用户态检查                                        │
│    • 与服务通信                                           │
│    • 作为游戏进程特定保护的端点                             │
└─────────────────────────────────────────────────────────┘
```

### 通信机制

- **IOCTL (I/O Control Codes)**：用户态与内核驱动之间的主要通信机制。用户态进程打开驱动的设备对象句柄，调用 `DeviceIoControl` 发送控制码
- **命名管道**：服务与游戏注入 DLL 之间的 IPC，比通过内核路由更快更简单
- **共享内存段**：通过 `NtCreateSection` 创建，映射到服务进程和游戏进程，实现高带宽、低延迟的数据共享

### 启动时加载 vs 运行时加载

BattlEye 和 EAC 在游戏启动时加载内核驱动，而 Vanguard 在系统启动时加载 `vgk.sys`。这个区别比看起来更重要：**启动时加载让 Vanguard 可以观察其后加载的每个驱动**。任何在正常驱动初始化阶段加载的外挂驱动，都加载到了 Vanguard 已经"盯着"的系统中。

这也是为什么 Vanguard 需要重启才能启用：驱动必须在系统其余部分初始化之前就位。

## 内核回调：一切的基础

Windows 内核暴露了一组丰富的回调注册 API，原本是为安全产品设计的，反作弊系统使用了每一个。

### ObRegisterCallbacks：进程保护的核心

这可能是进程保护最重要的 API。它允许驱动注册一个回调，当指定对象类型的句柄被打开或复制时触发。对于反作弊来说，感兴趣的对象类型是 `PsProcessType` 和 `PsThreadType`。

```c
OB_CALLBACK_REGISTRATION callbackReg = {0};
OB_OPERATION_REGISTRATION opReg[2] = {0};

UNICODE_STRING altitude = RTL_CONSTANT_STRING(L"31001");

// 监控进程对象的句柄打开
opReg[0].ObjectType = PsProcessType;
opReg[0].Operations = OB_OPERATION_HANDLE_CREATE | OB_OPERATION_HANDLE_DUPLICATE;
opReg[0].PreOperation = ObPreOperationCallback;

// 监控线程对象的句柄打开
opReg[1].ObjectType = PsThreadType;
opReg[1].Operations = OB_OPERATION_HANDLE_CREATE | OB_OPERATION_HANDLE_DUPLICATE;
opReg[1].PreOperation = ObPreOperationCallback;

callbackReg.Version = OB_FLT_REGISTRATION_VERSION;
callbackReg.OperationRegistrationCount = 2;
callbackReg.Altitude = altitude;
callbackReg.OperationRegistration = opReg;

NTSTATUS status = ObRegisterCallbacks(&callbackReg, &gCallbackHandle);
```

当外挂调用 `OpenProcess(PROCESS_VM_READ | PROCESS_VM_WRITE, ...)` 时，反作弊的预操作回调触发。回调检查目标进程是否是受保护的游戏进程，如果是，就从请求的访问权限中剥离 `PROCESS_VM_READ`、`PROCESS_VM_WRITE`、`PROCESS_VM_OPERATION` 和 `PROCESS_DUP_HANDLE`。

外挂收到一个句柄，但这个句柄对于读写游戏内存毫无用处。外挂的 `ReadProcessMemory` 调用将失败并返回 `ERROR_ACCESS_DENIED`。

### PsSetCreateProcessNotifyRoutineEx：进程创建监控

允许驱动在每个进程创建和终止事件上注册回调。反作弊用它来检测外挂工具进程的生成。如果已知的外挂启动器或注入器进程在游戏运行时被创建，反作弊可以立即标记。

更激进的做法是将 `CreateInfo->CreationStatus` 设置为失败代码，**直接阻止进程启动**。

### PsSetLoadImageNotifyRoutine：镜像加载监控

每当镜像（DLL 或 EXE）被映射到任何进程时触发。它在镜像被映射后但入口点执行前触发，这给了反作弊在代码运行前扫描镜像的机会。

反作弊用这个来维护游戏进程中允许的 DLL 白名单，任何不在白名单上的 DLL 加载都会被报告。

### 其他重要回调

- **PsSetCreateThreadNotifyRoutine**：监控线程创建，检测在游戏进程中创建的可疑线程
- **CmRegisterCallbackEx**：监控注册表操作，检测外挂配置自己或修改反作弊设置
- **MiniFilter 驱动**：监控文件系统操作，检测外挂文件写入

## 内存保护与扫描

内核驱动可以做的不止是注册回调。它可以主动扫描游戏进程的内存和系统范围的内存池，寻找外挂痕迹。

### 周期性内存完整性哈希

反作弊定期对游戏可执行文件及其核心 DLL 的代码段（`.text` 段）进行哈希。在游戏启动时计算基线哈希，定期重新哈希并与基线比较。如果哈希改变，说明有人写入了游戏代码——这是代码修补的强烈指示。

### 启发式扫描：检测手动映射的代码

最有趣的内存扫描是手动映射代码的启发式检测。关键启发式是：**找到进程中所有可执行内存区域，然后将每个区域与已加载模块列表交叉引用**。不对应任何已加载模块的可执行内存是可疑的。

```c
// 遍历 VAD 树查找可执行匿名映射
VOID ScanForManuallyMappedCode(PEPROCESS Process) {
    KAPC_STATE apcState;
    KeStackAttachProcess(Process, &apcState);

    PVOID baseAddress = NULL;
    MEMORY_BASIC_INFORMATION mbi;

    while (NT_SUCCESS(ZwQueryVirtualMemory(
        ZwCurrentProcess(),
        baseAddress,
        MemoryBasicInformation,
        &mbi,
        sizeof(mbi),
        NULL)))
    {
        if (mbi.State == MEM_COMMIT &&
            (mbi.Protect & PAGE_EXECUTE_READ ||
             mbi.Protect & PAGE_EXECUTE_READWRITE) &&
            mbi.Type == MEM_PRIVATE)  // 私有，非文件-backed
        {
            // 可执行私有内存 - 不与任何文件映射关联
            // 这是手动映射或 shellcode 的强烈指示
            ReportSuspiciousRegion(mbi.BaseAddress, mbi.RegionSize);
        }

        baseAddress = (PVOID)((ULONG_PTR)mbi.BaseAddress + mbi.RegionSize);
    }

    KeUnstackDetachProcess(&apcState);
}
```

### VAD 树遍历

VAD（虚拟地址描述符）树是内核内部结构，内存管理器用它来跟踪进程中分配的所有内存区域。反作弊直接遍历 VAD 树而不是依赖 `ZwQueryVirtualMemory`，因为 VAD 树不能像模块列表那样被轻易地从内核模式隐藏。

VAD 遍历的威力在于它能够捕获手动映射的代码，即使外挂已经操纵了 PEB 模块列表来隐藏自己。VAD 是用户态代码无法直接修改的内核结构。

## 注入检测

### CreateRemoteThread 注入

经典注入技术：在目标进程中以 `LoadLibraryA` 作为线程起始地址调用 `CreateRemoteThread`。这通过 `PsSetCreateThreadNotifyRoutine` 可以轻易检测：新线程的起始地址将是 `LoadLibraryA`，而且调用者进程不是游戏本身。

### APC 注入

`QueueUserAPC` 和底层的 `NtQueueApcThread` 允许向任何进程中的线程排队异步过程调用。当目标线程进入可警报等待状态时，APC 触发并在目标线程上下文中执行任意代码。

反作弊可以检查游戏进程线程的待处理 APC 队列，检测可疑的 APC 目标。

### 反射式 DLL 注入和手动映射

反射式 DLL 注入在 DLL 中嵌入一个反射式加载器，执行时将 DLL 映射到内存而不使用 `LoadLibrary`。结果是一个功能完整的 DLL 在内存中，但永远不会出现在 `InLoadOrderModuleList` 中。

检测方法：可执行内存中有有效的 PE 头（检查 `MZ` 魔数和 `PE\0\0` 签名），但没有相应的模块列表条目。

## Hook 检测

Hook 是用户态外挂拦截和操纵游戏与操作系统交互的主要机制。

### IAT Hook 检测

导入地址表（IAT）包含导入函数的地址。IAT hook 用指向攻击者控制代码的指针覆盖其中一个条目。

检测很简单：对于每个 IAT 条目，将解析的地址与磁盘上 DLL 导出的正确地址进行比较。

### Inline Hook 检测

Inline hook 用 `JMP` 指令（操作码 `0xE9` 或 `0xFF 0x25`）修补函数的前几个字节，将执行重定向到攻击者代码。

检测涉及读取每个受监控函数的前 16-32 字节，检查：
- `0xE9` (JMP rel32)
- `0xFF 0x25` (JMP [rip+disp32])
- `0x48 0xB8 ... 0xFF 0xE0` (MOV RAX, imm64; JMP RAX) - 64 位绝对跳转序列
- `0xCC` (INT 3) - 软件断点

反作弊读取磁盘上的 PE 文件，将磁盘上函数序言的字节与内存中当前的字节进行比较。任何差异都表示修补。

## 驱动级保护

### 检测未签名和测试签名驱动

在启用了 Secure Boot 的正确配置的 Windows 系统上，所有内核驱动必须由 Microsoft 信任的证书签名。测试签名模式（通过 `bcdedit /set testsigning on` 启用）允许加载自签名驱动，是常见的开发和外挂部署技术。

反作弊通过读取 Windows 启动配置和检查反映 DSE 是否当前执行的内核变量来检测测试签名模式。一些反作弊拒绝在启用测试签名时启动。

### BYOVD 攻击

**自带易受攻击驱动（BYOVD）** 是 2024-2026 年加载未签名内核代码的主导技术。攻击原理：

1. 攻击者找到一个具有漏洞的合法签名驱动
2. 攻击者加载这个合法驱动（通过 DSE 因为它有有效签名）
3. 攻击者利用漏洞实现任意内核代码执行
4. 使用该内核执行，攻击者禁用 DSE 或直接映射其未签名的外挂驱动

常见的 BYOVD 目标包括来自 MSI、Gigabyte、ASUS 和各种硬件厂商的驱动。这些驱动通常有暴露直接物理内存读写能力的 IOCTL 处理程序。

### 驱动黑名单

对抗 BYOVD 的主要防御是已知易受攻击驱动的黑名单。Microsoft 易受攻击驱动黑名单（在 `DriverSiPolicy.p7b` 中维护）内置于 Windows 并通过 Windows 更新分发。反作弊维护自己更积极的黑名单。

Vanguard 尤其以主动将已加载驱动集与其黑名单比较而闻名，**拒绝允许受保护游戏在存在黑名单驱动时启动**。

### PiDDBCacheTable

`PiDDBCacheTable` 是一个内核内部 AVL 树，缓存有关先前加载驱动的信息。当驱动加载时，内核存储一个以驱动 PE 头中的 `TimeDateStamp` 和 `SizeOfImage` 为键的条目。

手动映射驱动而不通过正常加载路径的外挂开发者试图擦除或修改相应的 `PiDDBCacheTable` 条目以隐藏其驱动曾经被加载。反作弊通过以下方式检测：

1. 验证 `PiDDBCacheTable` 的一致性
2. 监控 `PiDDBLock` 的意外获取
3. 将所有已知已加载驱动的时间戳/大小组合与 `PiDDBCacheTable` 条目比较

## 反调试保护

反作弊代码本身是逆向工程的高价值目标。分析反作弊驱动的逆向工程师需要使用内核调试器，反作弊系统会积极检测这些。

### 内核调试器检测

内核驱动检查内核导出变量 `KdDebuggerEnabled` 和 `KdDebuggerNotPresent`。在附带了 WinDbg（或任何内核调试器）的系统上，`KdDebuggerEnabled` 为 TRUE，`KdDebuggerNotPresent` 为 FALSE。

```c
BOOLEAN IsKernelDebuggerPresent(void) {
    if (*KdDebuggerEnabled && !*KdDebuggerNotPresent) {
        return TRUE;
    }
    return FALSE;
}
```

### 线程隐藏检测

`NtSetInformationThread` 和 `ThreadHideFromDebugger` 在线程的 `ETHREAD` 结构中设置一个标志。一旦设置，内核不会向任何附加的调试器传递该线程的调试事件。

反作弊用这个保护自己的线程，但也检测外挂是否用它隐藏自己的注入线程。检测方法是枚举系统中的所有线程，检查每个线程的 `HideFromDebugger` 位。

### 基于时序的反调试

单步调试和硬件断点大大增加了指令执行之间的时间。反作弊使用 `RDTSC` 指令基于时序来检测：

```c
UINT64 before = __rdtsc();
volatile ULONG dummy = 0;
for (int i = 0; i < 1000; i++) dummy += i;
UINT64 after = __rdtsc();

if ((after - before) > EXPECTED_MAXIMUM_CYCLES) {
    ReportDebuggerDetected();
}
```

## DMA 外挂与检测

DMA 外挂代表了当前反作弊军备竞赛的前沿，它们确实很难用软件单独解决。

### 什么是 DMA 外挂

PCIe DMA（直接内存访问）外挂使用 PCIe 连接的设备——通常是开发用 FPGA 板——可以通过 PCIe 总线直接读取主机系统的物理内存，而不涉及 CPU。`pcileech` 框架及其 `LeechCore` 库为这些设备提供软件栈。

攻击机器（运行外挂软件）与受害者机器（运行游戏）物理分离。所有外挂逻辑运行在攻击者的机器上。游戏机器没有来自外挂的进程、驱动或内存分配。**从纯软件角度来看，游戏机器完全干净。**

```
┌──────────────────┐        PCIe 总线        ┌──────────────────┐
│   游戏机器        │◄──────────────────────►│   FPGA 设备       │
│   (受害者)       │      TLP 协议           │   (DMA 攻击)      │
│                  │                         │                  │
│   物理内存        │    无 CPU 参与          └────────┬─────────┘
│   ↑              │                                  │
└───┼──────────────┘                                  │
    │                                                   │
    │ 读取                                              │ USB/网络
    │                                                   │
    ▼                                                   ▼
┌──────────────────┐                         ┌──────────────────┐
│   页表            │                         │   外挂机器        │
│   (物理内存)      │                         │   (攻击者)       │
└──────────────────┘                         │   外挂软件        │
                                             └──────────────────┘
```

### IOMMU 作为防御

IOMMU（Intel VT-d，AMD-Vi）是一个硬件单元，使用设备特定的页表翻译来自 PCIe 设备的 DMA 地址。如果 IOMMU 启用并正确配置，PCIe 设备只能访问 OS 通过 IOMMU 页表明确授予它的物理内存。

**然而，在实践中，IOMMU 防御有重大缺口：**

- 许多游戏主板默认禁用 IOMMU
- 即使启用，IOMMU 配置复杂，许多系统有错误配置的 IOMMU 策略
- 成功冒充合法 PCIe 设备的 DMA 固件可以使用合法设备的授权通过 IOMMU 访问内存

### Secure Boot 和 TPM 作为部分缓解

Epic Games 对堡垒之夜要求 Secure Boot 和 TPM 2.0 与 DMA 威胁直接相关。Secure Boot 确保只有签名的引导加载程序运行，TPM 2.0 支持度量启动，提供证明链证明系统以已知良好状态启动。

这并不直接解决 DMA 问题（物理连接到 PCIe 插槽的 DMA 攻击设备绕过所有这些），但它关闭了一些软件辅助的 DMA 攻击路径。

## 行为检测与遥测

没有静态保护方案是足够的。**行为检测操作于游戏遥测，是解决内核保护无法解决的问题的补充层。**

### 鼠标和输入分析

内核反作弊驱动可以拦截原始输入，然后它到达游戏。通过在 `mouclass.sys` 或 `kbdclass.sys` 之上安装过滤驱动，反作弊可以观察所有具有系统时钟精度的输入事件。

**自瞄检测**针对鼠标移动的统计特性：
- 人类瞄准遵循 Fitts 定律
- 光标接近目标时有特征性减速
- 速度曲线有特定的加速和减速曲线
- 存在测量噪声

自瞄执行完美的线性插值到目标会产生违反这些属性的运动。

### 机器学习检测

CheckMATE 2024 论文记录了 CNN 在触发器机器人检测上的应用，在标记数据集上达到约 99.2% 的准确率。AntiCheatPT 论文（2025）将 Transformer 架构应用于自瞄检测，使用 256 tick 窗口和每 tick 44 个数据点，达到 89.17% 的准确率。

```
人类鼠标轨迹:                    自瞄鼠标轨迹:
    ___                           ___________
   /   \___                      |           |
  /        \___                  |           |
 /            \___________       |     ▼     |
| 目标                      |    |     │     |
                            |    |     │     |
                             \___|_____▼_____│
                                  (瞬间跳转)
    (自然的 S 曲线，有超调和微修正)    (空闲后立即线性跳跃)
```

### 遥测管道

从原始数据到封禁决策的流程：

1. 内核驱动捕获输入事件并在硬件中断级别打时间戳
2. 这些事件写入共享内存环形缓冲区
3. 用户态服务从环形缓冲区读取，批量事件，加密，传输到后端服务器
4. 后端 ML 推理在事件流上运行并产生异常分数
5. 人工审核队列接收高置信度标记的会话
6. 封禁决策通过服务推送回游戏客户端

## 硬件指纹与封禁执行

反作弊收集多个硬件标识符来创建唯一的指纹，该指纹在账户封禁后仍然有效：

- **SMBIOS 数据**：制造商、产品名称、序列号、UUID
- **磁盘序列号**：通过 IOCTL `IOCTL_STORAGE_QUERY_PROPERTY` 获取物理磁盘序列号
- **GPU 标识符**：设备实例 ID、适配器 LUID
- **MAC 地址**：通过 NDIS 或注册表获取的 NIC MAC 地址
- **启动 GUID**：`HKLM\SOFTWARE\Microsoft\Cryptography` 中的 `MachineGuid` 或 UEFI 固件的平台 UUID

### HWID 欺骗与检测

HWID 欺骗涉及修改反作弊读取的标识符以逃避硬件封禁。反作弊通过交叉引用多个标识符来源来检测欺骗：

- 如果 SMBIOS UUID 是 `FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF`（常见的欺骗值），这是立即的标记
- 如果报告的磁盘型号是"Samsung 970 EVO"但磁盘序列号格式与三星的格式不匹配，这是欺骗指示
- 如果 UEFI 固件表报告一个 UUID 而注册表报告不同的 UUID，注册表值已被篡改

## 军备竞赛：当前趋势与未来方向

### AI 驱动的外挂

下一代威胁是由计算机视觉模型驱动的自瞄，运行在 GPU 或辅助计算机上。这些系统使用摄像头或屏幕捕获来分析游戏帧，识别目标，并通过硬件（USB HID 设备，完全绕过软件输入检查）移动鼠标。

从游戏机器的角度来看，通过硬件 HID 操作的 AI 自瞄与使用鼠标的人类完全无法区分。所有输入都通过合法的硬件通道。游戏进程中没有运行代码。内核完全干净。**唯一的检测面是行为特征：AI 产生的准确性、反应时间和运动模式。**

这就是为什么行为 ML 方法越来越成为有效反作弊的核心。

### 隐私争议

内核级反作弊在隐私倡导者中极度不受欢迎。批评是实质性的：

运行在 Ring 0 的启动时加载驱动可以访问系统上的一切。虽然 BattlEye、EAC 和 Vanguard 没有被记录滥用此访问进行监视，但**技术能力存在**。`vgk.sys` 中的漏洞是到 Ring 0 的本地特权提升。反作弊软件本身成为攻击目标。

### 基于证明的方法

反作弊技术上最有前途的方向是远程证明。系统向游戏服务器证明它以已知良好状态运行，而不是运行一个主动对抗外挂的 Ring-0 驱动。

TPM 基于的度量启动，结合 UEFI Secure Boot，可以生成加密签名的证明，证明特定引导加载程序、内核和驱动被加载。服务器拒绝无法提供有效证明的系统的连接。

这不是完整的解决方案（足够复杂的攻击者可能操纵证明），但它显著提高了门槛。

### 云游戏作为反作弊

云游戏（GeForce Now、Xbox Cloud Gaming）在架构上是某些游戏类别的终极反作弊。如果游戏运行在数据中心，只有视频流式传输到客户端，就没有游戏客户端代码可利用，没有游戏内存可读取，没有本地环境可操纵。

**约束是延迟**：云游戏不适合单数毫秒反应时间很重要的竞技游戏。

## 总结

现代内核反作弊系统代表了跨 Windows 特权模型每个可用级别的分层防御架构：

- **内核回调**提供对系统事件的实时可见性和主动阻止恶意操作的能力
- **内存扫描**提供游戏内存未被篡改且不存在注入代码的定期验证
- **行为遥测**捕获架构上对内核扫描不可见的外挂
- **硬件指纹**跨账户重置执行封禁决策
- **反调试和反 VM 保护**使逆向工程和开发显著更困难

**没有单一技术是足够的。** 内核回调可以被 DMA 攻击绕过。内存扫描可以被拦截内存读取的基于虚拟机监控器的外挂逃避。行为检测可以被足够模仿人类的 AI 欺骗。硬件指纹可以被硬件欺骗器击败。是所有这些层的组合，持续更新以响应新的逃避技术，才提供了有意义的保护。

这场军备竞赛的轨迹指向硬件证明和服务器端验证作为可信游戏安全的最终基础。**纯软件的客户端保护永远是不对称的：防御者必须检查一切，攻击者只需要找到一个缺口。** 硬件证明通过使在操作修改过的系统时证明可信状态变得极其困难来改变这种不对称性。

在那个基础普遍可用和强制执行之前，内核反作弊仍然是可用的最佳实际防御，伴随着所有相关的复杂性、隐私影响和攻击面。

---

## 参考文献

1. Collins, R. et al. "Anti-Cheat: Attacks and the Effectiveness of Client-Side Defences." CheckMATE 2024
2. Vella, R. et al. "If It Looks Like a Rootkit and Deceives Like a Rootkit: A Critical Analysis of Kernel-Level Anti-Cheat Systems." ARES 2024
3. Sousa, J. et al. "AntiCheatPT: A Transformer-Based Approach to Cheat Detection in First-Person Shooter Games." 2025
4. secret.club. "Reversing BattlEye's anti-cheat kernel driver." 2019
5. back.engineering. "Reversing BEDaisy.sys." 2020

---

## 个人点评

这篇文章是迄今为止我读过的最全面的内核级反作弊系统技术解析。作者不仅涵盖了反作弊的各个方面，还深入到了 Windows 内核内部结构（如 VAD 树、PiDDBCacheTable）的实现细节。

对于中国开发者来说，这篇文章的价值在于：

1. **深入理解 Windows 内核编程**：文章中的回调机制、内存扫描、VAD 遍历等技术对于任何从事系统级编程的开发者都有参考价值
2. **安全研究视角**：了解攻防两方的技术博弈，对于理解现代软件保护机制很有帮助
3. **隐私与安全的权衡**：内核级反作弊引发的隐私争议值得所有软件工程师思考

这场猫鼠游戏远未结束。随着 AI 驱动的外挂和固件级攻击的出现，反作弊技术还将继续进化。作为开发者，我们需要关注这个领域的最新动态，因为它代表了软件安全领域的前沿战场。
