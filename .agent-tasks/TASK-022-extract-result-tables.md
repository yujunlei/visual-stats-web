# Task Brief

## Task Name

抽离 ResultTables 组件

## Assigned Agent

Refactor Implementer

## Goal

根据《visual-stats-web 中间区布局功能优化与重构研究报告》的组件拆分路线，在 TASK-021 已抽离 `ResultReadingPanel` 的基础上，继续进行第二步安全拆分：**将结果阅读面板中的结果表格区域抽离为独立组件 `ResultTables`**。

本任务只做展示组件拆分，不改视觉、不改统计逻辑、不改导出逻辑。

目标：

1. 从 `src/components/results/ResultReadingPanel.tsx` 中定位“系数估计 / 统计表格 / result-tables / coef-table / secondary tables”相关 JSX；
2. 将这部分 JSX 原样迁移到新组件：

```text
src/components/results/ResultTables.tsx
```

3. `ResultReadingPanel.tsx` 改为调用 `<ResultTables />`；
4. 保持所有 className、表格结构、数值格式、导出入口行为不变；
5. 不修改 `App.tsx`，除非是为了修复 import/export 类型错误；
6. 不修改 CSS；
7. 不修改模型计算、数据预处理、导出逻辑或 Electron。

## Allowed Files

```text
src/components/results/ResultReadingPanel.tsx
src/components/results/ResultTables.tsx
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
4. 搜索并定位结果表格区域，重点关键词：
   - `result-tables`
   - `coef-table`
   - `table-caption`
   - `columnLabels`
   - `formatResultValue`
   - `result.tables`
   - `resultSecondaryTables`
   - `secondary`
   - `系数估计`
   - `统计表格`
5. 新增文件 `src/components/results/ResultTables.tsx`。
6. 将结果表格区域 JSX 原样迁移到 `ResultTables.tsx`。
7. 组件 props 必须显式声明。
8. 如果表格渲染依赖 `columnLabels`、`formatResultValue`，优先复用已有 `resultFormat.ts` 中的工具。
9. 不要改变任何表格列名、数值格式、className、空状态文案。
10. 不要修改 CSS。
11. 不要修改 `App.tsx`。
12. 更新 `src/components/results/index.ts`，导出 `ResultTables`。
13. 完成后运行测试命令。

## Suggested Component Shape

请根据真实代码调整，不要求完全照抄：

```tsx
import type { ModelResult } from '../../models/types'

type ResultTablesProps = {
  result: ModelResult | null
  // 其他当前结果表区域实际需要的展示参数
}

export function ResultTables(props: ResultTablesProps) {
  return (
    <section className="result-tables">
      {/* moved JSX from ResultReadingPanel */}
    </section>
  )
}
```

如果当前 `ResultReadingPanel` 中结果表格区域不是单个 `<section className="result-tables">`，可以保留原有外层结构，但不要改变 DOM 语义和 className。

## Acceptance Criteria

- [ ] 新增 `src/components/results/ResultTables.tsx`
- [ ] `ResultReadingPanel.tsx` 中表格渲染代码明显减少
- [ ] `ResultReadingPanel.tsx` 调用 `<ResultTables />`
- [ ] `src/components/results/index.ts` 导出 `ResultTables`
- [ ] 核心结论仍显示
- [ ] 模型摘要仍显示
- [ ] 系数估计 / 统计表格仍显示
- [ ] 补充表仍显示
- [ ] 表格 className 保持不变
- [ ] 数值格式保持不变
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
2. 确认系数估计表仍然显示。
3. 确认模型摘要仍然显示。
4. 确认补充表/诊断/日志仍然显示。
5. 确认表格样式与 TASK-021 合并后保持一致。
```

## Risk Notes

本任务风险较低，但需要注意：

- 不要改变 `ModelResult.tables` 的读取方式；
- 不要改变 `formatResultValue`；
- 不要改变 `columnLabels`；
- 不要修改 CSS；
- 不要把导出逻辑移动进该组件；
- 不要一次性拆分核心结论或诊断区域。

如果发现 `ResultReadingPanel` 内结果表格区域依赖太多本地变量，先停止并输出依赖清单，不要强行大范围重构。

## Output Required

请输出：

```text
修改摘要：
文件列表：
ResultTables 接收了哪些 props：
ResultReadingPanel 减少了什么职责：
测试结果：
人工检查建议：
风险说明：
git diff 摘要：
```
