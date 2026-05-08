#!/usr/bin/env bash
set -euo pipefail

FRONTEND_TREE="${FRONTEND_TREE:-../visual-stats-web-frontend}"
REFACTOR_TREE="${REFACTOR_TREE:-../visual-stats-web-refactor}"
BASE_BRANCH="${BASE_BRANCH:-main}"

if [ ! -f "AGENTS.md" ]; then
  echo "错误：请在主仓库 visual-stats-web 根目录运行本脚本。缺少 AGENTS.md。"
  exit 1
fi

echo "== 主仓库 =="
pwd
echo "当前分支：$(git branch --show-current)"
echo

echo "== 检查主仓库状态 =="
MAIN_STATUS="$(git status --short)"
if [ -n "$MAIN_STATUS" ]; then
  echo "主仓库当前存在未提交改动："
  echo "$MAIN_STATUS"
  echo
  echo "请先确认是否已经完成 git add / git commit。"
  echo "为避免覆盖或同步半成品，本脚本已停止。"
  exit 1
fi

echo "主仓库工作区干净。"
echo

sync_config_files() {
  local target="$1"

  if [ ! -d "$target" ]; then
    echo "跳过：worktree 不存在：$target"
    return
  fi

  echo "== 同步配置到 $target =="

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

  echo "配置同步完成：$target"
  echo
}

check_worktree_status() {
  local target="$1"

  if [ ! -d "$target" ]; then
    echo "跳过：worktree 不存在：$target"
    return
  fi

  echo "== 检查 worktree：$target =="
  (
    cd "$target"
    echo "当前分支：$(git branch --show-current)"
    STATUS="$(git status --short)"
    if [ -n "$STATUS" ]; then
      echo "注意：该 worktree 当前有未提交/未跟踪改动："
      echo "$STATUS"
      echo
      echo "本脚本不会自动 reset 或删除这些文件。"
      echo "如果这些是旧任务临时文件，请人工确认后清理。"
    else
      echo "worktree 工作区干净。"
    fi
  )
  echo
}

sync_config_files "$FRONTEND_TREE"
sync_config_files "$REFACTOR_TREE"

check_worktree_status "$FRONTEND_TREE"
check_worktree_status "$REFACTOR_TREE"

cat <<EOF

下一步建议：

如果某个 worktree 仍有上一个任务的临时改动，请先人工确认。
确认可以清空后，再在对应 worktree 执行：

  git status --short

如果只剩 .agent-reviews/ 等临时文件，可以删除：

  rm -rf .agent-reviews

如果 worktree 分支需要重新基于主仓库最新提交开始新任务，建议新建新的 worktree 或新分支，不要直接复用旧任务分支。

EOF
