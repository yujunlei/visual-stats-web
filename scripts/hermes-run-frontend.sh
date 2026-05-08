#!/usr/bin/env bash
set -euo pipefail

TASK_FILE="${1:-.agent-tasks/TASK-001.md}"

if [ ! -f "AGENTS.md" ]; then
  echo "错误：请在 visual-stats-web 仓库根目录运行本脚本。缺少 AGENTS.md。"
  exit 1
fi

if [ ! -f ".agents/frontend-implementer.md" ]; then
  echo "错误：缺少 .agents/frontend-implementer.md。请先完成 Step 1。"
  exit 1
fi

if [ ! -f "$TASK_FILE" ]; then
  echo "错误：任务单不存在：$TASK_FILE"
  echo "请先在 .agent-tasks/ 下创建任务单，例如 .agent-tasks/TASK-001.md。"
  exit 1
fi

if ! command -v vs-frontend >/dev/null 2>&1; then
  echo "错误：未找到 vs-frontend 命令。请先创建 Hermes profile：vs-frontend。"
  exit 1
fi

vs-frontend chat <<EOF
你是 visual-stats-web 项目的 Frontend Implementer Agent。

请先阅读：
- AGENTS.md
- .agents/frontend-implementer.md
- ${TASK_FILE}

本次任务必须严格按照任务单执行。

硬性要求：
- 只能修改任务单允许的文件。
- 不要修改任务单禁止的文件。
- 不要修改统计模型计算逻辑。
- 不要修改 electron/*
- 不要修改 package.json 依赖。
- 不要直接 commit。
- 不要直接 push。
- 不要自行扩大任务范围。

完成后请运行：
npm run typecheck
npm run lint
npm run build

如果测试命令无法运行，请明确说明原因。

最后请输出：
修改文件：
实现内容：
是否修改统计逻辑：否
是否修改 Electron：否
测试结果：
风险点：
git diff 摘要：
EOF
