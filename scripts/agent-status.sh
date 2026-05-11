#!/usr/bin/env bash
set -euo pipefail

echo "== Codex agent files =="
test -f AGENTS.md && echo "OK AGENTS.md" || echo "MISS AGENTS.md"
test -f .agents/codex-architect.md && echo "OK .agents/codex-architect.md" || echo "MISS .agents/codex-architect.md"
test -f .agents/codex-frontend.md && echo "OK .agents/codex-frontend.md" || echo "MISS .agents/codex-frontend.md"
test -f .agents/codex-refactor.md && echo "OK .agents/codex-refactor.md" || echo "MISS .agents/codex-refactor.md"
test -f .agents/task-template.md && echo "OK .agents/task-template.md" || echo "MISS .agents/task-template.md"
test -f .agents/review-template.md && echo "OK .agents/review-template.md" || echo "MISS .agents/review-template.md"
test -d .agent-tasks && echo "OK .agent-tasks/" || echo "MISS .agent-tasks/"
test -d .agent-reviews && echo "OK .agent-reviews/" || echo "MISS .agent-reviews/"

echo
echo "== Codex prompts =="
test -f .codex/prompts/architect.md && echo "OK .codex/prompts/architect.md" || echo "MISS .codex/prompts/architect.md"
test -f .codex/prompts/frontend-executor.md && echo "OK .codex/prompts/frontend-executor.md" || echo "MISS .codex/prompts/frontend-executor.md"
test -f .codex/prompts/refactor-executor.md && echo "OK .codex/prompts/refactor-executor.md" || echo "MISS .codex/prompts/refactor-executor.md"
test -f .codex/prompts/review.md && echo "OK .codex/prompts/review.md" || echo "MISS .codex/prompts/review.md"
test -f .codex/governance/meta-kim-contract.md && echo "OK .codex/governance/meta-kim-contract.md" || echo "MISS .codex/governance/meta-kim-contract.md"
test -f .codex/governance/karpathy-guidelines.md && echo "OK .codex/governance/karpathy-guidelines.md" || echo "MISS .codex/governance/karpathy-guidelines.md"

echo
echo "== Git status =="
git status --short || true
