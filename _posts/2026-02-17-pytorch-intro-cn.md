---
layout: post
title: "PyTorch 入门指南：从张量到神经网络的视觉化教程"
date: 2026-02-17 17:24:19 +0800
categories: tech-translation
description: "一篇图文并茂的 PyTorch 入门教程，从张量基础到自动微分，再到构建完整的房价预测神经网络模型，帮助你直观理解深度学习的核心概念。"
original_url: https://0byte.io/articles/pytorch_introduction.html
source: Hacker News
---

本文翻译自 [Intro to PyTorch](https://0byte.io/articles/pytorch_introduction.html)，原载于 Hacker News。

---

## PyTorch 是什么？

PyTorch 是目前最流行的深度学习框架之一。它是一个基于 Torch 库（已不再活跃开发）构建的开源库，最初由 Meta AI（前身为 Facebook AI）开发，现在隶属于 Linux 基金会。

如果你刚开始接触深度学习，PyTorch 是一个非常好的起点——它的 API 设计直观，调试方便，社区活跃。

## 张量基础

机器学习本质上就是处理数字。**张量（Tensor）** 就是专门用来存储这些数字的容器。

你可能从数学或物理课上学过张量的概念，但在机器学习中，张量就是 PyTorch 的基本数据类型。可以把它想象成一个更强大的列表或数组——张量存储你的训练数据，也是模型学习的载体。

张量之所以特别，是因为它内置了许多实用函数。创建新张量时，你需要用初始值填充它。PyTorch 提供了多种初始化函数：`torch.rand()`、`torch.randn()`、`torch.ones()` 等等。

但这些函数有什么区别？它们生成的随机数又有什么不同？

**最好的理解方式就是亲眼看看。** 如果我们用每个函数创建成千上万个随机值，然后绘制成直方图，就能清楚地看到它们的特点：

```python
import torch

rand_sample = torch.rand(10000)
randn_sample = torch.randn(10000)
zeros_sample = torch.zeros(10)
ones_sample = torch.ones(10)
arange_sample = torch.arange(0, 10)
linspace_sample = torch.linspace(0, 10, steps=5)
eye_sample = torch.eye(5)
empty_sample = torch.empty(10)
```

通过直方图可以清楚地看到：
- `torch.rand()`：用 0 到 1 之间的均匀分布随机值初始化张量
- `torch.randn()`：用均值为 0 的正态分布随机值初始化（大部分值聚集在 0 附近）
- `torch.eye()`：生成单位矩阵
- `torch.empty()`：有趣的是，它并不是"空的"！它只是分配内存但不初始化，所以张量包含的是该内存位置原本就存在的值。如果你看到全是 0，那只是巧合。`torch.zeros()` 会显式地将张量填充为 0，而 `torch.empty()` 不做任何保证——你应该始终在读取之前先写入数据。

### "那我的数据呢？"

用随机噪声初始化张量有时很有用，但最终你还是需要用自己的数据进行训练。来看一个简单的例子，假设你有如下房屋数据：

| 卧室数 | 面积 (m²) | 房龄 (年) | 价格 (£k) |
| --- | --- | --- | --- |
| 2 | 65 | 15 | 285 |
| 3 | 95 | 8 | 425 |
| 4 | 120 | 25 | 380 |
| 3 | 88 | 42 | 295 |
| 5 | 180 | 3 | 675 |
| 2 | 58 | 50 | 245 |

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

你可能会问：不是所有数据都是数字啊。有时候我们有文字、图像，甚至 3D 网格数据。这种情况下，我们需要一个中间步骤——找到将输入数据映射为数字的方法。

- **文字**：被映射为数字。最简单的方法是给每个词分配一个唯一 ID。所以句子 "hello world" 就变成了 `[0, 1]`——PyTorch 可以直接处理的数字序列。

  ```
  "hello" → 0
  "world" → 1
  ```

- **图像**：本质上就是像素网格，每个像素包含颜色信息（RGB - 红、绿、蓝），值范围从 0 到 255。一张 28×28 像素的灰度图像？那就是形状为 `[28, 28]` 的张量。彩色图像？形状为 `[3, 28, 28]`，对应三个颜色通道。

- **3D 网格**：我们在游戏中看到的 3D 物体看起来是实心形状，有时是线框。但对于机器学习，我们最感兴趣的是顶点（vertices）——定义形状的点。每个顶点都有坐标：x、y、z 值。一个有 1000 个顶点的 3D 模型？那就是形状为 `[1000, 3]` 的张量。

可以看到，总有办法找到输入数据的数值表示。

## 张量数学运算

张量还内置了大量运算。实际上，PyTorch 预定义了超过 100 种运算。这里介绍几个常用的：

**基础算术运算：**

```python
import torch

x = torch.tensor([1.0, 2.0, 3.0])
y = torch.tensor([4.0, 5.0, 6.0])

# 基础算术
print(x + y)    # 加法
print(x * y)    # 逐元素乘法
print(x @ y)    # 点积（一维情况下的矩阵乘法）

# 聚合操作
print(x.sum())  # 求和
print(x.mean()) # 平均值
print(x.max())  # 最大值
```

**激活函数：**

```python
import torch
import torch.nn.functional as F

x = torch.tensor([-2.0, -1.0, 0.0, 1.0, 2.0])

# ReLU（最常用）- 将负值设为 0
print(F.relu(x))        # tensor([0., 0., 0., 1., 2.])

# Sigmoid - 将值归一化到 0 和 1 之间
print(torch.sigmoid(x)) # tensor([0.12, 0.27, 0.50, 0.73, 0.88])

# Tanh - 将值归一化到 -1 和 1 之间
print(torch.tanh(x))    # tensor([-0.96, -0.76, 0.00, 0.76, 0.96])
```

## 自动微分（Autograd）

你经常会看到这样一句话："Autograd 是神经网络的引擎。"当然，你不需要知道引擎怎么工作才能开车，但至少打开引擎盖看一眼是个好主意。

如果你已经知道什么是函数导数，可以跳到下一节。

> "微分很重要。它是支撑科学和工程许多领域的基础数学运算。微分用于描述函数相对于特定变量如何变化。微分方程在科学和工程中无处不在——从模拟细菌进化到计算火箭推力随时间的变化，再到预测性机器学习算法，快速计算准确的微分方程的能力备受关注。" — autograd.readthedocs.io

### 导数（Derivative）——一个方向有多陡？

```
f(x) = x²
```

想象你在一条曲线上移动。导数告诉你：在当前位置，曲线有多陡？

比如在 x = 2 时，函数的变化率是 4（因为 f'(x) = 2x）。

这很有趣。但我们的房价例子从一开始就有不止一个变量——实际上有 4 个！卧室数、面积、房龄和价格（价格是目标值，我们要预测的）。

### 梯度（Gradient）——所有方向有多陡？

**梯度就是一组导数——每个变量一个。**它一次性显示每个方向的斜率。

我们可以可视化有两个变量 x 和 y 的函数，因为我们还有第三个维度 z 来表示高度。但关键来了：我们已经达到了可视化的极限。任何超过两个参数的网络都几乎无法可视化。而真正的神经网络有数百万个参数。

这就是为什么我们需要 autograd。它自动处理所有导数计算。在 GPU 的帮助下，这可以以难以想象的速度完成。

**我们只能相信数学。**

### 梯度下降（Gradient Descent）——沿着斜坡下坡

Autograd 给我们梯度。如你所见，箭头指向上坡方向——最陡增加的方向。那上面是什么？更高的损失（loss）——离真相更远。根据这个信息，我们可以做出调整。

**梯度下降**是找到下坡路的算法，通向损失最低的山谷。

它不是唯一能做到这一点的算法。值得一提的还有 **Adam**——最流行的优化器之一，也包含在 PyTorch 库中。

训练循环变成：计算导数得到梯度 → 使用优化器（梯度下降、Adam 等）进行调整 → 重复数百或数千次。

## Autograd 实践

让我们看看如何在 PyTorch 中计算导数：

```python
# 定义单值张量
# 注意我们启用了梯度跟踪
x = torch.tensor(2.0, requires_grad=True)

# 定义函数 f(x) = x²
f = x ** 2

# 要计算梯度，我们可以调用 .backward() 函数
f.backward()

# 我们现在可以检查点 x 处的梯度（导数）
print(x.grad)  # 4.0
```

来点更复杂的：

```python
# 定义三个带梯度跟踪的张量
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

这开始变得繁琐了。但关键点是：训练神经网络时，你不需要手动写出这些函数。**网络架构本身就是具有数百万参数和操作的复杂函数。**PyTorch 自动跟踪一切。你只需要定义模型、运行它、计算损失、然后调用 `.backward()`。PyTorch 在后台处理所有数学运算。

## 构建一个简单的神经网络

作为入门教程，创建一个简单的分类器或回归模型很合适。你可能见过经典的泰坦尼克号表格数据集？好吧，这个房价估计器也是类似的。

我们用这个例子是因为它可以让我们专注于学习 PyTorch 的核心概念——训练循环、反向传播和模型构建。在实践中，神经网络在图像和文本等非结构化数据上大放异彩。因为这是一个简单的入门教程，我们避免使用卷积层（CNN）。

> 如果你处理的是表格数据，通常最好先尝试 XGBoost 或 LightGBM，然后再跳到构建自定义神经网络，后者可能准确性更低。

### 导入库

```python
import torch
import torch.nn as nn
# 包含激活函数
import torch.nn.functional as F
# pandas 用于加载 CSV 数据
import pandas as pd
# 流行的数据分割库
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error
# 可选，用于可视化
import matplotlib.pyplot as plt
```

### 数据准备

在机器学习中，数据为王——但它需要是正确的格式。典型的工作流程：

1. **分离特征和目标** — 我们把 'price' 列分离出来，得到特征集 X。价格放到 y，这是我们的目标。
2. **数据分割** — 通常你会做 TRAIN/VALIDATE/TEST 分割，但我们保持简单，只用 TRAIN/TEST，`test_size=0.2`——我们基本上保留 20% 的数据集用于测试，80% 用于训练。`random_state=42` 参数确保分割是可重现的。
3. **标准化** — 有些值很大，可能会不成比例地影响训练。我们使用 `StandardScaler` 将数据缩放到零均值和单位方差。只在训练数据上拟合，以避免数据泄露。
4. **转换为张量** — 将数据转换为 PyTorch 张量——训练所需的数据类型。

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

# 保存这些用于后续反归一化
price_mean = scaler_Y.mean_[0]
price_std = scaler_Y.scale_[0]

# 转换为张量
X_train = torch.FloatTensor(scaler_X.transform(X_train_raw))
X_test = torch.FloatTensor(scaler_X.transform(X_test_raw))
Y_train = torch.FloatTensor(scaler_Y.transform(Y_train_raw.reshape(-1, 1)))
Y_test = torch.FloatTensor(scaler_Y.transform(Y_test_raw.reshape(-1, 1)))
```

### 定义模型

现在是定义模型对象的时候了。没有什么魔法，遵循 PyTorch 官方文档。不同之处在于我们指定了输入特征数量 87（我们的数据有 88 列——87 个特征和 1 个目标）。隐藏层：h1 有 64 个神经元，h2 有 32 个神经元，1 个输出特征（价格）。使用 ReLU 作为激活函数。

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

是时候把模型送去"上学"了！训练循环是模型真正学习的地方。遍历整个数据集的每次迭代称为一个 epoch。每个 epoch 发生的事情：

1. **前向传播** — 将训练数据通过模型并获得预测：`model.forward(X_train)`
2. **计算损失** — 我们使用 `MSELoss()` 测量预测有多错误
3. **反向传播** — `loss.backward()` 计算每个权重对误差的贡献
4. **更新权重** — `optimiser.step()` 调整权重以减少误差。我们使用 Adam 优化器，它会自动为每个参数调整学习率
5. **清除梯度** — `optimiser.zero_grad()` 重置梯度，以免它们累积到下一个 epoch

我们以 0.01 的学习率重复这个过程 100 次。随着每个 epoch，损失应该减少，模型在预测价格方面变得更好。

```python
epochs = 100
learning_rate = 0.01
torch.manual_seed(15)

# 每个训练循环，我们存储损失
# 这是可选的，用于可视化损失图
losses = []

optimiser = torch.optim.Adam(model.parameters(), learning_rate)
loss_func = nn.MSELoss()

for i in range(epochs):
    # 清除上一步的梯度
    optimiser.zero_grad()

    y_pred = model.forward(X_train)

    # 测量损失/误差
    loss = loss_func(y_pred, Y_train)

    # （可选）添加当前 epoch 的损失
    losses.append(loss.detach().numpy())

    # （可选）每 10 个 epoch 打印一次损失
    if i % 10 == 0:
        print(f'Epoch: {i} loss: {loss}')

    # 反向传播
    loss.backward()

    # 更新权重
    optimiser.step()

# 保存我们的最终模型
torch.save(model.state_dict(), 'model.pth')
```

### （可选）可视化损失函数

```python
plt.figure(figsize=(10, 6))
plt.plot(losses, linewidth=2, color='#e74c3c')
plt.xlabel('EPOCH', fontsize=12)
plt.ylabel('MSE Loss (normalized)', fontsize=12)
plt.title('Training Progress: Loss Approaching Zero', fontsize=14, fontweight='bold')
plt.grid(True, alpha=0.3)
plt.ylim(bottom=0)
plt.tight_layout()
plt.show()
```

### 测试模型

我们用预留的测试用例来测试模型。用模型从未见过的数据，我们检查结果与实际目标数据的对比。然后我们收集结果来计算：

- MAE - 平均绝对误差
- MAPE - 平均绝对百分比误差

```python
# 告诉 PyTorch 我们处于推理模式
model.eval()

with torch.no_grad():
    predictions = model(X_test)

# 反归一化回真实价格
predictions_real = predictions * price_std + price_mean
Y_test_real = Y_test * price_std + price_mean

print("\nTEST PREDICTIONS (UNSEEN DATA):")

mae = mean_absolute_error(Y_test_real, predictions_real)
mape = mean_absolute_percentage_error(Y_test_real, predictions_real) * 100

# 计算百分比误差
pct_errors = torch.abs((Y_test_real - predictions_real) / Y_test_real) * 100
within_10 = (pct_errors <= 10).sum().item()
within_20 = (pct_errors <= 20).sum().item()
total = len(Y_test_real)

print(f"\nOverall performance:")
print(f" MAE: £{mae:,.0f}")
print(f" MAPE: {mape:.1f}%")
print(f" Within 10%: {within_10}/{total} ({within_10/total*100:.0f}%)")
print(f" Within 20%: {within_20}/{total} ({within_20/total*100:.0f}%)")
```

### 结果分析

```
Overall performance:
MAE: £329,798
MAPE: 18.6%
Within 10%: 257/689 (37%)
Within 20%: 447/689 (65%)
```

我们从头构建了一个完整的机器学习管道——数据准备、训练、反向传播、评估——全部协同工作。结果清楚地告诉我们真正的挑战在哪里：**不在模型，而在特征**。房价最重要的是地段，而我们目前的特征无法捕捉这种精细度。

这就是机器学习的现实：**好的模型无法弥补缺失的信息**。下次？从更好的特征开始，或者在处理表格数据时选择 XGBoost。

---

## 总结

这篇教程从零开始介绍了 PyTorch 的核心概念：

1. **张量（Tensor）**：PyTorch 的基本数据结构，理解不同初始化方式的区别很重要
2. **自动微分（Autograd）**：PyTorch 的核心引擎，自动计算梯度，让你专注于模型设计
3. **训练循环**：前向传播 → 计算损失 → 反向传播 → 更新权重，这是所有神经网络学习的基础
4. **完整流程**：从数据准备到模型评估，构建了一个端到端的机器学习管道

对于国内开发者来说，PyTorch 的学习曲线相对平缓，社区资源丰富。如果你有 NumPy 经验，上手会非常快。建议在学习过程中多动手实践，用自己的数据集尝试不同的模型架构。

> 原文配有大量交互式可视化图表，强烈建议访问原文体验。
