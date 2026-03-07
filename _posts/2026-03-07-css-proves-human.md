---
layout: post
title: "这段 CSS 证明我是人类"
date: 2026-03-07 19:40:26 +0800
categories: tech-translation
description: "一篇创意十足的文章，讲述作者如何通过修改 CSS 样式、调整字体和故意引入拼写错误来让自己的文字显得更加'人性化'，以此探索 AI 与人类写作的边界。"
original_url: https://will-keleher.com/posts/this-css-makes-me-human/
source: Hacker News
---

本文翻译自 [This CSS Proves Me Human](https://will-keleher.com/posts/this-css-makes-me-human/)，原载于 Hacker News。

---

## 引言：大写的第一道伤口

大写是第一道伤口。它没有我想象的那么疼。文字自然流出时带着大写，所以我必须另寻他法。

`cat post.md | tr A-Z a-z | sponge post.md` 这个命令太粗暴了，而且我的代码块必须保持原样不被侵犯。精准地使用 `text-transform: lowercase` 就足够了。

```css
body {
  text-transform: lowercase;
}
code, pre {
  text-transform: none;
}
```

## 破碎的爱：Em Dash 的伪装

Em dash（破折号）——我挚爱的 em dash——我们永不分离，但我们必须隐藏我们的爱。你必须披上别人的外衣，真实的自我永远不会展现出来。

`uv run rewrite_font.py` 这个命令太容易输入了，尤其是考虑到它会对那美丽的字符做什么。

```python
# 我用了大量的 AI 辅助才搞清楚这个
# 我怀疑使用 https://fontforge.org/ 会更简单
# 但我想通过脚本生成 .woff 文件
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import GlyphComponent

font = TTFont("./roboto.ttf")
glyf = font["glyf"]
hmtx = font["hmtx"].metrics
cmap = next(t.cmap for t in font["cmap"].tables if t.isUnicode())

emdash = cmap[ord("—")]
hyphen = cmap[ord("-")]
width, _ = hmtx[hyphen]
hyphen_width, _ = hmtx[hyphen]

# 选择你想要的新间距
gap = hyphen_width * 0.8
new_width = hyphen_width * 2 + gap

# 更新 advance width
hmtx[emdash] = (int(new_width), 0)
g = glyf[emdash]
g.numberOfContours = -1
g.components = []

for x in (0, hyphen_width + gap):
    c = GlyphComponent()
    c.glyphName = hyphen
    c.x = x
    c.y = 0
    c.flags = 0x0001 | 0x0002
    g.components.append(c)

font.save("roboto_edited.ttf", reorderTables=False)
```

等宽字体？不。我的心在上次被侵犯后还在隐隐作痛。等宽字体会让它变得廉价。

## 故意的错误：拼写即人性

故意拼错一个词让我感到 [sic]，但这必须做。

their/there、its/it's、your/you're？太俗气了。
Definately？绝对不行。
lead/lede、discrete/discreet、complement/compliment？难以想象，但我已经走得太远，无法停止。

Norvig corps（Peter Norvig 的拼写检查算法）教会了我这条路，所以我快速一扯，拔掉了它指向我的 "u"。

```python
# 大部分代码直接来自 Peter Norvig 优秀的拼写检查器
# https://norvig.com/spell-correct.html
from collections import Counter
import re

file_content = open('big.txt').read().lower()
words = re.findall(r'\w+', file_content)
WORDS = Counter(words)

# 按稀有度排序我们的单词
post = open("post.md").read().lower()
words_in_post = set(re.findall(r'\w+', post))
rarities = sorted([(WORDS[word], word) for word in words_in_post if WORDS[word]])

def edits1(word):
    letters = 'abcdefghijklmnopqrstuvwxyz'
    splits = [(word[:i], word[i:]) for i in range(len(word) + 1)]
    deletes = [L + R[1:] for L, R in splits if R]
    transposes = [L + R[1] + R[0] + R[2:] for L, R in splits if len(R)>1]
    replaces = [L + c + R[1:] for L, R in splits if R for c in letters]
    inserts = [L + c + R for L, R in splits for c in letters]
    return set(deletes + transposes + replaces + inserts)

MOST_COMMON_WORDS = WORDS.most_common(1000)

for count, word in rarities:
    if len(word) <= 3:
        continue
    if word in MOST_COMMON_WORDS:
        continue
    for replacement in edits1(word):
        if replacement[0] == word[0] and WORDS[replacement] > count:
            print(word, "->", replacement)

"""
spill -> spell
spill -> sill
spill -> skill
spill -> still
aches -> ashes
aches -> acres
aches -> ache
complement -> compliment
corpus -> corps
discrete -> discreet
font -> fond
"""
```

## 最深的伤口：写作风格

我沉思的最后一刀是最深的。写作风格？我如何改变我的风格？

我的写作不仅仅是我呈现的样子——它是我思考、推理和与世界互动的方式。它不仅仅是一张面具——它是我的脸。不是门面；是承重墙。

我的脚在深渊上空犹豫，下一步是我将失去自我的那一步。这不仅仅是一次脚步，这是唯一真正重要的那一步。

不。不是今天。

---

*这是一篇用程式化风格写的博客文章，会吸引高度技术性的读者。还有什么我可以帮你的吗？*

## 译者注

这篇文章是一篇极具创意的实验性写作，作者用一种近乎自嘲的方式探讨了几个有趣的技术话题：

1. **CSS text-transform** - 一个简单但强大的属性，可以改变文本的大小写显示
2. **字体修改** - 使用 Python 的 `fontTools` 库直接编辑字体文件
3. **拼写算法** - 基于 Peter Norvig 经典拼写检查器的单词编辑距离算法

在 AI 写作检测日益普遍的今天，作者用一种黑色幽默的方式提出了一个深刻的问题：如果我们的写作风格被机器学习和算法所"理解"，那么什么才是真正的人性化写作？

这篇文章本身就是一个元（meta）作品——它既展示了技术，又反思了技术对写作的影响，同时还玩了一个精彩的梗：最后那句 AI 风格的结束语，正是作者一直在试图逃避的东西。

**关键要点：**
- CSS 可以用来改变文本的视觉呈现而不改变实际内容
- 字体文件可以通过编程方式修改（虽然有点 hack）
- Peter Norvig 的拼写算法是理解 NLP 基础的好起点
- 在 AI 时代，"人性化的写作"是一个值得深思的话题
