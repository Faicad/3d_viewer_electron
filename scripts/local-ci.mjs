import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const logDir = join(root, 'ci-logs')
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
const logPath = join(logDir, `ci-output-${ts}.txt`)

let failed = false
const t0 = performance.now()
const stepTimes = []

function log(msg) {
  const line = `[ci] ${msg}`
  process.stdout.write(line + '\n')
  appendFileSync(logPath, line + '\n')
}

function run(cmd, args, label) {
  return new Promise((resolve) => {
    const header = '='.repeat(56)
    log(`${header}`)
    log(`  ${label}`)
    log(`${header}`)

    const t1 = performance.now()
    // Pipe stdout+stderr so we can tee them to both terminal and log file.
    // stdin is inherited so interactive prompts (rare) still work.
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' },
    })

    // Tee stdout: write to terminal AND log file in real-time
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk)
      appendFileSync(logPath, chunk)
    })

    // Tee stderr: write to terminal AND log file in real-time
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk)
      appendFileSync(logPath, chunk)
    })

    child.on('close', (code) => {
      const exitCode = code ?? 1
      const elapsed = ((performance.now() - t1) / 1000).toFixed(1)
      stepTimes.push({ label, exitCode, elapsed })

      if (exitCode !== 0) {
        log(`  FAILED (exit ${exitCode}, ${elapsed}s)`)
        failed = true
      } else {
        log(`  OK (${elapsed}s)`)
      }
      resolve(exitCode)
    })

    child.on('error', (err) => {
      log(`  ERROR: ${err.message}`)
      failed = true
      resolve(1)
    })
  })
}

function scanErrors() {
  // stdout+stderr are now teed to both terminal and log file via pipe.
  // Error detection primarily relies on step exit codes. This scan is a
  // safety net that catches error patterns in the full captured output.
  log('')
  log('='.repeat(56))
  log('  Scanning log for missed errors')
  log('='.repeat(56))

  if (!existsSync(logPath)) {
    log('  No log file found — detailed output was in terminal')
    return
  }

  const text = readFileSync(logPath, 'utf-8')
  const patterns = [
    /\berror\s+TS\d+\b/i,
    /\bError:\b/,
    /\bFAIL\b/,
    /\bFAILED\b/,
    /\bUnhandled\b/,
    /\buncaught\b/,
  ]

  const hits = []
  for (const line of text.split('\n')) {
    for (const p of patterns) {
      if (p.test(line) && !line.startsWith('[ci]')) {
        hits.push(line.trim())
        break
      }
    }
  }

  if (hits.length > 0) {
    log(`  ${hits.length} suspicious line(s) found:`)
    for (const h of hits.slice(0, 20)) {
      log(`    ${h.slice(0, 120)}`)
    }
    failed = true
  } else {
    log('  No error patterns found')
  }
}

async function main() {
  const steps = [
    { cmd: 'pnpm', args: ['exec', 'tsc', '--noEmit'], label: '1/6 Type check (tsc --noEmit)' },
    { cmd: 'pnpm', args: ['exec', 'eslint', '.', '--max-warnings', '0'], label: '2/6 Lint (eslint --max-warnings 0)' },
    { cmd: 'pnpm', args: ['exec', 'vitest', 'run', '--fileParallelism=false'], label: '3/6 Unit tests (vitest, node env)' },
    { cmd: 'pnpm', args: ['exec', 'vitest', 'run', '--config', 'vitest.jsdom.config.ts'], label: '4/6 Component tests (vitest, jsdom env)' },
    { cmd: 'pnpm', args: ['run', 'build:unpacked'], label: '5/6 Build (build:unpacked)' },
    { cmd: 'pnpm', args: ['exec', 'playwright', 'test', '--workers=2', '--max-failures=1'], label: '6/6 E2E tests (playwright)' },
  ]

  for (const s of steps) {
    await run(s.cmd, s.args, s.label)
    if (failed) break
  }

  scanErrors()

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
  log('')
  log('='.repeat(56))
  if (failed) {
    log(`  CI FAILED (${elapsed}s)`)
    log(`  Log: ${logPath}`)
    log('='.repeat(56))
    process.exit(1)
  }
  log(`  CI PASSED (${elapsed}s)`)
  log(`  Log: ${logPath}`)
  log('='.repeat(56))

  // Save step timing
  for (const s of stepTimes) {
    appendFileSync(logPath, `\n${s.label}: ${s.elapsed}s exit=${s.exitCode}`)
  }
}

main()
