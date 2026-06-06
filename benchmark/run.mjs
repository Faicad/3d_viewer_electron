#!/usr/bin/env node
/**
 * Run the benchmark suite and save a snapshot.
 *
 * Usage:
 *   node benchmark/run.mjs <snapshot-name> [options]
 *
 * Options:
 *   --skip-bundle     Skip bundle size analysis (startup-only)
 *   --skip-startup    Skip Playwright startup measurement (bundle-only)
 *   --build           Auto-build the app
 *   --iterations=N    Startup measurement iterations (default: 3)
 *
 * Examples:
 *   node benchmark/run.mjs my-snapshot              # startup + bundle
 *   node benchmark/run.mjs my-snapshot --skip-bundle # startup only
 */

import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve } from 'path'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')

// Resolve module paths dynamically (use file:// URL for Windows compat)
const measureBundleModule = pathToFileURL(resolve(__dirname, 'lib', 'measure-bundle.mjs')).href
const measureStartupModule = pathToFileURL(resolve(__dirname, 'lib', 'measure-startup.mjs')).href
const snapshotModule = pathToFileURL(resolve(__dirname, 'lib', 'snapshot.mjs')).href

async function main() {
  const args = process.argv.slice(2)
  const snapshotName = args[0]
  const skipBundle = args.includes('--skip-bundle')
  const skipStartup = args.includes('--skip-startup')
  const autoBuild = args.includes('--build')
  const iterArg = args.find(a => a.startsWith('--iterations='))
  const iterations = iterArg ? parseInt(iterArg.split('=')[1], 10) : 3

  if (!snapshotName || snapshotName.startsWith('--')) {
    console.error('Usage: node benchmark/run.mjs <snapshot-name> [--skip-startup] [--build] [--iterations=N]')
    process.exit(1)
  }

  console.log('='.repeat(60))
  console.log('FAICAD 3D VIEWER BENCHMARK')
  console.log('='.repeat(60))
  console.log(`Snapshot : ${snapshotName}`)
  console.log(`Date     : ${new Date().toISOString()}`)
  console.log(`Platform : ${process.platform}`)
  console.log('')

  // 1. Bundle measurement
  if (!skipBundle) {
    console.log('--- Phase 1: Bundle size analysis ---')
    const { measureBundle } = await import(measureBundleModule)
    const bundleResult = measureBundle()

    console.log(`  Initial JS payload: ${bundleResult.initialSizeKB} KB`)
    console.log(`  Total JS (all chunks): ${bundleResult.totalSizeKB} KB`)
    console.log(`  Chunks: ${bundleResult.chunkCount} (initial: ${bundleResult.initialChunks.length}, dynamic: ${bundleResult.dynamicChunks.length})`)

    console.log('')
    console.log('--- Saving bundle snapshot ---')
    const { saveSnapshot } = await import(snapshotModule)
    saveSnapshot(`${snapshotName}-bundle`, bundleResult)
  }

  // 2. Startup measurement
  let startupResult = null

  if (!skipStartup) {
    console.log('')
    console.log('--- Phase 2: Startup time (Playwright) ---')
    console.log(`  Iterations: ${iterations}`)
    console.log(`  Auto-build: ${autoBuild}`)

    const { measureStartup } = await import(measureStartupModule)
    startupResult = await measureStartup({ iterations, build: autoBuild })

    console.log(`  Time to window: ${startupResult.summary.timeToFirstWindow.median} ms (median)`)
    console.log(`  Time to DOM    : ${startupResult.summary.timeToDCL.median} ms (median)`)
    console.log(`  Time to load   : ${startupResult.summary.timeToLoad.median} ms (median)`)
  } else {
    console.log('')
    console.log('--- Phase 2: Skipped ---')
  }

  // 3. Save startup snapshot
  console.log('')
  console.log('--- Saving snapshot ---')
  const { saveSnapshot } = await import(snapshotModule)
  if (startupResult) {
    saveSnapshot(`${snapshotName}-startup`, startupResult)
  }

  if (skipBundle && !startupResult) {
    console.log('Nothing to save — both --skip-bundle and --skip-startup specified.')
  }

  console.log('')
  console.log('Done.')
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
