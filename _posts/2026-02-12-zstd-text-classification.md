---
layout: post
title: "用 Python 3.14 的 zstd 模块做文本分类"
date: 2026-02-12 12:00:15 +0800
categories: tech-translation
description: "Python 3.14 新增了 compression.zstd 模块，作者巧妙地利用 Zstd 的增量压缩特性实现了一个简单高效的文本分类器，无需传统机器学习的矩阵运算和梯度下降。"
original_url: https://maxhalford.github.io/blog/text-classification-zstd/
source: Hacker News
---

本文翻译自 [Text classification with Python 3.14's zstd module](https://maxhalford.github.io/blog/text-classification-zstd/)，原载于 Hacker News。

---

Python 3.14 引入了 `compression.zstd` 模块，这是 Facebook 的 Zstandard (Zstd) 压缩算法的标准库实现。这个算法由 Yann Collet 在十年前开发，他甚至专门开了一个[博客](https://fastcompression.blogspot.com/)来讨论压缩算法。

我不是压缩算法专家，但 Zstd 吸引我的地方在于它支持**增量压缩**。你可以分块喂给它数据，它会维护内部状态。这让 Zstd 特别适合压缩小数据——而这正好是实现「通过压缩进行文本分类」这个技巧的完美选择，我在五年前的[博客文章](https://maxhalford.github.io/blog/text-classification-gzip/)里描述过这个方法。

## 核心思路：压缩长度 ≈ Kolmogorov 复杂度

这个方法源于《Artificial Intelligence: A Modern Approach》中的一个建议，核心思想是**压缩长度可以近似 Kolmogorov 复杂度**。2023 年有一篇论文叫["Low-Resource" Text Classification: A Parameter-Free Classification Method with Compressors](https://aclanthology.org/2023.findings-acl.426/)，重新审视了这个方法并取得了不错的结果。

但这方法一直有个实践上的问题：流行的压缩算法如 gzip 和 LZW **不支持增量压缩**。虽然从算法角度它们可能支持，但实际上没有暴露增量 API。所以你不得不为每个测试文档重新压缩训练数据，这非常耗时。

但 Zstd 支持增量压缩！Python 3.14 把 Zstd 加入标准库让我非常兴奋。

## 直观理解

在深入机器学习部分之前，先看一段代码来建立直觉。我们主要使用 `ZstdCompressor` 类，它有一个 `compress` 方法，接收数据块并返回压缩输出。被压缩的数据会被添加到它的内部状态。你还可以给压缩器提供一个 `ZstdDict`，这是一个预训练的字典，能让压缩器有个「热启动」。

```python
>>> from compression.zstd import ZstdCompressor, ZstdDict

>>> tacos = b"taco burrito tortilla salsa guacamole cilantro lime " * 50
>>> zd_tacos = ZstdDict(tacos, is_raw=True)
>>> comp_tacos = ZstdCompressor(zstd_dict=zd_tacos)

>>> padel = b"racket court serve volley smash lob match game set " * 50
>>> zd_padel = ZstdDict(padel, is_raw=True)
>>> comp_padel = ZstdCompressor(zstd_dict=zd_padel)

>>> input_text = b"I ordered three tacos with extra guacamole"

>>> len(comp_tacos.compress(input_text, mode=ZstdCompressor.FLUSH_FRAME))
43
>>> len(comp_padel.compress(input_text, mode=ZstdCompressor.FLUSH_FRAME))
51
```

看到了吗？输入文本可以被分类为「tacos」而不是「padel」，因为使用「tacos」字典的压缩器产生了更小的压缩输出。这可以转化为一个简单的分类器：为每个类别构建一个压缩器，然后通过找到对新文档产生最小压缩输出的压缩器来分类新文档。

## 技术细节：重建压缩器的技巧

注意 `compress` 方法不仅返回压缩输出，还会更新压缩器的内部状态。从机器学习的角度看，这意味着它正在用不属于该类别的数据「污染」每个压缩器。不幸的是，没有公开或私有方法可以只压缩而不更新内部状态。

解决方案是：**每次收到新的标注文档时重建压缩器**。好消息是，用 `ZstdDict` 实例化 `ZstdCompressor` 非常快——我的实验显示只需要几十微秒。这让频繁重建压缩器变得非常划算。

## 学习算法的实现步骤

1. 为每个类别维护一个属于该类别的文本缓冲区
2. 收到新的标注文档时，将其追加到对应类别的缓冲区
3. 用更新后的缓冲区重建该类别的压缩器
4. 分类新文档时，找到对该文档产生最小压缩输出的压缩器

## 可调参数

有几个参数可以调节，在吞吐量和准确性之间取得平衡：

- **窗口大小 (window size)**：每个类别缓冲区中保留的最大字节数。较小的窗口意味着更少的数据需要压缩，从而更快地重建压缩器和进行压缩。但也意味着更少的数据用于学习，可能影响准确性。
- **压缩级别 (compression level)**：Zstd 有 22 个压缩级别，从 1（最快）到 22（最慢）。级别越高，压缩比越好，准确性也越高，但压缩速度越慢。
- **重建频率 (rebuild frequency)**：在重建压缩器之前，一个类别需要接收多少新文档。重建压缩器虽然便宜但不是免费的，所以不必为每个样本都重建。但如果重建频率太低，压缩器的内部状态会过于陈旧和污染，影响准确性。

## ZstdClassifier 完整实现

```python
from compression.zstd import ZstdCompressor, ZstdDict

class ZstdClassifier:

    def __init__(
        self,
        window: int = 1 << 20,
        level: int = 3,
        rebuild_every: int = 5
    ):
        self.window = window
        self.level = level
        self.rebuild_every = rebuild_every
        self.buffers: dict[str, bytes] = {}
        self.compressors: dict[str, ZstdCompressor] = {}
        self.since_rebuild: dict[str, int] = {}

    def learn(self, text: bytes, label: str):

        # 将文本追加到该标签的缓冲区
        # 如果缓冲区满了，丢弃最旧的字节
        buf = self.buffers.get(label, b"") + text
        if len(buf) > self.window:
            buf = buf[-self.window:]
        self.buffers[label] = buf

        # 如果自上次构建压缩器以来
        # 已经看到了足够多的新数据，删除压缩器
        n = self.since_rebuild.get(label, 0) + 1
        if n >= self.rebuild_every:
            self.compressors.pop(label, None)
            self.since_rebuild[label] = 0
        else:
            self.since_rebuild[label] = n

    def classify(self, text: bytes) -> str | None:

        # 至少需要两个类别才能比较
        if len(self.buffers) < 2:
            return None

        # （重新）构建所有类别的压缩器
        for label in self.buffers:
            if label in self.compressors:
                continue
            self.compressors[label] = ZstdCompressor(
                level=self.level,
                zstd_dict=ZstdDict(
                    self.buffers[label],
                    is_raw=True
                )
            )

        # argmin：找到对输入文本产生最小压缩大小的标签
        best_label = None
        best_size = 0x7FFFFFFF
        mode = ZstdCompressor.FLUSH_FRAME
        for label, comp in self.compressors.items():
            size = len(comp.compress(text, mode))
            if size < best_size:
                best_size = size
                best_label = label
        return best_label
```

我非常喜欢这个方法的简洁性。没有矩阵，没有梯度，没有反向传播。所有的学习都委托给了压缩算法。`ZstdClassifier` 类只是一个薄薄的包装器，负责喂给它正确的数据并解释它的输出。

## 性能测试

简单还不够，它能学习吗？准确吗？速度快吗？我在 20 newsgroups 数据集上运行了基准测试。

```python
import random
import time

from compression.zstd import ZstdCompressor, ZstdDict
from sklearn.datasets import fetch_20newsgroups
from sklearn.metrics import classification_report

CATEGORIES = ["alt.atheism", "talk.religion.misc", "comp.graphics", "sci.space"]

def load_docs() -> list[tuple[str, str]]:
    data = fetch_20newsgroups(subset="all", categories=CATEGORIES)
    return [
        (text, data.target_names[target])
        for text, target in zip(data.data, data.target)
    ]

def main():
    docs = load_docs()
    random.seed(42)
    random.shuffle(docs)

    n = len(docs)
    classes = sorted(set(label for _, label in docs))
    print(f"{n} documents, {len(classes)} classes\n")

    clf = ZstdClassifier()
    all_true: list[str] = []
    all_pred: list[str] = []
    correct = 0
    total = 0
    recent_correct = 0
    recent_total = 0
    t0 = time.perf_counter()
    lap = t0

    for i, (text, label) in enumerate(docs):
        text_bytes = text.encode("utf-8", errors="replace")

        pred = clf.classify(text_bytes)
        if pred is not None:
            hit = pred == label
            total += 1
            correct += hit
            recent_total += 1
            recent_correct += hit
            all_true.append(label)
            all_pred.append(pred)

        clf.learn(text_bytes, label)

        if (i + 1) % 1000 == 0:
            now = time.perf_counter()
            recent = recent_correct / recent_total if recent_total else 0
            print(
                f"  [{i + 1:>6}/{n}]"
                f"  cumulative = {correct / total:.1%}"
                f"  last 1k = {recent:.1%}"
                f"  [{now - lap:.1f}s]"
            )
            recent_correct = 0
            recent_total = 0
            lap = now

    elapsed = time.perf_counter() - t0
    print(f"\nFinal: {correct / total:.1%}  ({correct}/{total})  [{elapsed:.1f}s]")
    print(f"\n{classification_report(all_true, all_pred, zero_division=0)}")

if __name__ == "__main__":
    main()
```

**结果：**

```
3387 documents, 4 classes

  [  1000/3387]  cumulative = 82.7%  last 1k = 82.7%  [0.3s]
  [  2000/3387]  cumulative = 88.4%  last 1k = 94.1%  [0.6s]
  [  3000/3387]  cumulative = 90.6%  last 1k = 95.0%  [0.7s]

Final: 91.0%  (3076/3382)  [1.9s]

                    precision    recall  f1-score   support

       alt.atheism       0.88      0.92      0.90       799
     comp.graphics       0.96      0.89      0.92       969
         sci.space       0.92      0.96      0.94       986
talk.religion.misc       0.87      0.85      0.86       628

          accuracy                           0.91      3382
         macro avg       0.91      0.90      0.90      3382
      weighted avg       0.91      0.91      0.91      3382
```

结果很不错：**不到 2 秒就达到了 91% 的准确率**。对比一下，我五年前基于 LZW 的实现在大约 32 分钟内才达到 89% 的准确率。所以这是显著的改进，无论是在准确性还是速度方面。

## 与传统方法的对比

为了提供另一个对比参照，我在同样的数据集上运行了批处理 TF-IDF + 逻辑回归的基准测试。模型每 100 次迭代重新训练一次。

**TF-IDF + 逻辑回归结果：**

```
3387 documents, 4 classes

  [  1000/3387]  cumulative = 86.6%  last 1k = 86.6%  [1.8s]
  [  2000/3387]  cumulative = 89.2%  last 1k = 91.6%  [3.5s]
  [  3000/3387]  cumulative = 91.2%  last 1k = 95.1%  [4.9s]

Final: 91.8%  (3017/3287)  [12.0s]
```

正如预期，批处理 TF-IDF + 逻辑回归的准确率比基于 Zstd 的分类器稍高，但也更慢。有趣的是，这证实了基于 Zstd 的分类器确实学到了一些非平凡的东西，而且它与标准机器学习方法是有竞争力的。

## 总结

这个方法最大的魅力在于它的**简洁性**和**可解释性**。整个分类逻辑就是：「哪个类别的字典能让这段文本压缩得更小？」——直觉上完全说得通。

**关键要点：**

1. **无需传统 ML 框架**：没有 sklearn、没有 PyTorch、没有 TensorFlow
2. **增量学习**：可以持续学习新数据，不需要重新训练整个模型
3. **速度惊人**：比五年前的 LZW 方法快了近 1000 倍
4. **准确率可观**：与 TF-IDF + 逻辑回归相当
5. **代码简洁**：核心分类器只有 50 行左右的代码

当然，我不确定是否建议在生产环境中使用这个方法，但它确实易于维护和理解。既然 Zstd 已经进入 Python 标准库，而且吞吐量不错，值得在你手头的文本分类数据集上做个基准测试。

---

*注：Python 3.14 目前还在开发中，`compression.zstd` 模块可能在正式发布前还会有变化。*
