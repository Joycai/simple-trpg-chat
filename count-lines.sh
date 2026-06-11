#!/bin/bash
# 统计 src/ 目录下的项目代码行数（排除文档、配置等非代码文件）

SRC_DIR="src"
EXTENSIONS=("ts" "tsx" "css")

total_files=0
total_lines=0

echo "=== 项目代码行数统计 ==="
echo ""

for ext in "${EXTENSIONS[@]}"; do
  files=$(find "$SRC_DIR" -type f -name "*.$ext" | wc -l | tr -d ' ')
  lines=$(find "$SRC_DIR" -type f -name "*.$ext" -exec cat {} + | wc -l | tr -d ' ')
  printf "  .%-5s %3s 个文件  %6s 行\n" "$ext" "$files" "$lines"
  total_files=$((total_files + files))
  total_lines=$((total_lines + lines))
done

echo ""
echo "  合计  :  $total_files 个文件  $total_lines 行"
echo ""
echo "=== 各文件行数（升序） ==="
find "$SRC_DIR" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) \
  -exec wc -l {} + | sort -n
