#!/bin/bash

# 发布文章到 Hacker News（自动化版本）
# 用法: ./publish_to_hn.sh <post_filename> [--auto]
# 示例:
#   ./publish_to_hn.sh 2026-02-16-bmad-skills-one-command-story-delivery.markdown  # 手动确认
#   ./publish_to_hn.sh 2026-02-16-bmad-skills-one-command-story-delivery.markdown --auto  # 自动发布

set -e

POSTS_DIR="_posts"
SITE_URL="https://terryso.github.com"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUTH_FILE="$SCRIPT_DIR/.hn-auth.json"
AUTO_MODE=false

# 检查参数
if [ -z "$1" ]; then
  echo "用法: $0 <post_filename> [--auto]"
  echo "示例:"
  echo "  $0 2026-02-16-bmad-skills-one-command-story-delivery.markdown        # 手动确认"
  echo "  $0 2026-02-16-bmad-skills-one-command-story-delivery.markdown --auto # 自动发布"
  echo ""
  echo "可用文章:"
  ls -1 "$POSTS_DIR" | grep -E "^[0-9]{4}-" | sort -r | head -10
  exit 1
fi

POST_FILE="$POSTS_DIR/$1"

# 检查 --auto 参数
if [ "$2" = "--auto" ]; then
  AUTO_MODE=true
fi

# 检查文件是否存在
if [ ! -f "$POST_FILE" ]; then
  echo "错误: 文件 $POST_FILE 不存在"
  exit 1
fi

# 提取 front matter 信息
extract_yaml() {
  local key="$1"
  sed -n "/^$key:/s/^$key: *//p" "$POST_FILE" | tr -d '"'
}

# 获取标题和日期
TITLE=$(extract_yaml "title")
DATE=$(extract_yaml "date")
DESCRIPTION=$(extract_yaml "description")

# 从文件名提取日期部分生成 URL 路径
FILE_DATE=$(basename "$POST_FILE" | grep -oE "^[0-9]{4}-[0-9]{2}-[0-9]{2}")
YEAR=$(echo "$FILE_DATE" | cut -d'-' -f1)
MONTH=$(echo "$FILE_DATE" | cut -d'-' -f2)
DAY=$(echo "$FILE_DATE" | cut -d'-' -f3)

# 去掉标题中的引号并转义特殊字符用于 URL
SLUG=$(basename "$POST_FILE" .markdown | sed 's/^[0-9-]*-//')

# 生成文章 URL (Jekyll 默认格式)
POST_URL="${SITE_URL}/${YEAR}/${MONTH}/${DAY}/${SLUG}.html"

echo "=========================================="
echo "文章信息:"
echo "------------------------------------------"
echo "标题: $TITLE"
echo "日期: $DATE"
echo "URL:  $POST_URL"
echo "描述: $DESCRIPTION"
echo "模式: $([ "$AUTO_MODE" = true ] && echo "自动发布" || echo "手动确认")"
echo "=========================================="
echo ""

if [ "$AUTO_MODE" = true ]; then
  # 自动发布模式 - 使用 Playwright
  echo "正在自动发布到 Hacker News..."

  # 检查认证文件
  if [ ! -f "$AUTH_FILE" ]; then
    echo "错误: 未找到登录状态文件 $AUTH_FILE"
    echo "请先运行登录脚本"
    exit 1
  fi

  # 正确的顺序：先打开浏览器，再加载状态，最后导航
  playwright-cli open https://news.ycombinator.com/submit
  playwright-cli state-load "$AUTH_FILE"
  playwright-cli goto https://news.ycombinator.com/submit

  # 等待页面加载
  sleep 1

  # 填写表单（固定元素引用）
  echo "填写标题: $TITLE"
  playwright-cli fill e24 "$TITLE"

  echo "填写 URL: $POST_URL"
  playwright-cli fill e28 "$POST_URL"

  echo "点击提交按钮..."
  playwright-cli click e39

  sleep 2
  playwright-cli screenshot --filename=hn-published.png

  echo ""
  echo "✅ 发布完成！截图已保存到 hn-published.png"

  playwright-cli close
else
  # 手动确认模式 - 打开浏览器预填表单
  HN_SUBMIT_URL="https://news.ycombinator.com/submitlink?u=${POST_URL}&t=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$TITLE'''))")"

  echo "即将打开浏览器提交到 Hacker News..."
  echo ""
  echo "提交 URL: $HN_SUBMIT_URL"
  echo ""

  # 打开浏览器
  if command -v open &> /dev/null; then
    open "$HN_SUBMIT_URL"
  elif command -v xdg-open &> /dev/null; then
    xdg-open "$HN_SUBMIT_URL"
  else
    echo "请手动打开以下链接:"
    echo "$HN_SUBMIT_URL"
  fi

  echo ""
  echo "提示: 浏览器将打开 Hacker News 提交页面，请检查并确认发布。"
fi
