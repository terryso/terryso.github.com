---
layout: post
title: "告别 innerHTML，迎接 setHTML：Firefox 148 的更强 XSS 防护"
date: 2026-02-25 01:15:45 +0800
categories: tech-translation
description: "Firefox 148 率先支持标准化的 Sanitizer API，开发者可以通过 setHTML() 方法安全地处理不可信 HTML，有效防范 XSS 攻击。"
original_url: https://hacks.mozilla.org/2026/02/goodbye-innerhtml-hello-sethtml-stronger-xss-protection-in-firefox-148/
source: Hacker News
---

本文翻译自 [Goodbye innerHTML, Hello setHTML: Stronger XSS Protection in Firefox 148](https://hacks.mozilla.org/2026/02/goodbye-innerhtml-hello-sethtml-stronger-xss-protection-in-firefox-148/)，原载于 Hacker News。

---

跨站脚本攻击（XSS，Cross-site scripting）仍然是 Web 上最普遍的安全漏洞之一。新标准化的 Sanitizer API 为 Web 开发者提供了一种简单直接的方式来在将不可信 HTML 插入 DOM 之前对其进行净化。Firefox 148 是首个支持这一标准化安全增强 API 的浏览器，为所有人构建更安全的 Web 环境。我们预计其他浏览器也会很快跟进。

## XSS 的威胁

当网站无意中允许攻击者通过用户生成的内容注入任意 HTML 或 JavaScript 时，就会产生 XSS 漏洞。通过这种攻击，攻击者可以监控和操纵用户交互，并在漏洞可被利用期间持续窃取用户数据。XSS 历来以难以防范而闻名，近十年来一直位列 Web 漏洞前三名（CWE-79）。

![Sanitizer API 工作原理](https://hacks.mozilla.org/wp-content/uploads/2026/02/sanitizer-diagram-optimized-2.svg)

## 从 CSP 到 Sanitizer API

Firefox 从一开始就深度参与 XSS 解决方案的开发，早在 2009 年就带头制定了 Content-Security-Policy（CSP）标准。CSP 允许网站限制浏览器可以加载和执行哪些资源（脚本、样式、图片等），为防御 XSS 提供了强有力的防线。

尽管 CSP 持续改进和维护，但它并未获得足够的采用率来保护 Web 的长尾网站，因为它需要对现有网站进行重大的架构调整，并由安全专家持续审查。

**Sanitizer API 的设计初衷就是填补这一空白**——提供一种标准化的方式将恶意 HTML 转化为无害 HTML，即对其进行"净化"。

## setHTML() 的使用

`setHTML()` 方法将净化功能直接集成到 HTML 插入过程中，**默认提供安全保障**。以下是一个净化简单危险 HTML 的示例：

```javascript
document.body.setHTML(`<h1>Hello my name is <img src="x"
onclick="alert('XSS')">`);
```

这段代码的净化过程会保留 `<h1>` 元素，但移除嵌入的 `<img>` 元素及其 `onclick` 属性，从而消除 XSS 攻击，最终生成以下安全的 HTML：

```html
<h1>Hello my name is</h1>
```

开发者只需将容易出错的 `innerHTML` 赋值替换为 `setHTML()`，就能以最小的代码改动获得更强的 XSS 防护。

### 自定义配置

如果 `setHTML()` 的默认配置对于特定用例来说过于严格（或不够严格），开发者可以提供自定义配置来定义应该保留或移除哪些 HTML 元素和属性：

```javascript
const sanitizer = new Sanitizer({
  allowElements: ['div', 'span', 'p'],
  allowAttributes: { 'class': ['*'] }
});
element.setHTML(userInput, { sanitizer });
```

建议在将 Sanitizer API 引入网页之前，先在 [Sanitizer API playground](https://sanitizer-api.dev/) 中进行实验。

## 与 Trusted Types 配合使用

为了获得更强的防护，Sanitizer API 可以与 Trusted Types 结合使用，后者可以集中控制 HTML 解析和注入。一旦采用了 `setHTML()`，网站就可以更轻松地启用 Trusted Types 强制执行，通常无需复杂的自定义策略。

一个严格的政策可以允许 `setHTML()` 同时阻止其他不安全的 HTML 插入方法，有助于防止未来的 XSS 回归问题。

## 小结

Sanitizer API 让开发者可以轻松地将现有的 `innerHTML` 赋值替换为 `setHTML()`，引入更安全的默认设置来保护用户免受 Web 上的 XSS 攻击。Firefox 148 支持 Sanitizer API 和 Trusted Types，创造了更安全的 Web 体验。采用这些标准将使所有开发者都能在无需专门的安全团队或重大实施变更的情况下防范 XSS。

---

**关键要点：**

1. **XSS 仍是头号 Web 安全威胁**，长期位列漏洞前三
2. **Sanitizer API 是 CSP 的补充方案**，更适合快速集成到现有项目
3. **setHTML() 替代 innerHTML** 是最小改动获得安全保障的最佳实践
4. **与 Trusted Types 配合** 可以实现更严格的 HTML 注入控制
5. **Firefox 148 首发**，其他浏览器预计会跟进支持
