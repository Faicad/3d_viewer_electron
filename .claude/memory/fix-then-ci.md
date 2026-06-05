---
name: fix-then-ci
description: Fix individual failing tests first, then run full CI — never run full suite to "check"
metadata:
  type: feedback
---

When CI fails, identify each failing test from the CI output. Run ONLY those specific failing tests individually (e.g. `pnpm exec playwright test src/test/file.spec.ts:153` for Playwright, `pnpm exec vitest run path/to/test` for vitest). Fix them one by one.

Only after ALL known failures are fixed, run `node scripts/local-ci.mjs` once to confirm.

**Never run the full E2E suite (`pnpm exec playwright test`) or full unit test suite (`pnpm exec vitest run`) as an intermediate "check".** That's what CI does and it's far too time-consuming (full E2E takes 2+ minutes). Always run only the specific failing test file + line number.

**Why:** Running full E2E suite then CI is completely redundant — both run the same tests. Full E2E wastes 2+ minutes. Only CI runs the full suite.

**How to apply:**
1. Parse CI output for all failing test names and line numbers
2. Run each failing test individually with precise filters
3. Fix them
4. When all pass individually → run `node scripts/local-ci.mjs`
