# Implementation Notes For Translating OD Artifacts

Open Design artifacts are visual references. The final implementation must follow this repository's workflow and safety rules.

## Tech Stack

```text
React
TypeScript
Vite
Electron
Global CSS
read-excel-file
papaparse
write-excel-file
lucide-react
```

## Current Design Tokens

The current token source is `src/index.css`.

Important existing tokens:

```text
--canvas
--surface
--surface-elevated
--soft
--ink
--ink-secondary
--muted
--line
--line-subtle
--accent
--accent-hover
--accent-subtle
--accent-muted
--accent-strong
--danger
--warning
--mono
--sans
--radius-sm
--radius-md
--radius-lg
```

When implementing an OD direction, map OD colors back into these tokens before changing component styles.

## Implementation Rules

- Do not add a heavy UI library.
- Continue using `lucide-react` icons.
- Keep global CSS unless a task explicitly introduces a component CSS pattern.
- Do not modify statistical formulas, model assumptions, or output values.
- Do not modify Electron IPC/security boundaries unless a task explicitly says so.
- Do not change export table values.
- Do not merge or commit automatically.
- Use `.agent-tasks/` task briefs for implementation work.

## Suggested Task Breakdown After OD Selection

1. App shell and topbar visual cleanup.
2. Left project index redesign.
3. Right contextual panel by workspace.
4. Data workspace redesign.
5. Model workspace redesign.
6. Result workspace redesign.
7. Report/publication workspace redesign.
8. Modal system cleanup: model library, variable setup, data preview, export, license.
9. CSS token consolidation and duplicate style cleanup.
10. Visual regression/manual QA pass.

## Verification For Each Implementation Task

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

Manual checks:

- Data import still works.
- Model run still works.
- Existing result tables still render.
- Export still works.
- Three-column layout remains intact.
- Publication table preview remains readable.
- Electron security boundaries are untouched.

