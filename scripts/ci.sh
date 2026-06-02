#!/usr/bin/env bash
# CI pipeline — all platforms
# Fast checks (~30s): typecheck + lint + unit tests + component tests
# Slow checks (~3min): build + E2E tests
set -euo pipefail

# Safe exit: works whether script is sourced or executed directly
_ci_exit() {
    # shellcheck disable=SC2317  # called from multiple contexts
    if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
        return "$1"
    fi
    exit "$1"
}

PLATFORM=$(uname -s)

# Detect Windows host regardless of shell:
#   $OS / $os = Windows_NT — cmd, pwsh, Git Bash (uppercase or lowercase)
#   uname -s matches MINGW*/MSYS*/CYGWIN* — Git Bash, MSYS2
#   /mnt/c/Windows exists — WSL bash running on a Windows host
if echo "${OS:-}${os:-}" | grep -q "Windows_NT" ||
   echo "$PLATFORM" | grep -qE "^(MINGW|MSYS|CYGWIN)"; then
  PLATFORM="Windows"
  BUILD_SCRIPT="build:unpacked"
elif [ "$PLATFORM" = "Linux" ]; then
  BUILD_SCRIPT="build:unpacked:linux"
elif [ "$PLATFORM" = "Darwin" ]; then
  BUILD_SCRIPT="build:unpacked:mac"
else
  echo "Unsupported platform: $PLATFORM" >&2
  _ci_exit 1
fi

echo "Platform: $PLATFORM  |  Build: $BUILD_SCRIPT"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TIME_FILE="$SCRIPT_DIR/time_ci.sh.txt"
TOTAL_START=$(date +%s)

step() {
    local label="$1"
    shift
    echo ""
    echo "========================================"
    echo "  $label"
    echo "========================================"
    local start
    start=$(date +%s)
    if ! "$@"; then
        local exit_code=$?
        local end
        end=$(date +%s)
        local elapsed=$((end - start))
        local minutes=$((elapsed / 60))
        local seconds=$((elapsed % 60))
        echo ""
        echo "========================================"
        echo "  FAILED: $label (exit code $exit_code)"
        echo "========================================"
        _ci_exit $exit_code
    fi
    local end
    end=$(date +%s)
    local elapsed=$((end - start))
    local minutes=$((elapsed / 60))
    local seconds=$((elapsed % 60))
    printf "  OK  (%dm %ds)\n" "$minutes" "$seconds"
}

# ---- Steps ----

step "1/7  Type check (tsc --noEmit)" pnpm exec tsc --noEmit

step "2/7  Lint (eslint --max-warnings 0)" pnpm exec eslint . --max-warnings 0

step "3/7  Unit tests (vitest, node env)" pnpm exec vitest run

step "4/7  Component & integration tests (vitest, jsdom env)" pnpm exec vitest run --config vitest.jsdom.config.ts

step "5/7  Build ($BUILD_SCRIPT)" pnpm run "$BUILD_SCRIPT"

step "6/7  E2E tests (playwright)" pnpm exec playwright test --max-failures=1

TOTAL_END=$(date +%s)
TOTAL_ELAPSED=$((TOTAL_END - TOTAL_START))
TOTAL_MINUTES=$((TOTAL_ELAPSED / 60))
TOTAL_SECONDS=$((TOTAL_ELAPSED % 60))
TOTAL_STR="${TOTAL_MINUTES}m ${TOTAL_SECONDS}s"

# Read previous time (seconds)
PREV_SECONDS=""
if [ -f "$TIME_FILE" ]; then
    content=$(cat "$TIME_FILE")
    if [[ "$content" =~ ^[0-9]+$ ]]; then
        PREV_SECONDS=$content
    fi
fi

echo ""
echo "========================================"
echo "  All checks and tests passed"
echo "  Total time: $TOTAL_STR"

if [ -n "$PREV_SECONDS" ]; then
    prev_minutes=$((PREV_SECONDS / 60))
    prev_seconds=$((PREV_SECONDS % 60))
    echo "  Previous:   ${prev_minutes}m ${prev_seconds}s"
fi

echo "========================================"

# Check for 10%+ slowdown vs previous run
SLOWDOWN=false
if [ -n "$PREV_SECONDS" ] && [ "$PREV_SECONDS" -gt 0 ]; then
    threshold=$((PREV_SECONDS * 110 / 100))
    if [ "$TOTAL_ELAPSED" -gt "$threshold" ]; then
        SLOWDOWN=true
        echo ""
        echo "========================================"
        echo "  ERROR: Performance regression detected"
        echo "  Current ($TOTAL_STR) is > 110% of previous (${prev_minutes}m ${prev_seconds}s)"
        echo "========================================"
    fi
fi

# Save current time for next comparison (only if no regression)
if [ "$SLOWDOWN" = false ]; then
    echo "$TOTAL_ELAPSED" > "$TIME_FILE"
    _ci_exit 0
else
    _ci_exit 1
fi
