---
name: ci-checklist
description: Checklist to review before claiming CI passes — prevents repeating past mistakes
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 44cd7c62-534d-4609-a4a1-e0b1c5164ef0
---

When the user asks to run CI (or I run ci.ps1/ci.sh/npm run ci), I MUST follow this checklist.

**Why:** On 2026-06-03, I repeatedly claimed "CI passes" when it didn't. The root causes were: (1) running individual steps instead of the actual CI script, (2) ignoring stderr, (3) not verifying batch edits, (4) dismissing failures as "pre-existing."

**How to apply:**

1. **Run the actual CI script, not individual commands.**
   - Windows: `.\scripts\ci.ps1` (PowerShell) — ensure `pnpm` is in PATH.
   - If running from bash via `powershell.exe -File`, must prepend pnpm's dir to `$env:PATH` first.

2. **Check ALL output — not just the last line.**
   - Grep for `error`, `Error`, `FAIL`, `Unhandled`, `uncaught`, `stderr` in the FULL log.
   - Never trust "X passed" at the bottom alone.

3. **If a step fails, record the error before proceeding.**
   - Save the full output to a file.
   - List each unique failure before attempting any fix.
   - Fix them one by one — never batch-fix and assume success.

4. **Don't dismiss errors as "pre-existing" or "unrelated."**
   - Every error in CI is my responsibility until proven otherwise.
   - `--ozone-platform-hint=x11` on Windows looked like an "environment issue" but was actually a code bug in 18 test files.

5. **Verify batch edits.**
   - After sed/perl/regex across many files, spot-check at least 5 files.
   - Run the affected tests immediately — don't wait for full CI.

6. **Check for non-deterministic errors.**
   - Run flaky-looking tests at least 2-3 times.
   - `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending` is a known vitest race condition — fix with `teardownTimeout` + `pool: 'forks'`.

Related: [[fix-all-test-failures]]
