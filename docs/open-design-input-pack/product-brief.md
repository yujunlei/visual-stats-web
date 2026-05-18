# Product Brief

## Product

Visual Stats Lab is a React + Vite + Electron desktop-style statistical modeling workbench for spreadsheet-driven analysis.

It should feel like professional statistics software: Stata, SPSS, RStudio, EViews, or a clean academic econometrics tool.

It should not feel like:

- a colorful SaaS dashboard;
- a logistics/admin backend;
- a marketing landing page;
- a flashy data screen;
- a forced onboarding wizard.

## Primary Users

- Statistics researchers
- Economics researchers
- Management researchers
- Social-science researchers
- Students and analysts who work with spreadsheet data and publication tables

These users care about reliable modeling workflow more than visual spectacle.

## Core Jobs

1. Import CSV or XLSX data.
2. Inspect data quality and variable types.
3. Identify ID, time, group, and model variables.
4. Select a statistical or econometric model.
5. Configure target, feature, control, inference, and model-specific parameters.
6. Run the model.
7. Read results in a publication-oriented order.
8. Export tables and reports.
9. Save and restore project snapshots.

## Product Shape

Keep the professional three-column workbench:

```text
Left column:
  Lightweight project index, current dataset, current model, recent results,
  pinned/favorite snapshots, history.

Center workspace:
  Main task focus. One workspace should emphasize one primary task.

Right context panel:
  Explanation, recommendations, warnings, interpretation, export guidance,
  and secondary settings.
```

The product can have a light workspace mode switch:

```text
Data
Model
Result
Report
```

But it must not become a forced step-by-step wizard.

## Key Workspaces

### Data

Primary task: understand imported data.

Show:

- dataset overview;
- data preview;
- variable recognition;
- ID/time/group roles;
- missing value warnings;
- panel balance checks.

Do not show model results here.

### Model

Primary task: choose and configure model.

Show:

- model family/category;
- recommended models;
- target/features/control selection;
- primary run action.

Advanced parameters should be folded or placed in the right context panel.

### Result

Primary task: read the result.

Show in this order:

1. Natural-language core conclusion.
2. Significance and coefficient direction explanation.
3. Key metrics.
4. Main statistical table.
5. Secondary tables.
6. Diagnostics/logs/export options as visually secondary content.

### Report

Primary task: prepare publication output.

Show:

- publication-style table builder;
- export format selection;
- report preview;
- paper-writing suggestions;
- table formatting notes.

## Tone

- Calm
- Academic
- Precise
- Trustworthy
- Low-noise
- Desktop-software-like

Use literal interface language. Avoid marketing copy inside the app.

