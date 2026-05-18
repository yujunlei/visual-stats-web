# Design Direction Prompt

Use this prompt as the fixed visual direction for all Open Design runs.

```text
Design direction: Enterprise Academic statistical workbench.

Create a professional desktop-style statistical modeling application for researchers.
The atmosphere should be calm, precise, academic, trustworthy, and low-noise.

The product should feel closer to Stata, SPSS, RStudio, EViews, or a clean academic econometrics tool than to a SaaS dashboard.

Use a light interface with subtle contrast:
- pale gray or warm off-white canvas;
- white or near-white panels;
- thin neutral borders;
- restrained dark teal or deep green primary accent;
- limited warning/danger colors only for real status;
- no decorative gradients;
- no glowing visuals;
- no colorful KPI dashboard language.

Typography should feel stable and readable:
- system sans-serif or quiet professional sans for UI;
- monospace only for formulas, coefficients, code-like labels, and numeric tables;
- headings large enough to scan but not heroic;
- no marketing-scale hero typography inside the application.

Layout rules:
- Preserve a three-column workbench.
- Left column is a lightweight project index, not a dense control panel.
- Center column owns the current task.
- Right column provides context, interpretation, warnings, and secondary actions.
- Avoid nested cards and decorative panels.
- Use subtle separators and section headers instead of excessive card grids.

Information hierarchy:
- Each workspace should emphasize one task.
- Do not show data table, model parameters, logs, diagnostics, and results with equal priority.
- Result view must put natural-language conclusion before technical tables.

Interaction style:
- Desktop software controls are preferred: segmented workspace switch, tabs, select menus, checkboxes, compact icon buttons, table controls, and explicit disabled states.
- Use icons only for clear tools/actions.
- Keep animations minimal and functional.

Hard anti-patterns:
- Do not create a landing page.
- Do not create a colorful SaaS admin dashboard.
- Do not use oversized decorative charts as the main visual language.
- Do not use purple-blue gradients, glassmorphism, neon, bokeh, or decorative orbs.
- Do not collapse the product into a linear wizard.
```

