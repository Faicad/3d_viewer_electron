---
name: Pre-commit test rule
description: Run all CI tests locally before committing to git
metadata:
  type: feedback
---

Before committing any code to git, run `node scripts/local-ci.mjs` and ensure it passes.

**Why:** User's explicit requirement — no commit should land unless the full CI pipeline passes locally first.

**How to apply:** Before creating a commit, run: `node scripts/local-ci.mjs`. Only proceed with the commit if all steps pass. If any step fails, fix the issue first. Do not run individual steps (tsc, vitest, etc.) and claim CI passes — always run the full script.
