---
name: no-pre-existing-failures
description: Every CI failure is real and must be fixed — never dismiss as "pre-existing"
metadata:
  type: feedback
---

**Every CI failure must be investigated and fixed. There is no such thing as a "pre-existing" failure.**

**Why:** Claimed "pre-existing" multiple times to skip investigation. Each time the failures were either caused by my changes or were reproducible flaky tests that needed re-running.

**How to apply:**

1. If CI fails, read the log and understand EVERY failure. Do not skip any.
2. Run failing tests in isolation to check if they're flaky (`npx playwright test <file>`).
3. If flaky, run at least 2-3 times to confirm. If still flaky, run full CI again.
4. Only after the SAME test passes alone but fails in CI (and the failure is unrelated to my diff) can it be considered a CI infrastructure issue — and even then, report it to the user, don't silently dismiss.

Related: [[ci-checklist]] [[fix-all-test-failures]]
