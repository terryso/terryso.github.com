---
layout: post
title: "内核级反作弊系统深度解析：现代游戏保护机制探秘"
date: 2026-03-15 12:01:00 +0800
categories: tech-translation
description: "本文深入剖析现代内核级反作弊系统的工作原理，涵盖 BattlEye、EasyAntiCheat、Vanguard 等主流方案的技术架构、内核回调机制、内存保护策略，以及 DMA 攻击与检测的前沿攻防博弈。"
original_url: https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work/
source: Hacker News
---

本文翻译自 [How Kernel Anti-Cheats Work: A Deep Dive into Modern Game Protection](https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work/)，原载于 Hacker News。

---

## 引言

毫不夸张地说，现代内核级反作弊系统（kernel anti-cheat）是运行在消费级 Windows 机器上最复杂的软件之一。它们运行在软件可用的最高权限级别，拦截本应为合法安全产品设计的内核回调，扫描大多数程序员整个职业生涯都不曾触碰的内存结构——而且这一切都在游戏运行时透明地进行。

如果你曾经好奇 BattlEye 是如何检测到作弊器的，或者 Vanguard 为什么坚持在 Windows 启动前加载，又或者 PCIe DMA 设备是如何绕过所有这些保护措施的——这篇文章就是为你准备的。

> **译者注**：这篇文章由安全研究员 Adrian 撰写，基于公开研究、内核源码阅读和驱动逆向分析。虽然不是官方文档，但其技术深度和实践价值都非常高，适合对 Windows 内核安全和游戏安全感兴趣的开发者阅读。

## 1. 为什么用户态保护远远不够

### 信任模型的根本问题

用户态（usermode）反作弊的根本问题在于**信任模型**。用户态进程运行在 ring 3，完全受制于内核的权威。任何完全在用户态实现的保护都可以被任何运行在更高权限级别的代码绕过——在 Windows 上，这意味着 ring 0（内核驱动）或更低级别（hypervisor、固件）。

一个用户态反作弊如果调用 `ReadProcessMemory` 来检查游戏内存完整性，可以被一个 hook 了 `NtReadVirtualMemory` 并返回伪造数据的内核驱动击败。一个用户态反作弊如果通过 `EnumProcessModules` 枚举已加载模块，可以被一个修补 PEB 模块列表的驱动击败。用户态进程对发生在它之上的事情完全盲视。

作弊开发者比大多数反作弊工程师愿意承认的更早理解了这一点。内核长期以来是作弊器的专属领地。内核态作弊器可以直接操作游戏内存，无需通过任何用户态反作弊可以拦截的 API。它们可以轻易从用户态枚举 API 中隐藏自己的存在。它们可以拦截和伪造用户态反作弊可能执行的任何检查的结果。

回应是不可避免的：**把反作弊移到内核中去**。

### 持续升级的军备竞赛

这种升级是无情的：用户态作弊催生了内核作弊，内核反作弊随之出现。作弊开发者开始利用带有漏洞的合法签名驱动来实现内核执行，而无需加载未签名驱动（BYOVD 攻击）。反作弊以阻止列表和更严格的驱动枚举作为回应。作弊开发者转向 hypervisor，在内核之下运行并虚拟化整个操作系统。反作弊添加了 hypervisor 检测。作弊开发者开始使用 PCIe DMA 设备通过硬件直接读取游戏内存，完全不触碰操作系统。对此的回应仍在开发中。

每次升级都要求攻击方投入更多的资金和专业知识，这产生了一个重要效果：**过滤掉普通作弊者**。30 美元的内核作弊订阅对许多人来说是可负担的。一个定制的 FPGA DMA 设置需要数百美元，并且需要大量技术知识来配置。虽然对反作弊工程师来说很令人沮丧，但这场军备竞赛确实服务于一个实际目标：使作弊变得足够昂贵和困难，以至于大多数作弊者不会费心。

### 主流反作弊系统

四个系统主导着竞技游戏领域：

- **BattlEye**：被 PUBG、彩虹六号围攻、DayZ、Arma 和数十个其他游戏使用。其内核组件是 `BEDaisy.sys`，已成为详细的公开逆向工程工作的对象。
- **EasyAntiCheat (EAC)**：现归 Epic Games 所有，用于堡垒之夜、Apex 英雄、Rust 等。其架构与 BattlEye 的三层组件设计大致相似，但在实现细节上差异显著。
- **Vanguard**：Riot Games 的专有反作弊系统，用于无畏契约和英雄联盟。值得注意的是，它在系统启动时而非游戏启动时加载其内核组件 `vgk.sys`，并采取激进的驱动白名单立场。
- **FACEIT AC**：用于 Counter-Strike 的 FACEIT 竞技平台。它是一个内核级系统，在竞技社区中享有有效检测作弊的声誉。

## 2. 内核反作弊的架构

### 三层组件模型

现代内核反作弊普遍遵循三层架构：

1. **内核驱动**：运行在 ring 0。注册回调、拦截系统调用、扫描内存、执行保护。这是真正有权力做任何有意义事情的组件。
2. **用户态服务**：作为 Windows 服务运行，通常具有 `SYSTEM` 权限。通过 IOCTL 与内核驱动通信。处理与后端服务器的网络通信、管理封禁执行、收集和传输遥测数据。
3. **游戏注入 DLL**：注入（或被加载到）游戏进程。执行用户态检查，与服务通信，作为专门应用于游戏进程的保护端点。

这种关注点分离既是架构上的，也是安全动机上的。内核驱动可以做任何用户态组件无法做的事情，但它不能轻易建立网络连接或实现复杂的应用逻辑。服务可以做这些事情，但不能直接拦截系统调用。游戏内 DLL 可以直接访问游戏状态，但运行在一个不可信的 ring-3 环境中。

### 启动时 vs 运行时驱动加载

BattlEye 和 EAC 在游戏启动时加载其内核驱动。`BEDaisy.sys` 及其 EAC 等效物被注册为按需启动驱动，当游戏启动时由服务通过 `ZwLoadDriver` 加载。游戏退出时它们被卸载。

**Vanguard 则不同**：它在系统启动时加载 `vgk.sys`。该驱动被配置为启动启动驱动（`SERVICE_BOOT_START`），意味着 Windows 内核在系统大部分初始化之前就加载它。这给 Vanguard 一个关键优势：它可以观察在它之后加载的每个驱动。任何在 `vgk.sys` 之后加载的驱动都可以在其代码以有意义的方式运行之前被检查。

启动时加载的实际意义也是为什么 Vanguard 需要系统重启才能启用：驱动必须在系统其余部分初始化之前就位，这意味着它不能在事后加载而不重启。

## 3. 内核回调和监控

这是内核反作弊所做一切的基础。Windows 内核暴露了一组丰富的回调注册 API，本意是为安全产品设计的，反作弊使用了每一个。

### ObRegisterCallbacks：进程保护的基石

`ObRegisterCallbacks` 可能是进程保护最重要的 API。它允许驱动注册一个回调，当指定对象类型的句柄被打开或复制时被调用。对于反作弊来说，感兴趣的对象类型是 `PsProcessType` 和 `PsThreadType`。

```c
OB_CALLBACK_REGISTRATION callbackReg = {0};
OB_OPERATION_REGISTRATION opReg[2] = {0};

// Altitude 字符串是必需的 - 每个驱动必须唯一
UNICODE_STRING altitude = RTL_CONSTANT_STRING(L"31001");

// 监控进程对象的句柄打开
opReg[0].ObjectType = PsProcessType;
opReg[0].Operations = OB_OPERATION_HANDLE_CREATE | OB_OPERATION_HANDLE_DUPLICATE;
opReg[0].PreOperation = ObPreOperationCallback;
opReg[0].PostOperation = ObPostOperationCallback;

// 监控线程对象的句柄打开
opReg[1].ObjectType = PsThreadType;
opReg[1].Operations = OB_OPERATION_HANDLE_CREATE | OB_OPERATION_HANDLE_DUPLICATE;
opReg[1].PreOperation = ObPreOperationCallback;
opReg[1].PostOperation = NULL;

callbackReg.Version = OB_FLT_REGISTRATION_VERSION;
callbackReg.OperationRegistrationCount = 2;
callbackReg.Altitude = altitude;
callbackReg.RegistrationContext = NULL;
callbackReg.OperationRegistration = opReg;

NTSTATUS status = ObRegisterCallbacks(&callbackReg, &gCallbackHandle);
```

pre-operation 回调接收一个 `POB_PRE_OPERATION_INFORMATION` 结构。关键字段是 `Parameters->CreateHandleInformation.DesiredAccess`。回调可以通过在创建句柄之前修改 `DesiredAccess` 来剥夺访问权限。这就是反作弊如何防止外部进程以 `PROCESS_VM_READ` 或 `PROCESS_VM_WRITE` 访问权限打开游戏进程句柄的方式。

当作弊器调用 `OpenProcess(PROCESS_VM_READ | PROCESS_VM_WRITE, FALSE, gameProcessId)` 时，反作弊的 `ObRegisterCallbacks` pre-operation 回调被触发。回调检查目标进程是否是受保护的游戏进程。如果是，它从所需访问权限中剥夺 `PROCESS_VM_READ`、`PROCESS_VM_WRITE`、`PROCESS_VM_OPERATION` 和 `PROCESS_DUP_HANDLE`。作弊器收到一个句柄，但这个句柄对于读取或写入游戏内存是无用的。作弊器的 `ReadProcessMemory` 调用将因 `ERROR_ACCESS_DENIED` 而失败。

### PsSetCreateProcessNotifyRoutineEx：进程创建监控

这个 API 允许驱动注册一个回调，在每个进程创建和终止事件时触发，系统范围内有效。回调接收进程的 `PEPROCESS`、PID，以及一个包含正在创建的进程详细信息（镜像名称、命令行、父 PID）的 `PPS_CREATE_NOTIFY_INFO` 结构。

值得注意的是，`Ex` 变体（在 Windows Vista SP1 中引入）提供了镜像文件名和命令行，而原始的 `PsSetCreateProcessNotifyRoutine` 不提供。

反作弊使用此回调来检测作弊工具进程在系统上生成。如果已知的作弊启动器或注入器进程在游戏运行时被创建，反作弊可以立即标记。一些实现还设置 `CreateInfo->CreationStatus` 为失败代码，以完全阻止进程启动。

### PsSetLoadImageNotifyRoutine：镜像加载监控

当镜像（DLL 或 EXE）被映射到任何进程时触发。它提供镜像文件名和一个包含基地址和大小的 `PIMAGE_INFO` 结构。

这个回调在 IRQL `PASSIVE_LEVEL` 运行。回调在镜像被映射后但在其入口点执行之前触发，这给反作弊一个在镜像的任何代码运行之前扫描它的机会。

## 4. 内存保护和扫描

内核驱动可以做的远不止注册回调。它可以主动扫描游戏进程的内存和系统范围的内存池，寻找作弊的痕迹。

### 句柄访问阻断

如 `ObRegisterCallbacks` 部分所述，保护游戏内存免受外部读取和写入的主要机制是从打开到游戏进程的句柄中剥夺 `PROCESS_VM_READ` 和 `PROCESS_VM_WRITE`。这对任何使用标准 Win32 API（`ReadProcessMemory`、`WriteProcessMemory`）的作弊器都有效，因为这些最终调用 `NtReadVirtualMemory` 和 `NtWriteVirtualMemory`，它们需要适当的句柄访问权限。

然而，内核态作弊器可以完全绕过这一点。它可以直接调用 `MmCopyVirtualMemory`（一个未导出但可定位的内核函数），或直接操作页表项来访问游戏内存，而无需通过基于句柄的访问控制系统。这就是为什么仅靠句柄保护是不够的，以及为什么内核级作弊需要内核级反作弊响应。

### 周期性内存完整性哈希

反作弊定期对游戏可执行文件及其核心 DLL 的代码段（`.text` 段）进行哈希。在游戏启动时计算基准哈希，周期性重新哈希与基准进行比较。如果哈希发生变化，说明有人写入了游戏代码，这是代码修补的强烈指标（通常用于启用无后座力、加速或自瞄功能）。

`KeStackAttachProcess` / `KeUnstackDetachProcess` 模式用于临时将调用线程附加到目标进程的地址空间，允许驱动读取映射到游戏进程的内存，而无需通过基于句柄的访问控制。

### 启发式扫描：检测手动映射的代码

最有趣的内存扫描是手动映射代码的启发式检测。当合法 DLL 加载时，它出现在进程的 PEB 模块列表中，在 `InLoadOrderModuleList` 中，并且有一个相应的 `VAD_NODE` 条目，其 `MemoryAreaType` 指示映射来自文件。手动映射绕过正常加载器，所以映射的代码在内存中显示为匿名私有映射或具有可疑特征的文件支持映射。

**关键启发式**：找到进程中所有可执行内存区域，然后将每一个与已加载模块列表进行交叉引用。不对应任何已加载模块的可执行内存是可疑的。

```c
// 遍历 VAD 树以找到可执行的匿名映射
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
             mbi.Protect & PAGE_EXECUTE_READWRITE ||
             mbi.Protect & PAGE_EXECUTE_WRITECOPY) &&
            mbi.Type == MEM_PRIVATE)  // 私有，非文件支持
        {
            // 可执行私有内存 - 不与任何文件映射关联
            // 这是手动映射或 shellcode 的强烈指标
            ReportSuspiciousRegion(mbi.BaseAddress, mbi.RegionSize,
                                   "无文件支持的可执行私有内存");
        }

        baseAddress = (PVOID)((ULONG_PTR)mbi.BaseAddress + mbi.RegionSize);
        if ((ULONG_PTR)baseAddress >= 0x7FFFFFFFFFFF) break;
    }

    KeUnstackDetachProcess(&apcState);
}
```

### VAD 树遍历

VAD（Virtual Address Descriptor）树是内核内部结构，内存管理器用它来跟踪进程中分配的所有内存区域。每个 `VAD_NODE`（实际上是一个 `MMVAD` 结构）包含关于区域的信息：其基地址和大小、保护、是否是文件支持的（以及如果是，哪个文件）以及各种标志。

反作弊直接遍历 VAD 树，而不是依赖 `ZwQueryVirtualMemory`，因为 VAD 树不能像模块列表可以被操作那样从内核模式简单地隐藏。

**VAD 遍历的威力**在于它甚至可以捕获手动映射的代码，即使作弊器已经操纵了 PEB 模块列表或 `LDR_DATA_TABLE_ENTRY` 链来隐藏自己。VAD 是一个用户态代码无法直接修改的内核结构。

## 5. 反注入检测

### CreateRemoteThread 注入

经典注入技术：在目标进程中调用 `CreateRemoteThread`，以 `LoadLibraryA` 作为线程起始地址，DLL 路径作为参数。这通过 `PsSetCreateThreadNotifyRoutine` 可以轻易检测：新线程的起始地址将是 `LoadLibraryA`（或者说是它在 kernel32.dll 中的地址），而且调用者进程不是游戏本身。

一个更微妙的检查是创建线程的 `CLIENT_ID`。当调用 `CreateRemoteThread` 时，内核记录哪个进程创建了线程。反作弊可以检查游戏进程中的线程是否由外部进程创建，这是注入的可靠指标。

### APC 注入

`QueueUserAPC` 和底层的 `NtQueueApcThread` 允许向任何进程中的线程排队异步过程调用（APC），只要调用者有 `THREAD_SET_CONTEXT` 访问权限。当目标线程进入可警报等待状态时，APC 触发并在目标线程上下文中执行任意代码。

在内核级别的检测利用 `KAPC` 结构。每个线程有一个内核 APC 队列和一个用户 APC 队列。反作弊可以检查游戏进程线程的待处理 APC 队列，以检测可疑的 APC 目标。

### 反射式 DLL 注入和手动映射

反射式 DLL 注入在 DLL 内部嵌入一个反射式加载器，当执行时，将 DLL 映射到内存而不使用 `LoadLibrary`。DLL 解析自己的 PE 头，解析导入，应用重定位，并调用 `DllMain`。结果是一个在内存中完全功能的 DLL，从未出现在 `InLoadOrderModuleList` 中。

**检测方法**：可执行内存中存在有效的 PE 头（检查 `MZ` 魔术字节和 `e_lfanew` 指定偏移处的 `PE\0\0` 签名）但没有相应的模块列表条目。这是一个可靠的指标。

### 使用 RtlWalkFrameChain 的栈遍历

当 BEDaisy 想要检查线程的调用栈时，它使用 APC 机制在线程处于用户模式时捕获栈帧。APC 在游戏线程的上下文中触发，并调用 `RtlWalkFrameChain` 或 `RtlCaptureStackBackTrace` 来捕获返回地址链。

BEDaisy 将内核 APC 排队到受保护进程中的线程。APC 内核例程在 `APC_LEVEL` 运行，捕获线程的栈，然后根据已加载模块列表分析每个返回地址。指向任何已加载模块之外的返回地址是栈上有注入代码的强烈指标，这表明线程当前正在执行注入的代码或从中返回。

## 6. Hook 检测

Hook 是用户态作弊器拦截和操纵游戏与操作系统交互的主要机制。检测它们是反作弊的核心功能。

### IAT Hook 检测

PE 文件的导入地址表（IAT）包含导入函数的地址。当进程加载时，加载器通过在导出 DLL 中查找每个导入函数并将其地址写入 IAT 来解析这些地址。IAT hook 用指向攻击者控制的代码的指针覆盖其中一个条目。

**检测很直接**：对于每个 IAT 条目，将解析的地址与正确 DLL 的磁盘导出应该说的地址进行比较。

### Inline Hook 检测

Inline hook 用 `JMP`（相对近跳转的操作码 `0xE9`，或通过内存指针间接跳转的 `0xFF 0x25`）修补函数的前几个字节，以将执行重定向到攻击者代码，攻击者代码通常执行其修改，然后跳回原始代码（"蹦床"模式）。

检测涉及读取每个受监控函数的前 16-32 字节并检查：

- `0xE9`（JMP rel32）
- `0xFF 0x25`（JMP [rip+disp32]）- 64 位 hook 常用
- `0x48 0xB8 ... 0xFF 0xE0`（MOV RAX, imm64; JMP RAX）- 绝对 64 位跳转序列
- `0xCC`（INT 3）- 软件断点，也可以是一个 hook 点

反作弊读取磁盘 PE 文件，并将函数序言的磁盘字节与当前内存中的内容进行比较。任何差异都表明修补。

### SSDT 完整性检查

系统服务描述符表（SSDT）是内核的系统调用分发表。当用户态进程执行系统调用指令时，内核使用系统调用号（放在 EAX 中）索引到 SSDT 并调用相应的内核函数。修补 SSDT 将系统调用重定向到攻击者控制的代码。

SSDT hook 是一种经典技术，在 64 位 Windows 引入 PatchGuard（内核补丁保护，KPP）后变得显著困难。PatchGuard 监控 SSDT（以及许多其他结构），如果检测到修改则触发 `CRITICAL_STRUCTURE_CORRUPTION` 错误检查（0x109）。因此，SSDT hook 在 64 位 Windows 中基本已死。然而，反作弊仍然验证 SSDT 完整性作为纵深防御措施。

## 7. 驱动级保护

### 检测未签名和测试签名驱动

在正确配置并启用 Secure Boot 的 Windows 系统上，所有内核驱动必须由 Microsoft 信任的证书签名。测试签名模式（使用 `bcdedit /set testsigning on` 启用）允许加载自签名驱动，是开发和作弊部署的常用技术。

反作弊通过读取 Windows 启动配置和检查反映当前是否执行 DSE 的内核变量来检测测试签名模式。一些反作弊如果启用了测试签名则拒绝启动。

### BYOVD 攻击

**Bring Your Own Vulnerable Driver（自带易受攻击驱动）** 是 2024-2026 年加载未签名内核代码的主导技术。攻击工作原理如下：

1. 攻击者找到一个带有漏洞的合法签名驱动（通常是一个危险的 IOCTL 处理程序，允许任意内核内存读/写，或用攻击者控制的参数调用 `MmMapIoSpace`）。
2. 攻击者加载这个合法驱动（它通过 DSE 因为有有效签名）。
3. 攻击者利用合法驱动中的漏洞实现任意内核代码执行。
4. 使用该内核执行，攻击者禁用 DSE 或直接映射其未签名作弊驱动。

常见的 BYOVD 目标包括 MSI、Gigabyte、ASUS 和各种硬件供应商的驱动。这些驱动通常有暴露直接物理内存读/写能力的 IOCTL 处理程序，这就是攻击者所需要的全部。

### 反作弊驱动阻止列表

对抗 BYOVD 的主要防御是已知易受攻击驱动的阻止列表。Microsoft 易受攻击驱动阻止列表（在 `DriverSiPolicy.p7b` 中维护）内置于 Windows 并通过 Windows Update 分发。反作弊维护自己的更激进的阻止列表。

特别是 Vanguard 以主动比较已加载驱动集与其阻止列表而闻名，如果存在阻止列表中的驱动，则拒绝允许受保护的游戏启动。这是强制执行的，因为一些 BYOVD 攻击涉及加载易受攻击驱动并立即使用它，然后卸载它，因此在游戏启动时预扫描覆盖了大多数情况。

### PiDDBCache 和 PiDDBLock

这是内核作弊开发者和反作弊工程师都深切关心的更有趣的内部机制之一。

`PiDDBCacheTable` 是一个内核内部 AVL 树，缓存关于以前加载驱动的信息。当驱动被加载时，内核存储一个由驱动的 `TimeDateStamp`（来自 PE 头）和 `SizeOfImage` 键控的条目。这个缓存用于快速查找驱动以前是否被见过。该结构是一个由 `PiDDBLock`（一个 `ERESOURCE` 锁）保护的 `RTL_AVL_TABLE`。

不通过正常加载路径手动映射驱动的作弊开发者试图擦除或修改相应的 `PiDDBCacheTable` 条目，以隐藏他们的驱动曾经被加载过。反作弊通过以下方式检测：

1. 验证 `PiDDBCacheTable` 的一致性 - 如果驱动在内存中（通过池标签扫描或其他方式找到）但没有 `PiDDBCacheTable` 条目，条目可能被清除了。
2. 监控来自非内核线程的 `PiDDBLock` 意外获取。
3. 将所有已知已加载驱动的时间戳/大小组合与 `PiDDBCacheTable` 条目进行比较。

### MmUnloadedDrivers

`MmUnloadedDrivers` 是一个内核数组（也不导出），维护最后 50 个卸载驱动的循环缓冲区，存储它们的名称、起始地址、结束地址和卸载时间戳。这个结构允许驱动活动的调试和取证。

成功加载然后卸载内核驱动的作弊开发者经常试图清零或破坏他们在 `MmUnloadedDrivers` 中的条目以隐藏痕迹。反作弊通过以下方式检测：

1. 维护自己的预期 `MmUnloadedDrivers` 条目的影子副本。
2. 检测循环缓冲区中间的异常零填充条目（故意擦除的签名）。
3. 将 `MmUnloadedDrivers` 与其他内核时间戳和日志交叉引用。

## 8. 反调试保护

反作弊代码本身是逆向工程的高价值目标。分析反作弊驱动的逆向工程师需要使用内核调试器，反作弊会积极检测这些。

### 内核调试器检测

内核驱动检查内核导出变量 `KdDebuggerEnabled` 和 `KdDebuggerNotPresent`。在附加了 WinDbg（或任何内核调试器）的系统上，`KdDebuggerEnabled` 为 TRUE，`KdDebuggerNotPresent` 为 FALSE。

一些反作弊更进一步，直接检查 `KDDEBUGGER_DATA64` 结构和共享内核数据页（`KUSER_SHARED_DATA`）中的调试器相关标志。

### 线程隐藏检测

带有 `ThreadHideFromDebugger` (17) 的 `NtSetInformationThread` 在线程的 `ETHREAD` 结构（`CrossThreadFlags.HideFromDebugger`）中设置一个标志。一旦设置，内核不会将该线程的调试事件传递给任何附加的调试器。线程实际上对 WinDbg 不可见：线程中的断点不触发调试器通知，异常不被转发。

反作弊使用这个来保护自己的线程。然而，它们也检测作弊器是否使用它来隐藏自己注入的线程。检测方法是通过内核枚举（不是通过可以被 hook 的用户态 API）枚举系统中的所有线程，并检查每个线程的 `CrossThreadFlags` 中的 `HideFromDebugger` 位。游戏进程中反作弊自己没有隐藏的隐藏线程是一个危险信号。

### 基于时序的反调试

单步调试（通过 EFLAGS 中的 TF 标志）和硬件断点显著增加指令执行之间的时间。反作弊使用基于 `RDTSC` 指令的时序来检测这一点：

```c
UINT64 before = __rdtsc();

// 执行固定数量的操作
volatile ULONG dummy = 0;
for (int i = 0; i < 1000; i++) dummy += i;

UINT64 after = __rdtsc();

UINT64 elapsed = after - before;
if (elapsed > EXPECTED_MAXIMUM_CYCLES) {
    // 执行被减慢 - 可能是单步或断点
    ReportDebuggerDetected();
}
```

阈值 `EXPECTED_MAXIMUM_CYCLES` 根据已知 CPU 行为校准。单步每条指令可能增加数千个周期（由于调试异常处理），使时序差异明显。

### Hypervisor 基础调试器检测

基于 Type-1 hypervisor 的调试器（如在隔离调试环境中运行 Windows VM 的自定义 hypervisor）显著更难检测。主要检测向量是：

- **CPUID 检查**：hypervisor 存在位（执行 CPUID 叶 1 时 ECX 的位 31）表示存在 hypervisor。
- **MSR 时序**：在 VM 中执行 `RDMSR` 引入额外的开销，与原生执行相比。
- **CPUID 指令时序**：`CPUID` 指令本身在虚拟化环境中是特权指令，必须由 hypervisor 处理，引入可测量的延迟。

## 9. DMA 作弊和检测

DMA 作弊代表了当前反作弊军备竞赛的前沿，而且它们真的很难仅用软件解决。

### 什么是 DMA 作弊

PCIe DMA（直接内存访问）作弊使用 PCIe 连接的设备——通常是开发 FPGA 板——可以通过 PCIe 总线直接读取主机系统的物理内存，而无需 CPU 参与。`pcileech` 框架及其 `LeechCore` 库为这些设备提供软件栈。

攻击机器（运行作弊软件）与受害机器（运行游戏）物理分离。所有作弊逻辑在攻击者的机器上运行。游戏机器没有来自作弊的进程、驱动、内存分配。从纯软件角度来看，游戏机器是完全干净的。

### PCIe 内部机制

PCIe 通信围绕 TLP（Transaction Layer Packet）构建。来自 DMA 设备的内存读取 TLP 包含要读取的物理地址和请求的字节数。PCIe 根复合体通过读取指定的物理内存并在完成 TLP 中返回数据来服务此请求。这完全是硬件级别的，CPU 不参与服务请求。

### IOMMU 作为防御

IOMMU（Intel VT-d，AMD-Vi）是一个硬件单元，使用设备特定的页表转换来自 PCIe 设备的 DMA 地址（类似于 CPU 用于用户态地址转换的页表）。如果 IOMMU 启用并正确配置，PCIe 设备只能访问操作系统通过 IOMMU 页表显式授予它的物理内存。

理论上，这是对抗 DMA 攻击的硬件级防御。

实际上，IOMMU 防御有重大缺陷。许多游戏主板默认禁用 IOMMU。即使启用，IOMMU 配置复杂，许多系统的 IOMMU 策略配置不当，使大量物理内存范围可访问。关键的是，成功冒充合法 PCIe 设备的 DMA 固件（例如，操作系统已授予 IOMMU 访问权限的 USB 控制器或网卡）可能使用合法设备的授予权限通过 IOMMU 访问内存。

### Secure Boot 和 TPM 作为部分缓解

Epic Games 对堡垒之夜要求 Secure Boot 和 TPM 2.0 与 DMA 威胁直接相关。Secure Boot 确保只有签名的引导加载程序运行，这可以防止可能禁用 IOMMU 或安装固件级作弊的启动时攻击。TPM 2.0 启用测量启动（每个启动阶段的哈希记录在 TPM 的 PCR 寄存器中），提供一个证明链，证明系统以已知良好状态启动。使用 TPM 的远程证明可以允许服务器验证客户端系统在固件级别没有被篡改。

这不能直接解决 DMA 问题（物理连接到 PCIe 插槽的 DMA 攻击设备绕过所有这些），但它关闭了一些软件辅助的 DMA 攻击路径。

## 10. 行为检测和遥测

没有静态保护方案是足够的。基于游戏遥测运行的行为检测是解决内核保护无法解决问题的补充层。

### 鼠标和输入分析

内核反作弊驱动运行在一个可以拦截原始输入在其到达游戏之前的级别。HID（人机接口设备）输入的驱动，特别是鼠标和键盘的驱动，位于输入驱动栈中。通过在 `mouclass.sys` 或 `kbdclass.sys` 之上安装过滤驱动，反作弊可以观察所有输入事件，时间戳精确到系统时钟（微秒级分辨率）。

**自瞄检测**针对鼠标移动的统计特性。人类瞄准表现出特定属性：Fitts 定律支配接近轨迹，当光标接近目标时有特征性减速，速度分布有特定的加速和减速曲线，存在测量噪声。执行完美线性插值到目标的自瞄产生的移动违反这些属性。

**扳机机器人**（当准星在目标上时自动开火但不操纵鼠标移动）通过反应时间分析检测：人类对目标穿过准星的反应时间有最小生理下限（约 150-200ms）和特征分布。低于此下限且高一致性的反应时间表明自动化。

### 机器学习检测

Collins 等人的 CheckMATE 2024 论文记录了 CNN 在扳机机器人检测中的应用，在标记数据集上达到约 99.2% 的准确率。馈入网络的特征包括鼠标位置时间序列、相对于目标位置的点击时序和速度分布。

AntiCheatPT 论文（2025）将 transformer 架构应用于自瞄检测。使用 256 tick 窗口，每个 tick 44 个数据点（包括位置、速度、加速度、视角变化率和点击事件），模型在区分合法玩家和自瞄用户方面达到 89.17% 的准确率。

图神经网络用于串通检测（透视和团队游戏中基于通信的作弊），通过建模玩家交互图和检测异常模式，例如玩家持续通过墙壁瞄准敌人或在没有视线的情况下表现出对敌人位置的完美感知。

## 11. 反虚拟化和环境检查

### 基于 CPUID 的 VM 检测

最可靠的 VM 检测是基于 CPUID 的。当 `EAX=1` 执行 `CPUID` 时，如果存在 hypervisor，则设置 `ECX` 的位 31（这是"Hypervisor Present"位）。使用 `EAX=0x40000000`，hypervisor 供应商字符串在 EBX、ECX、EDX 中返回：

```c
BOOLEAN IsRunningInVM(void) {
    int cpuInfo[4];
    __cpuid(cpuInfo, 1);

    // 检查 hypervisor 存在位（ECX 位 31）
    if (cpuInfo[2] & (1 << 31)) {
        // 获取 hypervisor 供应商
        __cpuid(cpuInfo, 0x40000000);

        char vendor[13];
        memcpy(vendor, &cpuInfo[1], 4);
        memcpy(vendor + 4, &cpuInfo[2], 4);
        memcpy(vendor + 8, &cpuInfo[3], 4);
        vendor[12] = '\0';

        // 已知 VM 供应商
        if (strcmp(vendor, "VMwareVMware") == 0 ||
            strcmp(vendor, "VBoxVBoxVBox") == 0 ||
            strcmp(vendor, "Microsoft Hv") == 0 ||  // Hyper-V
            strcmp(vendor, "KVMKVMKVM") == 0) {
            return TRUE;
        }

        return TRUE; // 未知 hypervisor 也是可疑的
    }
    return FALSE;
}
```

### 基于特征的 VM 检测

每个 VM 平台在注册表和设备枚举中留下特征性痕迹：

- **VMware**：注册表键 `HKLM\SOFTWARE\VMware, Inc.\VMware Tools`；PCI 设备 `\Device\VMwareHGFS`
- **VirtualBox**：`HKLM\SOFTWARE\Oracle\VirtualBox Guest Additions`；`VBoxMiniRdDN` 驱动
- **Hyper-V**：`HKLM\SOFTWARE\Microsoft\Virtual Machine\Guest\Parameters`；存在 `vmbus` 和 `storvsc` 驱动对象

反作弊从内核模式查询这些特征，在那里它们不能被用户态 hooking 拦截。呈现任何这些特征的系统可能运行在 VM 中，反作弊可以拒绝操作或标记会话。

## 12. 硬件指纹和封禁执行

### 收集的标识符

反作弊收集多个硬件标识符以创建在账户封禁后仍然存在的唯一指纹：

- **SMBIOS 数据**：制造商、产品名称、序列号、UUID
- **磁盘序列号**：通过 IOCTL `IOCTL_STORAGE_QUERY_PROPERTY` 获取的物理磁盘序列号
- **GPU 标识符**：设备实例 ID、适配器 LUID
- **MAC 地址**：通过 NDIS 或注册表获取的 NIC MAC 地址
- **启动 GUID**：`HKLM\SOFTWARE\Microsoft\Cryptography` 中的 `MachineGuid`

### HWID 欺骗和检测

HWID 欺骗涉及修改反作弊读取的标识符以规避硬件封禁。欺骗方法包括：

- 基于注册表的欺骗：修补报告磁盘序列号、MAC 地址和 SMBIOS 数据的注册表条目
- 驱动级欺骗：拦截硬件标识符的 IOCTL 请求并返回欺骗值的内核驱动
- 物理欺骗：将不同的 MAC 地址编程到 NIC 固件中

反作弊通过交叉引用多个标识符来源来检测欺骗。如果 SMBIOS UUID 是 `FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF`（一个常见的欺骗值），那是立即的标志。如果报告的磁盘型号是"Samsung 970 EVO"但磁盘序列号格式与三星的格式不匹配，那是欺骗指标。

## 13. 军备竞赛：当前趋势和未来方向

### 升级层次结构

我们在过去十年中看到的升级遵循一个清晰的模式：

1. 用户态作弊被用户态反作弊对抗
2. 内核作弊被内核反作弊对抗
3. 带 BYOVD 的内核作弊被驱动阻止列表和更严格的 DSE 执行对抗
4. 基于 Hypervisor 的作弊被 hypervisor 检测对抗
5. DMA 作弊是当前前沿，部分被 IOMMU、Secure Boot 和 TPM 证明对抗
6. **下一级是固件基础攻击**，其中作弊嵌入在 SSD 固件、GPU 固件或 NIC 固件中

固件攻击特别令人担忧，因为它们在操作系统重装后仍然存在，对所有内核级检查不可见，而且如果没有物理访问设备进行固件验证则极难检测。今天没有广泛的反作弊防御来对抗固件作弊。

### AI 驱动的作弊

下一代威胁是由计算机视觉模型驱动的自瞄，运行在 GPU 或辅助计算机上。这些系统使用摄像头或屏幕捕获来分析游戏帧，识别目标，并通过硬件移动鼠标（一个 USB HID 设备，完全绕过软件输入检查）。它们产生的鼠标移动可以配置为模仿人类运动模式，使统计检测更加困难。

从游戏机器的角度来看，通过硬件 HID 操作的 AI 自瞄与使用鼠标的人类完全无法区分。所有输入都通过合法的硬件通道。游戏进程中没有代码运行。内核完全干净。唯一的检测面是行为概况：AI 产生的准确性、反应时间和移动模式。

这就是为什么第 10 节讨论的行为 ML 方法不是可选的，而是越来越成为有效反作弊的核心。

### 隐私辩论

内核级反作弊在隐私倡导者中非常不受欢迎。批评是实质性的：

一个以 boot-time 加载在 ring 0 运行的驱动可以访问系统上的一切。虽然 BattlEye、EAC 和 Vanguard 没有被记录滥用此访问权限进行监控，但技术能力存在。ARES 2024 论文的分析强调，信任模型与我们用于安全关键软件的相同，这意味着这些组件中的任何漏洞都是到 ring 0 的本地权限提升。

游戏需要安装启动时内核驱动作为游戏条件这一事实也是一个重大的攻击面担忧。`vgk.sys` 中的漏洞是到 ring 0 的本地权限提升。反作弊软件本身成为攻击目标。

### 基于证明的方法

反作弊在技术上最有前途的方向是远程证明。系统不是运行主动对抗作弊的 ring-0 驱动，而是向游戏服务器证明它以已知良好状态运行。基于 TPM 的测量启动，结合 UEFI Secure Boot，可以生成加密签名的证明，证明特定引导加载程序、内核和驱动被加载。服务器拒绝无法提供有效证明的系统的连接。

这不是一个完整的解决方案（足够复杂的攻击者可能操纵证明），但它显著提高了门槛。证明可以与传统扫描共存以提供纵深防御。

### 云游戏作为反作弊

云游戏（GeForce Now、Xbox Cloud Gaming）在架构上是某些游戏类别的终极反作弊。如果游戏在数据中心运行，只有视频流式传输到客户端，就没有游戏客户端代码可利用，没有游戏内存可读取，没有本地环境可操纵。作弊攻击面减少到输入操纵和视频分析，两者都有相对直接的检测方法。

限制是延迟：云游戏不适合单位数毫秒反应时间很重要的竞技游戏。

## 14. 总结

现代内核反作弊系统代表了一个分层防御架构，跨越 Windows 权限模型的每个可用级别运行：

- **内核回调**（`ObRegisterCallbacks`、`PsSetCreateProcessNotifyRoutineEx`、`PsSetLoadImageNotifyRoutine`）提供对系统事件的实时可见性，并具有主动阻止恶意操作的能力
- **内存扫描**（VAD 遍历、大池枚举、代码段哈希）提供定期验证游戏内存未被篡改且没有注入代码存在
- **行为遥测**（输入分析、统计画像、ML 推理）捕获在架构上对内核扫描不可见的作弊
- **硬件指纹**在账户重置之间执行封禁决定
- **反调试和反虚拟化保护**使逆向工程和开发显著更加困难

**没有单一技术是足够的**。内核回调可以被 DMA 攻击绕过。内存扫描可以被拦截内存读取的基于 hypervisor 的作弊规避。行为检测可以被足够模仿人类的 AI 欺骗。硬件指纹可以被硬件欺骗器击败。是所有这些层的组合，不断更新以响应新的规避技术，提供了有意义的保护。

这场军备竞赛的轨迹指向硬件证明和服务器端验证作为可信游戏安全的最终基础。仅软件的客户端保护将永远是不对称的：防御者必须检查一切，攻击者只需要找到一个缺口。硬件证明通过使在操作修改系统时极难证明可信状态来改变这种不对称性。

直到该基础普遍可用和执行，内核反作弊仍然是可用的最佳实际防御，伴随着所有相关的复杂性、隐私影响和攻击面。

---

## 译者总结

这篇文章是对现代内核级反作弊系统的一次全面技术剖析，涵盖了从架构设计到具体实现的各种技术细节。作为开发者，我们可以从中获得几点重要启示：

1. **安全是一个分层问题**：没有银弹，有效的保护需要多层防御机制协同工作
2. **军备竞赛的本质**：攻击者和防御者之间的博弈推动了双方技术的不断进步
3. **隐私与安全的权衡**：内核级反作弊引发的真实隐私担忧值得业界持续关注
4. **未来趋势**：硬件证明和云端执行可能是游戏安全的下一个重大转变

对于对 Windows 内核安全感兴趣的开发者，这篇文章也是学习内核回调、内存管理、驱动开发等底层技术的绝佳参考资料。

---

> **参考资料**：原文引用了多篇学术论文和技术博客，包括 ARES 2024 论文、CheckMATE 2024 论文以及 secret.club 和 back.engineering 的逆向分析工作，感兴趣的读者可以在[原文](https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work/)末尾找到完整链接。
