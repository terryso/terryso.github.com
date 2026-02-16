---
layout: post
title: "驾驭 PostgreSQL 竞态条件：用同步屏障进行确定性测试"
date: 2026-02-17 07:13:15 +0800
categories: tech-translation
description: "介绍如何使用同步屏障（Synchronization Barriers）来可靠地测试 PostgreSQL 中的竞态条件，确保并发代码的正确性"
original_url: https://www.lirbank.com/harnessing-postgres-race-conditions
source: Hacker News
---

本文翻译自 [Harnessing Postgres race conditions](https://www.lirbank.com/harnessing-postgres-race-conditions)，原载于 Hacker News。

## 为什么竞态条件测试如此重要

如果没有竞态条件测试，你系统中每一个潜在的竞态条件都离生产环境只有一次重构的距离。

同步屏障（Synchronization Barriers）让你能够自信地编写这些测试。

## 竞态条件是什么样子的

假设你有一个给账户充值的函数。它读取当前余额，加上一个金额，然后写回新值。

当两个请求并发执行时——比如向一个余额为 $100 的账户同时充值两个 $50——时序可能会是这样：

```
P1: SELECT balance → 100
P2: SELECT balance → 100
     ── 两个都读到 100，现在都基于它写入 ──
P1: UPDATE balance = 150
P2: UPDATE balance = 150
```

两个进程都读到了 100。都计算出 150。都写入了 150。最终余额：$150 而不是 $200。一个 $50 的充值凭空消失了。没有错误抛出。没有事务回滚。数据库完全按照指令执行了操作。

这就是每个写竞态条件的典型模式：两个操作读取相同的过期值，然后都基于它写入。第二个写入覆盖了第一个。在处理资金的系统中，这意味着客户余额错误，而没有任何日志能解释原因。

## 测试的挑战

你的测试套件一次运行一个请求。上面那种交错执行永远不会发生。无论你的代码是否正确处理了并发，测试都会通过。

把充值逻辑放在一个函数里，然后并发运行两次调用：

```typescript
// 朴素实现——没有事务，没有锁
const credit = async (accountId: number, amount: number) => {
  const [row] = await db.execute(
    sql`SELECT balance FROM accounts WHERE id = ${accountId}`,
  );
  const newBalance = row.balance + amount;
  await db.execute(
    sql`UPDATE accounts SET balance = ${newBalance} WHERE id = ${accountId}`,
  );
};

await Promise.all([credit(1, 50), credit(1, 50)]);
expect(result.balance).toBe(200); // 通过了——但我们知道代码有竞态条件
```

你可以在两个查询之间添加 `sleep()` 来强制重叠。这会给你一个又慢又不稳定的测试，有时能捕获 bug，有时不能。你可以运行测试一千次，希望时序至少对齐一次。这两种方法都是一样的赌博——你不是在测试并发，你是在掷骰子。

你需要的是一种能够强制两个操作在任何一个写入之前读取相同过期值的方法。每次都是如此。不是概率性的。

你知道这个模式存在。你知道它很危险。问题不在于知识。而在于证明。

## 同步屏障

屏障是并发操作的同步点。你告诉它预期有多少个任务。每个任务独立运行直到碰到屏障，然后等待。当最后一个任务到达时，所有任务同时被释放。

```typescript
function createBarrier(count: number) {
  let arrived = 0;
  const waiters: (() => void)[] = [];

  return async () => {
    arrived++;
    if (arrived === count) {
      waiters.forEach((resolve) => resolve());
    } else {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  };
}
```

一个计数器和一个等待者列表。每个调用者增加计数。如果不是最后一个，就等待。当最后一个到达时，所有人都被释放。函数返回一个屏障——调用它你就同步了。

在并发代码的读和写之间放置屏障，你就强制了前面提到的精确交错：每个任务在任何一个任务写入之前都读取。这就是竞态条件，按需制造。

## 屏障实战

将屏障应用到前面的充值函数。运行相同的测试——两个并发的 $50 充值——在三个保护级别下。结果很有启发性。

### 1. 裸查询

最简单的情况：没有事务，只有一个 SELECT 和一个 UPDATE，中间有屏障：

```typescript
// 创建一个屏障，阻塞直到 2 个任务到达，然后同时释放所有任务
const barrier = createBarrier(2);

const credit = async (accountId: number, amount: number) => {
  // 步骤 1：读取当前余额
  const [row] = await db.execute(
    sql`SELECT balance FROM accounts WHERE id = ${accountId}`,
  );

  // 步骤 2：在这里等待直到另一个任务也读取。这保证两个任务
  // 在任何一个写入之前都读取了
  await barrier();

  // 步骤 3：计算并写入新余额
  const newBalance = row.balance + amount;
  await db.execute(
    sql`UPDATE accounts SET balance = ${newBalance} WHERE id = ${accountId}`,
  );
};

// 同时运行两个 $50 充值
await Promise.all([credit(1, 50), credit(1, 50)]);

// 检查最终余额
const [result] = await db.execute(
  sql`SELECT balance FROM accounts WHERE id = 1`,
);
expect(result.balance).toBe(200); // 失败——余额是 150，不是 200
```

测试失败：

```
P1: SELECT balance → 100
P2: SELECT balance → 100
     ── 屏障释放两者 ──
P1: UPDATE balance = 150
P2: UPDATE balance = 150

Expected: 200
Received: 150  ✗
```

和之前一样的交错，现在发生在你的测试套件里。确定性的。没有时序技巧。

### 2. 添加事务

将操作包装在事务中：

```typescript
const credit = async (accountId: number, amount: number) => {
  // 相同的逻辑，现在在事务中
  await db.transaction(async (tx) => {
    const [row] = await tx.execute(
      sql`SELECT balance FROM accounts WHERE id = ${accountId}`,
    );
    await barrier();
    const newBalance = row.balance + amount;
    await tx.execute(
      sql`UPDATE accounts SET balance = ${newBalance} WHERE id = ${accountId}`,
    );
  });
};
```

相同的测试，相同的屏障。仍然失败：

```
T1: BEGIN
T1: SELECT balance → 100
T2: BEGIN
T2: SELECT balance → 100
     ── 屏障释放两者 ──
T1: UPDATE balance = 150
T1: COMMIT
T2: UPDATE balance = 150
T2: COMMIT

Expected: 200
Received: 150  ✗
```

事务没有帮助。PostgreSQL 的默认隔离级别是 READ COMMITTED——每条语句看到该语句开始前提交的所有数据。

事务给你每条语句的一致快照。它不给你写锁。屏障刚刚证明了这是两回事。

### 3. 添加写锁

`SELECT ... FOR UPDATE` 在读取时获取行级锁。另一个尝试锁定同一行的事务会阻塞，直到第一个提交：

```typescript
const credit = async (accountId: number, amount: number) => {
  await db.transaction(async (tx) => {
    const [row] = await tx.execute(
      sql`SELECT balance FROM accounts WHERE id = ${accountId} FOR UPDATE`, // 锁定行
    );
    await barrier();
    const newBalance = row.balance + amount;
    await tx.execute(
      sql`UPDATE accounts SET balance = ${newBalance} WHERE id = ${accountId}`,
    );
  });
};
```

相同的屏障，相同的测试。发生了不同的事情：

```
T1: BEGIN
T1: SELECT balance FOR UPDATE → 100 (获取锁)
T2: BEGIN
T2: SELECT balance FOR UPDATE → ☐ 阻塞 (等待 T1 的锁)
     ── T1 在屏障处，等待 T2。
        T2 在锁处，等待 T1。
        两者都无法继续。 ──
```

第一个任务执行 `SELECT ... FOR UPDATE` 并获取锁。第二个任务尝试相同的查询并阻塞——它不能读取行直到第一个任务释放锁。第二个任务永远到达不了屏障。屏障在等待两个任务，但只来了一个。

屏障死锁了。

### 4. 死锁

死锁证明了锁的存在。你已经验证了行为。但一个挂起的测试不能存在于 CI 中。务实的做法是接受证明然后继续——移除屏障，禁用测试，任何能让套件重新变绿的方法。

这有效直到重构重写了查询。没有什么能捕获丢失的锁。

死锁不是死胡同。它是一个信号，表明屏障放在了错误的位置。

### 5. 移动屏障

将屏障放在读和写之间对之前的测试有意义——它强制两个任务在任何一个写入之前读取过期数据，正如我们所愿。但有了 `FOR UPDATE`，锁在读取时发生。

死锁发生是因为一个事务持有锁同时在屏障处等待另一个——但另一个卡在锁上从未到达。

把屏障移早一点——在 BEGIN 之后，SELECT 之前——这样两个事务在任何一个尝试锁定之前都已启动。下面是 `FOR UPDATE` 仍然存在时发生的情况：

```
T1: BEGIN
T2: BEGIN
     ── 屏障释放两者 ──
T1: SELECT balance FOR UPDATE → 100    -- 获取锁
T2: SELECT balance FOR UPDATE           -- 阻塞 (等待 T1 的锁)
T1: UPDATE balance = 150
T1: COMMIT                              -- 释放锁
T2: SELECT balance FOR UPDATE → 150     -- 读取更新后的值
T2: UPDATE balance = 200
T2: COMMIT

Expected: 200
Received: 200 ✓
```

屏障同时释放两个任务进入它们的 SELECT。`FOR UPDATE` 序列化它们——一个获得锁，另一个等待。哪一个先走是任意的，但结果相同：第二个事务读取更新后的值。测试通过，运行完成，验证实际结果。

测试通过了。但我们移动屏障来修复死锁——测试通过是因为锁，还是因为新的屏障位置？移除 `FOR UPDATE` 找出答案：

```
T1: BEGIN
T2: BEGIN
     ── 屏障释放两者 ──
T1: SELECT balance → 100
T2: SELECT balance → 100
T1: UPDATE balance = 150
T1: COMMIT
T2: UPDATE balance = 150
T2: COMMIT

Expected: 200
Received: 150 ✗
```

相同的屏障，相同的位置。没有锁，两个都读取了过期数据。测试失败——证明锁在工作。这是正确的！

> **重要：** 一个正确的屏障测试有锁时通过，没有锁时失败。如果它不同时做到这两点，它什么也证明不了。每次你改变屏障或它测试的代码时，验证两个方向。

## 实际应用

### 针对真实数据库测试

这些测试需要一个真实的 PostgreSQL 实例——模拟没有锁、没有事务、没有争用可重现。有很多方法可以做到这一点。作者使用 [Neon Testing](https://www.npmjs.com/package/neon-testing)，它也提供了 `createBarrier` 函数。

### 用钩子注入屏障

屏障是测试基础设施——它们不应该存在于生产代码中。在之前的例子中，屏障被烘焙到函数体中。这对演示有效，但你需要一种只在运行测试时注入屏障的方法。

解决方案是钩子：一个在事务内部正确点触发的可选回调。生产调用者不传递它。测试通过它注入屏障。

```typescript
async function credit(
  accountId: number,
  amount: number,
  hooks?: { onTxBegin?: () => Promise<void> | void },
) {
  await db.transaction(async (tx) => {
    if (hooks?.onTxBegin) {
      await hooks.onTxBegin();
    }
    const [row] = await tx.execute(
      sql`SELECT balance FROM accounts WHERE id = ${accountId} FOR UPDATE`,
    );
    const newBalance = row.balance + amount;
    await tx.execute(
      sql`UPDATE accounts SET balance = ${newBalance} WHERE id = ${accountId}`,
    );
  });
}
```

钩子在事务开始后但在任何查询执行前触发。在生产中，`hooks` 是 undefined——`if` 检查没有成本。在测试中，你传递屏障：

```typescript
const barrier = createBarrier(2);
await Promise.all([
  credit(1, 50, { onTxBegin: barrier }),
  credit(1, 50, { onTxBegin: barrier }),
]);
const [result] = await db.execute(
  sql`SELECT balance FROM accounts WHERE id = 1`,
);
expect(result.balance).toBe(200);
```

生产代码不变：

```typescript
await credit(1, 50);
```

没有钩子，没有屏障，没有开销。

## 不要发布虚荣测试

六个月后，有人重构数据访问层。查询被重写，函数被重组，锁在混乱中丢失。如果套件中有屏障测试，那个回归就不会发布。测试在离开开发者机器之前就失败了。

但前提是测试真正捕获回归。每次你改变屏障或业务逻辑时——比如移动屏障来修复死锁——移除锁并确认测试失败。如果两种情况都通过，那就是虚荣测试。

---

## 总结

没有屏障测试，你系统中每一个可能的竞态条件都离生产环境只有一次重构的距离。现在你知道了。

**关键要点：**

1. **竞态条件难以测试** - 传统测试无法可靠地触发并发问题，靠运气不是好策略
2. **同步屏障提供确定性** - 通过强制特定的执行顺序，可以可靠地重现竞态条件
3. **事务本身不解决竞态** - PostgreSQL 默认的 READ COMMITTED 隔离级别提供语句级一致性，但不提供写锁
4. **SELECT ... FOR UPDATE 是关键** - 在读取时获取行锁，确保其他事务等待
5. **测试需要双向验证** - 正确的屏障测试应该在有保护时通过，没有保护时失败
6. **钩子模式保持代码干净** - 使用可选的钩子参数在测试中注入屏障，不影响生产代码

这种技术特别适合金融系统、库存管理等对数据一致性要求高的场景。值得在你的项目中尝试！
