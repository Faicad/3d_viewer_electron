---
name: ci-debug-workflow
description: Never rerun full CI blindly — isolate failing step first, fix, verify, then re-run CI
metadata:
  type: feedback
---

When CI fails, follow this workflow. **NEVER rerun full CI blindly.**

**Why:** Rerunning CI is extremely slow (~6 min for full pipeline). Blind retries waste time and mask real failures.

**How to apply:**

1. **Identify the failing step.** Read the CI output to find which exact step failed (tsc / lint / vitest / build / playwright).

2. **Isolate and reproduce.** Run ONLY the failing step/command to confirm the failure is reproducible. For test failures, run only the specific test file or individual test case.

3. **Fix the issue.** Make the minimal code change needed.

4. **Verify the fix.** Run the isolated failing step/test again to confirm it passes.

5. **Run affected tests.** Think about which other code paths might be affected by the change, and run those tests too.

6. **Only then run CI.** `node scripts/local-ci.mjs` — the full pipeline, ONE time.

Never skip to step 6. Steps 1-5 are non-negotiable.
