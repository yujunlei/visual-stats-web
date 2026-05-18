# Visual Stats Lab Open Design Input Pack

This pack prepares Visual Stats Lab for a full-product visual redesign in Open Design.

Open Design path:

```bash
cd /Users/dengjy16/Documents/open-design
corepack enable
pnpm tools-dev run web
```

Local environment note:

```text
Open Design requires Node ~24 and pnpm 10.33.2.
If the default shell node crashes or reports a Node 25.x Homebrew runtime,
switch to Node 24 with nvm/fnm before running Open Design.
```

Recommended Open Design setup:

```text
Design System: enterprise
Backup Design System: professional
First-pass Skill: dashboard
Page-pass Skill: web-prototype or dashboard
Review Skill: critique
```

## Files

```text
product-brief.md
  Product identity, users, core workflows, and hard product constraints.

design-direction-prompt.md
  Enterprise Academic visual direction. Use this as the design direction anchor.

od-master-prompt.md
  First prompt to generate the full Visual Stats Lab workbench concept.

screen-prompts.md
  Copy-ready prompts for Data, Model, Result, Report, Publication, License,
  Export, Model Library, Variable Setup, and Data Preview screens.

reference-pack.md
  Screenshot checklist, reference products, anti-references, and naming rules.

implementation-notes.md
  Technical and workflow constraints for turning OD artifacts into repo tasks.

od-workflow.md
  Suggested end-to-end Open Design session flow.
```

## Usage

1. Start Open Design with `pnpm tools-dev run web`.
2. Create a project named `Visual Stats Lab Redesign`.
3. Select `enterprise` as the design system.
4. Select `dashboard` as the first skill.
5. Paste `od-master-prompt.md`.
6. Save the generated artifact.
7. Use `screen-prompts.md` to generate key screens one by one.
8. Use `critique` to review each artifact.
9. Convert the chosen direction into `.agent-tasks/` implementation tasks in this repository.

## Acceptance

The generated design should look like a professional statistical desktop workbench:

- closer to Stata, SPSS, RStudio, EViews, or a clean academic econometrics tool;
- not like a colorful SaaS dashboard;
- not like a logistics/admin backend;
- not like a marketing landing page;
- not like a big-screen data visualization wall.
