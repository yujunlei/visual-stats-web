# AGENTS.md

## Project Identity

This repository is **Visual Stats Lab / visual-stats-web**, a React + Vite + Electron desktop-style statistical modeling workbench for spreadsheet-driven analysis.

The product should feel like a professional statistics desktop application, closer to **Stata, SPSS, RStudio, EViews, or a clean academic econometrics tool**, not like a colorful SaaS dashboard, logistics/admin backend, or flashy data screen.

Primary users are statistics, economics, management, and social-science researchers who care about:

- importing spreadsheet data,
- identifying variable types,
- selecting statistical/econometric models,
- configuring model variables and parameters,
- running models,
- reading results,
- exporting publication-style tables and reports.

---

## Core Product Direction

When improving this project, preserve these principles:

1. **Keep the three-column professional workbench layout.**
   - Left: lightweight navigation, project index, data/model/history status.
   - Center: main working area and current task focus.
   - Right: contextual assistance, explanation, recommendations, warnings, and secondary settings.

2. **Do not convert the product into a forced step-by-step wizard.**
   - A light workspace mode switch is acceptable:
     - Data
     - Model
     - Result
     - Report
   - But the product should still feel like a professional desktop workbench.

3. **Reduce information density.**
   - Do not show data table, model parameters, logs, diagnostics, and results all with equal priority.
   - Each workspace should emphasize one primary task.

4. **Use professional, calm visual styling.**
   - Large enough headings.
   - Enough whitespace.
   - Subtle borders.
   - Calm colors.
   - Clear visual focus.
   - Avoid excessive gradients, cards, flashy icons, and dashboard-like charts.

5. **Results should be readable before they are technical.**
   - Result page should prioritize:
     1. Natural-language core conclusion.
     2. Significance and direction explanation.
     3. Key metrics.
     4. Main regression/statistical table.
     5. Diagnostics, logs, and export options.

---

## Technical Stack

Current stack:

- React
- TypeScript
- Vite
- Electron
- Global CSS
- `read-excel-file`
- `papaparse`
- `write-excel-file`
- `lucide-react`

Statistical calculations are split between browser-side TypeScript plugins and Electron IPC calls to the Python professional backend for some models.

Important files:

```text
src/App.tsx
src/App.css
src/index.css
src/main.tsx
src/data/types.ts
src/data/tableUtils.ts
src/data/preprocess.ts
src/models/types.ts
src/models/registry.ts
src/models/plugins/*
src/export/publicationTables.ts
electron/main.cjs
electron/preload.cjs
package.json
```

---

## Local Multi-Agent Workflow

This project uses a semi-automated local multi-agent workflow.

There are three roles:

1. **Architect Reviewer Agent**
   - Powered by Codex / GPT 5.5.
   - Responsible for planning, task decomposition, diff review, and merge recommendation.
   - This role is **not** a Hermes profile.

2. **Frontend Implementer Agent**
   - Powered by Hermes profile + MiniMax 2.6.
   - Responsible for UI, JSX, CSS, layout, and interaction execution.

3. **Refactor Implementer Agent**
   - Powered by Hermes profile + MiniMax 2.6.
   - Responsible for low-risk refactoring, extracting components, hooks, utilities, and reducing App.tsx complexity.

---

## Workflow Rule

All development should follow this flow:

```text
1. Architect Reviewer reads the user requirement.
2. Architect Reviewer creates a task brief.
3. Task brief is saved under .agent-tasks/.
4. One Hermes implementer agent executes the task.
5. Implementer outputs code changes and diff.
6. Architect Reviewer reviews the diff.
7. Only after review should the change be committed.
```

Implementation agents must not start work without a task brief.

Implementation agents must not modify files outside the task brief.

Implementation agents must not commit or push directly unless explicitly instructed.

---

## Task Brief Requirements

Every task brief must include:

```text
Task Name
Assigned Agent
Goal
Allowed Files
Forbidden Files
Implementation Steps
Acceptance Criteria
Test Commands
Risk Notes
```

---

## Review Requirements

Every review must check:

```text
是否符合 AGENTS.md
是否符合任务单
是否只修改允许文件
是否保留三列式专业工作台布局
是否未修改统计计算逻辑
是否未破坏数据导入
是否未破坏模型运行
是否未破坏结果展示
是否未破坏导出
是否未修改 Electron 安全边界
是否新增了不必要依赖
npm run typecheck 是否通过
npm run lint 是否通过
npm run build 是否通过
```

---

## Merge Rule

No implementation agent should merge changes automatically.

The final merge decision belongs to the user after Architect Reviewer review.

---

## Frontend UX Requirements

### Left Column

The left column should be a lightweight index, not a dense control panel.

Good left column contents:

```text
Current project
Current dataset
Current model
Recent results
Pinned/favorite snapshots
History list
```

Avoid putting too many variables, parameter selectors, metrics, and detailed diagnostics in the left column.

### Center Workspace

The center column is the main focus.

Recommended modes:

#### Data Mode

Show only the core data task:

- dataset overview,
- data preview,
- variable recognition,
- field roles.

Avoid showing model result tables or run logs here.

#### Model Mode

Show:

- model family/category,
- recommended models,
- target/features selection,
- primary run action.

Advanced parameters should be folded or moved to the right contextual panel.

#### Result Mode

Show:

- natural-language conclusion first,
- key metrics,
- main statistical table,
- secondary tables,
- diagnostics/logs folded or visually secondary.

#### Report Mode

Show:

- publication-style table builder,
- export format selection,
- paper-writing suggestions,
- report/export preview.

### Right Context Panel

Right panel should dynamically support the current center workspace.

Data mode:

- data summary,
- variable type recognition,
- missing values,
- quality warnings,
- panel balance checks.

Model mode:

- model recommendation,
- method explanation,
- parameter interpretation,
- assumption/risk reminders.

Result mode:

- significance interpretation,
- coefficient direction explanation,
- robustness suggestions,
- thesis/paper writing suggestions.

Report mode:

- export guidance,
- table formatting notes,
- academic writing suggestions.

---

## Styling Guidelines

Use the existing design token system in `src/index.css`.

Keep the style:

- professional,
- calm,
- low-density,
- desktop software-like,
- academic/statistical.

Avoid:

- colorful dashboard widgets,
- logistics/admin-system visual language,
- overuse of cards,
- large decorative gradients,
- big-screen data visualization style,
- unnecessary animations,
- mobile-first consumer app aesthetics.

---

## Statistical and Modeling Safety Rules

Do not change statistical formulas, econometric assumptions, or model results unless explicitly asked.

Especially avoid changing:

- regression logic,
- standard error handling,
- p-value calculations,
- mediation/moderation logic,
- spatial model calculation,
- threshold logic,
- fixed effects logic,
- export table values.

If refactoring model code, preserve output compatibility:

```ts
ModelResult {
  id
  summary
  tables
  diagnostics
  warnings?
  message
}
```

Model plugins should continue to follow `src/models/types.ts`.

---

## Electron / IPC Safety Rules

Be careful with:

```text
electron/main.cjs
electron/preload.cjs
```

Rules:

- Do not enable `nodeIntegration`.
- Keep `contextIsolation: true`.
- Do not expose unrestricted IPC channels.
- Validate payloads before sending to Python backend.
- Do not allow arbitrary command execution from renderer.
- Keep Python backend calls narrow and explicit.

---

## Definition of Done

A frontend optimization is done only when:

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run build` passes.
- The three-column workbench layout is preserved.
- Data import still works.
- Model run still works.
- Existing result tables still render.
- Export still works.
- No statistical calculation behavior is changed unintentionally.
