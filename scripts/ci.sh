#!/usr/bin/env bash
# Run all CI checks and tests locally
set -euo pipefail

echo "========================================"
echo "  1/5  Type check (tsc --noEmit)"
echo "========================================"
npx tsc --noEmit

echo ""
echo "========================================"
echo "  2/5  Lint (eslint)"
echo "========================================"
npx eslint . --max-warnings 0

echo ""
echo "========================================"
echo "  3/5  Build (electron-vite build)"
echo "========================================"
npm run build

echo ""
echo "========================================"
echo "  4/5  Unit tests (vitest run)"
echo "========================================"
npx vitest run

echo ""
echo "========================================"
echo "  5/5  Integration tests (playwright)"
echo "========================================"
npx playwright test

echo ""
echo "========================================"
echo "  All checks and tests passed"
echo "========================================"