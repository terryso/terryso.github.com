---
layout: post
title: "裸机 C++ 开发：抽象类与纯虚函数的实践指南"
date: 2026-03-10 21:47:03 +0800
categories: tech-translation
description: "探讨在裸机（bare metal）开发中使用 C++ 抽象类和纯虚函数时遇到的编译器依赖问题，以及如何正确实现 `__cxa_pure_virtual` 和 `operator delete`。"
original_url: https://arobenko.github.io/bare_metal_cpp/#_abstract_classes
source: Hacker News
---

本文翻译自 [Practical Guide to Bare Metal C++ - Abstract Classes](https://arobenko.github.io/bare_metal_cpp/#_abstract_classes)，原载于 Hacker News。

## 背景

在嵌入式裸机开发中，C++ 是一个强大但被低估的工具。很多人知道 C++ 比 C 更强大，但很少有实践指南告诉你如何在不使用标准库的情况下，充分利用 C++ 的特性。本文将深入探讨一个具体问题：**当使用 `-nostdlib` 编译选项时，抽象类（abstract classes）和纯虚函数（pure virtual functions）会带来哪些挑战？**

## 抽象类测试

假设我们有以下简单的抽象类和派生类：

```cpp
class AbstractBase
{
public:
    virtual ~AbstractBase();
    virtual void func() = 0;
    virtual void nonOverridenFunc() final;
};

class Derived : public AbstractBase
{
public:
    virtual ~Derived();
    virtual void func() override;
};

AbstractBase::~AbstractBase()
{
}

void AbstractBase::nonOverridenFunc()
{
}

Derived::~Derived()
{
}

void Derived::func()
{
}
```

在 `main` 函数中使用：

```cpp
Derived obj;
AbstractBase* basePtr = &obj;
basePtr->func();
```

## 编译器报错

使用 `-nostdlib` 编译时，你会遇到以下链接错误：

```
CMakeFiles/04_test_abstract_class.dir/AbstractBase.cpp.o: In function `AbstractBase::~AbstractBase()':
AbstractBase.cpp:(.text+0x24): undefined reference to `operator delete(void*)'
CMakeFiles/04_test_abstract_class.dir/AbstractBase.cpp.o:(.rodata+0x10): undefined reference to `__cxa_pure_virtual'
CMakeFiles/04_test_abstract_class.dir/Derived.cpp.o: In function `Derived::~Derived()':
Derived.cpp:(.text+0x3c): undefined reference to `operator delete(void*)'
```

### 1. `__cxa_pure_virtual` 是什么？

这是编译器在构建虚函数表（vtable）时，为纯虚函数预留的函数地址。正常情况下，这个函数不应该被调用。只有在以下异常情况下才会触发：

- 指针被不当操作
- 在抽象基类的析构函数中调用了纯虚函数

如果这个函数被调用了，说明程序有 bug。一个安全的实现方式是让它进入无限循环，或者通过某种方式报告错误（比如闪烁 LED）：

```cpp
extern "C" void __cxa_pure_virtual()
{
    while (true) {}
}
```

### 2. 为什么需要 `operator delete`？

奇怪的是，我们的代码中并没有动态内存分配，为什么还需要实现 `operator delete`？让我们先提供一个空实现来调查：

```cpp
void operator delete(void *)
{
}
```

## 深入分析：虚函数表结构

编译后，虚函数表位于 `.rodata` 段：

```
Disassembly of section .rodata:

000081a0 <_ZTV12AbstractBase>:
    ...
    81a8:	000080d8
    81ac:	000080ec
    81b0:	0000815c
    81b4:	000080e8

000081b8 <_ZTV7Derived>:
    ...
    81c0:	00008110
    81c4:	00008130
    81c8:	0000810c
    81cc:	000080e8
```

### 虚表条目解析

1. **最后一条条目**（`0x80e8`）：指向 `AbstractBase::nonOverridenFunc`
2. **第三条条目**：`Derived` 类指向 `Derived::func`（`0x810c`），而 `AbstractBase` 类指向 `__cxa_pure_virtual`（`0x815c`）

## 虚析构函数的两个版本

这是最关键的部分！当存在虚析构函数时，编译器会生成**两个版本的析构函数**：

### D1 版本（直接析构）
```
000080d8 <_ZN12AbstractBaseD1Ev>:
    ; 直接析构，不调用 delete
```

### D0 版本（析构 + delete）
```
000080ec <_ZN12AbstractBaseD0Ev>:
    ; 析构后调用 operator delete
    80fc:	eb000015 	bl	8158 <_ZdlPv>  ; 调用 operator delete
```

编译器根据使用场景选择不同版本：

```cpp
basePtr->~AbstractBase();  // 使用 D1 版本（直接析构）
delete basePtr;            // 使用 D0 版本（析构 + delete）
```

对应的汇编代码：

```
    ; 第一次调用：直接析构
    8198:	e5933000 	ldr	r3, [r3]        ; vtable[0]
    819c:	e12fff33 	blx	r3

    ; 第二次调用：析构 + delete
    81a8:	e5933004 	ldr	r3, [r3, #4]    ; vtable[1]
    81ac:	e12fff33 	blx	r3
```

## 关键结论

> **只要类中存在虚析构函数，即使没有动态内存分配，也可能需要实现 `operator delete(void*)`。**

这是因为编译器需要为 `delete` 操作生成正确的代码路径，即使你从未真正调用 `delete`。

## 实践建议

在裸机开发中使用 C++ 抽象类时：

1. **必须实现** `__cxa_pure_virtual`，通常用一个无限循环即可
2. **如果使用虚析构函数**，需要提供 `operator delete(void*)` 的实现
3. **考虑是否真的需要虚析构函数** - 如果确定不会通过基类指针删除对象，可以用 `protected` 非虚析构函数替代
4. 使用 `objdump` 或类似工具检查生成的代码，了解编译器的行为

## 总结

C++ 的抽象类和纯虚函数是非常强大的特性，但在裸机环境下需要理解其底层实现机制。通过分析编译器生成的汇编代码，我们可以清楚地看到虚函数表的结构，以及为什么需要提供某些"看起来不必要"的函数实现。

这正是 Alex Robenko 在其著作 *Practical Guide to Bare Metal C++* 中强调的核心理念：**了解编译器输出，才能在裸机开发中充分利用 C++ 的优势。**
