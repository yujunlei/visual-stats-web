# Task Brief

## Task Name

增强 Hermes 执行脚本可观察性

## Assigned Agent

Refactor Implementer

## Goal

优化现有 Hermes 执行脚本，让本地执行 Agent 任务时更容易判断：

- 任务是否已经开始；
- 当前调用的是哪个 Hermes profile；
- 当前任务文件是什么；
- 日志保存在哪里；
- 执行过程中是否有输出；
- 任务结束后 git 状态是什么。

本任务只优化本地 Agent 工作流脚本，不修改业务代码、不修改统计逻辑、不修改 Electron。

需要增强的脚本：

```text
scripts/hermes-run-frontend.sh
scripts/hermes-run-refactor.sh
```

建议新增一个查看最新日志的辅助脚本：

```text
scripts/agent-tail-latest-log.sh
```

建议在 `.gitignore` 中加入：

```text
.agent-logs/
```

## Allowed Files

```text
scripts/hermes-run-frontend.sh
scripts/hermes-run-refactor.sh
scripts/agent-tail-latest-log.sh
.gitignore
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
3. 修改 `scripts/hermes-run-frontend.sh`：
   - 在执行前打印任务文件路径；
   - 在执行前打印当前工作目录；
   - 在执行前打印当前时间；
   - 创建 `.agent-logs/` 目录；
   - 将 Hermes 输出同时显示在终端并写入日志文件；
   - 日志文件名应包含 agent 类型和时间戳，例如 `.agent-logs/frontend-YYYYMMDD-HHMMSS.log`；
   - 执行结束后打印 `git status --short`。
4. 修改 `scripts/hermes-run-refactor.sh`：
   - 同上，但日志文件名使用 `refactor-YYYYMMDD-HHMMSS.log`。
5. 新增 `scripts/agent-tail-latest-log.sh`：
   - 自动查找 `.agent-logs/` 中最新的 `.log` 文件；
   - 如果找不到日志，输出明确提示；
   - 如果找到日志，执行 `tail -f` 查看。
6. 修改 `.gitignore`，加入 `.agent-logs/`，避免日志被提交。
7. 不要修改任何业务源码。
8. 不要修改统计模型计算逻辑。
9. 不要修改 Electron。
10. 不要新增依赖。
11. 不要自动 commit。
12. 不要自动 push。
13. 完成后运行测试命令。

## Acceptance Criteria

- [ ] `scripts/hermes-run-frontend.sh` 会输出日志路径
- [ ] `scripts/hermes-run-refactor.sh` 会输出日志路径
- [ ] Hermes 输出会同时显示在终端并写入 `.agent-logs/*.log`
- [ ] 新增 `scripts/agent-tail-latest-log.sh`
- [ ] `scripts/agent-tail-latest-log.sh` 可执行
- [ ] `.gitignore` 包含 `.agent-logs/`
- [ ] 不修改 `src/*`
- [ ] 不修改 `electron/*`
- [ ] 不修改 `package.json`
- [ ] 不改变统计计算逻辑
- [ ] `bash -n scripts/hermes-run-frontend.sh` 通过
- [ ] `bash -n scripts/hermes-run-refactor.sh` 通过
- [ ] `bash -n scripts/agent-tail-latest-log.sh` 通过
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过

## Test Commands

```bash
bash -n scripts/hermes-run-frontend.sh
bash -n scripts/hermes-run-refactor.sh
bash -n scripts/agent-tail-latest-log.sh
chmod +x scripts/hermes-run-frontend.sh
chmod +x scripts/hermes-run-refactor.sh
chmod +x scripts/agent-tail-latest-log.sh
npm run typecheck
npm run lint
npm run build
```

可以额外检查：

```bash
grep -n ".agent-logs/" .gitignore
```

## Risk Notes

本任务风险较低，因为只修改本地 Agent 工作流脚本。

需要注意：

- 不要改变 `hermes-run-frontend.sh` 和 `hermes-run-refactor.sh` 原本调用对应 Hermes profile 的行为；
- 不要让脚本自动 commit 或 push；
- 不要把 `.agent-logs/` 提交进仓库；
- 不要修改业务源码；
- 不要修改统计模型、Electron 或依赖。

## Output Required

请输出：

```text
修改摘要：
文件列表：
测试结果：
风险说明：
git diff 摘要：
```
