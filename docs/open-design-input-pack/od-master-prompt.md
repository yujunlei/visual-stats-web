# OD Master Prompt

Use this as the first Open Design prompt.

Recommended setup:

```text
Design System: enterprise
Skill: dashboard
```

Prompt:

```text
Redesign Visual Stats Lab as a full-product desktop statistical modeling workbench.

Product identity:
Visual Stats Lab is a React + Electron statistical modeling workbench for spreadsheet-driven analysis. Users import CSV/XLSX data, inspect variables, choose statistical/econometric models, configure variables and parameters, run models, read results, and export publication-style tables.

Audience:
Statistics, economics, management, and social-science researchers. They care about reliability, clarity, method interpretation, and publication-ready output.

Visual direction:
Enterprise Academic statistical workbench. Calm, precise, academic, professional, low-noise. It should feel closer to Stata, SPSS, RStudio, EViews, or RStudio than to a SaaS dashboard.

Preserve this app structure:
- Top bar with product name, workspace switch, license/status badge, import/run/export actions.
- Three-column workbench.
- Left column: project index, current dataset, current model, recent results, pinned/favorite snapshots, history.
- Center workspace: current primary task.
- Right context panel: explanation, recommendations, warnings, interpretation, and secondary settings.

Workspace modes:
1. Data: dataset overview, preview, variable recognition, ID/time/group roles, missing values, panel balance checks.
2. Model: model family/category, recommended models, target/features/control setup, primary run action, advanced settings as secondary.
3. Result: natural-language conclusion first, significance and direction explanation, key metrics, main statistical table, secondary tables, diagnostics folded or secondary.
4. Report: publication table builder, export format selection, report preview, academic writing suggestions.

Design requirements:
- Light desktop app interface.
- Thin borders, clear hierarchy, calm whitespace.
- Stable table and form controls.
- Professional statistical table styling.
- Right panel should change by workspace.
- Use monospace only for formulas, logs, coefficients, and numeric tables.
- Keep headings readable but not marketing-hero-sized.
- Avoid excessive cards; use structured panels and separators.

Hard constraints:
- Do not make a landing page.
- Do not make a colorful SaaS/admin dashboard.
- Do not make it a forced wizard.
- Do not use decorative gradients, glassmorphism, neon, bokeh, or large decorative charts.
- Do not place all information at equal priority.

Deliverable:
Produce one high-fidelity HTML artifact showing the full desktop workbench in the Result workspace, with visible left project index and right result interpretation panel. Include enough UI detail to infer Data, Model, and Report modes from the workspace switch and context design.

The Result center should show:
- a natural-language core conclusion;
- coefficient direction/significance explanation;
- four key metrics;
- a main regression coefficient table;
- secondary diagnostics collapsed or visually secondary;
- export and publication table actions.
```

