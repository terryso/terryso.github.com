---
layout: post
title: "使用 CSS 变量和 React 构建动态主题切换器"
date: 2026-02-16 12:13:19 +0800
categories: tech-translation
description: "本文介绍如何在 React 应用中实现一个完整的亮暗主题切换系统，包括 CSS 变量、React Context、本地存储和系统主题检测。"
original_url: https://modern-css.com
source: Hacker News
---

本文翻译自 [Dynamic Theme Switcher: Building a Light & Dark Mode Toggle using CSS Variables and React](https://modern-css.com)，原载于 Hacker News。

## 引言

在现代 Web 开发中，暗黑模式（Dark Mode）已经从"锦上添花"变成了"必备功能"。用户期待网站能够根据他们的系统偏好自动切换主题，或者至少提供手动切换的选项。本文将带你从零开始，构建一个完整的主题切换系统。

## 核心技术栈

我们将使用以下技术组合：

- **CSS Custom Properties（CSS 变量）** - 定义主题颜色
- **React Context API** - 全局状态管理
- **useLocalStorage Hook** - 持久化用户偏好
- **prefers-color-scheme 媒体查询** - 检测系统主题

## 第一步：定义 CSS 变量

首先，我们需要用 CSS 变量定义两套主题色：

```css
/* 亮色主题（默认） */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #333333;
  --text-secondary: #666666;
  --accent-color: #0066cc;
  --border-color: #e0e0e0;
}

/* 暗色主题 */
[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --text-primary: #f0f0f0;
  --text-secondary: #b0b0b0;
  --accent-color: #4da6ff;
  --border-color: #404040;
}
```

**为什么使用 `data-theme` 属性而不是 class？**

这是一个常见的争议点。`data-theme` 更具语义性，表示这是一个状态而非样式类。此外，它在选择器优先级上更清晰。

## 第二步：创建 useLocalStorage Hook

为了让用户的主题偏好能够持久化，我们需要一个自定义 Hook：

```typescript
import { useState, useEffect } from 'react';

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error reading localStorage:', error);
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      console.error('Error setting localStorage:', error);
    }
  };

  return [storedValue, setValue];
}
```

这个 Hook 非常实用，除了主题设置，还可以用于保存用户的其他偏好，比如表单草稿、UI 配置等。

## 第三步：实现 Theme Context

使用 React Context API 来管理全局主题状态：

```typescript
import React, { createContext, useContext, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useLocalStorage<Theme>('theme', 'system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = (newTheme: 'light' | 'dark') => {
      root.setAttribute('data-theme', newTheme);
      setResolvedTheme(newTheme);
    };

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches ? 'dark' : 'light');

      const handler = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
```

**关键设计点：**

1. **三种模式**：`light`、`dark` 和 `system`，给用户最大的灵活性
2. **resolvedTheme**：返回实际生效的主题，方便组件使用
3. **系统主题监听**：当用户选择 `system` 时，实时监听系统主题变化

## 第四步：创建主题切换组件

现在我们来构建一个漂亮的切换按钮：

```tsx
import { useTheme } from './ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycleTheme = () => {
    const order: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = order.indexOf(theme);
    const nextIndex = (currentIndex + 1) % order.length;
    setTheme(order[nextIndex]);
  };

  return (
    <button
      onClick={cycleTheme}
      className="theme-toggle"
      aria-label={`当前主题: ${theme === 'system' ? '跟随系统' : theme}`}
    >
      {theme === 'light' && '☀️'}
      {theme === 'dark' && '🌙'}
      {theme === 'system' && '💻'}
      <span className="theme-label">
        {theme === 'system' ? '跟随系统' : theme === 'dark' ? '暗色' : '亮色'}
      </span>
    </button>
  );
}
```

对应的 CSS：

```css
.theme-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-primary);
}

.theme-toggle:hover {
  background-color: var(--accent-color);
  color: white;
}

.theme-label {
  font-size: 0.875rem;
}
```

## 第五步：添加平滑过渡效果

主题切换时，我们希望颜色变化是平滑的：

```css
/* 在全局样式中添加 */
* {
  transition: background-color 0.3s ease,
              color 0.3s ease,
              border-color 0.3s ease;
}
```

**注意**：不要对所有属性都加 `transition: all`，这会影响性能。只对颜色相关的属性添加过渡即可。

## 第六步：在应用中使用

在 `App.tsx` 或 `_app.tsx`（Next.js）中包装你的应用：

```tsx
import { ThemeProvider } from './ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <Header />
      <MainContent />
      <Footer />
    </ThemeProvider>
  );
}
```

在任何组件中使用主题：

```tsx
import { useTheme } from './ThemeContext';

function MyComponent() {
  const { resolvedTheme } = useTheme();

  return (
    <div className={resolvedTheme === 'dark' ? 'dark-card' : 'light-card'}>
      {/* 内容 */}
    </div>
  );
}
```

## 避免 FOUC（Flash of Unstyled Content）

一个常见的问题是页面加载时会"闪烁"一下默认主题再切换到用户偏好。解决方案是在 HTML 的 `<head>` 中添加一个内联脚本：

```html
<script>
  (function() {
    const theme = localStorage.getItem('theme');
    if (theme) {
      document.documentElement.setAttribute('data-theme', theme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  })();
</script>
```

这段代码会在 React 加载之前就应用正确的主题，避免闪烁。

## 完整架构图

```
┌─────────────────────────────────────────────┐
│              ThemeProvider                   │
│  ┌───────────────────────────────────────┐  │
│  │  State: theme, resolvedTheme          │  │
│  │  Logic: localStorage sync,            │  │
│  │         system theme detection        │  │
│  └───────────────────────────────────────┘  │
│                    ↓                        │
│  ┌───────────────────────────────────────┐  │
│  │  ThemeContext.Provider                │  │
│  │  value: { theme, setTheme,            │  │
│  │          resolvedTheme }              │  │
│  └───────────────────────────────────────┘  │
│                    ↓                        │
│  ┌───────────────────────────────────────┐  │
│  │           App Components              │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  useTheme() hook                │  │  │
│  │  │  - ThemeToggle                  │  │  │
│  │  │  - Any themed component         │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## 实战建议

根据我的开发经验，这里有一些实用建议：

1. **设计阶段就要考虑暗黑模式**
   不要在亮色模式完成后再适配暗色，这样会很痛苦。建议从一开始就使用 CSS 变量定义所有颜色。

2. **对比度比颜色本身更重要**
   暗色模式不是简单的"把白色换成黑色"。需要确保文字和背景有足够的对比度，可以参考 WCAG 标准。

3. **图片和图标也需要适配**
   有些 logo 在暗色背景下会看不清，考虑提供反色版本或添加阴影。

4. **不要忘记第三方组件**
   如果你使用了 UI 库（如 Ant Design、Material-UI），确保它们也跟随主题变化。

5. **提供系统跟随选项**
   很多用户希望网站能跟随他们的系统设置，不要强制用户手动选择。

## 延伸阅读

如果你想深入了解，可以参考以下资源：

- [MDN: prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme) - 官方文档
- [CSS-Tricks: A Complete Guide to Dark Mode](https://css-tricks.com/a-complete-guide-to-dark-mode-on-the-web/) - 完整指南
- [Josh Comeau: The Quest for the Perfect Dark Mode](https://www.joshwcomeau.com/react/dark-mode/) - 避免常见陷阱
- [LogRocket: Dark Mode in React](https://blog.logrocket.com/dark-mode-react-in-depth-guide/) - 深度教程

## 总结

构建一个完整的主题切换系统需要考虑以下几个关键点：

- **CSS 变量** 让主题切换变得优雅，避免重复代码
- **React Context** 提供全局状态管理，让任何组件都能访问和修改主题
- **useLocalStorage** 持久化用户偏好，下次访问时自动应用
- **prefers-color-scheme** 尊重用户的系统设置，提供更好的用户体验
- **避免 FOUC** 通过内联脚本确保首次加载时不会闪烁

这套方案适用于大多数 React 应用，包括 Next.js 等框架。如果你使用 Vue 或其他框架，核心思路是相同的，只是实现细节会有所差异。

Happy coding! 🎨
