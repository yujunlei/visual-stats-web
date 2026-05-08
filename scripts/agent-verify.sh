#!/usr/bin/env bash
set -euo pipefail

echo "== npm run typecheck =="
npm run typecheck

echo
echo "== npm run lint =="
npm run lint

echo
echo "== npm run build =="
npm run build

echo
echo "全部检查通过。"
