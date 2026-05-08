#!/usr/bin/env bash
set -euo pipefail

if [ ! -d ".agent-tasks" ]; then
  echo "暂无 .agent-tasks 目录。"
  exit 0
fi

echo "== Agent Tasks =="
find .agent-tasks -maxdepth 1 -type f -name "TASK-*.md" | sort
