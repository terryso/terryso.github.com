---
layout: post
title: "VisiCalc 复刻：500 行 C 代码实现电子表格"
date: 2026-03-21 03:59:55 +0800
categories: tech-translation
description: "本文带你用不到 500 行 C 代码从零复刻 VisiCalc——世界上第一个电子表格软件，深入理解数据模型、公式解析器和 TUI 界面的实现原理。"
original_url: https://zserge.com/posts/visicalc/
source: Hacker News
---

本文翻译自 [VisiCalc reconstructed](https://zserge.com/posts/visicalc/)，原载于 Hacker News。

---

## VisiCalc：改变世界的电子表格

近半个世纪以来，电子表格一直统治着商业计算领域。我坚信它是史上最优秀的 UX 设计之一——简洁易学，却能让用户快速处理数据、描述逻辑、可视化结果，甚至创作艺术作品或运行 GameBoy 游戏。

这一切始于 1979 年，Dan Bricklin 和 Bob Frankston 创造了 VisiCalc——世界上第一款电子表格软件。仅用几千行手写的 6502 汇编代码，VisiCalc 就能在 16K RAM 的机器上流畅运行。它迅速成为 Apple ][ 的「杀手级应用」，销量超过 100 万份，让早期的个人电脑成为严肃的商业工具。

我觉得从零开始重建一个最小化的 VisiCalc 克隆会是个有趣的练习。我们需要的核心组件只有三个：数据模型、公式求值器，以及一个简单的单元格显示界面。

## 单元格（Cells）：电子表格的基石

就像生活中的万物一样，电子表格也是由单元格组成的。每个单元格可以包含一个值、一个公式，或者为空。值可以是数字或文本。公式则是基本的数学表达式，可以引用其他单元格。

你可能从 Excel 中熟悉这些概念，但在 VisiCalc 中，公式前缀通常是 `+` 而不是 `=`。例如 `+A1+A2*B1` 是一个公式，而 `A1` 则是文本值。

```c
#define MAXIN 128 // 最大单元格输入长度
enum { EMPTY, NUM, LABEL, FORMULA }; // 单元格类型
struct cell {
    int type;
    float val;
    char text[MAXIN]; // 原始用户输入
};
```

这足以表示电子表格中的单元格。电子表格本身就是一个单元格网格。Excel 的限制是 1,048,576 行和 16,384 列，VisiCalc 有 256 行和 64 列。我们可以从更小的规模开始：

```c
#define NCOL 26 // 最大列数 (A..Z)
#define NROW 50 // 最大行数
struct grid {
    struct cell cells[NCOL][NROW];
};
```

## 公式解析：递归下降解析器

接下来我们需要实现公式求值器。我们可以使用一个简单的递归下降解析器（recursive descent parser），即时计算公式结果。由于公式可能包含单元格引用，解析器需要感知网格并能够从中获取值。

```c
struct parser {
    const char* s;
    int pos;
    struct grid* g;
};
```

我们从顶层函数 `expr` 开始，它调用 `term` 来解析项，`term` 又调用 `primary` 来解析因子。一个因子可以是数字、单元格引用或括号表达式：

```c
// 跳过空白字符
void skipws(struct parser* p) { for (; isspace(*p->p); p->p++); }
// 解析单元格引用，如 A1, AA12 等
int ref(const char* s, int* col, int* row) { ... }
// 解析数字
float number(struct parser* p) { ... }
// 解析单元格引用并返回其值
static float cellval(struct parser* p) { ... }
// 解析函数调用，如 @SUM(A1...B5) 或 @ABS(-A1)
float func(struct parser* p) { ... }
// 解析基本表达式（数字、单元格引用、函数调用、括号表达式）
float primary(struct parser* p) { ... }
// 解析项 (factor [*|/ factor]*)
float term(struct parser* p) { ... }
// 解析表达式 (term [+|- term]*)
float expr(struct parser* p) { ... }
```

这是一个经典的「自顶向下」解析器结构：

```c
float primary(struct parser* p) {
    skipws(p);
    if (!*p->p) return NAN;
    if (*p->p == '+') p->p++;
    if (*p->p == '-') {
        p->p++;
        return -primary(p);
    }
    if (*p->p == '@') {
        p->p++;
        return func(p);
    }
    if (*p->p == '(') {
        p->p++;
        float v = expr(p);
        skipws(p);
        if (*p->p != ')') return NAN;
        p->p++;
        return v;
    }
    if (isdigit(*p->p) || *p->p == '.') return number(p);
    return cellval(p);
}

float term(struct parser* p) {
    float l = primary(p);
    for (;;) {
        skipws(p);
        char op = *p->p;
        if (op != '*' && op != '/') break;
        p->p++;
        float r = primary(p);
        if (op == '*')
            l *= r;
        else if (r == 0)
            return NAN;
        else
            l /= r;
    }
    return l;
}

float expr(struct parser* p) {
    float l = term(p);
    for (;;) {
        skipws(p);
        char op = *p->p;
        if (op != '+' && op != '-') break;
        p->p++;
        float r = term(p);
        l = (op == '+') ? l + r : l - r;
    }
    return l;
}
```

我们使用 `NAN`（Not a Number）来表示错误，它会优雅地传播——几乎所有对 NAN 的操作都会返回 NAN。

单元格引用的解析也很直观。对于有限的网格，我们可以使用简单的解析来支持更多列和行，比如 "AB123"：

```c
int ref(const char* s, int* col, int* row) {
    char* end;
    const char* p = s;
    if (!isalpha(*p)) return 0;
    *col = toupper(*p++) - 'A';
    if (isalpha(*p)) *col = *col * 26 + (toupper(*p++) - 'A');
    int n = strtol(p, &end, 10);
    if (n <= 0 || end == p) return 0;
    *row = n - 1;
    return (int)(end - s);
}
```

解析数字很简单，但解析函数稍微复杂一些。我们需要支持单参数函数（如 `@ABS(-A1)`）和范围函数（如 `@SUM(A1...C3)`）。本文中我只支持 `@SUM`、`@ABS`、`@INT`、`@SQRT`，但添加更多函数应该不难。

有了解析器，我们就可以对单元格中的公式求值了：

```c
struct grid g;
struct parser p = { .g = &g };
// A1 := 42
g.cells[0][0].val = 42; g.cells[0][0].type = NUMBER;
// A2 := 123
g.cells[0][1].val = 123; g.cells[0][1].type = NUMBER;
p.s = p.p = "+A1+A2*4";
float n = expr(&p); // n = 534
```

## 重算机制：响应式更新的秘密

有了表达式求值器，电子表格的核心功能就有了，但这还不够——因为计算是响应式的。一个单元格可能包含引用其他单元格的公式，当那些单元格变化时，公式应该重新求值。

一种方法是追踪所有单元格之间的依赖关系，在必要时触发更新。维护依赖图能带来最高效的更新，但对于电子表格来说往往是过度设计。

VisiCalc 在 16K RAM 的机器上用一个更简单的技巧实现了这个功能：**每次单元格更新时，重新计算整个电子表格**。用户可以选择按行优先或按列优先的求值顺序。VisiCalc 手册说，在过去的古董电脑上，大型电子表格的重算可能需要几秒钟。这就是为什么 VisiCalc 提供了手动重算命令，并建议运行几次，直到所有依赖都被解决。

我们可以做得更好——自动运行几次求值迭代，直到没有新的变化被检测到。尽管简单，但这对于大多数实际电子表格来说是非常高效的方式：

```c
void recalc(struct grid* g) {
    for (int pass = 0; pass < 100; pass++) {
        int changed = 0;
        for (int r = 0; r < NROW; r++)
            for (int c = 0; c < NCOL; c++) {
                struct cell* cl = &g->cells[c][r];
                if (cl->type != FORMULA) continue;
                struct parser p = {cl->text, cl->text, g};
                float v = expr(&p);
                if (v != cl->val) changed = 1;
                cl->val = v;
            }
        if (!changed) break;
    }
}
```

现在我们可以添加一个 setter 函数，更新单元格值并触发重算：

```c
void setcell(struct grid* g, int c, int r, const char* input) {
    struct cell* cl = cell(g, c, r);
    if (!cl) return;
    if (!*input) {
        *cl = (struct cell){0};
        recalc(g);
        return;
    }
    strncpy(cl->text, input, MAXIN - 1);
    if (input[0] == '+' || input[0] == '-' || input[0] == '(' || input[0] == '@') {
        cl->type = FORMULA;
    } else if (isdigit(input[0]) || input[0] == '.') {
        char* end;
        double v = strtod(input, &end);
        cl->type = (*end == '\0') ? NUM : LABEL;
        if (cl->type == NUM) cl->val = v;
    } else {
        cl->type = LABEL;
    }
    recalc(g);
}
```

测试我们的电子表格数据模型变得简单易读：

```c
struct grid g = {0};
// 设置 A1=5, A2=7, A3=11, A4=@SUM(A1...A3)
setcell(&g, 0, 0, "5");
setcell(&g, 0, 1, "7");
setcell(&g, 0, 2, "11");
setcell(&g, 0, 3, "+@SUM(A1...A3)");
assert(g.cells[0][3].val == 23.0f);

// 改变值，求和应该被重新计算
setcell(&g, 0, 0, "5");
setcell(&g, 0, 1, "+A1+5");
setcell(&g, 0, 2, "+A2+A1");
assert(g.cells[0][3].val == 5.0f + 10.0f + 15.0f);

// 改变 A1，所有公式应该被重新计算
setcell(&g, 0, 0, "7");
assert(g.cells[0][3].val == 7.0f + 12.0f + 19.0f);
```

## TUI 界面：用 ncurses 构建界面

构建 TUI（Terminal User Interface）可能是这个项目中最不具挑战性但最有成就感的部分。我们可以使用经典的 `ncurses` 库创建一个简单的界面，让我们在单元格中导航、编辑并显示它们的值。

首先需要确定我们要绘制什么。VisiCalc 的屏幕有四个垂直堆叠的不同区域：

* **状态栏**：当前单元格地址及其值或公式
* **编辑行**：你正在输入的内容
* **列标题**：A, B, C, …, AA, AB, AC, …
* **网格**：单元格本身，左边有行号

不是每个单元格都能在屏幕上显示。我们的网格是 26×50，但典型的终端可能只有 80×24。我们需要一个视口（viewport）——一个在网格上滑动的窗口，跟随光标滚动。VisiCalc 也是这样做的：

```c
#define CW 9 // 列显示宽度
#define GW 4 // 行号宽度
// 可见行数和列数
int vcols(void) { return (COLS - GW) / CW; }
int vrows(void) { return LINES - 4; }

struct grid {
    struct cell cells[NCOL][NROW];
    int cc, cr; // 光标列，光标行
    int vc, vr; // 视口左上角
};
```

当光标移出屏幕时，视口跟随：

```c
if (g.cc < g.vc) g.vc = g.cc;
if (g.cc >= g.vc + vcols()) g.vc = g.cc - vcols() + 1;
if (g.cr < g.vr) g.vr = g.cr;
if (g.cr >= g.vr + vrows()) g.vr = g.cr - vrows() + 1;
```

实际渲染有点冗长但很线性。状态栏显示当前单元格地址及其值或公式，还显示当前模式——就像 VisiCalc 会在等待输入时显示「READY」，在你输入公式时显示「ENTRY」：

```c
enum { READY, ENTRY, GOTO };

static void draw(struct grid* g, int mode, const char* buf) {
    erase();
    // 状态栏：单元格地址 + 值 + 模式指示器
    attron(A_BOLD | A_REVERSE);
    mvprintw(0, 0, " %c%d", 'A' + g->cc, g->cr + 1);
    if (cur->type == FORMULA)
        printw(" %s = %.10g", cur->text, cur->val);
    mvprintw(0, COLS - 6, mode == ENTRY ? "ENTRY" : "READY");
    attroff(A_BOLD | A_REVERSE);

    // 编辑行：显示正在输入的内容，或当前单元格内容
    if (mode)
        mvprintw(1, 0, "> %s_", buf);
    else if (cur->type != EMPTY)
        mvprintw(1, 0, " %s", cur->text);
```

然后是列标题和网格单元格。对于每个可见单元格，我们格式化它的值：标签左对齐，数字右对齐，错误显示为「ERROR」。当前单元格用反色高亮：

```c
// 列标题
attron(A_BOLD | A_REVERSE);
for (int c = 0; c < vcols(); c++)
    mvprintw(2, GW + c * CW, "%*c", CW, 'A' + g->vc + c);
attroff(A_BOLD | A_REVERSE);

// 网格单元格
for (int r = 0; r < vrows() && g->vr + r < NROW; r++) {
    int row = g->vr + r, y = 3 + r;
    // 行号
    attron(A_REVERSE);
    mvprintw(y, 0, "%*d ", GW - 1, row + 1);
    attroff(A_REVERSE);

    for (int c = 0; c < vcols() && g->vc + c < NCOL; c++) {
        int col = g->vc + c;
        struct cell* cl = cell(g, col, row);
        // ... 将 cl->val 格式化到显示缓冲区 ...
        int is_cur = (col == g->cc && row == g->cr);
        if (is_cur) attron(A_REVERSE);
        mvprintw(y, GW + c * CW, "%s", fb);
        if (is_cur) attroff(A_REVERSE);
    }
}
```

整数显示时不带小数，浮点数保留两位小数，标签左对齐。VisiCalc 还有格式化命令——你可以设置单元格显示为货币（`$`）或左对齐（`L`）。我们也支持这个：`/F` 命令让你为当前单元格选择格式。

## 输入处理：模态界面

主循环将所有内容整合在一起。VisiCalc 有一个模态界面：你要么在网格中导航，要么在单元格中输入。

在 READY 模式下只有三个特殊的首字符：

* `/` 进入命令模式（VisiCalc 风格：`/B` 清空，`/Q` 退出，`/F` 格式化）
* `>` 进入跳转模式（输入单元格地址如 `B5`，然后按 Enter）
* 其他任何字符——进入单元格编辑模式

一旦进入编辑模式，`setcell` 决定你输入的内容类型：如果以 `+`、`-`、`(` 或 `@` 开头，就是公式；如果解析为数字，就是数字；其他都是标签。

要输入特殊的标签文本如 `///` 或 `>hello`，你可以用引号包裹：`"///"`。我们在存储前去掉最外层的引号：

```c
if (ch == '/') {
    // 命令模式：/B 清空，/Q 退出，/F 格式化
} else if (ch == '>') {
    // 跳转模式：输入单元格地址，按 Enter
} else if (ch >= 32 && ch < 127) {
    mode = ENTRY;
    buf[0] = ch; buf[1] = '\0'; len = 1;
}
```

当用户按 Enter 时，我们确认编辑并向下移动。Tab 确认并向右移动。这让数据输入感觉像在 Excel 中填写表格：

```c
if (ch == 10 && mode == ENTRY) {
    setcell(&g, g.cc, g.cr, buf);
    if (g.cr < NROW - 1) g.cr++;
    mode = READY;
}
```

整个主循环就是一个 `for(;;)`，一个 `getch()`，一个模式变量和一个字符缓冲区。显示和输入处理加起来大约 150 行。

你可以在 [GitHub Gist](https://gist.github.com/zserge/9781e3855002f4559ae20c16823aaa6b) 上查看 mini-VisiCalc 的完整代码。

## 还有什么没实现

相当多。我们没有文件 I/O，没有 `/R`（复制）命令来跨范围复制公式，我们可以添加更多函数和运算符，让网格更大，添加控制列宽或锁定行/列的命令。范围上的复杂操作，如移动或复制也缺失了，并且需要在单元格移动时调整公式。

但精髓都在这里：单元格、公式、引用、重算，以及模态 TUI，全部在 500 行 C 代码以内。

令人惊叹的是，在 VisiCalc 首次诞生四十七年后，今天所有的电子表格仍然以同样的方式工作：单元格、公式、重算、网格。试着自己创建一个，或者看看 GitHub 上更完整的 VisiCalc 重新实现——[kalk](https://github.com/zserge/kalk)。

---

## 总结

这篇文章展示了如何用不到 500 行 C 代码从零实现一个最小可用的电子表格程序。核心要点：

1. **数据模型极其简洁**：单元格只需要类型、值和原始文本三个字段
2. **递归下降解析器**：经典的 `expr → term → primary` 结构，优雅处理运算符优先级
3. **响应式更新**：VisiCalc 的「暴力重算」策略——每次更新重算整个表格，简单高效
4. **模态界面**：READY/ENTRY/GOTO 三种模式，用 ncurses 约 150 行代码实现

这个项目让我重新审视了电子表格的设计。在追求复杂性和功能性的今天，回到 1979 年的 simplicity（简洁）是一种很好的学习方式。47 年过去了，电子表格的核心范式依然未变——这本身就是对原始设计最好的致敬。

如果你想深入了解，可以访问作者的 [GitHub](https://github.com/zserge/kalk) 查看更完整的实现。
