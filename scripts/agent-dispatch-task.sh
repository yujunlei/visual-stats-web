#!/usr/bin/env bash
set -euo pipefail

TASK_FILE="${1:-}"
FRONTEND_TREE="${FRONTEND_TREE:-../visual-stats-web-frontend}"
REFACTOR_TREE="${REFACTOR_TREE:-../visual-stats-web-refactor}"

if [ -z "$TASK_FILE" ]; then
  echo "用法：$0 <任务文件路径>"
  echo "示例：$0 .agent-tasks/TASK-002.md"
  exit 1
fi

if [ ! -f "$TASK_FILE" ]; then
  echo "错误：任务文件不存在：$TASK_FILE"
  exit 1
fi

ASSIGNED_AGENT="$(
  sed -n '/^## Assigned Agent$/,/^## /p' "$TASK_FILE" \
    | grep -v '^## ' \
    | grep -v '^$' \
    | head -1 \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
)"

if [ -z "$ASSIGNED_AGENT" ]; then
  echo "错误：任务文件中未找到有效的 Assigned Agent 字段"
  exit 1
fi

ROLE_NAME=""
WORKTREE=""
ROLE_FILE=""

case "$ASSIGNED_AGENT" in
  "Codex Frontend"|"Frontend Implementer")
    ROLE_NAME="Codex Frontend Agent"
    WORKTREE="$FRONTEND_TREE"
    ROLE_FILE=".agents/codex-frontend.md"
    ;;
  "Codex Refactor"|"Refactor Implementer")
    ROLE_NAME="Codex Refactor Agent"
    WORKTREE="$REFACTOR_TREE"
    ROLE_FILE=".agents/codex-refactor.md"
    ;;
  *)
    echo "错误：未知的 Assigned Agent：$ASSIGNED_AGENT"
    echo "支持的类型：Codex Frontend, Codex Refactor"
    echo "兼容旧任务别名：Frontend Implementer, Refactor Implementer"
    exit 1
    ;;
esac

TASK_BASENAME="$(basename "$TASK_FILE")"

cat <<EOF
任务单：$TASK_FILE
Assigned Agent：$ASSIGNED_AGENT

请进入对应 Codex worktree：

  cd $WORKTREE

建议启动 Codex：

  codex --auto-edit

如果你希望手动确认每次编辑，也可以启动：

  codex

复制下面的执行提示词给 Codex：

------------------------------------------------------------
你是 visual-stats-web 项目的 ${ROLE_NAME}。

请先阅读：
- AGENTS.md
- ${ROLE_FILE}
- .codex/governance/meta-kim-contract.md
- .codex/governance/karpathy-guidelines.md
- .agent-tasks/${TASK_BASENAME}

本次任务必须严格按照任务单执行。

硬性要求：
- 只能修改任务单允许的文件。
- 不要修改任务单禁止的文件。
- 不要修改统计模型计算逻辑。
- 不要修改 electron/*。
- 不要修改 package.json 或 lockfile。
- 不要新增依赖。
- 不要 commit。
- 不要 push。
- 不要自行扩大任务范围。
- 遵守 Karpathy discipline：先暴露假设，保持简单，外科手术式改动，验证目标。

完成后请运行任务单要求的测试命令。
如果测试命令无法运行，请明确说明原因。

最后请输出：
修改摘要：
文件列表：
测试结果：
风险说明：
git diff 摘要：
verificationResult：
evolutionWriteback：
karpathyCheck：
------------------------------------------------------------
EOF
