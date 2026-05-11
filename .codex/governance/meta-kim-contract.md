# Meta_Kim Governance Contract for visual-stats-web

This project adapts Meta_Kim as a lightweight governance layer over the local Codex-only workflow.

Meta_Kim source of inspiration:

```text
https://github.com/KimYx0207/Meta_Kim
```

This repository does not vendor or install Meta_Kim. It adapts the governance ideas that fit this project:

- clarify intent before execution;
- discover capabilities before assigning a role;
- create a bounded dispatch packet;
- review implementation output;
- meta-review the review standard when risk is non-trivial;
- verify with real commands or explicit manual checks;
- write back reusable lessons only when useful.

## 8-Stage Spine

Every non-trivial task should follow this spine:

```text
Critical -> Fetch -> Thinking -> Execution -> Review -> Meta-Review -> Verification -> Evolution
```

For small pure-query tasks, stages may be skipped, but the skip reason should be explicit in the final answer or task brief.

## Project Mapping

| Meta_Kim Stage | visual-stats-web Artifact |
|---|---|
| Critical | User requirement, clarified goal, success criteria, exclusions |
| Fetch | Repository search, role files, existing components, scripts, docs |
| Thinking | `.agent-tasks/TASK-xxx.md` with owner, allowed files, risks |
| Execution | Codex Frontend or Codex Refactor worktree changes |
| Review | `.agent-reviews/<task>/` review pack and Codex Architect review |
| Meta-Review | Review-quality check for scope, evidence, and missing risks |
| Verification | `bash -n`, `npm run typecheck`, `npm run lint`, `npm run build`, or task-specific checks |
| Evolution | Optional update to `.agents/`, `.codex/prompts/`, `docs/`, or scripts when the workflow learned something reusable |

## Contract Packets

### intentPacket

Purpose: lock down the real request before implementation.

Minimum fields:

```text
Goal:
Success Criteria:
Out of Scope:
Risk Level:
```

### fetchPacket

Purpose: prove capability discovery happened before dispatch.

Minimum fields:

```text
Files inspected:
Existing workflow assets:
Matching capability:
Capability gaps:
```

### dispatchBoard

Purpose: show who owns execution and where it runs.

Minimum fields:

```text
Assigned Agent:
Worktree:
Allowed Files:
Forbidden Files:
Review Owner:
Verification Commands:
```

### workerTaskPacket

Purpose: the task brief handed to the execution agent.

In this repository, the worker task packet is the `.agent-tasks/TASK-xxx.md` file.

### reviewPacket

Purpose: record what changed and whether it obeys the task.

In this repository, the review packet is exported under `.agent-reviews/` and includes:

```text
task.md
git-status.txt
git-diff-stat.txt
git-diff.diff
review-instructions.md
```

### metaReviewPacket

Purpose: check whether the review itself is strong enough.

Minimum checks:

```text
Did review check forbidden files?
Did review check statistical logic boundaries?
Did review check Electron security boundaries?
Did review check test evidence?
Did review identify residual risk?
```

### verificationResult

Purpose: confirm reality matches the completion claim.

Minimum fields:

```text
Commands run:
Manual checks:
Failures:
Residual risk:
```

### evolutionWriteback

Purpose: preserve reusable lessons without creating noise.

Allowed writeback targets:

```text
AGENTS.md
.agents/*.md
.codex/prompts/*.md
docs/*.md
scripts/agent-*.sh
```

Do not write back into business code unless the user explicitly requests it.

## Gates

| Gate | Pass Condition |
|---|---|
| Planning Gate | Task brief has owner, allowed files, forbidden files, acceptance criteria, tests, risks |
| Execution Gate | Execution agent modifies only allowed files and reports tests |
| Review Gate | Codex Architect finds no blocking issue |
| Meta-Review Gate | Review quality is strong enough for the task risk |
| Verification Gate | Required commands or manual checks have evidence |
| Evolution Gate | Lessons are written back only if reusable |

## Anti-Patterns

- Editing before clarifying a broad request.
- Assigning an agent by name before checking the needed capability.
- Letting one task span unrelated workflows.
- Treating a review as complete without checking forbidden files.
- Claiming completion without verification evidence.
- Writing lessons into business code when they belong in workflow docs.
