# Task Brief

## Task Name

测试 Hermes Frontend Agent 是否能读取任务单

## Assigned Agent

Frontend Implementer

## Goal

本任务只用于测试 Hermes 执行 Agent 是否能读取项目规则和任务单。不要修改代码。

## Allowed Files

```text
无。本任务不允许修改任何文件。
```

## Forbidden Files

```text
全部文件。
```

## Implementation Steps

1. 阅读 AGENTS.md。
2. 阅读 .agents/frontend-implementer.md。
3. 阅读本任务单。
4. 不要修改任何文件。
5. 只回复你已经理解当前工作流。

## Acceptance Criteria

- [ ] 不修改任何文件
- [ ] 不运行破坏性命令
- [ ] 能说明 Frontend Implementer Agent 的职责和禁止事项

## Test Commands

```bash
git status --short
```

## Risk Notes

本任务只用于测试 profile 和脚本连通性，风险很低。

## Output Required

请输出：

```text
Frontend Agent 已读取任务单。
我不会修改统计逻辑。
我不会修改 electron/*。
我不会修改 package.json。
我不会直接 commit 或 push。
```
