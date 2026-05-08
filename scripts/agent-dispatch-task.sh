#!/usr/bin/env bash
set -euo pipefail

TASK_FILE="${1:-}"

if [ -z "$TASK_FILE" ]; then
  echo "用法：$0 <任务文件路径>"
  echo "示例：$0 .agent-tasks/TASK-002.md"
  exit 1
fi

if [ ! -f "$TASK_FILE" ]; then
  echo "错误：任务文件不存在：$TASK_FILE"
  exit 1
fi

# 读取 Assigned Agent 字段值（取第一个有效值）
ASSIGNED_AGENT=$(sed -n '/^## Assigned Agent$/,/^## /p' "$TASK_FILE" | grep -v '^## ' | grep -v '^$' | head -1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

if [ -z "$ASSIGNED_AGENT" ]; then
  echo "错误：任务文件中未找到有效的 Assigned Agent 字段"
  exit 1
fi

case "$ASSIGNED_AGENT" in
  "Frontend Implementer")
    exec ./scripts/hermes-run-frontend.sh "$TASK_FILE"
    ;;
  "Refactor Implementer")
    exec ./scripts/hermes-run-refactor.sh "$TASK_FILE"
    ;;
  *)
    echo "错误：未知的 Assigned Agent：$ASSIGNED_AGENT"
    echo "支持的类型：Frontend Implementer, Refactor Implementer"
    exit 1
    ;;
esac
