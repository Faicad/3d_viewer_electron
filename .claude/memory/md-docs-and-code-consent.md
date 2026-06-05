---
name: md-docs-and-code-consent
description: MD documents go in docs/ directory; never write code without explicit consent
metadata:
  type: feedback
---

When asked to write a markdown document, always write it to the project's `docs/` directory (e.g. `docs/some-plan.md`).

Never write or modify source code without the user's explicit consent. This includes creating new files, editing existing files, or running commands that change the codebase.

**Why:** User had to revert unwanted code changes after asking only for an MD document.

**How to apply:** When the user asks for a plan/document/analysis, write ONLY the `.md` file in `docs/`. If code implementation is needed alongside documentation, ask the user first before touching any source files.
