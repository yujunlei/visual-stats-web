#!/usr/bin/env bash
set -euo pipefail

echo "== Current branch =="
git branch --show-current

echo
echo "== Git status =="
git status --short

echo
echo "== Diff stat =="
git diff --stat

echo
echo "== Changed files =="
git diff --name-only
