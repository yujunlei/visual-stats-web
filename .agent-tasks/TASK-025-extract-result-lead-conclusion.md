# Task Brief

## Task Name

抽离 ResultLeadConclusion 组件

## Assigned Agent

Refactor Implementer

## Goal

在已完成以下拆分的基础上继续组件化：

```text
ResultReadingPanel
  ├── ResultMetricGrid
  ├── ResultTables
  └── ResultSupportSection
```

本任务将“核心结论 / 自然语言结论 / 结果解读说明”区域从 `ResultReadingPanel.tsx` 中抽离为独立组件：

```text
src/components/results/ResultLeadConclusion.tsx
```

本任务只做展示组件拆分，不改视觉、不改统计逻辑、不改导出逻辑。

目标：

1. 从 `src/components/results/ResultReadingPanel.tsx` 中定位核心结论区域；
2. 将核心结论相关 JSX 原样迁移到 `ResultLeadConclusion.tsx`；
3. `ResultReadingPanel.tsx` 改为调用 `<ResultLeadConclusion />`；
4. 保持所有 className、文案、条件渲染、空状态、运行中提示不变；
5. 不修改 CSS；
6. 不修改 `src/App.tsx`；
7. 不修改模型计算、数据预处理、导出逻辑或 Electron。

## Allowed Files

```text
src/components/results/ResultReadingPanel.tsx
src/components/results/ResultLeadConclusion.tsx
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
4. 搜索并定位核心结论区域，重点关键词：
   - `核心结论`
   - `lead-conclusion`
   - `lead-conclusion-card`
   - `result.message`
   - `result.warnings`
   - `result-insights`
   - `paper-quote-note`
   - `结果解读说明`
   - `isModelRunning`
   - `notice is-running-task`
5. 新增文件 `src/components/results/ResultLeadConclusion.tsx`。
6. 将核心结论相关 JSX 原样迁移到 `ResultLeadConclusion.tsx`。
7. 组件 props 必须显式声明。
8. 如果核心结论区域依赖 `result`、`isModelRunning`、`runTask`、`runProgress`、`warnings`、`error` 等数据，只传入渲染需要的数据。
9. 不要改变任何 className。
10. 不要改变任何文案。
11. 不要改变任何条件渲染逻辑。
12. 不要修改 CSS。
13. 不要修改 `App.tsx`。
14. 更新 `src/components/results/index.ts`，导出 `ResultLeadConclusion`。
15. 完成后运行测试命令。

## Suggested Component Shape

请根据真实代码调整，不要求完全照抄：

```tsx
import type { ModelResult } from '../../models/types'

type ResultLeadConclusionProps = {
  result: ModelResult | null
  isModelRunning: boolean
  // 其他当前核心结论区域实际需要的展示状态
}

export function ResultLeadConclusion(props: ResultLeadConclusionProps) {
  return (
    <>
      {/* moved JSX from ResultReadingPanel */}
    </>
  )
}
```

如果当前核心结论区域外层是：

```tsx
<section className="result-primary-summary">
```

则应保留该外层 className，不要改变 DOM 语义和 className。

## Acceptance Criteria

- [ ] 新增 `src/components/results/ResultLeadConclusion.tsx`
- [ ] `ResultReadingPanel.tsx` 中核心结论相关代码明显减少
- [ ] `ResultReadingPanel.tsx` 调用 `<ResultLeadConclusion />`
- [ ] `src/components/results/index.ts` 导出 `ResultLeadConclusion`
- [ ] 核心结论仍显示
- [ ] 自然语言结论仍显示
- [ ] 结果解读说明仍按当前逻辑显示或隐藏
- [ ] 运行中提示仍显示
- [ ] 警告/风险提示仍显示
- [ ] 所有 className 保持不变
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
2. 确认核心结论仍然显示。
3. 确认模型摘要、系数估计、诊断日志没有变化。
4. 确认运行中状态和结果完成状态都没有报错。
5. 确认结果页视觉与 TASK-024 后保持一致。
```

## Risk Notes

本任务风险较低，但需要注意：

- 不要改变 `result.message` 的展示逻辑；
- 不要改变 warnings 的展示逻辑；
- 不要修改 CSS；
- 不要把模型运行状态逻辑移动进该组件；
- 不要一次性拆分整个 ResultReadingPanel 其他区域。

如果核心结论区域依赖太多本地变量，先停止并输出依赖清单，不要强行大范围重构。

## Output Required

请输出：

```text
修改摘要：
文件列表：
ResultLeadConclusion 接收了哪些 props：
ResultReadingPanel 减少了什么职责：
测试结果：
人工检查建议：
风险说明：
git diff 摘要：
```
