---
layout: post
title: "深入理解类型擦除：从零开始实现 std::any"
date: 2026-03-15 09:54:05 +0800
categories: tech-translation
description: "本文从 C++ 中常见的多态实现方式出发，逐步推导类型擦除（Type Erasure）的原理，最终带你理解 std::any 背后的设计思想。"
original_url: https://david.alvarezrosa.com/posts/deriving-type-erasure/
source: Hacker News
---

本文翻译自 [Deriving Type Erasure](https://david.alvarezrosa.com/posts/deriving-type-erasure/)，原载于 Hacker News。

---

你是否曾好奇过 `std::any` 背后到底发生了什么？在那看似复杂的接口之下，隐藏着一个经典的技术——**类型擦除（Type Erasure）**：将具体类型隐藏在一个小巧、统一的包装器之后。

本文将从我们熟悉的虚函数和模板出发，一步步构建一个精简版的 `std::any`。读完之后，你将对类型擦除的底层原理有清晰的理解。

## 通过接口实现多态

实现多态最常见的方式是定义一个接口，其中包含你希望调用的纯虚函数。然后，为每个你希望以多态方式使用的实现创建一个子类，继承自基类并实现这些方法。

举个例子，让我们来实现带有 `area()` 方法的形状类。首先定义接口：

```cpp
class Shape {
public:
    virtual ~Shape() = default;
    virtual auto area() const noexcept -> double = 0;
};
```

> **注意**：通过 `Base&` 或 `Base*` 使用的接口必须拥有虚析构函数，以确保派生类能被正确销毁（参考 C++ Core Guidelines C.127）。

然后添加 `Square`（正方形）和 `Circle`（圆形）的具体实现：

```cpp
class Square : public Shape {
    int side_;
public:
    explicit Square(int side) noexcept : side_{side} {}
    auto area() const noexcept -> double override { return side_ * side_; }
};

class Circle : public Shape {
    int radius_;
public:
    explicit Circle(int radius) noexcept : radius_{radius} {}
    auto area() const noexcept -> double override {
        return std::numbers::pi * radius_ * radius_;
    }
};
```

现在，我们可以通过接口来统一使用这些实现了：

```cpp
auto printArea(const Shape& shape) -> void {
    std::println("Area is {:.2f}", shape.area());
}
```

很简单，对吧？

## 通过模板实现多态

继承是解决多态问题的好方案，但有时候你想要以多态方式处理的具体类型无法共享同一个基类。

> 在某些情况下，你可能无法控制具体类型（比如 STL 类型如 `std::string`），或者具体类型甚至无法继承（比如内置类型 `int`）。

这种情况下，如果这些类型提供了相同的接口，你可以使用模板来实现多态：

```cpp
auto printArea(const auto& shape) -> void {
    std::println("Area is {:.2f}", shape.area());
}
```

你可以用这个方法处理 `Square`、`Circle`，或者任何提供了无参 `area()` 且返回 `double` 的类型。模板之所以能工作，是因为编译器会为你使用的每个具体类型生成一个版本的函数——只要生成的代码能够编译通过，调用就是合法的。

> 如果你尝试传入一个不符合「接口」的类型（比如 `std::string`），编译器会在编译方法调用时报错，提示 `std::string` 没有 `area` 方法。

不幸的是，基于模板的多态有两个主要缺点。

**首先**，模板不会给你一个共享的运行时基类型（如 `Shape`）。每个实例化都是一个独特的类型，所以不存在一个公共类型来创建同质容器；你无法将 `Square` 和 `Circle` 混合存储在同一个数组中并统一处理，就像使用基类指针技术那样：

```cpp
auto shapes = std::vector<???>{&square, &circle};  // 无法确定类型
```

**第二个缺点**稍微隐蔽一些。任何使用基于模板的 `area(const auto&)` 方法的人，要么必须显式指定具体类型，要么本身也得是模板，以便传递 `area()` 的模板类型。

> 既然你一开始就是要在多态场景下使用，大多数调用者可能都属于第二类，他们自己也需要是模板才能传递类型。这会迅速让模板在代码库中蔓延，使代码更难阅读和结构化，增加编译时间，并产生更大的二进制文件和更慢的启动速度。

## 推导 std::any

假设 `Square` 和 `Circle` 是没有共同基类的固定类型，而且你无法修改它们让它们继承自同一个基类。但你仍然想通过一个统一的接口来处理它们。

一种方法是引入**包装器（wrapper）**。定义自己的 `Shape` 接口，然后创建继承自 `Shape` 并包含 `Square` 或 `Circle` 的包装类；每个包装器通过简单地转发调用给被包装对象来实现虚函数：

```cpp
class SquareWrapper : public Shape {
    Square square_;
public:
    explicit SquareWrapper(Square square) noexcept : square_{std::move(square)} {}
    auto area() const noexcept -> double override { return square_.area(); }
};

class CircleWrapper : public Shape {
    Circle circle_;
public:
    explicit CircleWrapper(Circle circle) noexcept : circle_{std::move(circle)} {}
    auto area() const noexcept -> double override { return circle_.area(); }
};
```

现在我们可以直接操作 `Shape` 的实例了：

```cpp
auto printAreas(const std::vector<std::unique_ptr<Shape>>& shapes) -> void {
    for (const auto& shape : shapes) {
        std::println("Area is {:.2f}", shape->area());
    }
}

auto main() -> int {
    auto shapes = std::vector<std::unique_ptr<Shape>>{};
    shapes.emplace_back(std::make_unique<SquareWrapper>(Square{2}));
    shapes.emplace_back(std::make_unique<CircleWrapper>(Circle{1}));
    printAreas(shapes);
}
```

这种方法可行，但有一个明显的缺点：你需要为每个想要适配的具体类型（如 `Circle`）编写单独的包装器类型（如 `CircleWrapper`），这很快就会变成一堆样板代码。

幸运的是，**模板可以将大部分工作交给编译器**，让它自动为每种类型生成所需的代码：

```cpp
template <typename T>
class ShapeWrapper : public Shape {
    T shape_;
public:
    explicit ShapeWrapper(T shape) noexcept : shape_{std::move(shape)} {}
    auto area() const noexcept -> double override { return shape_.area(); }
};
```

我们上面构建的就是「类型擦除」惯用法的基础。剩下的就是把所有这些机制隐藏在另一个类之后，这样调用者就不必处理我们的自定义接口和模板了：

> 这个实现总是进行堆分配。生产环境的 `std::any` 实现通常使用小缓冲区优化（SBO）技术，将小对象内联存储以避免分配。

```cpp
class AnyShape {
    class Shape { // 接口
    public:
        virtual ~Shape() = default;
        virtual auto area() const noexcept -> double = 0;
    };

    template <typename T>
    class ShapeWrapper : public Shape { // 包装器
        T shape_;
    public:
        explicit ShapeWrapper(T shape) noexcept : shape_{std::move(shape)} {}
        auto area() const noexcept -> double override { return shape_.area(); }
    };

    std::unique_ptr<Shape> shape_;

public:
    template <typename T>
    explicit AnyShape(T&& shape)
        : shape_{std::make_unique<ShapeWrapper<std::decay_t<T>>>(std::forward<T>(shape))} {}

    auto area() const noexcept -> double { return shape_->area(); }
};
```

它的工作方式和之前一样，但包装器逻辑对使用者完全隐藏：

```cpp
auto printAreas(const std::vector<AnyShape>& shapes) -> void {
    for (const auto& shape : shapes) {
        std::println("Area is {:.2f}", shape.area());
    }
}

auto main() -> int {
    auto shapes = std::vector<AnyShape>{};
    shapes.emplace_back(Square{2});
    shapes.emplace_back(Circle{1});
    printAreas(shapes);
}
```

## 通用版本的 std::any

`Shape` 和 `ShapeWrapper` 有一个标准的命名约定：前者被称为类型擦除的 **Concept（概念）**——即我们编程时所针对的接口；后者被称为 **Model（模型）**——即实现接口并转发给具体类型的模板包装器。

> 这里的「概念」是面向对象风格的接口（本质上是 vtable），与 C++20 的 `concept`（编译期谓词）无关。

让我们用标准术语重写原来的类型擦除示例。除了几个类型名之外，不需要做任何改动：

```cpp
#include <memory>

class Any {
    class Concept {
    public:
        virtual ~Concept() = default;
        virtual auto f() const noexcept -> double = 0;
    };

    template <typename T>
    class Model : public Concept {
        T obj_;
    public:
        explicit Model(T obj) noexcept : obj_{std::move(obj)} {}
        auto f() const noexcept -> double override { return obj_.f(); }
    };

    std::unique_ptr<Concept> obj_;

public:
    template <typename T>
    explicit Any(T&& obj) : obj_{std::make_unique<Model<std::decay_t<T>>>(std::forward<T>(obj))} {}

    auto f() const noexcept -> double { return obj_->f(); }
};
```

就是这样！`Any` 类就是 `std::any` 的简化版本，这种技术甚至在 STL 本身中也有使用（具体来说是在 `std::function` 中）。但那就是另一篇文章的内容了。

---

*原文作者：David Álvarez Rosa*

---

## 总结

类型擦除是 C++ 中一种优雅的技术，它结合了面向对象和模板编程的优点：

1. **接口多态**：传统方式，通过虚函数实现运行时多态，但要求类型有共同基类
2. **模板多态**：编译期多态，灵活但不支持异构容器
3. **类型擦除**：两全其美——通过包装器将任意类型适配到统一接口，同时隐藏实现细节

理解类型擦除不仅有助于你理解 `std::any` 和 `std::function` 的原理，更能让你在设计需要运行时多态但类型不共享基类的场景时，有一个优雅的解决方案。

如果你对 Rust 中的类似实现感兴趣，推荐阅读 Waifod 的文章 [Polymorphism in C++ and Rust: Type Erasure](https://waifod.com/posts/polymorphism-in-cpp-and-rust-type-erasure/)。
