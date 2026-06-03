# macOS CI Playwright Test Failure Analysis

**Run**: https://github.com/Faicad/3d_viewer_electron/actions/runs/26631211356
**Job**: ci (macos-latest)
**Commit**: 2c0f217 - feat: add ci-playwright retry script to reduce flaky test false positives

## Script behavior (correct)

The new `ci-playwright.mjs` script worked as designed:

1. **First attempt**: 49 passed, 1 failed
2. **Detected failure**: `shadow-diag.spec.ts:10` → within threshold (≤3), entering retry
3. **Individual retry**: Re-ran `shadow-diag.spec.ts:10` alone
4. **Retry also failed** → correctly reported as real failure (not a flaky false positive)

## The failing test

**`src/test/shadow-diag.spec.ts:10:1` — shadow visibility diagnostic**

```
Error: should have dark pixels indicating shadows on the ground
Expected: true
Received: false
```

### Diagnostic output:
```
bgBrightness: 125
darkCount: 16 / 27435 samples
minBrightness: 12
brightnessHistogram: [12, 6, 27282, 6, 129]
hasDarkPixels: false
```

## Root cause

The test checks `hasDarkPixels` to verify shadows are visible on the ground plane. On macOS CI, the renderer produces 16 dark pixels (brightness ≤ some threshold) but the test's `hasDarkPixels` check returns `false` — meaning the threshold for "dark enough to count" is not met, or the shadow rendering behaves differently on macOS GPU/software rendering.

This is a **genuine test failure** (macOS-specific rendering difference), not a flaky test. The retry script correctly identified it as a real failure rather than a transient one.

## Other platforms

- **ubuntu-latest**: Had its own failures (expected per user)
- **windows-latest**: Had its own failures (expected per user)
