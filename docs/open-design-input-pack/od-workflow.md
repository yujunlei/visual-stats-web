# Open Design Workflow

## 1. Start Open Design

Open Design declares:

```text
Node: ~24
pnpm: 10.33.2
```

If your default shell `node` points to a broken Homebrew Node 25.x runtime, switch to Node 24 first:

```bash
nvm install 24
nvm use 24
# or:
fnm install 24
fnm use 24
```

```bash
cd /Users/dengjy16/Documents/open-design
corepack enable
pnpm tools-dev run web
```

Open the web URL printed by `tools-dev`.

## 2. Create Project

Create a new project:

```text
Visual Stats Lab Redesign
```

Recommended first settings:

```text
Mode: Prototype
Skill: dashboard
Design System: enterprise
Agent: Local CLI or API mode
```

## 3. Generate Master Direction

Paste:

```text
docs/open-design-input-pack/od-master-prompt.md
```

Save the artifact when it renders.

## 4. Generate Key Screens

Use `screen-prompts.md` in this order:

```text
1. Result Workspace
2. Data Workspace
3. Model Workspace
4. Report Workspace
5. Variable Setup
6. Model Library
7. Export Dialog
8. License Dialog
9. Publication Table Workspace
10. Data Preview Dialog
```

Reason: Result is the highest-value screen and anchors the whole product's reading hierarchy.

## 5. Critique Each Artifact

Switch to the `critique` skill and use:

```text
Run a 5-dimension critique on the current Visual Stats Lab artifact.

Score:
- Philosophy consistency
- Visual hierarchy
- Detail execution
- Functionality
- Innovation

Evaluate against this product constraint:
The design must feel like a professional statistical desktop workbench, not a colorful SaaS dashboard, not a logistics/admin backend, and not a marketing landing page.

Return:
- Keep
- Fix
- Quick wins
- Merge recommendation for this visual direction
```

## 6. Selection Criteria

Pick the direction only if:

- the three-column workbench is clear;
- the result reading order is correct;
- the interface looks academic/professional;
- the design can be mapped to existing React/CSS without a new UI library;
- the artifact does not rely on decorative effects that the app should not ship.

## 7. Convert To Implementation Tasks

After choosing a direction, create small `.agent-tasks/` briefs in `visual-stats-web`.

Do not ask an implementation agent to "apply the design" in one pass. Split by surface:

```text
Shell/topbar
Left project index
Right context panel
Data workspace
Model workspace
Result workspace
Report/publication workspace
Modal system
CSS token cleanup
```

Each task must specify allowed files and verification commands.
