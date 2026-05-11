# Task Brief

## Task Name

中间区基线清理与样式收敛

## Assigned Agent

Frontend Implementer

## Goal

根据《visual-stats-web 中间区布局功能优化与重构研究报告》，先进行中间区重构第一步：**基线清理与样式收敛**。

当前中间区经历多轮 CSS patch，导致：

- `App.css` 与 `src/styles/result-reading-container.css` 同时控制结果阅读区；
- 可能存在 `result-reading-final-fix.css`、`result-reading-heading-fix.css` 等临时覆盖文件；
- CSS import 顺序影响实际视觉效果；
- 核心结论、模型摘要、系数估计、诊断日志之间的父子关系和视觉关系不稳定；
- 继续叠加 CSS patch 会使维护成本继续上升。

本任务目标不是继续做视觉微调，而是先收敛样式来源和中间区结构基线。

最终要求：

1. 结果阅读区只保留一套样式来源；
2. 不再依赖多个后加载 CSS override 文件；
3. 不再使用 CSS `::before` / `::after` 生成标题；
4. 不再出现重复“结果阅读”标题；
5. 核心结论、模型摘要、系数估计、诊断与运行日志仍完整显示；
6. 不修改统计计算、模型输出、导出逻辑或 Electron 行为。

## Allowed Files

```text
src/App.tsx
src/App.css
src/main.tsx
src/styles/result-reading-container.css
src/styles/result-reading-final-fix.css
src/styles/result-reading-heading-fix.css
```

## Forbidden Files

```text
src/models/*
src/data/*
src/export/*
electron/*
package.json
package-lock.json
AGENTS.md
.agents/*
.agent-tasks/*
scripts/*
```

## Implementation Steps

1. 阅读 `AGENTS.md`。
2. 阅读 `.agents/frontend-implementer.md`。
3. 检查 `src/main.tsx` 的 CSS import 顺序。
4. 检查以下文件是否存在：
   - `src/styles/result-reading-container.css`
   - `src/styles/result-reading-final-fix.css`
   - `src/styles/result-reading-heading-fix.css`
5. 清理临时样式：
   - 如果 `result-reading-final-fix.css` 存在，删除并移除 import。
   - 如果 `result-reading-heading-fix.css` 存在，删除并移除 import。
6. 处理 `result-reading-container.css`：
   - 推荐删除该文件，并把必要结果区样式合并回 `src/App.css`；
   - 如果保留，必须只保留一套最终规则，不得和 `App.css` 互相覆盖；
   - 不得新增第三个 CSS override 文件。
7. 检查 `src/App.tsx` 中是否存在重复“结果阅读”标题：
   - 如外层已有“阅读并解释结果 / 结果阅读”，内部不要再重复渲染“RESULT READING / 结果阅读”。
8. 结果顺序保持：
   - 核心结论
   - 模型摘要
   - 系数估计 / 统计表格
   - 诊断与运行日志
9. 保持已有结果数据、表格、诊断和日志内容不变。
10. 完成后运行测试命令。

## Acceptance Criteria

- [ ] 不再有多个结果阅读 CSS override 文件互相覆盖
- [ ] `src/main.tsx` 中 CSS import 顺序清晰
- [ ] 如删除 CSS 文件，已同步移除 import
- [ ] 页面不再出现重复“结果阅读”标题
- [ ] 核心结论、模型摘要、系数估计、诊断与运行日志仍完整显示
- [ ] 核心结论没有被外层青色大块二次包裹
- [ ] 模型摘要/系数估计不再出现明显脱离白底容器的左侧装饰区域
- [ ] 不修改统计计算逻辑
- [ ] 不修改数据预处理逻辑
- [ ] 不修改导出逻辑
- [ ] 不修改 Electron
- [ ] 不修改 package.json
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run build` 通过

## Test Commands

```bash
npm run typecheck
npm run lint
npm run build
```

## Manual Check

```text
1. 运行一个线性回归模型，进入结果页。
2. 确认中间结果阅读区只有一个主要白底容器。
3. 确认没有重复“结果阅读”标题。
4. 确认核心结论、模型摘要、系数估计、诊断日志顺序清楚。
5. 确认模型摘要左侧没有脱离容器的空白装饰轴。
6. 缩小窗口宽度，确认没有明显遮挡或重叠。
```

## Risk Notes

本任务风险中等，因为会清理中间区样式来源。

必须避免：

- 继续新增 CSS override 文件；
- 删除真实业务内容；
- 修改模型计算；
- 修改导出逻辑；
- 修改 Electron；
- 引入新依赖。

## Output Required

```text
修改摘要：
文件列表：
删除或保留的 CSS 文件：
测试结果：
人工检查建议：
风险说明：
git diff 摘要：
```
