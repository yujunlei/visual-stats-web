#!/usr/bin/env bash
set -euo pipefail

TASK_FILE="${1:-}"
OUTPUT_ROOT="${2:-.agent-reviews}"

if [ -z "$TASK_FILE" ]; then
  echo "用法：./scripts/agent-export-review-pack.sh .agent-tasks/TASK-001.md"
  exit 1
fi

if [ ! -f "AGENTS.md" ]; then
  echo "错误：请在 visual-stats-web 的某个 worktree 根目录运行本脚本。缺少 AGENTS.md。"
  exit 1
fi

if [ ! -f "$TASK_FILE" ]; then
  echo "错误：任务单不存在：$TASK_FILE"
  exit 1
fi

TASK_BASENAME="$(basename "$TASK_FILE" .md)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${OUTPUT_ROOT}/${TASK_BASENAME}-${STAMP}"

mkdir -p "$OUT_DIR"

cp "$TASK_FILE" "$OUT_DIR/task.md"

git status --short > "$OUT_DIR/git-status.txt"
git diff --stat > "$OUT_DIR/git-diff-stat.txt"
git diff > "$OUT_DIR/git-diff.diff"

cat > "$OUT_DIR/review-instructions.md" <<EOF
# Review Instructions

请让 Codex Architect Agent 审查本次改动。

## 必须阅读

- AGENTS.md
- .agents/codex-architect.md
- .codex/governance/meta-kim-contract.md
- .codex/governance/karpathy-guidelines.md
- 本目录中的 task.md
- 本目录中的 git-status.txt
- 本目录中的 git-diff-stat.txt
- 本目录中的 git-diff.diff

## Review 重点

- 是否符合任务单
- 是否只修改允许文件
- 是否修改了禁止文件
- 是否保留三列式专业工作台布局
- 是否误改统计计算逻辑
- 是否破坏数据导入、模型运行、结果展示、导出
- 是否修改 Electron 安全边界
- 是否新增不必要依赖
- 是否有大范围无关重构
- 是否通过 Meta_Kim Planning / Execution / Review / Verification / Evolution gates
- 是否符合 Karpathy discipline：假设、简单性、外科手术式改动、验证证据
- 是否建议合并

## 输出格式

结论：通过 / 需要修改 / 拒绝
风险等级：低 / 中 / 高
主要问题：
建议修改：
是否可以合并：
EOF

echo "Review pack 已生成：$OUT_DIR"
echo
echo "包含文件："
find "$OUT_DIR" -maxdepth 1 -type f -print | sort
