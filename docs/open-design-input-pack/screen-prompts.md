# Screen Prompts

Use these after the first master artifact. Keep `enterprise` as the design system unless a later critique shows a clear problem.

## Data Workspace

Recommended skill: `dashboard` or `web-prototype`

```text
Create the Data workspace for Visual Stats Lab.

Use the Enterprise Academic statistical workbench direction.

Keep the three-column layout:
- Left: project index with current dataset, current model placeholder, history snapshots.
- Center: data task only.
- Right: data context panel.

Center workspace should focus on imported spreadsheet data:
- dataset overview;
- file name, row count, field count;
- compact data preview table;
- variable type recognition list;
- ID, Time, Group field role controls;
- missing value alert if applicable;
- primary action to confirm data roles and continue to model setup.

Right context panel should show:
- data quality summary;
- missing values;
- likely ID/time/group fields;
- panel balance check;
- warnings about fields that should not enter the regression as model variables.

Avoid:
- model result tables;
- logs;
- decorative charts;
- colorful KPI dashboard cards.
```

## Model Workspace

Recommended skill: `dashboard`

```text
Create the Model workspace for Visual Stats Lab.

Use the Enterprise Academic statistical workbench direction.

Keep the three-column layout:
- Left: project index and current dataset/model/history.
- Center: model selection and variable setup.
- Right: model context and assumptions.

Center workspace should show:
- model family/category selector;
- recommended models;
- selected model identity;
- target variable selector;
- core explanatory variables;
- control variables;
- inference settings;
- primary Run Model action.

Right context panel should show:
- method explanation;
- when to use this model;
- variable interpretation;
- standard error/cluster warning;
- run readiness checklist;
- advanced parameters folded as secondary content.

The design should feel like professional econometrics software. It should not feel like a SaaS onboarding wizard.
```

## Result Workspace

Recommended skill: `dashboard`

```text
Create the Result workspace for Visual Stats Lab.

Use the Enterprise Academic statistical workbench direction.

Keep the three-column layout:
- Left: project index and saved result snapshots.
- Center: result reading surface.
- Right: interpretation and next actions.

Center result order must be:
1. Natural-language core conclusion.
2. Significance and coefficient direction explanation.
3. Key metrics.
4. Main regression/statistical table.
5. Secondary tables.
6. Diagnostics/logs/export options as visually secondary.

Show a realistic regression result:
- model name;
- formula;
- N, R-squared, adjusted R-squared, p-value;
- coefficient table with coefficient, standard error, t/z, p-value, confidence interval.

Right context panel should show:
- significant terms;
- positive/negative direction explanation;
- robustness suggestions;
- paper-writing suggestions;
- export and publication table actions.

Avoid:
- giving diagnostics equal visual priority to the conclusion;
- large decorative charts;
- colorful dashboard KPI language.
```

## Report Workspace

Recommended skill: `web-prototype` or `dashboard`

```text
Create the Report workspace for Visual Stats Lab.

Use the Enterprise Academic statistical workbench direction.

Keep the three-column layout:
- Left: project index and available result snapshots.
- Center: publication table and export preparation.
- Right: report/export guidance.

Center workspace should show:
- publication-style table builder;
- source model/results selection;
- variable rows;
- statistic rows;
- formatting options;
- live publication table preview;
- export format selector for Excel, HTML, Word, CSV, JSON.

Right context panel should show:
- table formatting notes;
- academic writing suggestions;
- export readiness checklist;
- warnings about missing coefficients or incomplete result sources.

Design the publication table preview like an academic paper table: restrained, readable, black text, thin rules, no decorative colors.
```

## Publication Table Workspace

Recommended skill: `web-prototype`

```text
Create the custom publication table workspace for Visual Stats Lab.

This mode may use a wider center surface than the normal three-column workbench, but it should still feel connected to the desktop application.

Show:
- result source selection;
- model comparison sources;
- column ordering;
- variable row labels;
- statistic row controls;
- format rules;
- saved table templates;
- live table preview.

The preview table should be the visual focus. It should resemble a publication-ready three-line academic table.

Keep styling calm and professional. Avoid spreadsheet clutter and avoid dashboard charts.
```

## License Dialog

Recommended skill: `web-prototype`

```text
Create the License activation dialog for Visual Stats Lab.

Use the Enterprise Academic direction.

The dialog should feel like a desktop software license panel, not a SaaS pricing page.

Show:
- current license status;
- plan;
- expiration date;
- enabled model packs;
- license key input;
- activate button;
- start trial button;
- refresh license button;
- deactivate local license button;
- clear note that the client stores a signed certificate and does not store private keys.

Keep the modal compact, calm, and trustworthy.
```

## Export Dialog

Recommended skill: `web-prototype`

```text
Create the Export dialog for Visual Stats Lab.

Use the Enterprise Academic direction.

Show:
- selected model and result count;
- export format selector: Excel, HTML, Word, CSV, JSON;
- selectable export contents: summary, coefficient table, diagnostics, logs, config JSON, publication table;
- quick actions: core results, clear, all;
- export progress/disabled state;
- error state.

The dialog should feel like a desktop report export dialog. Avoid marketing copy.
```

## Model Library

Recommended skill: `dashboard` or `web-prototype`

```text
Create the Model Library modal for Visual Stats Lab.

Use the Enterprise Academic direction.

Show:
- current model;
- draft model to apply;
- search input;
- category tabs;
- recent models;
- model cards grouped by task family;
- maturity/status badge;
- full model name;
- method use case;
- sticky footer with selected model and Apply button.

The modal should support quick scanning by researchers. It should not feel like an app marketplace.
```

## Variable Setup

Recommended skill: `web-prototype`

```text
Create the Variable Setup modal for Visual Stats Lab.

Use the Enterprise Academic direction.

Show a three-pane desktop setup surface:
- left: model fields, target variable, core explanatory variables, controls;
- middle: inference settings, standard errors, cluster field, advanced parameters;
- right: run readiness checklist, formula preview, warnings, run action.

Use familiar desktop controls: select menus, checkboxes, compact field lists, disabled states.

Do not turn this into a multi-page wizard. It is a professional configuration surface.
```

## Data Preview Dialog

Recommended skill: `web-prototype`

```text
Create the Data Preview dialog for Visual Stats Lab.

Use the Enterprise Academic direction.

Show:
- field inspector;
- variable type selector;
- role selector for model/id/time/group;
- data preview table with sticky header;
- missing value and quality indicators;
- panel diagnosis strip;
- confirm/cancel actions.

The preview table should be readable and dense enough for spreadsheet users, but not visually overwhelming.
```

