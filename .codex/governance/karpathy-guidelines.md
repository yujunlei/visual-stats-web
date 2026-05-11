# Karpathy-Inspired Execution Guidelines for visual-stats-web

Source of inspiration:

```text
https://github.com/forrestchang/andrej-karpathy-skills
```

This repository adapts the upstream guidelines as local Codex execution discipline. It does not install a Claude plugin or vendor upstream runtime files.

Use these rules when planning, implementing, reviewing, or refactoring.

## 1. Think Before Coding

Do not silently pick an interpretation when the request is ambiguous.

Required behavior:

- State important assumptions.
- Present meaningful tradeoffs when there are multiple viable paths.
- Push back when a simpler or safer approach exists.
- Stop and ask when uncertainty would materially change the implementation.

Local mapping:

- Codex Architect records assumptions in the task brief.
- Execution agents preserve assumptions from the task brief and do not reinterpret scope.
- Review checks whether the implementation relied on hidden assumptions.

## 2. Simplicity First

Use the minimum implementation that solves the task.

Avoid:

- speculative features;
- abstractions used only once;
- configurable systems that were not requested;
- defensive branches for impossible cases;
- broad rewrites when a narrow change is enough.

Local mapping:

- Task briefs should keep `Goal` and `Allowed Files` narrow.
- Codex Refactor should prefer extracting existing code over inventing new architecture.
- Codex Frontend should match existing UI patterns before adding new layout systems.

## 3. Surgical Changes

Touch only what the task requires.

Rules:

- Do not improve adjacent code, comments, formatting, or naming unless required.
- Do not remove unrelated dead code.
- Match existing style, even when a different style looks nicer.
- Clean up only imports, variables, functions, and files made unused by the current change.

Local mapping:

- Every changed line should trace back to the task brief.
- Review must flag drive-by cleanup and unrelated refactors.
- Existing dirty worktree changes must be treated as user-owned unless explicitly assigned.

## 4. Goal-Driven Execution

Turn tasks into verifiable goals.

Required behavior:

- Define success criteria before implementation.
- Tie each implementation step to a check.
- Run the task's required verification commands.
- Report command output or explain why verification could not be run.

Local mapping:

- Task briefs include acceptance criteria and test commands.
- Execution agents output `verificationResult`.
- Codex Architect checks evidence before recommending merge.

## Review Checklist Add-on

For any implementation review, ask:

```text
Assumptions: Were any important assumptions hidden?
Simplicity: Is the solution larger or more abstract than needed?
Surgicality: Did every changed line belong to the task?
Verification: Is completion backed by fresh evidence?
```

If the answer to any item is no, record a review finding.
