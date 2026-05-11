# Codex-only Agent Workflow

This project uses a local Codex-only multi-agent workflow. The workflow keeps planning, execution, review, and merge decisions separated while avoiding external agent profiles.

The workflow now uses a lightweight Meta_Kim governance overlay. Meta_Kim is treated as a method source, not as a runtime dependency. The local contract lives at:

```text
.codex/governance/meta-kim-contract.md
```

It also adapts Karpathy-inspired coding discipline from `forrestchang/andrej-karpathy-skills`:

```text
.codex/governance/karpathy-guidelines.md
```

That discipline adds four gates to everyday work: surface assumptions, keep the solution simple, make surgical changes, and verify against explicit goals.

## Architecture

```text
Codex Architect
  Runs in visual-stats-web/
  Plans tasks, writes task briefs, reviews diffs, recommends merge decisions

Codex Frontend
  Runs in ../visual-stats-web-frontend/
  Executes UI, JSX, CSS, layout, and interaction tasks

Codex Refactor
  Runs in ../visual-stats-web-refactor/
  Executes component, hook, utility, and pure-function refactors
```

## Directories

```text
visual-stats-web/             # main repository for planning and review
visual-stats-web-frontend/    # frontend execution worktree
visual-stats-web-refactor/    # refactor execution worktree
```

Task briefs live in:

```text
.agent-tasks/
```

Review packs live in:

```text
.agent-reviews/
```

## Daily Flow

1. User gives a requirement to Codex Architect in `visual-stats-web/`.
2. Codex Architect reads `AGENTS.md`, `.agents/codex-architect.md`, `.codex/governance/meta-kim-contract.md`, and `.codex/governance/karpathy-guidelines.md`.
3. Codex Architect applies `Critical -> Fetch -> Thinking` before tasking.
4. Codex Architect creates a narrow task brief in `.agent-tasks/` with `intentPacket`, `fetchPacket`, `dispatchBoard`, and Karpathy discipline fields.
5. Sync workflow files and tasks to worktrees:

```bash
./scripts/agent-sync-worktrees.sh
```

6. Print execution guidance:

```bash
./scripts/agent-dispatch-task.sh .agent-tasks/TASK-xxx.md
```

7. User enters the printed worktree and starts Codex:

```bash
cd ../visual-stats-web-frontend
codex --auto-edit
```

or:

```bash
cd ../visual-stats-web-refactor
codex --auto-edit
```

8. Execution agent reads the task brief and modifies only allowed files.
9. Execution agent runs the task's test commands and outputs `verificationResult` plus `evolutionWriteback`.
10. Export a review pack from the execution worktree:

```bash
./scripts/agent-export-review-pack.sh .agent-tasks/TASK-xxx.md
```

11. Codex Architect reviews the pack in the main repository.
12. Codex Architect performs a Meta-Review check on review quality when risk is non-trivial.
13. User decides whether and how to merge.

## Karpathy Discipline Mapping

| Principle | Local Practice |
|---|---|
| Think Before Coding | Record assumptions and ask when ambiguity would change the plan |
| Simplicity First | Avoid speculative features and one-off abstractions |
| Surgical Changes | Touch only files and lines traceable to the task brief |
| Goal-Driven Execution | Define verification goals and report fresh evidence |

## Meta_Kim Stage Mapping

| Stage | Local Practice |
|---|---|
| Critical | Clarify goal, success criteria, and out-of-scope items |
| Fetch | Search existing files, agents, prompts, scripts, and capabilities |
| Thinking | Create task brief and dispatch board |
| Execution | Run Codex Frontend or Codex Refactor in an isolated worktree |
| Review | Export and inspect `.agent-reviews/` pack |
| Meta-Review | Check whether the review covered the right risks |
| Verification | Run task commands or explicit manual checks |
| Evolution | Update workflow docs/prompts/scripts only when a reusable lesson exists |

## Common Commands

Create a task skeleton:

```bash
./scripts/agent-new-task.sh TASK-001 "Codex Frontend" "任务标题"
./scripts/agent-new-task.sh TASK-002 "Codex Refactor" "任务标题"
```

List tasks:

```bash
./scripts/agent-list-tasks.sh
```

Sync worktrees:

```bash
./scripts/agent-sync-worktrees.sh
```

Dispatch guidance:

```bash
./scripts/agent-dispatch-task.sh .agent-tasks/TASK-xxx.md
```

Export review pack:

```bash
./scripts/agent-export-review-pack.sh .agent-tasks/TASK-xxx.md
```

Run full verification when a task requires it:

```bash
./scripts/agent-verify.sh
```

Sync workflow files after a confirmed merge:

```bash
./scripts/agent-post-merge-sync.sh
```

## Safety Rules

- Do not commit directly from execution worktrees.
- Do not push directly from any agent.
- Do not modify files outside the task brief.
- Do not change statistical formulas, model assumptions, or result values unless explicitly requested.
- Do not modify `electron/*` unless explicitly requested.
- Do not modify `package.json` or lockfiles unless explicitly requested.
- Final merge decisions belong to the user.
