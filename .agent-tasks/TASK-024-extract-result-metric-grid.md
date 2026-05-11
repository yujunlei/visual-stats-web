# Task Brief

## Task Name

抽离 ResultMetricGrid 组件

## Assigned Agent

Refactor Implementer

## Goal

在 TASK-021 已抽离 `ResultReadingPanel`、TASK-022A 已抽离 `ResultTables`、TASK-023 已抽离 `ResultSupportSection` 的基础上，继续进行结果区组件拆分：将“模型摘要 / 摘要指标网格”区域抽离为独立组件 `ResultMetricGrid`。

本任务只做展示组件拆分，不改视觉、不改统计逻辑、不改导出逻辑。

目标：

1. 从 `src/components/results/ResultReadingPanel.tsx` 中定位模型摘要 / 指标摘要区域；
2. 将摘要指标网格 JSX 原样迁移到新组件：

```text
src/components/results/ResultMetricGrid.tsx
```

3. `ResultReadingPanel.tsx` 改为调用 `<ResultMetricGrid />`；
4. 保持所有 className、指标顺序、数值格式、空状态文案不变；
5. 不修改 CSS；
6. 不修改 `src/App.tsx`；
7. 不修改模型计算、数据预处理、导出逻辑或 Electron。

## Allowed Files

```text
src/components/results/ResultReadingPanel.tsx
src/components/results/ResultMetricGrid.tsx
src/components/results/index.ts
```

## Forbidden Files

```text
src/App.tsx
src/App.css
src/index.css
src/styles/*
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
2. 阅读 `.agents/refactor-implementer.md`。
3. 打开 `src/components/results/ResultReadingPanel.tsx`。
4. 搜索并定位模型摘要/指标摘要区域，重点关键词：
   - `模型摘要`
   - `Model summary`
   - `summary-grid`
   - `summary`
   - `formatMetricValue`
   - `result.summary`
   - `metrics`
   - `Observations`
   - `R-squared`
   - `Root MSE`
5. 新增文件 `src/components/results/ResultMetricGrid.tsx`。
6. 将模型摘要/指标网格区域 JSX 原样迁移到 `ResultMetricGrid.tsx`。
7. 组件 props 必须显式声明。
8. 如果依赖 `formatMetricValue`，优先复用已有 `resultFormat.ts` 中的工具。
9. 不要改变任何指标 label、指标顺序、className、空状态文案。
10. 不要修改 CSS。
11. 不要修改 `App.tsx`。
12. 更新 `src/components/results/index.ts`，导出 `ResultMetricGrid`。
13. 完成后运行测试命令。

## Suggested Component Shape

请根据真实代码调整，不要求完全照抄：

```tsx
import type { ModelMetric } from '../../models/types'

type ResultMetricGridProps = {
  summary: ModelMetric[]
}

export function ResultMetricGrid({ summary }: ResultMetricGridProps) {
  return (
    <div className="summary-grid">
      {/* moved JSX from ResultReadingPanel */}
    </div>
  )
}
```

如果当前 `ResultReadingPanel` 中模型摘要区域不是单个 `.summary-grid`，可以保留原有外层结构，但不要改变 DOM 语义和 className。

## Acceptance Criteria

- [ ] 新增 `src/components/results/ResultMetricGrid.tsx`
- [ ] `ResultReadingPanel.tsx` 中模型摘要/指标网格代码明显减少
- [ ] `ResultReadingPanel.tsx` 调用 `<ResultMetricGrid />`
- [ ] `src/components/results/index.ts` 导出 `ResultMetricGrid`
- [ ] 模型摘要仍显示
- [ ] 指标顺序保持不变
- [ ] 数值格式保持不变
- [ ] 空状态保持不变
- [ ] 不修改 CSS
- [ ] 不修改 `App.tsx`
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

请人工检查：

```text
1. 运行一个线性回归模型，进入结果页。
2. 确认“模型摘要”仍然显示。
3. 确认样本量、R²、Root MSE 等摘要指标仍然显示。
4. 确认核心结论、系数估计、诊断日志没有变化。
5. 确认结果页视觉与 TASK-023 后保持一致。
```

## Risk Notes

本任务风险较低，但需要注意：

- 不要改变 `result.summary` 的读取方式；
- 不要改变 `formatMetricValue`；
- 不要修改 CSS；
- 不要把统计指标计算逻辑移动进该组件；
- 不要一次性拆分核心结论或整个结果阅读面板。

如果模型摘要区域依赖太多本地变量，先停止并输出依赖清单，不要强行大范围重构。

## Output Required

请输出：

```text
修改摘要：
文件列表：
ResultMetricGrid 接收了哪些 props：
ResultReadingPanel 减少了什么职责：
测试结果：
人工检查建议：
风险说明：
git diff 摘要：
```
