# Task Brief

## Task Name

抽离 ResultSupportSection 组件

## Assigned Agent

Refactor Implementer

## Goal

在 TASK-021 已抽离 `ResultReadingPanel`、TASK-022A 已抽离 `ResultTables` 的基础上，继续进行结果区组件拆分：将“诊断与运行日志”区域抽离为独立组件 `ResultSupportSection`。

本任务只做展示组件拆分，不改视觉、不改统计逻辑、不改导出逻辑。

目标：

1. 从 `src/components/results/ResultReadingPanel.tsx` 中定位“诊断与运行日志”相关 JSX；
2. 将该区域原样迁移到新组件：

```text
src/components/results/ResultSupportSection.tsx
```

3. `ResultReadingPanel.tsx` 改为调用 `<ResultSupportSection />`；
4. 保持所有 className、诊断图、运行日志、空状态文案不变；
5. 不修改 CSS；
6. 不修改 `src/App.tsx`；
7. 不修改模型计算、数据预处理、导出逻辑或 Electron。

## Allowed Files

```text
src/components/results/ResultReadingPanel.tsx
src/components/results/ResultSupportSection.tsx
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
4. 搜索并定位诊断与运行日志区域，重点关键词：
   - `result-support-section`
   - `result-support-row`
   - `result-diagnostic-card`
   - `result-log-card`
   - `scatter-plot`
   - `correlation-heatmap`
   - `runLogs`
   - `diagnostics`
   - `诊断与运行日志`
   - `拟合诊断`
   - `运行日志`
5. 新增文件 `src/components/results/ResultSupportSection.tsx`。
6. 将“诊断与运行日志”区域 JSX 原样迁移到 `ResultSupportSection.tsx`。
7. 组件 props 必须显式声明。
8. 如果依赖图形数据、日志、格式化函数，请从 `ResultReadingPanel` 显式传入。
9. 不要改变任何 className。
10. 不要改变诊断图渲染逻辑。
11. 不要改变运行日志渲染逻辑。
12. 不要修改 CSS。
13. 不要修改 `App.tsx`。
14. 更新 `src/components/results/index.ts`，导出 `ResultSupportSection`。
15. 完成后运行测试命令。

## Suggested Component Shape

请根据真实代码调整，不要求完全照抄：

```tsx
import type { RunLogEntry } from '../../data/preprocess'
import type { ModelResult } from '../../models/types'

type ResultSupportSectionProps = {
  result: ModelResult | null
  runLogs: RunLogEntry[]
  // 其他当前诊断区实际需要的展示参数
}

export function ResultSupportSection(props: ResultSupportSectionProps) {
  return (
    <section className="result-support-section">
      {/* moved JSX from ResultReadingPanel */}
    </section>
  )
}
```

如果当前 `ResultReadingPanel` 中诊断区域不是单个 `<section className="result-support-section">`，可以保留原有外层结构，但不要改变 DOM 语义和 className。

## Acceptance Criteria

- [ ] 新增 `src/components/results/ResultSupportSection.tsx`
- [ ] `ResultReadingPanel.tsx` 中诊断与运行日志代码明显减少
- [ ] `ResultReadingPanel.tsx` 调用 `<ResultSupportSection />`
- [ ] `src/components/results/index.ts` 导出 `ResultSupportSection`
- [ ] 拟合诊断仍显示
- [ ] 运行日志仍显示
- [ ] 空诊断/空日志状态仍显示
- [ ] 诊断图 className 保持不变
- [ ] 日志列表 className 保持不变
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
2. 确认诊断与运行日志仍在结果阅读底部。
3. 确认拟合诊断图仍显示。
4. 确认运行日志仍显示。
5. 确认模型摘要和系数估计没有变化。
6. 缩小窗口宽度，确认诊断与日志布局不变。
```

## Risk Notes

本任务风险较低，但需要注意：

- 不要改变 diagnostics 数据读取方式；
- 不要改变 runLogs 生成方式；
- 不要改变图表点位计算逻辑；
- 不要修改 CSS；
- 不要把诊断计算逻辑移动进该组件；
- 不要一次性拆分核心结论或模型摘要区域。

如果诊断区依赖太多本地变量，先停止并输出依赖清单，不要强行大范围重构。

## Output Required

请输出：

```text
修改摘要：
文件列表：
ResultSupportSection 接收了哪些 props：
ResultReadingPanel 减少了什么职责：
测试结果：
人工检查建议：
风险说明：
git diff 摘要：
```
