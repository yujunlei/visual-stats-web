# Task Brief

## Task Name

抽离 ResultReadingPanel 组件

## Assigned Agent

Refactor Implementer

## Goal

根据《visual-stats-web 中间区布局功能优化与重构研究报告》的重构路线，完成第二阶段的第一步：**从 App.tsx 中抽离结果阅读主面板组件**。

报告建议中间区应先完成“基线清理”，再进入“组件化拆分”；当前 TASK-020 已完成基线清理，因此本任务只做最小安全组件拆分，不改视觉、不改业务逻辑、不改统计计算。

本任务目标：

1. 从 `src/App.tsx` 中定位结果页的统一结果阅读区域；
2. 将 `result-reading-section` 这一块 JSX 抽离为独立组件；
3. 新增组件文件：

```text
src/components/results/ResultReadingPanel.tsx
```

4. `App.tsx` 改为调用 `ResultReadingPanel`；
5. 保持页面视觉和交互不变；
6. 不修改模型计算、数据预处理、结果导出、Electron 逻辑。

## Allowed Files

```text
src/App.tsx
src/components/results/ResultReadingPanel.tsx
src/components/results/index.ts
```

## Forbidden Files

```text
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
3. 在 `src/App.tsx` 中查找结果阅读区域，重点搜索：
   - `result-reading-section`
   - `result-primary-summary`
   - `result-tables`
   - `result-support-section`
   - `核心结论`
   - `模型摘要`
   - `系数估计`
   - `诊断与运行日志`
4. 确认 `result-reading-section` 当前已包含：
   - 核心结论；
   - 模型摘要；
   - 系数估计 / 统计表格；
   - 诊断与运行日志。
5. 新建 `src/components/results/ResultReadingPanel.tsx`。
6. 将 `result-reading-section` 的 JSX 原样移动到该组件中。
7. 组件 props 应尽量显式，但不要为了“完美类型”大范围移动类型定义。
8. 如果 props 数量过多，可以先以最小方式抽离：
   - 保留必要类型 import；
   - 只传入渲染该区块必需的 result/run/log/export/action 相关数据和 handlers；
   - 不移动模型计算函数；
   - 不移动导出函数实现。
9. 如果已有 `src/components/results/index.ts`，则从中导出 `ResultReadingPanel`；如果没有，可以新建。
10. `App.tsx` 中使用：

```tsx
<ResultReadingPanel ... />
```

11. 保持所有原有 className 不变。
12. 不修改 CSS。
13. 不改变任何条件渲染逻辑。
14. 不改变运行按钮、导出按钮、诊断内容和日志内容。
15. 不改变 `ModelResult`、`RunLogEntry`、`PublicationTable` 等数据结构。
16. 完成后运行测试命令。

## Important Boundaries

本任务不是 UI 改版。

不要做：

```text
不要重命名大量 className
不要修改 CSS
不要重构模型运行逻辑
不要移动 export/publicationTables.ts 逻辑
不要修改 data/preprocess.ts
不要修改 models/*
不要新增依赖
不要继续处理视觉问题
```

只做：

```text
把现有 result-reading-section JSX 抽成 ResultReadingPanel
保持行为不变
```

## Suggested Component Shape

根据当前真实代码调整，不要求完全照抄：

```tsx
type ResultReadingPanelProps = {
  // result data
  result: ModelResult | null
  resultLogs: RunLogEntry[]
  // running state
  isModelRunning: boolean
  // export/actions
  // existing callbacks used by buttons inside result-reading-section
}

export function ResultReadingPanel(props: ResultReadingPanelProps) {
  return (
    <section className="result-reading-section">
      {/* moved JSX from App.tsx */}
    </section>
  )
}
```

如果 JSX 中依赖的局部变量很多，可以在组件中先使用更宽的 props，但必须保持类型安全：

```tsx
type ResultReadingPanelProps = {
  result: ModelResult | null
  logs: RunLogEntry[]
  children?: never
  // explicit callbacks and values only
}
```

不要使用 `any`，除非当前项目已有对应类型无法轻易访问；如必须使用，需在输出中解释原因。

## Acceptance Criteria

- [ ] 新增 `src/components/results/ResultReadingPanel.tsx`
- [ ] `App.tsx` 中结果阅读区域减少
- [ ] `App.tsx` 调用 `ResultReadingPanel`
- [ ] 核心结论仍显示
- [ ] 模型摘要仍显示
- [ ] 系数估计仍显示
- [ ] 诊断与运行日志仍显示
- [ ] 导出/操作按钮仍显示并保持原有行为
- [ ] 不修改 CSS
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
2. 确认核心结论、模型摘要、系数估计、诊断与运行日志全部仍然显示。
3. 确认没有重复结果阅读标题。
4. 确认导出按钮、结果表、日志区域仍可见。
5. 缩小窗口宽度，确认布局与 TASK-020 合并后的状态一致。
```

## Risk Notes

本任务风险中等，因为会移动 JSX。

风险控制：

- 不改 CSS；
- 不改模型逻辑；
- 不改导出逻辑；
- 不改数据预处理；
- 保持 className 不变；
- 不做视觉优化；
- 只抽一个组件，避免一次性拆太多。

如果抽离后 props 数量非常多，也可以先停止并说明需要先拆更小组件，不要强行大范围重构。

## Output Required

请输出：

```text
修改摘要：
文件列表：
App.tsx 减少了什么职责：
ResultReadingPanel 接收了哪些主要 props：
测试结果：
人工检查建议：
风险说明：
git diff 摘要：
```
