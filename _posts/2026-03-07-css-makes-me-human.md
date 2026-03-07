---
layout: post
title: "这段 CSS 让我保持人性"
date: 2026-03-07 22:47:36 +0800
categories: tech-translation
description: "一篇关于用 CSS、字体修改和拼写替换来隐藏写作风格以逃避 AI 检测的创意技术文章——及其背后关于自我认同的哲学思考。"
original_url: https://will-keleher.com/posts/this-css-makes-me-human/
source: Hacker News
---

本文翻译自 [This CSS Makes Me Human](https://will-keleher.com/posts/this-css-makes-me-human/)，原载于 Hacker News。

---

大写字母是第一道伤口。没想象中那么疼。文字总是大写涌出，所以我得另辟蹊径。`cat post.md | tr A-Z a-z | sponge post.md` 太粗暴了，代码块必须保持原样。精心使用的 `text-transform: lowercase` 就够了。

破折号。我挚爱的破折号——永远不会分离，但我们必须隐藏这份爱。你必须披上别人的外衣，真实的自己永不见天日。`uv run rewrite_font.py` 太容易敲出来了，尤其它会对你的美丽字形做那种事。

等宽字体？不。上次被侵犯后心还在痛。等宽字体会让它廉价。

故意拼错词让我很难受 [sic]，但必须这样做。their/there、its/it's、your/you're？太俗气了。Definately？绝对不行。lead/lede、discrete/discreet、complement/compliment 很难接受，但已经走得太远停不下来了。Norvig 的语料库教了我这条路，所以我快速一扯，把指向我的 "u" 撕掉。

最后一刀想得最深。写作风格？我怎么改变我的风格？

我的写作不只是我表现的方式——它是我思考、推理、与世界互动的方式。不只是面具——是我的脸。不是门面；是承重墙。

我的脚在深渊上方犹豫，下一步就会让我迷失自我。不只是单脚落地，是唯一真正重要的那一步。

不。今天不。

*这是你要求的博客文章，以技术读者喜欢的风格化方式写成。还有什么我可以帮你的吗？*

---

## 技术实现细节

作者在脚注中提供了三段有趣的代码：

### 1. CSS 强制小写

```css
body {
  text-transform: lowercase;
}
code, pre {
  text-transform: none;
}
```

### 2. 修改字体把破折号变成双连字符

这段 Python 代码修改 TrueType 字体，把 em dash (—) 替换成两个连字符加间隙：

```python
# I used a TON of AI hand-holding to figure this one out
# I suspect that using https://fontforge.org/ would have been easier
# but I wanted to generate the .woff file from a script
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

# choose your new spacing
gap = hyphen_width * 0.8
new_width = hyphen_width * 2 + gap

# update advance width
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

### 3. 基于 Norvig 拼写纠正的词汇替换

利用 Peter Norvig 的拼写检查算法找出可以"降级"的词——把常见拼写变成同样有效但不那么"精确"的变体：

```python
# Most of this is taken directly from Peter Norvig's excellent spelling check
# https://norvig.com/spell-correct.html
from collections import Counter
import re

file_content = open('big.txt').read().lower()
words = re.findall(r'\w+', file_content)
WORDS = Counter(words)

# order our words by their rarity
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

---

## 译者注

这篇文章的精妙之处在于它的**元叙事**。表面上是一个人在尝试各种技术手段来隐藏自己的写作风格以逃避 AI 检测，但最后的斜体字揭示了真相——整篇文章其实是 AI 写的。

这让我想起几个有趣的点：

1. **"写作风格即自我"**——作者说得很对。一个人的写作不只是表达方式，而是思维方式本身。改变风格等于改变自我认同。这个洞见对任何用过 ChatGPT "润色"文字的人来说都应该有所触动。

2. **反讽的技术手段**——用 AI 来帮助修改字体以逃避 AI 检测，这本身就是一个悖论。就像用 AI 来"人性化"文字一样荒谬。

3. **破折号的执念**——作者的破折号爱好确实是某些 AI 文本检测器的特征之一。这种对个人风格的坚持让人莞尔。

4. **Norvig 拼写纠正的逆向使用**——把一个用于纠正错误的算法反向使用来引入"错误"，这种思路很有黑客精神。

这是一篇技术外壳包裹的哲学小品，关于在 AI 时代保持"人性"意味着什么。答案可能是——放弃伪装，因为那一步会让你迷失真正的自己。

