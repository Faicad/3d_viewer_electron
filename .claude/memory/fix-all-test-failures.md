---
name: fix-all-test-failures
description: Critical rule — all test failures must be memorized and fixed one by one
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 44cd7c62-534d-4609-a4a1-e0b1c5164ef0
---

The user explicitly stated: **所有测试失败必须记住。必须随后尝试一个一个修复。** (All test failures must be remembered/memorized. Must then attempt to fix them one by one.)

**Why:** The user wants every failing test to be systematically tracked and addressed, not skipped or dismissed as "unrelated." Previously I was about to dismiss E2E failures as pre-existing, which the user considered "推卸责任" (shirking responsibility).

**How to apply:** When encountering ANY test failure:
1. Record/memorize each individual failure
2. Investigate the root cause
3. Fix them one by one
4. Never dismiss failures as "pre-existing" or "environment-specific" without first attempting a fix
