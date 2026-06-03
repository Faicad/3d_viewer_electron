# CI pipeline for Windows
# Fast checks (~30s): typecheck + lint + unit tests + component tests
# Slow checks (~3min): build + E2E tests

$ErrorActionPreference = "Stop"

$PSNativeCommandUseErrorActionPreference = $true

$totalSw = [System.Diagnostics.Stopwatch]::StartNew()
$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
    $scriptDir = (Get-Location).Path
}
$timeFile = "$scriptDir\time_ci.ps1.txt"

function Exit-OnFail {
    param([string]$StepName)
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "  FAILED: $StepName (exit code $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

function Step {
    param([string]$Label, [ScriptBlock]$Script)
    Write-Host ""
    Write-Host "========================================"
    Write-Host "  $Label"
    Write-Host "========================================"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & $Script
    $sw.Stop()
    Exit-OnFail $Label
    Write-Host "  OK  (${sw.Elapsed})" -ForegroundColor Green
}

# ---- Steps ----

Step "1/7  Type check (tsc --noEmit)" {
    pnpm exec tsc --noEmit
}

Step "2/7  Lint (eslint --max-warnings 0)" {
    pnpm exec eslint . --max-warnings 0
}

Step "3/7  Unit tests (vitest, node env)" {
    pnpm exec vitest run
}

Step "4/7  Component & integration tests (vitest, jsdom env)" {
    pnpm exec vitest run --config vitest.jsdom.config.ts
}

Step "5/7  Build (build:unpacked)" {
    Remove-Item -Recurse -Force dist\win-unpacked, out -ErrorAction SilentlyContinue
    pnpm run build:unpacked
}

Step "6/7  E2E tests (playwright)" {
    # Kill any leftover Electron processes from previous runs
    Get-Process "3D_Viewer" -ErrorAction SilentlyContinue | Stop-Process -Force
    pnpm exec playwright test
}

$totalSw.Stop()

$total = $totalSw.Elapsed
$totalSeconds = [int]$total.TotalSeconds
$totalStr = "$($total.Hours)h $($total.Minutes)m $($total.Seconds)s"

# Read previous time (seconds)
$prevSeconds = $null
$prevStr = ""
if (Test-Path -LiteralPath $timeFile) {
    $content = Get-Content -LiteralPath $timeFile -Raw
    $content = $content.Trim()
    if ($content -match '^\d+$') {
        $prevSeconds = [int]$content
        $prevTs = [TimeSpan]::FromSeconds($prevSeconds)
        $prevStr = "$($prevTs.Hours)h $($prevTs.Minutes)m $($prevTs.Seconds)s"
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  All checks and tests passed" -ForegroundColor Green
Write-Host "  Total time: $totalStr" -ForegroundColor Green

if ($prevSeconds) {
    Write-Host "  Previous:    $prevStr" -ForegroundColor Green
}

Write-Host "========================================" -ForegroundColor Green

# Check for 10%+ slowdown vs previous run
$slowdown = $false
if ($prevSeconds -and $prevSeconds -gt 0) {
    $threshold = $prevSeconds * 110 / 100
    if ($totalSeconds -gt $threshold) {
        $slowdown = $true
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "  ERROR: Performance regression detected" -ForegroundColor Red
        Write-Host "  Current ($totalStr) is > 110% of previous ($prevStr)" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
    }
}

# Save current time for next comparison (only if no regression)
if (-not $slowdown) {
    $totalSeconds | Out-File -LiteralPath $timeFile -Encoding utf8
    exit 0
} else {
    exit 1
}
