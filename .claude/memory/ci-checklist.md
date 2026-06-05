---
name: ci-checklist
description: Checklist to review before claiming CI passes — prevents repeating past mistakes
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 44cd7c62-534d-4609-a4a1-e0b1c5164ef0
---

When the user asks to run CI, I MUST follow this checklist.

**Why:** Repeatedly claimed "CI passes" when it didn't. Root causes: (1) used individual steps instead of the actual CI script, (2) ignored stderr, (3) tee swallowed exit codes, (4) dismissed errors as "pre-existing."

**How to apply:**

1. **Run the actual CI script, not individual commands.**
   - `node scripts/local-ci.mjs`
   - Do NOT run `npx vitest run` or `pnpm run build` separately and claim CI passes.

2. **`local-ci.mjs` handles output capture automatically.**
   - All console output is piped to `ci-logs/ci-output-{timestamp}.txt` in real-time.
   - After all steps complete, the script scans the log for error patterns (Error:, FAIL, Unhandled, timeout, etc.).
   - Report the log file path to the user after every CI run.

3. **Check ALL output — not just the exit code.**
   - `local-ci.mjs` performs dual check: exit code + error-pattern scan on the log.
   - If the scan finds errors but exit code is 0, CI still reports FAILED.
   - Agent must verify both: exit code 0 AND no errors in log.

4. **If a step fails, record the error before proceeding.**
   - `local-ci.mjs` stops on first failure.
   - Read the log file to understand what went wrong.
   - Fix each failure one by one — never batch-fix and assume success.

5. **Don't dismiss errors as "pre-existing" or "unrelated."**
   - Every error in CI is my responsibility until proven otherwise.
   - Verify pre-existing claims by running `git stash` + CI on the clean branch.

6. **Check for non-deterministic errors.**
   - Run flaky-looking tests at least 2-3 times.
   - `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending` is a known vitest race condition.

Related: [[fix-all-test-failures]] [[feedback_precommit]]
