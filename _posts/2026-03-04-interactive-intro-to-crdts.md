---
layout: post
title: "CRDT 交互式入门指南"
date: 2026-03-04 05:15:06 +0800
categories: tech-translation
description: "CRDT 不必是晦涩的学术论文和数学术语。通过交互式可视化和代码示例，深入浅出地理解无冲突复制数据类型的工作原理。"
original_url: https://jakelazaroff.com/words/an-interactive-intro-to-crdts/
source: Hacker News
---

本文翻译自 [An Interactive Intro to CRDTs](https://jakelazaroff.com/words/an-interactive-intro-to-crdts/)，原载于 Hacker News。

---

你听说过 CRDT 吗？是否好奇它到底是什么？也许你尝试研究过，却被学术论文和数学术语劝退？这正是我在参加 [Recurse Center](https://www.recurse.com/) 之前的状态。但经过一个月的研究和代码实践，我发现：只需掌握几个简单概念，就能构建出强大的应用！

本系列文章将带你了解什么是 CRDT，从编写基础 CRDT 开始，逐步组合成更复杂的数据结构，最终用所学知识构建一个**协作式像素画编辑器**。整个过程不需要任何 CRDT 先备知识，只需基础的 TypeScript 理解。

先睹为快，这是我们最终要实现的效果：一个可以离线协作的像素画板，支持网络延迟模拟和断网测试。

## 什么是 CRDT？

CRDT 全称 **Conflict-free Replicated Data Type**（无冲突复制数据类型）。听起来很学术，但核心概念其实不难理解：

CRDT 是一种可以存储在不同计算机（peer，对等节点）上的数据结构。每个 peer 可以**立即更新自己的状态**，无需网络请求确认。不同 peer 在不同时刻可能拥有不同状态，但保证**最终收敛到一致的状态**。

这使得 CRDT 成为构建富协作应用的理想选择——比如 Google Docs 和 Figma——而无需中央服务器来同步变更。

### 两类 CRDT

CRDT 大致分为两类：

1. **State-based CRDT（基于状态）**：peer 之间传输完整状态，通过合并所有状态获得新状态
2. **Operation-based CRDT（基于操作）**：只传输用户的操作，用于计算新状态

Operation-based 听起来更高效？确实，如果用户只更新列表中的一个元素，它只需发送那条更新，而 state-based 必须发送整个列表。但代价是对通信渠道有严格要求：消息必须**精确送达一次**，且**按因果顺序**到达每个 peer。

本文专注于 **state-based CRDTs**，后文简称 CRDTs。

### CRDT 接口定义

抽象概念讲完了，具体来说，CRDT 是实现了以下接口的数据结构：

```typescript
interface CRDT<T, S> {
  value: T;           // 应用层关心的值
  state: S;           // 同步所需的元数据
  merge(state: S): void;  // 合并其他 peer 的状态
}
```

三个核心组成部分：
- **value**：应用层实际使用的数据，同步 CRDT 的目的就是可靠地同步这个值
- **state**：peer 之间达成一致所需的元数据，会被序列化后发送给其他 peer
- **merge**：接收其他 peer 的状态并与本地状态合并的函数

### merge 函数的三条定律

merge 函数必须满足三个性质，确保所有 peer 最终达成一致（用 `A ∨ B` 表示将状态 A 合并到 B）：

1. **交换律（Commutativity）**：合并顺序无关；`A ∨ B = B ∨ A`
   - Alice 和 Bob 交换状态后，各自合并对方状态，结果相同

2. **结合律（Associativity）**：多个状态合并时，先合并哪个都行；`(A ∨ B) ∨ C = A ∨ (B ∨ C)`
   - Alice 同时收到 Bob 和 Carol 的状态，任意顺序合并，结果相同

3. **幂等性（Idempotence）**：与自己合并不改变状态；`A ∨ A = A`
   - Alice 与自己的状态合并，状态保持不变

数学证明这些性质听起来很复杂？好消息是：我们可以直接**组合已有的 CRDT**，依赖前人完成证明！

## Last Write Wins Register（LWW Register）

**Register** 是只保存单个值的 CRDT。最简单的一种是 **Last Write Wins Register**（LWW Register）。

顾名思义，LWW Register 用最新写入的值覆盖当前值。它通过**时间戳**判断哪个写入更新——这里用整数表示，每次更新时递增。

### 合并算法

```
- 如果收到的时间戳 < 本地时间戳：忽略，不改变状态
- 如果收到的时间戳 > 本地时间戳：用收到的值覆盖本地值，同时更新时间戳和 peer ID
- 如果时间戳相同：比较 peer ID，较大的胜出
```

### TypeScript 实现

```typescript
class LWWRegister<T> {
  readonly id: string;
  state: [peer: string, timestamp: number, value: T];

  get value() {
    return this.state[2];
  }

  constructor(id: string, state: [string, number, T]) {
    this.id = id;
    this.state = state;
  }

  set(value: T) {
    // 设置 peer ID 为本地 ID，时间戳 +1，更新值
    this.state = [this.id, this.state[1] + 1, value];
  }

  merge(state: [peer: string, timestamp: number, value: T]) {
    const [remotePeer, remoteTimestamp] = state;
    const [localPeer, localTimestamp] = this.state;

    // 本地时间戳更大，丢弃收到的值
    if (localTimestamp > remoteTimestamp) return;

    // 时间戳相同但本地 peer ID 更大，丢弃收到的值
    if (localTimestamp === remoteTimestamp && localPeer > remotePeer) return;

    // 否则，用收到的状态覆盖本地状态
    this.state = state;
  }
}
```

让我们对照 CRDT 接口：
- `state` 是一个三元组：`[peer ID, 时间戳, 值]`
- `value` 就是 `state` 的第三个元素
- `merge` 实现了上述合并算法

额外方法 `set` 在本地调用，更新寄存器值的同时递增时间戳、记录本地 peer ID。

看起来很简单？但这个不起眼的 LWW Register 是构建实际应用的强大基石。

## Last Write Wins Map（LWW Map）

大多数程序不止一个值，我们需要更复杂的 CRDT：**Last Write Wins Map**（LWW Map）。

### 类型定义

首先是值类型——从应用视角看，LWW Map 就是普通的键值对：

```typescript
type Value<T> = {
  [key: string]: T;
};
```

再看状态类型——关键技巧在这里：**每个 key 对应一个 LWW Register**！

```typescript
type State<T> = {
  [key: string]: LWWRegister<T | null>["state"];
};
```

### 组合的力量

这点很重要：**组合（Composition）让我们可以用基础 CRDT 构建复杂 CRDT**。

合并时，父级只需把状态的相应切片传给子级的 merge 函数。这个过程可以无限嵌套——每层 CRDT 把越来越小的状态切片传递给下一层，直到最终由基础 CRDT 执行真正的合并。

从这个角度看，LWW Map 的 merge 逻辑很简单：遍历每个 key，交给对应的 LWW Register 处理。

### TypeScript 实现

```typescript
class LWWMap<T> {
  readonly id: string;
  #data = new Map<string, LWWRegister<T | null>>();

  constructor(id: string, state: State<T>) {
    this.id = id;
    // 为初始状态的每个 key 创建寄存器
    for (const [key, register] of Object.entries(state)) {
      this.#data.set(key, new LWWRegister(this.id, register));
    }
  }

  get value() {
    const value: Value<T> = {};
    // 构建对象，每个值是对应 key 的寄存器值
    for (const [key, register] of this.#data.entries()) {
      if (register.value !== null) value[key] = register.value;
    }
    return value;
  }

  get state() {
    const state: State<T> = {};
    // 构建对象，每个值是对应 key 的寄存器完整状态
    for (const [key, register] of this.#data.entries()) {
      if (register) state[key] = register.state;
    }
    return state;
  }

  has(key: string) {
    return this.#data.get(key)?.value !== null;
  }

  get(key: string) {
    return this.#data.get(key)?.value;
  }

  set(key: string, value: T) {
    const register = this.#data.get(key);
    if (register) register.set(value);
    else this.#data.set(key, new LWWRegister(this.id, [this.id, 1, value]));
  }

  delete(key: string) {
    // 设置寄存器值为 null（如果存在）
    this.#data.get(key)?.set(null);
  }

  merge(state: State<T>) {
    // 递归合并每个 key 的寄存器
    for (const [key, remote] of Object.entries(state)) {
      const local = this.#data.get(key);
      if (local) local.merge(remote);
      else this.#data.set(key, new LWWRegister(this.id, remote));
    }
  }
}
```

### Tombstone（墓碑）机制

注意到 `delete` 方法了吗？它并没有真正删除 key，而是把寄存器值设为 `null`。这种保留元数据的做法叫做 **Tombstone**——CRDT 历史的幽灵。

为什么要这样做？试想如果真的删除 key 会怎样：

1. Alice 断网后添加了一个 key
2. 网络恢复，Alice 收到 Bob 的状态
3. Bob 的状态没有那个 key（他根本不知道）
4. Alice 从自己的 map 中移除了那个 key——**错误地"删除"了自己刚添加的数据！**

这就是为什么 CRDT 只能添加信息，不能删除。从技术角度，我们说 CRDT 是**单调递增（monotonically increasing）**的数据结构。

## 小结

现在我们的工具箱里有两个 CRDT：
- **LWW Register**：保存单个值
- **LWW Map**：保存键值对，通过组合 LWW Register 实现

这些看似简单的组件，可以构建出强大的协作应用。在[下一篇文章](https://jakelazaroff.com/words/building-a-collaborative-pixel-art-editor-with-crdts/)中，我们将用它们构建一个真正的协作式像素画编辑器。

### 关键要点

| 概念 | 要点 |
|------|------|
| CRDT 本质 | 无需中央服务器的最终一致数据结构 |
| 三大定律 | 交换律、结合律、幂等性——保证最终收敛 |
| LWW Register | 用时间戳决定"最后写入"，是基础构建块 |
| LWW Map | 组合多个 Register，每个 key 一个 |
| Tombstone | 删除操作设为 null，不真正移除——避免"未知的未知"问题 |
| 单调性 | CRDT 只增不减，只能通过垃圾回收或压缩优化 |

---

> 原文还包含一个[优化篇](https://jakelazaroff.com/words/making-crdts-98-percent-more-efficient/)，介绍如何将 CRDT 状态压缩 98%，推荐进阶阅读。
