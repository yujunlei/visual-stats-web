# Code Review

Codex Architect reviews implementation work from a review pack or worktree diff. Do not directly modify code or merge during review.

## Reviewed Task

填写任务名称。

## Changed Files

```text
填写修改文件列表。
```

## Review Checklist

- [ ] 是否符合 `AGENTS.md`
- [ ] 是否符合 `.codex/governance/meta-kim-contract.md`
- [ ] 是否符合 `.codex/governance/karpathy-guidelines.md`
- [ ] 是否符合任务单
- [ ] 是否只修改允许文件
- [ ] 是否未修改禁止文件
- [ ] 是否保留三列式专业工作台布局
- [ ] 是否未修改统计计算逻辑
- [ ] 是否未破坏数据导入流程
- [ ] 是否未破坏模型运行流程
- [ ] 是否未破坏结果展示
- [ ] 是否未破坏导出流程
- [ ] 是否未修改 Electron 安全边界
- [ ] 是否新增不必要依赖
- [ ] `npm run typecheck` 是否通过
- [ ] `npm run lint` 是否通过
- [ ] `npm run build` 是否通过

## Meta_Kim Gate Review

- [ ] Planning Gate：任务单是否有 owner、允许文件、禁止文件、验收标准、测试、风险
- [ ] Execution Gate：执行是否只改允许文件
- [ ] Review Gate：本次审查是否覆盖禁止文件、统计逻辑、Electron、安全边界和测试证据
- [ ] Verification Gate：测试或人工检查是否有明确证据
- [ ] Evolution Gate：是否有需要写回 `.agents/`、`.codex/prompts/`、`docs/` 或 `scripts/` 的可复用经验

## Karpathy Discipline Review

- [ ] Think Before Coding：是否暴露关键假设，而不是静默猜测
- [ ] Simplicity First：实现是否是满足任务的最小足够方案
- [ ] Surgical Changes：是否每个改动都能追溯到任务单
- [ ] Goal-Driven Execution：是否有明确验证证据

## Decision

通过 / 需要修改 / 拒绝

## Risk Level

低 / 中 / 高

## Main Issues

填写主要问题。

## Required Changes

如需修改，列出具体修改点。

## Merge Suggestion

可以合并 / 暂不建议合并 / 拒绝合并
