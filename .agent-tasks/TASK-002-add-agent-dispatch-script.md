# Task Brief

## Task Name

新增任务自动分发脚本 agent-dispatch-task.sh

## Assigned Agent

Refactor Implementer

## Goal

新增一个本地任务分发脚本：

```text
scripts/agent-dispatch-task.sh
```

该脚本读取 `.agent-tasks/TASK-xxx.md` 中的 `Assigned Agent` 字段，并自动调用对应的 Hermes 执行脚本：

- `Frontend Implementer` → `scripts/hermes-run-frontend.sh`
- `Refactor Implementer` → `scripts/hermes-run-refactor.sh`

本任务只新增脚本，不修改业务代码。

## Allowed Files

```text
scripts/agent-dispatch-task.sh
```

## Forbidden Files

```text
src/*
electron/*
package.json
package-lock.json
AGENTS.md
.agents/*
.agent-tasks/*
```

## Implementation Steps

1. 阅读 `AGENTS.md`。
2. 阅读 `.agents/refactor-implementer.md`。
3. 新增文件 `scripts/agent-dispatch-task.sh`。
4. 脚本必须接收任务文件路径作为第一个参数。
5. 如果任务文件不存在，应输出明确错误并退出。
6. 从任务文件中读取 `## Assigned Agent` 后面的有效值。
7. 如果值是 `Frontend Implementer`，调用 `./scripts/hermes-run-frontend.sh "$TASK_FILE"`。
8. 如果值是 `Refactor Implementer`，调用 `./scripts/hermes-run-refactor.sh "$TASK_FILE"`。
9. 如果 Assigned Agent 为空或不是以上两个值，应输出错误并退出。
10. 不要修改任何源码文件。
11. 不要修改统计逻辑。
12. 不要修改 Electron。
13. 不要新增依赖。
14. 不要自动 commit。
15. 不要自动 push。

## Acceptance Criteria

- [ ] 新增 `scripts/agent-dispatch-task.sh`
- [ ] 能识别 `Frontend Implementer`
- [ ] 能识别 `Refactor Implementer`
- [ ] 未知 Assigned Agent 会报错
- [ ] 任务文件不存在会报错
- [ ] 不修改 `src/*`
- [ ] 不修改 `electron/*`
- [ ] 不修改 `package.json`
- [ ] 不改变统计计算逻辑
- [ ] `bash -n scripts/agent-dispatch-task.sh` 通过
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过

## Test Commands

```bash
bash -n scripts/agent-dispatch-task.sh
chmod +x scripts/agent-dispatch-task.sh
npm run typecheck
npm run lint
npm run build
```

## Risk Notes

本任务风险较低，因为只新增本地脚本，不修改业务代码。

需要注意：

- 不要让脚本误调用错误的 Hermes profile。
- 不要让脚本修改任务单。
- 不要让脚本自动 commit 或 push。
- 不要让脚本执行不在任务单中的操作。
- 不要修改已有 Hermes 执行脚本。
- 不要修改统计计算逻辑。
- 不要修改 Electron 安全边界。

## Output Required

请输出：

```text
修改摘要：
文件列表：
测试结果：
风险说明：
git diff 摘要：
```
