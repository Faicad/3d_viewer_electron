import { spawn } from 'child_process'
import { readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testsDir = path.join(__dirname, 'tests')
const repoRoot = path.resolve(__dirname, '..')

const testFiles = readdirSync(testsDir)
  .filter(f => f.startsWith('test') && f.endsWith('.mjs') && f !== 'test_spark.mjs')

let passed = 0
let failed = 0
const failedNames = []

for (const file of testFiles) {
  const filePath = path.join(testsDir, file)
  process.stdout.write(`▶ ${file} ... `)

  try {
    const { status, stdout, stderr } = await new Promise((resolve, reject) => {
      const child = spawn('node', [filePath], {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      })
      let stdout = '', stderr = ''
      child.stdout.on('data', d => { stdout += d })
      child.stderr.on('data', d => { stderr += d })
      child.on('close', code => resolve({ status: code, stdout, stderr }))
      child.on('error', reject)
    })

    // Some tests (e.g. test_magnifier.mjs) track failures via boolean but
    // never call process.exit(1). Check output for failure indicators too.
    const output = stdout + stderr
    const hasFailure = /FAIL|SOME FAILED/i.test(output)
    const effectiveExit = (status === 0 && !hasFailure) ? 0 : 1

    if (effectiveExit === 0) {
      console.log('PASS')
      passed++
    } else {
      console.log('FAIL')
      failed++
      failedNames.push(file)
      // Print last relevant lines
      const lines = output.split('\n').filter(Boolean).slice(-15)
      for (const line of lines) {
        if (/FAIL|Error|error|SOME FAILED/.test(line)) {
          console.log(`  ${line.trim()}`)
        }
      }
    }
  } catch (err) {
    console.log('FAIL (spawn error)')
    failed++
    failedNames.push(file + ' (spawn error)')
    console.log(`  ${err.message}`)
  }
}

const total = passed + failed
console.log(`\n── Results: ${passed}/${total} passed`)
if (failed > 0) {
  console.log(`   Failed: ${failedNames.join(', ')}`)
  process.exit(1)
}
