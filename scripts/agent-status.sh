#!/usr/bin/env bash
set -euo pipefail

echo "== Agent files =="
test -f AGENTS.md && echo "OK AGENTS.md" || echo "MISS AGENTS.md"
test -f .agents/frontend-implementer.md && echo "OK .agents/frontend-implementer.md" || echo "MISS .agents/frontend-implementer.md"
test -f .agents/refactor-implementer.md && echo "OK .agents/refactor-implementer.md" || echo "MISS .agents/refactor-implementer.md"
test -d .agent-tasks && echo "OK .agent-tasks/" || echo "MISS .agent-tasks/"

echo
echo "== Hermes profiles =="
command -v vs-frontend >/dev/null 2>&1 && echo "OK vs-frontend" || echo "MISS vs-frontend"
command -v vs-refactor >/dev/null 2>&1 && echo "OK vs-refactor" || echo "MISS vs-refactor"

echo
echo "== Git status =="
git status --short || true
