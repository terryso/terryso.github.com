---
layout: post
title: "Python asyncio 共享状态的问题与解决方案"
date: 2026-03-05 13:09:43 +0800
categories: tech-translation
description: "深入探讨 Python asyncio 中 Event、Condition 和 Queue 在处理共享状态时的缺陷，以及通过 per-consumer queue 模式彻底解决「丢失更新」问题的完整方案。"
original_url: https://www.inngest.com/blog/no-lost-updates-python-asyncio
source: Hacker News
---

本文翻译自 [What Python's asyncio primitives get wrong about shared state](https://www.inngest.com/blog/no-lost-updates-python-asyncio)，原载于 Hacker News。

## 引言

在 Python 的 `asyncio` 中，协调多个并发任务对共享状态的访问是一个非常常见的问题。标准库提供了 `asyncio.Event` 和 `asyncio.Condition`，但它们都存在一个只在真实并发压力下才会暴露的缺陷。Inngest 团队在开发 Python SDK 时遇到了这个问题——多个异步 handler 需要围绕 WebSocket 连接状态进行协调。

这篇文章会逐一分析每个原语，展示它们具体在什么地方会出问题，并逐步迭代出一个能够处理所有场景的解决方案。

## 场景描述

假设有一个异步 Python 应用，管理着一个会经历多个状态的连接：

```
disconnected → connecting → connected → closing → closed
```

其中一个并发 handler 需要在连接开始关闭时处理（drain）待处理的请求。它必须等待 `closing` 状态：

```python
state = "disconnected"

async def drain_requests():
    # 需要等待直到 state == "closing"
    ...
    print("draining pending requests")
```

看起来很简单。让我们看看每个标准库工具如何处理这个问题。

## 方案一：轮询（Polling）

最直观的方法：在循环中检查值。

```python
async def drain_requests():
    while state != "closing":
        await asyncio.sleep(0.1)
    print("draining pending requests")
```

这确实能工作，但代价很大：

- **延迟与效率的权衡**：短的睡眠间隔浪费 CPU 周期；长的睡眠间隔增加延迟。没有完美的值。
- **重复代码**：每个消费者都要重新实现同样的轮询逻辑，面临同样的权衡。
- **非事件驱动唤醒**：无论状态是否改变，消费者都会定期运行。

我们可以做得更好。我们真正想要的是「状态变化时唤醒我」，而不是「每隔一段时间醒来检查一下」。

## 方案二：asyncio.Event

`asyncio.Event` 是标准库对「有事发生时唤醒我」的解决方案：

```python
closing_event = asyncio.Event()

async def drain_requests():
    await closing_event.wait()
    print("draining pending requests")
```

没有轮询，没有浪费的 CPU 周期。handler 会阻塞直到事件触发。但 `Event` 是布尔值：它只有 set 或 unset 两种状态。我们的连接有五个状态，而 `drain_requests` 只关心其中一个。当另一个 handler 需要等待 `connected` 状态时怎么办？你需要第二个 Event。第三个 handler 要等待「不是 disconnected」？第三个 Event，还要加上取反逻辑。setter 必须知道所有这些 Event：

```python
closing_event = asyncio.Event()
connected_event = asyncio.Event()

async def set_state(new_state):
    global state
    state = new_state
    if new_state == "closing":
        closing_event.set()
    if new_state == "connected":
        connected_event.set()
```

每个新条件都需要另一个 `Event` 对象。Event 之间的协调是 bug 的温床。忘记一个 `set()` 或 `clear()` 调用，消费者就会永远阻塞。

## 方案三：asyncio.Condition

`asyncio.Condition` 允许消费者等待任意谓词：

```python
state = "disconnected"
condition = asyncio.Condition()

async def drain_requests():
    async with condition:
        await condition.wait_for(lambda: state == "closing")
    print("draining pending requests")
```

一个协调点，任意谓词，不需要 `Event` 对象的泛滥。这好多了。

但它在一个常见模式下会出问题。

### 丢失更新（The Lost Update）

`Condition` 的设计是让消费者在醒来时检查「当前」值。当状态只向前移动时这没问题，但当状态转换很快时就会出问题。当 setter 改变状态时，它调用 `notify_all()`，这会为每个等待的消费者安排唤醒。但在单线程事件循环中，在当前协程让出控制权之前，没有消费者真正运行。如果值在消费者运行之前再次改变，消费者醒来后会针对「当前」值（而不是触发通知时的值）重新评估谓词。谓词失败，消费者回去睡觉，可能永远醒不来。

```python
# 两次快速连续的状态转换：
await set_state("closing")  # notify_all() 安排唤醒
await set_state("closed")   # 在消费者运行之前状态又变了

# drain_requests 终于醒来，看到的是 "closed"，不是 "closing"
# 待处理的请求被静默丢弃
```

下面是一个可运行的复现：

```python
import asyncio

state = "disconnected"
condition = asyncio.Condition()

async def set_state(new_state):
    global state
    async with condition:
        state = new_state
        condition.notify_all()

async def drain_requests():
    async with condition:
        await condition.wait_for(lambda: state == "closing")
    print("draining pending requests")

async def main():
    task = asyncio.create_task(drain_requests())
    await asyncio.sleep(0)  # 让 drain_requests 开始等待

    await set_state("closing")  # 短暂地变成 "closing"...
    await set_state("closed")   # ...然后立即变成 "closed"

    await asyncio.wait_for(task, timeout=1.0)
    # TimeoutError: drain_requests 永远看不到 "closing"

asyncio.run(main())
```

值「曾经」是 `"closing"`，但当 `drain_requests` 醒来检查时，它已经是 `"closed"` 了。中间状态丢失了。

这不是一个虚构的边缘情况。在作者的 SDK 连接管理器中，关闭信号可能在同一个事件循环 tick 内到达，连接可能在同一时刻关闭。`drain_requests` 永远不会运行，任何进行中的工作都会直接消失。

## 解决方案：Per-Consumer Queue

与其唤醒消费者然后问「当前状态是不是你想要的？」，不如将每次转换缓冲到每个消费者自己的队列中。每个消费者从自己的队列中取出并单独检查每次转换。这样消费者永远不会错过任何状态。

每个消费者注册自己的 `asyncio.Queue`。当值改变时，setter 将 `(old, new)` 推入每个已注册的队列。下面是一个简化版本，展示核心思想：

```python
class ValueWatcher:
    def __init__(self, initial_value):
        self._value = initial_value
        self._watch_queues: list[asyncio.Queue] = []

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, new_value):
        if new_value == self._value:
            return

        old_value = self._value
        self._value = new_value

        # 通知所有消费者
        for queue in self._watch_queues:
            queue.put_nowait((old_value, new_value))

    async def wait_for(self, target):
        queue = asyncio.Queue()
        self._watch_queues.append(queue)

        try:
            if self._value == target:
                return

            while True:
                old, new = await queue.get()
                if new == target:
                    return
        finally:
            self._watch_queues.remove(queue)
```

`wait_for` 注册一个队列，检查当前值，然后不断取出转换直到找到匹配。`try/finally` 确保即使调用者取消，队列也会被注销。

即使值在消费者运行之前改变多次，队列也会按顺序缓冲并传递每个中间转换。

## 生产就绪的实现

要让这个方案在生产环境中使用，还需要一些额外功能。完整的实现需要：

- **线程安全**：使用 `threading.Lock` 保护值和队列列表。每个队列与其事件循环配对，setter 使用 `loop.call_soon_threadsafe` 而不是直接调用 `put_nowait`。
- **原子注册**：`wait_for` 在同一个锁获取中检查当前值并注册队列，关闭注册和初始检查之间可能漏掉转换的竞态窗口。
- **完整的泛型类型**：端到端的 `Generic[T]`，这样谓词、队列和返回值都有类型检查。
- **基于谓词的匹配**：`wait_for`、`wait_for_not` 和 `wait_for_not_none` 都通过共享的 `_wait_for_condition(predicate)` 核心实现。
- **超时支持**：每个等待方法接受可选的 `timeout` 参数，由 `asyncio.wait_for` 支持。
- **条件设置**：`set_if` 仅当当前值满足谓词时才原子地设置值，对只能从特定状态发生的状态机转换很有用。
- **变化监听**：`wait_for_change` 等待任何转换，不管值是什么，适合日志记录或响应状态变化。
- **回调 API**：`on_change` 和 `on_value` 为同步消费者提供接口，与异步等待 API 并存。
- **弹性通知**：setter 捕获 `RuntimeError`（关闭的循环）并抑制回调异常，这样一个失败不会阻塞其他消费者。

完整的实现大约 300 行，大部分是文档字符串和基于相同核心构建的便捷方法。作者鼓励将其复制到你的代码库中！

### 完整 ValueWatcher 源码

```python
from __future__ import annotations

import asyncio
import threading
import typing

T = typing.TypeVar("T")

# Used by `wait_for_not_none` to narrow `ValueWatcher[X | None]` to `X`.
S = typing.TypeVar("S")

class ValueWatcher(typing.Generic[T]):
    """
    Thread-safe observable value with async watchers.

    Watchers can await value changes via methods like `wait_for` and
    `wait_for_change`. Alternatively, they can add callbacks via `on_change` and
    `on_value`.

    Any thread can set `.value`, and the watcher will react accordingly.
    """

    def __init__(
        self,
        initial_value: T,
        *,
        on_change: typing.Callable[[T, T], None] | None = None,
    ) -> None:
        """
        Args:
            initial_value: The initial value.
            on_change: Called when the value changes. Good for debug logging.
        """

        self._lock = threading.Lock()
        self._on_changes: list[typing.Callable[[T, T], None]] = []
        if on_change:
            self._on_changes.append(on_change)

        # Every watcher gets its own (loop, queue) pair. Storing the loop lets
        # the setter use `call_soon_threadsafe` for cross-thread notification.
        # Queue items are (old, new) tuples.
        self._watch_queues: list[
            tuple[asyncio.AbstractEventLoop, asyncio.Queue[tuple[T, T]]]
        ] = []

        # Hold references to fire-and-forget tasks to prevent GC.
        self._background_tasks: set[asyncio.Task[T]] = set()

        self._value = initial_value

    @property
    def value(self) -> T:
        with self._lock:
            return self._value

    @value.setter
    def value(self, new_value: T) -> None:
        with self._lock:
            if new_value == self._value:
                return

            old_value = self._value
            self._value = new_value

            # Snapshot lists under lock to avoid iteration issues
            queues = list(self._watch_queues)
            callbacks = list(self._on_changes)

        # Notify all watchers outside the lock to avoid deadlock.
        for loop, queue in queues:
            try:
                # `call_soon_threadsafe` wakes the target loop's selector
                # immediately. A plain `put_nowait` wouldn't poke the self-pipe,
                # so a cross-thread watcher could stall until something else
                # wakes its loop.
                #
                # In other words, without `call_soon_threadsafe`, a watcher
                # could get the changed value notification long after the value
                # actually changed.
                loop.call_soon_threadsafe(
                    queue.put_nowait, (old_value, new_value)
                )
            except RuntimeError:
                # Target event loop is closed.
                pass

        for on_change in callbacks:
            try:
                on_change(old_value, new_value)
            except Exception:
                # Suppress exceptions from callbacks so one failure doesn't skip
                # the rest.
                pass

    def set_if(
        self,
        new_value: T,
        condition: typing.Callable[[T], bool],
    ) -> bool:
        """
        Atomically set the value only if the current value satisfies the
        condition. Returns True if the value was set.
        """

        with self._lock:
            if not condition(self._value):
                return False

            if new_value == self._value:
                return True

            old_value = self._value
            self._value = new_value

            queues = list(self._watch_queues)
            callbacks = list(self._on_changes)

        for loop, queue in queues:
            try:
                loop.call_soon_threadsafe(
                    queue.put_nowait, (old_value, new_value)
                )
            except RuntimeError:
                pass

        for on_change in callbacks:
            try:
                on_change(old_value, new_value)
            except Exception:
                pass

        return True

    def on_change(self, callback: typing.Callable[[T, T], None]) -> None:
        """
        Add a callback that's called when the value changes.

        Args:
            callback: Called with (old_value, new_value) on each change.
        """

        with self._lock:
            self._on_changes.append(callback)

    def on_value(self, value: T, callback: typing.Callable[[], None]) -> None:
        """
        One-shot callback for when the value equals `value`. Requires a
        running event loop (internally spawns a background task).

        Args:
            value: The value to wait for.
            callback: Called when the internal value equals `value`.
        """

        task = asyncio.create_task(self.wait_for(value))
        self._background_tasks.add(task)

        def _done(t: asyncio.Task[T]) -> None:
            self._background_tasks.discard(t)
            if not t.cancelled() and t.exception() is None:
                callback()

        task.add_done_callback(_done)

    async def wait_for(
        self,
        value: T,
        *,
        immediate: bool = True,
        timeout: float | None = None,
    ) -> T:
        """
        Wait for the internal value to equal the given value.

        Args:
            value: Return when the internal value is equal to this.
            immediate: If True and the internal value is already equal to the given value, return immediately. Defaults to True.
            timeout: Seconds to wait before raising `asyncio.TimeoutError`. None means wait forever.
        """

        return await self._wait_for_condition(
            lambda v: v == value,
            immediate=immediate,
            timeout=timeout,
        )

    async def wait_for_not(
        self,
        value: T,
        *,
        immediate: bool = True,
        timeout: float | None = None,
    ) -> T:
        """
        Wait for the internal value to not equal the given value.

        Args:
            value: Return when the internal value is not equal to this.
            immediate: If True and the internal value is already not equal to the given value, return immediately. Defaults to True.
            timeout: Seconds to wait before raising `asyncio.TimeoutError`. None means wait forever.
        """

        return await self._wait_for_condition(
            lambda v: v != value,
            immediate=immediate,
            timeout=timeout,
        )

    async def wait_for_not_none(
        self: ValueWatcher[S | None],
        *,
        immediate: bool = True,
        timeout: float | None = None,
    ) -> S:
        """
        Wait for the internal value to be not None.

        Args:
            immediate: If True and the internal value is already not None, return immediately. Defaults to True.
            timeout: Seconds to wait before raising `asyncio.TimeoutError`. None means wait forever.
        """

        result = await self._wait_for_condition(
            lambda v: v is not None,
            immediate=immediate,
            timeout=timeout,
        )
        if result is None:
            raise AssertionError("unreachable")
        return result

    async def _wait_for_condition(
        self,
        condition: typing.Callable[[T], bool],
        *,
        immediate: bool = True,
        timeout: float | None = None,
    ) -> T:
        """
        Wait until `condition(current_value)` is true, then return the
        matching value. Handles the TOCTOU gap between checking the current
        value and subscribing to the change queue.
        """

        # Fast path: no task needed if the value already matches.
        if immediate:
            # Read once to avoid a TOCTOU race between check and return.
            current = self.value
            if condition(current):
                return current

        async def _wait() -> T:
            with self._watch() as queue:
                # Re-check after queue registration to close the gap
                # between the fast path above and the queue being live.
                if immediate:
                    # Read once to avoid a TOCTOU race between check and return.
                    current = self.value
                    if condition(current):
                        return current

                while True:
                    _, new = await queue.get()
                    if condition(new):
                        return new

        return await asyncio.wait_for(_wait(), timeout=timeout)

    async def wait_for_change(
        self,
        *,
        timeout: float | None = None,
    ) -> T:
        """
        Wait for the internal value to change.

        Args:
            timeout: Seconds to wait before raising `asyncio.TimeoutError`. None means wait forever.
        """

        async def _wait() -> T:
            with self._watch() as queue:
                _, new = await queue.get()
                return new

        return await asyncio.wait_for(_wait(), timeout=timeout)

    def _watch(self) -> _WatchContextManager[T]:
        """
        Watch for all changes to the value. This method returns a context
        manager so it must be used in a `with` statement.

        Its return value is a queue that yields tuples of the old and new
        values.
        """

        loop = asyncio.get_running_loop()
        queue = asyncio.Queue[tuple[T, T]]()
        with self._lock:
            self._watch_queues.append((loop, queue))

        return _WatchContextManager(
            on_exit=lambda: self._remove_queue(queue),
            queue=queue,
        )

    def _remove_queue(self, queue: asyncio.Queue[tuple[T, T]]) -> None:
        """
        Remove a queue from the watch list in a thread-safe manner.
        """

        with self._lock:
            self._watch_queues = [
                entry for entry in self._watch_queues if entry[1] is not queue
            ]

class _WatchContextManager(typing.Generic[T]):
    """
    Context manager that's used to automatically delete a queue when it's no
    longer being watched.

    Returns a queue that yields tuples of the old and new values.
    """

    def __init__(
        self,
        on_exit: typing.Callable[[], None],
        queue: asyncio.Queue[tuple[T, T]],
    ) -> None:
        self._on_exit = on_exit
        self._queue = queue

    def __enter__(self) -> asyncio.Queue[tuple[T, T]]:
        # IMPORTANT: Do not return an async generator. That can lead to "Task
        # was destroyed but it is pending!" warnings when the event loop closes.
        return self._queue

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: object,
    ) -> None:
        self._on_exit()
```

`wait_for_not_none` 特别有用：

```python
# 等待状态变成除了 "disconnected" 之外的任何值
await state.wait_for_not("disconnected")

# 对于 Optional 值：等待直到非 None 并缩窄类型
ws_watcher = ValueWatcher[Connection | None](None)
ws: Connection = await ws_watcher.wait_for_not_none()
```

## 一个注意事项

setter 通过相等性去重：如果新值 `==` 当前值，不会触发通知。这对枚举、字符串和整数很有效，但原地修改可变对象并重新分配相同的引用不会触发消费者（因为 `obj == obj` 总是 `True`）。坚持使用不可变值就不是问题。

## 总结

核心洞察很简单：`asyncio.Condition` 问消费者「当前状态是不是你想要的？」，但它应该问「状态是否曾经变成你想要的？」。Per-consumer queue 通过缓冲每次转换（而不是只通知最新状态）使这成为可能。

这个 `ValueWatcher` 类的关键设计思路：

1. **缓冲所有状态转换**：每个消费者维护独立队列，不会错过任何中间状态
2. **线程安全**：支持跨线程设置值
3. **原子操作**：检查和注册在同一个锁中完成，避免竞态条件
4. **丰富的 API**：支持谓词匹配、超时、回调等多种使用方式

如果你在 asyncio 中管理共享可变状态，这个模式值得一试。
