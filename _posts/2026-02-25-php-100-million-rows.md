---
layout: post
title: "PHP 的一亿行数据挑战赛"
date: 2026-02-25 22:18:33 +0800
categories: tech-translation
description: "Tempest PHP 发起的一项性能挑战赛：用 PHP 解析一亿行页面访问数据，比拼谁的方案最快，优胜者可获得 PhpStorm 和 Tideways 提供的丰厚奖品。"
original_url: https://github.com/tempestphp/100-million-row-challenge
source: Hacker News
---

本文翻译自 [100 Million Row Challenge](https://github.com/tempestphp/100-million-row-challenge)，原载于 Hacker News。

## 挑战赛已开启

**一亿行数据挑战赛（100-million-row challenge）现已正式开启！** 你需要在 **3 月 15 日晚 11:59（中欧时间）** 前提交你的参赛方案。

欢迎参加 PHP 版的一亿行数据挑战赛！你的目标是将一份包含页面访问记录的数据集解析成 JSON 文件。本仓库包含了本地开发所需的一切。提交参赛方案非常简单 —— 只需向本仓库发送 Pull Request 即可。

本次比赛将持续两周：从 **2026 年 2 月 24 日到 3 月 15 日**。比赛结束后，速度最快的前三名方案将获得奖品！

## 快速开始

要提交解决方案，你需要先 fork 本仓库，然后克隆到本地。完成后，安装项目依赖并生成本地开发用的数据集：

```bash
composer install
php tempest data:generate
```

默认情况下，`data:generate` 命令会生成 1,000,000 条访问记录。实际基准测试将使用 100,000,000 条记录。你也可以通过运行 `php tempest data:generate 100_000_000` 来调整访问记录数量。

此外，生成器会使用固定种子的随机数生成器，这样大家在本地开发时可以使用相同的数据集。你可以通过 `data:generate --seed=123456` 参数覆盖种子值，也可以使用 `data:generate --no-seed` 参数生成无种子的随机数据集。真正的基准测试数据集是无种子生成的，并且是保密的。

接下来，在 `app/Parser.php` 中实现你的解决方案：

```php
final class Parser
{
    public function parse(string $inputPath, string $outputPath): void
    {
        throw new Exception('TODO');
    }
}
```

你可以随时运行你的实现来检查工作成果：

```bash
php tempest data:run
```

此外，你还可以通过运行 `data:validate` 命令来验证输出文件的格式是否正确。该命令会在一个小型数据集上运行，并使用预定义的预期输出进行验证。如果验证成功，你就可以确定自己实现了一个可行的方案：

```bash
php tempest data:validate
```

## 输出格式规则

你需要将数百万行 CSV 数据解析成 JSON 文件，遵循以下规则：

- 生成的 JSON 文件中，每个条目应是一个键值对，键是页面的 URL 路径，值是按日期统计的访问次数数组
- 访问记录应按日期升序排列
- 输出应编码为格式化的 JSON 字符串（pretty JSON）

举个例子，假设输入如下：

```
https://stitcher.io/blog/11-million-rows-in-seconds,2026-01-24T01:16:58+00:00
https://stitcher.io/blog/php-enums,2024-01-24T01:16:58+00:00
https://stitcher.io/blog/11-million-rows-in-seconds,2026-01-24T01:12:11+00:00
https://stitcher.io/blog/11-million-rows-in-seconds,2025-01-24T01:15:20+00:00
```

你的解析器应该在 `$outputPath` 指定的路径下存储如下 JSON 文件：

```json
{
    "\/blog\/11-million-rows-in-seconds": {
        "2025-01-24": 1,
        "2026-01-24": 2
    },
    "\/blog\/php-enums": {
        "2024-01-24": 1
    }
}
```

## 提交你的方案

向本仓库发送包含你解决方案的 Pull Request。PR 的标题只需填写你的 GitHub 用户名。如果你的方案通过验证，我们会在基准测试服务器上运行它，并将你的耗时记录到 leaderboard.csv 中。你可以继续改进你的方案，但请注意基准测试是手动触发的，可能需要等待一段时间才能看到结果发布。

## 关于抄袭的说明

你可能会想从其他竞争者那里寻找灵感。虽然我们无法阻止你这样做，但我们会移除明显抄袭自其他提交的方案。我们会预先手工验证每个提交，并请你提出自己原创的解决方案。

## FAQ

### 我能赢得什么？

奖品由 PhpStorm 和 Tideways 赞助。获奖者将根据提交的最快方案确定，如果有两个方案速度相同，提交时间将被纳入考量。

所有方案必须在 **2026 年 3 月 16 日**前提交（即你需要在 **3 月 15 日晚 11:59 中欧时间**前提交）。截止日期后的任何提交都不会被计入。

**第一名将获得：**

- 一只 PhpStorm 大象玩偶（Elephpant）
- 一只 Tideways 大象玩偶
- 一年期 JetBrains 全产品包许可证
- 三个月 JetBrains AI Ultimate 许可证
- 一年期 Tideways Team 许可证

**第二名将获得：**

- 一只 PhpStorm 大象玩偶
- 一只 Tideways 大象玩偶
- 一年期 JetBrains 全产品包许可证
- 三个月 JetBrains AI Ultimate 许可证

**第三名将获得：**

- 一只 PhpStorm 大象玩偶
- 一只 Tideways 大象玩偶
- 一年期 JetBrains 全产品包许可证

### 在哪里可以看到结果？

每次运行的基准测试结果都存储在 leaderboard.csv 中。

### 基准测试使用什么样的服务器？

基准测试运行在一台 Premium Intel Digital Ocean Droplet 上，配置为 **2vCPUs 和 1.5GB 可用内存**。我们特意没有选择更强大的服务器，因为我们喜欢在一个相对"标准"的 PHP 环境中进行测试。以下是可用的 PHP 扩展：

```
bcmath, calendar, Core, ctype, curl, date, dom, exif, fileinfo, filter, ftp, gd, gettext, gmp, hash, iconv, igbinary, imagick, imap, intl, json, lexbor, libxml, mbstring, memcached, msgpack, mysqli, mysqlnd, openssl, pcntl, pcre, PDO, pdo_mysql, pdo_pgsql, pdo_sqlite, pgsql, Phar, posix, random, readline, redis, Reflection, session, shmop, SimpleXML, soap, sockets, sodium, SPL, sqlite3, standard, sysvmsg, sysvsem, sysvshm, tokenizer, uri, xml, xmlreader, xmlwriter, xsl, Zend OPcache, zip, zlib, Zend OPcache
```

### 如何确保公平性？

每个提交在基准测试服务器上运行之前都会经过人工验证。我们同时只会运行一个提交，以防止结果出现偏差。此外，我们会使用一致的专用服务器来运行基准测试，以确保结果具有可比性。

如有需要，我们会为顶级提交进行多次运行，并比较它们的平均值。

最后，我们请大家尊重其他参与者的作品。你可以参考他人的方案寻找灵感（仅仅因为我们无法阻止这种情况发生），但直接抄袭其他方案是禁止的。我们会尽力监督。如果你遇到任何问题，可以在 PR 评论中 @brendt 或 @xHeaven。

### 为什么不是十亿行？

这个挑战的灵感来自 Java 版的 10 亿行挑战。我们之所以只用 1 亿行，是因为 PHP 版本的复杂度比 Java 版本高得多（包括日期解析、JSON 编码、数组排序等）。

### JIT 呢？

在测试这个挑战时，JIT（Just-In-Time 编译器）似乎没有带来明显的性能提升。此外，它有时会导致段错误（segfault）。因此我们决定在这个挑战中禁用 JIT。

### 我可以使用 FFI 吗？

这个挑战的目的是将 PHP 推向极限。因此不允许使用 FFI（Foreign Function Interface）。

### 我需要等多久才能看到基准测试结果？

我们会在每个提交运行到基准测试服务器之前进行人工验证。根据我们的空闲时间，可能会有等待时间。如果我们在 24 小时内还没有处理你的提交，请随时在评论中 @brendt 或 @xHeaven 以确保我们没有忘记你。

---

## 个人点评

这是一个非常有趣的性能优化挑战。与 Java 版的 10 亿行挑战不同，PHP 版本增加了更多复杂性：

1. **日期解析**：需要从 ISO 8601 格式中提取日期部分
2. **URL 处理**：需要从完整 URL 中提取路径部分
3. **JSON 编码**：最终输出需要是格式化的 JSON

对于想要参加的开发者，一些可能的优化思路：

- 使用 `stream_get_line()` 替代 `fgets()` 进行更高效的行读取
- 避免在循环中创建不必要的对象和数组
- 考虑使用 `SplFixedArray` 来优化内存使用
- 利用 `array_reduce()` 或手动迭代来减少内存分配

这个挑战很好地展示了 PHP 在数据处理方面的潜力，也提醒我们：在现代硬件上，即使是动态语言也能处理大规模数据集，关键在于找到正确的优化策略。
