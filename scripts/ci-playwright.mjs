#!/usr/bin/env node
import { spawnSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RETRY_THRESHOLD = 3
const IS_LINUX = process.platform === 'linux'
const IS_WINDOWS = process.platform === 'win32'

/** Clean environment: remove proxy vars that can interfere with local dev */
function cleanEnv() {
  const env = { ...process.env }
  for (const key of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'no_proxy', 'NO_PROXY']) {
    delete env[key]
  }
  return env
}

/** Read Playwright JSON report file, return null if not found */
function readReportFile(filePath) {
  try {
    return readFileSync(filePath, 'utf-8').trim()
  } catch {
    return null
  }
}

/**
 * Build the command and args for running Playwright.
 * On Linux we wrap with xvfb-run for headless CI.
 */
function buildPlaywrightCmd(testFilter = []) {
  if (IS_LINUX) {
    return {
      cmd: 'xvfb-run',
      args: ['--auto-servernum', 'pnpm', 'exec', 'playwright', 'test', ...testFilter],
    }
  }
  return {
    cmd: 'pnpm',
    args: ['exec', 'playwright', 'test', ...testFilter],
  }
}

/**
 * Run Playwright tests and retry flaky failures.
 *
 * Strategy:
 *   1. Run all tests with `--reporter=list` (human-readable).
 *      JSON report is written to a file via PLAYWRIGHT_JSON_OUTPUT_NAME.
 *   2. Parse the JSON report file to find failed specs.
 *   3. If ≤ RETRY_THRESHOLD failures, re-run each individually.
 *   4. Exit 0 only if all retries pass.
 */
function main() {
  // Pass through CLI args (e.g., "app.spec.ts:4 app.spec.ts:28") to playwright
  const testFilter = process.argv.slice(2)

  // ── Step 1: Run all integration tests ────────────────────────────────
  console.log('\n=== Integration tests (first attempt) ===\n')

  const reportDir = resolve(ROOT, 'test-results')
  const reportFile = resolve(reportDir, 'playwright-report.json')

  const env = cleanEnv()
  env.PLAYWRIGHT_JSON_OUTPUT_NAME = reportFile

  const { cmd, args } = buildPlaywrightCmd([
    '--workers=2',
    '--reporter=list,json',
    ...testFilter,
  ])

  const pw = spawnSync(cmd, args, {
    cwd: ROOT,
    shell: IS_WINDOWS,
    stdio: 'inherit',
    encoding: 'utf-8',
    env,
  })

  const jsonOutput = readReportFile(reportFile)
  const exitCode = pw.status ?? 1

  // Also show the JSON to the user (truncated)
  const passMatch = jsonOutput ? jsonOutput.match(/"expected"\s*:\s*(\d+)/) : null
  const failMatch = jsonOutput ? jsonOutput.match(/"unexpected"\s*:\s*(\d+)/) : null
  const passed = passMatch ? parseInt(passMatch[1]) : '?'
  const failed = failMatch ? parseInt(failMatch[1]) : '?'
  console.log(`\nResults: ${passed} passed, ${failed} failed`)

  if (exitCode === 0) {
    console.log('\n✓ All integration tests passed.')
    process.exit(0)
  }

  // ── Step 2: Parse failures ──────────────────────────────────────────
  let report
  try {
    report = jsonOutput ? JSON.parse(jsonOutput) : null
    if (!report) throw new Error('empty report')
  } catch {
    console.error('\n✘ Failed to parse Playwright JSON output.')
    process.exit(1)
  }

  const failedSpecs = []
  function visit(suite) {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        if (t.status === 'unexpected') {
          failedSpecs.push(`${spec.file}:${spec.line}`)
        }
      }
    }
    for (const child of suite.suites || []) visit(child)
  }
  visit(report)

  if (failedSpecs.length === 0) {
    console.error('\n✘ Tests failed but no unexpected specs found in JSON report.')
    process.exit(1)
  }

  if (failedSpecs.length > RETRY_THRESHOLD) {
    console.error(`\n✘ ${failedSpecs.length} failures exceeds threshold of ${RETRY_THRESHOLD}.`)
    process.exit(1)
  }

  // ── Step 3: Retry each failed test individually ─────────────────────
  console.log(`\n=== Retrying ${failedSpecs.length} flaky failure(s) individually ===\n`)

  // Support PW_RETRY_DELAY_MS for testing (pause before retry, allows
  // manual fix of flaky tests to verify retry mechanism)
  const retryDelay = parseInt(process.env.PW_RETRY_DELAY_MS || '0', 10)
  if (retryDelay > 0) {
    console.log(`Waiting ${retryDelay}ms before retry (PW_RETRY_DELAY_MS)...`)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelay)
  }

  let allPassed = true
  for (const spec of failedSpecs) {
    console.log(`Re-running: ${spec}`)
    const { cmd: retryCmd, args: retryArgs } = buildPlaywrightCmd([
      '--workers=2',
      '--reporter=line',
      spec,
    ])
    const retry = spawnSync(retryCmd, retryArgs, {
      cwd: ROOT,
      shell: IS_WINDOWS,
      stdio: 'inherit',
      encoding: 'utf-8',
      env: cleanEnv(),
    })

    if (retry.status === 0) {
      console.log(`\n✓ Retry passed: ${spec}`)
    } else {
      console.error(`\n✘ Retry failed: ${spec}`)
      allPassed = false
    }
  }

  if (allPassed) {
    console.log(`\n✓ All ${failedSpecs.length} flaky failure(s) passed on individual retry.`)
    process.exit(0)
  } else {
    console.error(`\n✘ Some retries still failed.`)
    process.exit(1)
  }
}

main()
