---
layout: post
title: "PyTorch 入门指南：从张量到神经网络"
date: 2026-02-17 13:57:49 +0800
categories: tech-translation
description: "一篇图文并茂的 PyTorch 入门教程，涵盖张量基础、自动求导机制、梯度下降，以及如何从零构建一个完整的神经网络预测模型。"
original_url: https://0byte.io/articles/pytorch_introduction.html
source: Hacker News
---

本文翻译自 [Intro to PyTorch](https://0byte.io/articles/pytorch_introduction.html)，原载于 Hacker News。

---

## PyTorch 是什么？

PyTorch 是目前最流行的深度学习框架之一。它是一个开源库，基于 Torch 库构建（后者已不再活跃开发），由 Meta AI（前 Facebook AI）开发，如今隶属于 Linux 基金会。

如果你问我为什么选择 PyTorch 而不是 TensorFlow？答案很简单：**动态计算图**。PyTorch 采用动态图（define-by-run），这意味着你可以在运行时改变网络结构，调试起来就像写普通 Python 代码一样自然。相比之下，TensorFlow 1.x 的静态图调试简直是噩梦（虽然 TF 2.x 已经支持动态图了）。

## 张量基础

机器学习本质上就是数字游戏。**张量（Tensor）** 就是 PyTorch 中存储这些数字的专用容器。

你可能从数学或物理课上学过张量，但在机器学习中，张量就是 PyTorch 的数据类型——把它想象成一个加强版的列表或数组。张量承载着你的训练数据，模型就是从这些数据中学习规律的。

### 张量初始化方式

张量之所以强大，是因为它自带了很多实用的函数。创建张量时，你需要用初始值填充它。PyTorch 提供了多种初始化函数：`torch.rand()`、`torch.randn()`、`torch.ones()` 等等。

但它们有什么区别？随机数到底是什么样的随机？

**最好的理解方式是直接看。** 让我们用每种函数创建数千个随机值，然后画成直方图：

```python
import torch

rand_sample = torch.rand(10000)      # 均匀分布 [0, 1)
randn_sample = torch.randn(10000)    # 标准正态分布（均值0，方差1）
zeros_sample = torch.zeros(10)       # 全零
ones_sample = torch.ones(10)         # 全一
arange_sample = torch.arange(0, 10)  # 0到9的序列
linspace_sample = torch.linspace(0, 10, steps=5)  # 等间隔采样
eye_sample = torch.eye(5)            # 单位矩阵
empty_sample = torch.empty(10)       # 未初始化
```

可视化后一目了然：

- `torch.rand()`：生成 0 到 1 之间的均匀分布随机数
- `torch.randn()`：生成标准正态分布，数值集中在 0 附近
- `torch.eye()`：生成单位矩阵
- `torch.empty()`：这个比较特殊——它只分配内存但不初始化，所以张量里包含的是内存中原本的"垃圾值"。如果你看到全是 0，那只是巧合。`torch.zeros()` 才是明确填充 0，而 `torch.empty()` 不做任何保证，**读取前必须先写入**。

### 导入你自己的数据

"那我的数据呢？"

初始化张量用随机噪声固然有用，但训练模型最终还是要用你自己的真实数据。来看一个简单的例子，假设你有这样的房价数据：

| 卧室数 | 面积（m²） | 房龄（年） | 价格（万英镑） |
|--------|-----------|-----------|---------------|
| 2      | 65        | 15        | 285           |
| 3      | 95        | 8         | 425           |
| 4      | 120       | 25        | 380           |
| 3      | 88        | 42        | 295           |
| 5      | 180       | 3         | 675           |
| 2      | 58        | 50        | 245           |

```python
# 每行是一套房：[卧室数, 面积, 房龄, 价格]
houses = torch.tensor([
    [2, 65, 15, 285],
    [3, 95, 8, 425],
    [4, 120, 25, 380],
    [3, 88, 42, 295],
    [5, 180, 3, 675],
    [2, 58, 50, 245]
], dtype=torch.float32)
```

**等等，我的数据不全是数字啊？** 有时候我们有文字、图片，甚至 3D 模型数据。这时候就需要一个中间步骤：找到把输入数据映射成数字的方法。

- **文字** → 数字：最简单的方法是给每个词分配一个唯一 ID。句子 "hello world" 就变成了 `[0, 1]`：
  ```
  "hello" → 0
  "world" → 1
  ```

- **图片** → 数字：图片本质上就是像素网格，每个像素包含颜色信息（RGB，值范围 0-255）。28×28 像素的灰度图？形状是 `[28, 28]`。彩色图？形状是 `[3, 28, 28]`（三个颜色通道）。

- **3D 模型** → 数字：对于机器学习，我们最关心的是**顶点（vertices）**——定义形状的点。每个顶点有 x、y、z 坐标。1000 个顶点的 3D 模型？形状是 `[1000, 3]`。

你看，总能找到数值表示的方法。

## 张量数学运算

张量自带丰富的运算操作。事实上，PyTorch 预定义了超过 100 种运算。

### 基本算术运算

```python
import torch

x = torch.tensor([1.0, 2.0, 3.0])
y = torch.tensor([4.0, 5.0, 6.0])

# 基本算术
print(x + y)   # 加法: tensor([5., 7., 9.])
print(x * y)   # 逐元素乘法: tensor([4., 10., 18.])
print(x @ y)   # 点积: tensor(32.)

# 聚合运算
print(x.sum())   # 求和: tensor(6.)
print(x.mean())  # 平均值: tensor(2.)
print(x.max())   # 最大值: tensor(3.)
```

### 激活函数

```python
import torch
import torch.nn.functional as F

x = torch.tensor([-2.0, -1.0, 0.0, 1.0, 2.0])

# ReLU（最常用）- 负值变 0
print(F.relu(x))        # tensor([0., 0., 0., 1., 2.])

# Sigmoid - 归一化到 0~1
print(torch.sigmoid(x)) # tensor([0.12, 0.27, 0.50, 0.73, 0.88])

# Tanh - 归一化到 -1~1
print(torch.tanh(x))    # tensor([-0.96, -0.76, 0.00, 0.76, 0.96])
```

## 自动求导（Autograd）

你常会看到这句话：**"Autograd 是神经网络的引擎。"**

确实，你不需要懂发动机原理也能开车，但至少掀开引擎盖看看是个好主意。

### 导数——一个方向上的陡峭程度

$$f(x) = x^2$$

导数描述函数相对于某个变量的变化率。在 $x = 2$ 处，函数的变化率是 4（因为 $f'(x) = 2x$）。

### 梯度——所有方向上的陡峭程度

但我们的房价预测例子不止一个变量，实际上有 4 个！卧室数、面积、房龄……（价格是目标值——我们要预测的）。

**梯度（Gradient）** 就是导数的集合——每个变量一个。它一次性展示所有方向的斜率。

关键点是：两个参数的函数我们还能用 3D 图可视化，但任何超过两个参数的网络几乎无法可视化。而真实神经网络有**数百万**个参数。

这就是为什么我们需要 autograd——它自动处理所有导数计算。配合 GPU，速度快到难以想象。

**这时候我们只能相信数学。**

### 梯度下降——沿着斜坡下山

Autograd 给我们梯度。如你所见，箭头指向上坡——最陡增加的方向。上面是什么？更高的损失（loss）——离真相更远。

**梯度下降（Gradient Descent）** 就是找到下坡路的算法，通往损失最低的山谷。

还有其他优化算法，值得一提的有 **Adam**——最流行的优化器之一，PyTorch 也内置了。

训练循环变成：计算导数得到梯度 → 用优化器（梯度下降、Adam 等）调整参数 → 重复成百上千次。

## Autograd 实战

让我们看看在 PyTorch 中如何计算导数：

```python
# 定义单值张量
# 注意我们启用了梯度追踪
x = torch.tensor(2.0, requires_grad=True)

# 定义函数 f(x) = x²
f = x ** 2

# 调用 .backward() 计算梯度
f.backward()

# 检查在点 x 处的梯度（导数）
print(x.grad)  # 4.0
```

来个复杂点的：

```python
# 定义三个带梯度追踪的张量
x = torch.tensor(1.0, requires_grad=True)
y = torch.tensor(2.0, requires_grad=True)
z = torch.tensor(0.5, requires_grad=True)

# 定义函数 f(x,y,z) = sin(x)·y² + e^z
f = torch.sin(x) * y**2 + torch.exp(z)

# 计算梯度
f.backward()

# 检查导数
print(x.grad)  # cos(1) * 4 ≈ 2.16
print(y.grad)  # sin(1) * 2*2 ≈ 3.37
print(z.grad)  # e^0.5 ≈ 1.65
```

这开始变得繁琐了。但关键是：**训练神经网络时，你不需要手写这些函数**。网络架构本身就是那个有数百万参数和运算的复杂函数。PyTorch 自动追踪一切。你只需要定义模型、运行、计算损失、调用 `.backward()`。PyTorch 在幕后处理所有数学。

## 构建一个简单的神经网络

作为入门教程，创建一个简单的分类或回归模型很合适。你可能见过经典的泰坦尼克号表格数据集？我们的房价预测器也是同类。

之所以用这个例子，是因为它能让我们专注于 PyTorch 的核心概念——训练循环、反向传播、模型构建。实践中，神经网络在图像和文本等非结构化数据上才真正大放异彩。因为这是入门介绍，我们暂时避开卷积层（CNN）。

> **实际建议**：如果你处理的是表格数据，在动手写自定义神经网络之前，先试试 XGBoost 或 LightGBM，效果可能更好。

### 导入库

```python
import torch
import torch.nn as nn
import torch.nn.functional as F  # 包含激活函数
import pandas as pd               # 加载 CSV 数据
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error
import matplotlib.pyplot as plt   # 可选，用于可视化
```

### 数据准备

在机器学习中，数据为王——但格式必须正确。典型工作流程：

1. **分离特征和目标** - 把 `price` 列分出来作为目标值 y，其余作为特征 X
2. **数据划分** - 通常用 TRAIN/VALIDATE/TEST 三分，但我们简化为 TRAIN/TEST（80/20）
3. **归一化** - 用 StandardScaler 缩放到零均值和单位方差
4. **转张量** - 转成 PyTorch 张量

```python
data_raw = pd.read_csv('./london_houses_transformed.csv')

# 分离特征和目标
x = data_raw.drop('price', axis=1)
y = data_raw['price']

# 数据划分 80/20
X_train_raw, X_test_raw, Y_train_raw, Y_test_raw = train_test_split(
    x.values, y.values, test_size=0.2, random_state=15
)

# 归一化
scaler_X = StandardScaler().fit(X_train_raw)
scaler_Y = StandardScaler().fit(Y_train_raw.reshape(-1, 1))

# 保存用于后续反归一化
price_mean = scaler_Y.mean_[0]
price_std = scaler_Y.scale_[0]

# 转张量
X_train = torch.FloatTensor(scaler_X.transform(X_train_raw))
X_test = torch.FloatTensor(scaler_X.transform(X_test_raw))
Y_train = torch.FloatTensor(scaler_Y.transform(Y_train_raw.reshape(-1, 1)))
Y_test = torch.FloatTensor(scaler_Y.transform(Y_test_raw.reshape(-1, 1)))
```

### 定义模型

定义模型对象，遵循 PyTorch 官方文档的模式。指定输入特征数 87（数据有 88 列 - 87 个特征 + 1 个目标），隐藏层 h1 有 64 个神经元，h2 有 32 个神经元，输出 1 个特征（价格）。使用 ReLU 作为激活函数。

```python
class Model(nn.Module):
    def __init__(self, in_features=87, h1=64, h2=32, output_features=1):
        super().__init__()
        self.fc1 = nn.Linear(in_features, h1)
        self.fc2 = nn.Linear(h1, h2)
        self.out = nn.Linear(h2, output_features)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = F.relu(self.fc2(x))
        x = self.out(x)
        return x

model = Model()
```

### 训练循环

送模型去上学！训练循环是模型真正学习的地方。遍历整个数据集的每一次迭代称为一个 **epoch**。每个 epoch 发生的事情：

1. **前向传播** - 把训练数据送进模型得到预测：`model.forward(X_train)`
2. **计算损失** - 用 `MSELoss()` 衡量预测有多错
3. **反向传播** - `loss.backward()` 计算每个权重对误差的贡献
4. **更新权重** - `optimizer.step()` 调整权重以减少误差。我们用 Adam 优化器，它会自动为每个参数调整学习率
5. **清零梯度** - `optimizer.zero_grad()` 重置梯度，防止累积到下一个 epoch

重复 100 次，学习率 0.01。每个 epoch 损失应该下降。

```python
epochs = 100
learning_rate = 0.01
torch.manual_seed(15)

losses = []
optimizer = torch.optim.Adam(model.parameters(), learning_rate)
loss_func = nn.MSELoss()

for i in range(epochs):
    # 前向传播
    y_pred = model.forward(X_train)

    # 计算损失
    loss = loss_func(y_pred, Y_train)
    losses.append(loss.detach().numpy())

    if i % 20 == 0:
        print(f'Epoch: {i} loss: {loss:.4f}')

    # 清零梯度
    optimizer.zero_grad()

    # 反向传播
    loss.backward()

    # 更新权重
    optimizer.step()

# 保存最终模型
torch.save(model.state_dict(), 'model.pth')
```

### 测试模型

用预留的测试数据评估模型——模型从未见过的数据：

```python
# 推理模式
model.eval()

with torch.no_grad():
    predictions = model(X_test)

# 反归一化回真实价格
predictions_real = predictions * price_std + price_mean
Y_test_real = Y_test * price_std + price_mean

print("\n测试集预测结果：")
mae = mean_absolute_error(Y_test_real, predictions_real)
mape = mean_absolute_percentage_error(Y_test_real, predictions_real) * 100

# 计算误差百分比
pct_errors = torch.abs((Y_test_real - predictions_real) / Y_test_real) * 100
within_10 = (pct_errors <= 10).sum().item()
within_20 = (pct_errors <= 20).sum().item()
total = len(Y_test_real)

print(f"\n整体性能：")
print(f"  MAE: £{mae:,.0f}")
print(f"  MAPE: {mape:.1f}%")
print(f"  误差 ≤10%: {within_10}/{total} ({within_10/total*100:.0f}%)")
print(f"  误差 ≤20%: {within_20}/{total} ({within_20/total*100:.0f}%)")
```

**结果：**

```
整体性能：
  MAE: £329,798
  MAPE: 18.6%
  误差 ≤10%: 257/689 (37%)
  误差 ≤20%: 447/689 (65%)
```

我们从零构建了一个完整的机器学习流水线——数据准备、训练、反向传播、评估——全部协同工作。

## 小结

通过这篇教程，我们完成了：

1. **张量基础** - 理解了 PyTorch 的核心数据结构，以及各种初始化方式的区别
2. **自动求导** - 了解了 Autograd 如何自动计算梯度，这是神经网络训练的基础
3. **完整流水线** - 从数据预处理到模型训练再到评估，跑通了整个 ML 流程

**关于房价预测结果的一点思考**：模型性能的瓶颈不在模型本身，而在特征。房价最关键的因素是**位置**，而我们当前的特征无法捕捉这种细粒度信息。这正是机器学习的现实：**再好的模型也弥补不了缺失的信息**。

下次改进时，要么从更好的特征工程入手，要么对于表格数据直接上 XGBoost/LightGBM。
