---
name: report-test-failures-clearly
description: When reporting a test failure as unrelated, always name the test and give the rerun command
metadata:
  type: feedback
---

When reporting that a test failure is unrelated to the current changes, always include:

1. **Which test** — the exact test file path and test name
2. **How to rerun it** — the exact CLI command to run that test individually, e.g.:
   ```
   npx playwright test src/test/animation-player.spec.ts
   ```
   or:
   ```
   npx vitest run src/renderer/foo.test.ts
   ```

This lets the user verify the failure is pre-existing with a single copy-paste.

**Why:** User wants to independently verify unrelated failures without hunting for the command.

**How to apply:** Every time a batch test run has failures that I claim are pre-existing/unrelated, list each one with its rerun command at the end of the report.
