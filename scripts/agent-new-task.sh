#!/usr/bin/env bash
set -euo pipefail

TASK_ID="${1:-}"
ASSIGNED_AGENT="${2:-}"
TASK_TITLE="${3:-}"

if [ -z "$TASK_ID" ] || [ -z "$ASSIGNED_AGENT" ] || [ -z "$TASK_TITLE" ]; then
  echo "用法：./scripts/agent-new-task.sh TASK-001 \"Codex Frontend\" \"任务标题\""
  echo
  echo "示例："
  echo "./scripts/agent-new-task.sh TASK-001 \"Codex Refactor\" \"抽出结果页格式化工具函数\""
  exit 1
fi

case "$ASSIGNED_AGENT" in
  "Codex Frontend"|"Codex Refactor")
    ;;
  "Frontend Implementer")
    echo "提示：Frontend Implementer 是旧别名，新任务建议使用 Codex Frontend。"
    ;;
  "Refactor Implementer")
    echo "提示：Refactor Implementer 是旧别名，新任务建议使用 Codex Refactor。"
    ;;
  *)
  echo "错误：Assigned Agent 只能是："
  echo "- Codex Frontend"
  echo "- Codex Refactor"
  echo "兼容旧别名：Frontend Implementer, Refactor Implementer"
  exit 1
    ;;
esac

if [ ! -f "AGENTS.md" ]; then
  echo "错误：请在 visual-stats-web 仓库或 worktree 根目录运行。缺少 AGENTS.md。"
  exit 1
fi

mkdir -p .agent-tasks

SLUG="$(echo "$TASK_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9一-龥]/-/g' | sed 's/-\+/-/g' | sed 's/^-//' | sed 's/-$//')"
TASK_FILE=".agent-tasks/${TASK_ID}-${SLUG}.md"

if [ -f "$TASK_FILE" ]; then
  echo "错误：任务文件已存在：$TASK_FILE"
  exit 1
fi

cat > "$TASK_FILE" <<EOF
# Task Brief

## Task Name

${TASK_TITLE}

## Assigned Agent

${ASSIGNED_AGENT}

## Goal

在这里填写本次任务的明确目标。目标必须小而清晰，不要一次性覆盖多个业务流程。

## Meta_Kim Governance Packet

\`\`\`text
intentPacket:
  Goal:
  Success Criteria:
  Out of Scope:
  Risk Level:

fetchPacket:
  Files inspected:
  Existing workflow assets:
  Matching capability:
  Capability gaps:

dispatchBoard:
  Assigned Agent: ${ASSIGNED_AGENT}
  Worktree:
  Review Owner: Codex Architect
  Verification Commands:
\`\`\`

## Karpathy Discipline

\`\`\`text
Assumptions:
Simplicity Check:
Surgical Change Boundary:
Verification Goal:
\`\`\`

## Allowed Files

\`\`\`text
在这里填写允许修改的文件或目录。
示例：
src/App.tsx
src/components/results/
src/utils/
\`\`\`

## Forbidden Files

\`\`\`text
src/models/plugins/*
src/models/registry.ts
src/data/preprocess.ts
src/export/publicationTables.ts
electron/main.cjs
electron/preload.cjs
package.json
package-lock.json
\`\`\`

## Implementation Steps

1. 阅读 AGENTS.md 和对应 .agents/*.md。
2. 只在 Allowed Files 范围内修改。
3. 保持现有功能行为不变，除非 Goal 明确要求改变。
4. 完成后运行测试命令。
5. 输出修改摘要、测试结果、风险点和 git diff 摘要。

## Acceptance Criteria

- [ ] 功能正常
- [ ] 不改变统计计算逻辑
- [ ] 不破坏三列式专业工作台布局
- [ ] 不修改 Forbidden Files
- [ ] 不新增不必要依赖
- [ ] 符合 Karpathy discipline：无隐藏假设、无过度抽象、无无关改动、有验证证据
- [ ] npm run typecheck 通过
- [ ] npm run lint 通过
- [ ] npm run build 通过

## Test Commands

\`\`\`bash
npm run typecheck
npm run lint
npm run build
\`\`\`

## Risk Notes

在这里填写本任务风险点。若风险未知，执行 Agent 必须保守处理，不得扩大范围。

## Output Required

请输出：

\`\`\`text
修改摘要：
文件列表：
测试结果：
风险说明：
git diff 摘要：
verificationResult：
evolutionWriteback：
karpathyCheck：
\`\`\`
EOF

echo "任务文件已创建：$TASK_FILE"
echo
echo "下一步：请打开该文件，补全 Goal / Allowed Files / Risk Notes 后运行 ./scripts/agent-dispatch-task.sh。"
