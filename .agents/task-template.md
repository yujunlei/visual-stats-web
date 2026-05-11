# Task Brief

## Task Name

填写任务名称。

## Assigned Agent

Codex Frontend / Codex Refactor

Legacy aliases `Frontend Implementer` and `Refactor Implementer` may appear only in old task briefs. New tasks should use Codex role names.

## Goal

本次任务要实现什么。

## Meta_Kim Governance Packet

```text
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
  Assigned Agent:
  Worktree:
  Review Owner:
  Verification Commands:
```

## Karpathy Discipline

```text
Assumptions:
Simplicity Check:
Surgical Change Boundary:
Verification Goal:
```

## Allowed Files

```text
填写允许修改的文件或目录。
```

## Forbidden Files

```text
填写禁止修改的文件或目录。
```

## Implementation Steps

1.
2.
3.

## Acceptance Criteria

- [ ] 功能正常
- [ ] 不改变统计计算逻辑
- [ ] 不破坏三列式专业工作台布局
- [ ] 不修改禁止文件
- [ ] 不新增不必要依赖
- [ ] 不直接 commit
- [ ] 不直接 push
- [ ] 符合 Karpathy discipline：无隐藏假设、无过度抽象、无无关改动、有验证证据
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过

## Test Commands

```bash
npm run typecheck
npm run lint
npm run build
```

## Risk Notes

填写本任务的风险点。

## Output Required

请输出：

```text
修改摘要：
文件列表：
测试结果：
风险说明：
git diff 摘要：
verificationResult：
evolutionWriteback：
karpathyCheck：
```
