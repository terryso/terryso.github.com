#!/bin/bash

# 发布文章到 Hacker News
# 用法: ./publish_to_hn.sh <post_filename>
# 示例: ./publish_to_hn.sh 2026-02-16-bmad-skills-one-command-story-delivery.markdown

set -e

POSTS_DIR="_posts"
SITE_URL="https://terryso.github.com"

# 检查参数
if [ -z "$1" ]; then
  echo "用法: $0 <post_filename>"
  echo "示例: $0 2026-02-16-bmad-skills-one-command-story-delivery.markdown"
  echo ""
  echo "可用文章:"
  ls -1 "$POSTS_DIR" | grep -E "^[0-9]{4}-" | sort -r | head -10
  exit 1
fi

POST_FILE="$POSTS_DIR/$1"

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
echo "=========================================="
echo ""

# 生成 Hacker News 提交链接
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
