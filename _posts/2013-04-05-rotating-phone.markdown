---
layout: post
title: "iOS开发Tips，使用非默认字体"
description: " 一般开发iOS App时，我们用到的字体都是系统默认字体。"
tags: [ios]
newstylesheet: "iphone"
published: true
---

一般开发iOS App时，我们用到的字体都是系统默认字体，代码：[UIFont systemFontOfSize:13.0f]。
但如果要使用系统中的其他字体时，该怎么做呢？
其实http://iosfonts.com/这个网站列出了iOS下所有可用的字体，找到你喜欢的字体，使用代码：lable.font = [UIFont fontWithName:@"Georgia" size:13.0f]; 就可以了。

Please let me know if you have any questions or feedback. My email is [suchuanyi@126.com](mailto:suchuanyi@126.com) and I can also be reached on Sina Weibo at [@donovanh](http://weibo.com/suchuanyi).

