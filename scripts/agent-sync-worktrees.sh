#!/usr/bin/env bash
set -euo pipefail

FRONTEND_TREE="${FRONTEND_TREE:-../visual-stats-web-frontend}"
REFACTOR_TREE="${REFACTOR_TREE:-../visual-stats-web-refactor}"

if [ ! -f "AGENTS.md" ]; then
  echo "错误：请在主仓库 visual-stats-web 根目录运行本脚本。缺少 AGENTS.md。"
  exit 1
fi

sync_to_tree() {
  local target="$1"

  if [ ! -d "$target" ]; then
    echo "跳过：worktree 不存在：$target"
    return
  fi

  echo "同步到：$target"

  mkdir -p "$target/.agents" "$target/.agent-tasks" "$target/scripts"

  cp AGENTS.md "$target/AGENTS.md"

  if [ -d ".agents" ]; then
    cp -R .agents/. "$target/.agents/"
  fi

  if [ -d ".agent-tasks" ]; then
    cp -R .agent-tasks/. "$target/.agent-tasks/"
  fi

  if [ -d "scripts" ]; then
    cp scripts/*.sh "$target/scripts/" 2>/dev/null || true
    chmod +x "$target"/scripts/*.sh 2>/dev/null || true
  fi

  echo "完成：$target"
}

sync_to_tree "$FRONTEND_TREE"
sync_to_tree "$REFACTOR_TREE"

echo
echo "同步完成。"
echo
echo "你可以检查："
echo "cd $FRONTEND_TREE && ./scripts/agent-list-tasks.sh"
echo "cd $REFACTOR_TREE && ./scripts/agent-list-tasks.sh"
