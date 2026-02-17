---
layout: post
title: "PyTorch 入门指南：从张量到神经网络的视觉化学习"
date: 2026-02-17 10:38:23 +0800
categories: tech-translation
description: "一篇面向初学者的 PyTorch 可视化教程，从张量基础、自动微分到构建完整的神经网络，用直观的方式带你理解深度学习框架的核心概念。"
original_url: https://0byte.io/articles/pytorch_introduction.html
source: Hacker News
---

本文翻译自 [Intro to PyTorch](https://0byte.io/articles/pytorch_introduction.html)，原载于 Hacker News。

## PyTorch 是什么？

PyTorch 是目前最流行的深度学习框架之一。它是一个基于 Torch 库（已不再活跃开发）构建的开源库，由 Meta AI（前身是 Facebook AI）开发，现在隶属于 Linux 基金会。

如果你刚接触深度学习，可能会好奇：为什么需要 PyTorch？简单来说，它提供了一套完整的工具链，让你能够高效地构建、训练和部署神经网络。

## 张量（Tensor）基础

机器学习本质上就是数字的游戏。**张量（Tensor）** 就是 PyTorch 中专门用来存储这些数字的容器。你可能在数学或物理学中接触过张量，但在机器学习中，张量其实就是 PyTorch 的核心数据类型。可以把它想象成列表或数组的强化版——张量不仅存储你的训练数据，也是模型学习过程中参数的载体。

### 张量的初始化方式

创建新张量时，你需要填充初始值。PyTorch 提供了多种初始化函数：`torch.rand()`、`torch.randn()`、`torch.ones()` 等等。它们之间有什么区别？

**最好的理解方式就是看图。** 如果我们用每种函数创建数千个随机值并绘制直方图，就能清楚地看到它们的分布特点：

```python
import torch

rand_sample = torch.rand(10000)      # 均匀分布 [0, 1)
randn_sample = torch.randn(10000)    # 标准正态分布 (均值0, 方差1)
zeros_sample = torch.zeros(10)       # 全零
ones_sample = torch.ones(10)         # 全一
arange_sample = torch.arange(0, 10)  # 等差数列
linspace_sample = torch.linspace(0, 10, steps=5)  # 线性间隔
eye_sample = torch.eye(5)            # 单位矩阵
empty_sample = torch.empty(10)       # 未初始化（内容不确定）
```

从直方图可以看出：
- `torch.rand()`：生成 0 到 1 之间的均匀分布随机数
- `torch.randn()`：生成标准正态分布，大部分值聚集在 0 附近
- `torch.eye()`：生成单位矩阵
- `torch.empty()`：这里有个**坑**——它分配内存但不初始化，张量中包含的是该内存位置原本的数据。如果你看到零，那只是巧合。`torch.zeros()` 会显式填充零，而 `torch.empty()` 不做任何保证——读取前必须先写入。

### 处理自己的数据

用随机噪声初始化张量有时很有用，但最终你需要自己的数据进行训练。假设你有这样的房价数据：

| 卧室数 | 面积 (m²) | 房龄 (年) | 价格 (£k) |
|--------|-----------|-----------|-----------|
| 2      | 65        | 15        | 285       |
| 3      | 95        | 8         | 425       |
| 4      | 120       | 25        | 380       |
| 3      | 88        | 42        | 295       |
| 5      | 180       | 3         | 675       |

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

### 非数值数据的处理

你可能好奇：不是所有数据都是数字。我们有文字、图像甚至 3D 网格数据。这种情况下，需要一个中间步骤——把输入数据映射成数字。

**文本**映射为数字。最简单的方法是给每个词分配一个唯一 ID。所以句子 "hello world" 变成 `[0, 1]`——PyTorch 可以直接处理的数字序列。

```
"hello" → 0
"world" → 1
```

**图像**本质上就是像素网格，每个像素包含颜色信息（RGB - 红、绿、蓝），值范围从 0 到 255。一张 28×28 像素的灰度图像？那是形状为 `[28, 28]` 的张量。彩色图像？形状为 `[3, 28, 28]`，对应三个颜色通道。

**3D 网格**：我们在游戏中看到的 3D 物体看起来是实心的形状，有时能看到线框。但对于机器学习，我们最关心的是顶点（vertices）——定义形状的点。每个顶点有坐标：x、y、z 值。一个有 1000 个顶点的 3D 模型？那是形状为 `[1000, 3]` 的张量。

## 张量数学运算

张量还提供了丰富的运算操作。实际上，PyTorch 有超过 100 个预定义的运算。以下是几个常用的：

### 基本算术运算

```python
import torch

x = torch.tensor([1.0, 2.0, 3.0])
y = torch.tensor([4.0, 5.0, 6.0])

# 基本运算
print(x + y)   # 加法
print(x * y)   # 逐元素乘法
print(x @ y)   # 点积（1D 的矩阵乘法）

# 聚合操作
print(x.sum())   # 求和
print(x.mean())  # 平均值
print(x.max())   # 最大值
```

### 激活函数

```python
import torch
import torch.nn.functional as F

x = torch.tensor([-2.0, -1.0, 0.0, 1.0, 2.0])

# ReLU（最流行）- 将负值设为 0
print(F.relu(x))       # tensor([0., 0., 0., 1., 2.])

# Sigmoid - 将值归一化到 0-1 之间
print(torch.sigmoid(x)) # tensor([0.12, 0.27, 0.50, 0.73, 0.88])

# Tanh - 将值归一化到 -1 到 1 之间
print(torch.tanh(x))    # tensor([-0.96, -0.76, 0.00, 0.76, 0.96])
```

## 自动微分（Autograd）：神经网络的引擎

你经常会看到这句话："Autograd 是神经网络的引擎。" 当然，你不需要知道引擎怎么工作才能开车，但稍微掀开引擎盖看看还是值得的。

### 导数——一个方向上的陡峭程度

对于函数 f(x) = x²，在 x = 2 处，函数的变化率是 4。虚线显示了该点的斜率（导数）。注意斜率在远离 x = 0 时变得更陡峭。

### 梯度——所有方向上的陡峭程度

即使是开头那个简单的房价示例，也有多个变量（卧室数、面积、房龄）。**梯度（Gradient）** 就是导数的集合——每个变量一个。它同时显示每个方向的斜率。黄色箭头显示梯度——总是指向最陡上升的方向。

Autograd 给我们梯度。如你所见，箭头指向上坡方向——最陡增加的方向。那里有什么？更高的损失——离真相更远。根据这个信息，我们可以进行调整。**梯度下降（Gradient Descent）** 就是找到下坡路的算法，通向损失最低的山谷。

这不是唯一的算法。值得一提的是 **Adam**——最流行的优化器之一，也包含在 PyTorch 库中。

训练循环变成：计算导数得到梯度 → 使用优化器（梯度下降、Adam 等）进行调整 → 重复数百或数千次。

### Autograd 实践

看看 PyTorch 中如何计算导数：

```python
# 定义单值张量
# 注意我们启用了梯度追踪
x = torch.tensor(2.0, requires_grad=True)

# 定义函数 f(x) = x²
f = x ** 2

# 调用 .backward() 计算梯度
f.backward()

# 查看梯度（导数）
print(x.grad)  # 4.0
```

来点更复杂的：

```python
# 定义三个启用梯度追踪的张量
x = torch.tensor(1.0, requires_grad=True)
y = torch.tensor(2.0, requires_grad=True)
z = torch.tensor(0.5, requires_grad=True)

# 定义函数 f(x,y,z) = sin(x)·y² + e^z
f = torch.sin(x) * y**2 + torch.exp(z)

# 计算梯度
f.backward()

# 查看导数
print(x.grad)  # cos(1) * 4 ≈ 2.16
print(y.grad)  # sin(1) * 2*2 ≈ 3.37
print(z.grad)  # e^0.5 ≈ 1.65
```

这开始变得繁琐了。但关键是：训练神经网络时，你不需要手动写出这些函数。网络架构本身就是有数百万参数和操作的复杂函数。PyTorch 自动追踪一切。你只需定义模型、运行它、计算损失，然后调用 `.backward()`。PyTorch 在幕后处理所有数学运算。

## 构建一个简单的神经网络

作为入门教程，我们来创建一个简单的房价预测模型。这让我们专注于学习 PyTorch 的核心概念——训练循环、反向传播和模型构建。

**小贴士**：如果你处理的是表格数据，通常建议先尝试 XGBoost 或 LightGBM，再考虑构建自定义神经网络，前者可能更准确。神经网络在图像和文本等非结构化数据上才真正大放异彩。

### 导入库

```python
import torch
import torch.nn as nn
import torch.nn.functional as F  # 包含激活函数
import pandas as pd              # 加载 CSV 数据
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error
import matplotlib.pyplot as plt  # 可视化（可选）
```

### 数据准备

在机器学习中，数据为王——但格式要对。典型的工作流程：

1. **分离特征和目标**：把 'price' 列分出来作为目标 y，其余作为特征 X
2. **数据分割**：用 `test_size=0.2` 保留 20% 数据用于测试，80% 用于训练
3. **标准化**：使用 StandardScaler 缩放到零均值和单位方差
4. **转换张量**：把数据转成 PyTorch 张量

```python
data_raw = pd.read_csv('./london_houses_transformed.csv')

# 分离特征和目标
x = data_raw.drop('price', axis=1)
y = data_raw['price']

# 数据分割 80/20
X_train_raw, X_test_raw, Y_train_raw, Y_test_raw = train_test_split(
    x.values, y.values, test_size=0.2, random_state=15
)

# 标准化
scaler_X = StandardScaler().fit(X_train_raw)
scaler_Y = StandardScaler().fit(Y_train_raw.reshape(-1, 1))

# 保存用于后续反标准化
price_mean = scaler_Y.mean_[0]
price_std = scaler_Y.scale_[0]

# 转换张量
X_train = torch.FloatTensor(scaler_X.transform(X_train_raw))
X_test = torch.FloatTensor(scaler_X.transform(X_test_raw))
Y_train = torch.FloatTensor(scaler_Y.transform(Y_train_raw.reshape(-1, 1)))
Y_test = torch.FloatTensor(scaler_Y.transform(Y_test_raw.reshape(-1, 1)))
```

### 定义模型

按照 PyTorch 官方文档定义模型。输入特征 87 个（数据有 88 列 - 87 个特征和 1 个目标）。隐藏层：h1 有 64 个神经元，h2 有 32 个神经元，输出 1 个特征（价格）。使用 ReLU 作为激活函数。

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

训练循环是模型真正学习的地方。每次遍历整个数据集称为一个 epoch。每个 epoch 中发生的事情：

1. **前向传播**：把训练数据送入模型得到预测
2. **计算损失**：用 MSELoss() 衡量预测有多错
3. **反向传播**：`loss.backward()` 计算每个权重对错误的贡献
4. **更新权重**：`optimiser.step()` 调整权重减少错误
5. **清除梯度**：`optimiser.zero_grad()` 重置梯度，防止累积到下一个 epoch

```python
epochs = 100
learning_rate = 0.01
torch.manual_seed(15)

losses = []
optimiser = torch.optim.Adam(model.parameters(), learning_rate)
loss_func = nn.MSELoss()

for i in range(epochs):
    # 前向传播
    y_pred = model.forward(X_train)

    # 计算损失
    loss = loss_func(y_pred, Y_train)
    losses.append(loss.detach().numpy())

    if i % 20 == 0:
        print(f'Epoch: {i} loss: {loss}')

    # 清除梯度
    optimiser.zero_grad()

    # 反向传播
    loss.backward()

    # 更新权重
    optimiser.step()

# 保存模型
torch.save(model.state_dict(), 'model.pth')
```

### 测试模型

用保留的测试数据评估模型：

```python
model.eval()
with torch.no_grad():
    predictions = model(X_test)

# 反标准化回真实价格
predictions_real = predictions * price_std + price_mean
Y_test_real = Y_test * price_std + price_mean

print("\n测试预测（未见过的数据）：")
mae = mean_absolute_error(Y_test_real, predictions_real)
mape = mean_absolute_percentage_error(Y_test_real, predictions_real) * 100

# 计算百分比误差
pct_errors = torch.abs((Y_test_real - predictions_real) / Y_test_real) * 100
within_10 = (pct_errors <= 10).sum().item()
within_20 = (pct_errors <= 20).sum().item()
total = len(Y_test_real)

print(f"\n整体性能：")
print(f"  MAE: £{mae:,.0f}")
print(f"  MAPE: {mape:.1f}%")
print(f"  误差 10% 以内: {within_10}/{total} ({within_10/total*100:.0f}%)")
print(f"  误差 20% 以内: {within_20}/{total} ({within_20/total*100:.0f}%)")
```

### 结果分析

```
整体性能：
MAE: £329,798
MAPE: 18.6%
误差 10% 以内: 257/689 (37%)
误差 20% 以内: 447/689 (65%)
```

我们从零构建了完整的机器学习流水线——数据准备、训练、反向传播、评估——所有环节协同工作。结果告诉我们真正的挑战在哪里：不在模型，而在特征。房价很大程度上取决于位置，而我们目前的特征无法捕捉那种粒度。这就是机器学习的现实：好的模型无法弥补缺失的信息。下次？从更好的特征开始，或者处理表格数据时选择 XGBoost。

## 关键要点

1. **张量是基础**：理解张量的不同初始化方式和数据类型是使用 PyTorch 的第一步
2. **Autograd 是核心**：自动微分让反向传播变得简单，只需调用 `.backward()`
3. **训练循环五步走**：前向传播 → 计算损失 → 清除梯度 → 反向传播 → 更新权重
4. **数据预处理很重要**：标准化、分割数据是基本功
5. **选对工具**：表格数据优先考虑 XGBoost/LightGBM，图像文本才是神经网络的主场

PyTorch 的学习曲线可能看起来陡峭，但一旦掌握了张量操作和训练循环的基本概念，你就能开始构建各种有趣的深度学习应用了。 Happy coding!
