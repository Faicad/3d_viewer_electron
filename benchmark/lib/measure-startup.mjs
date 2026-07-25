/**
 * Startup time measurement via Playwright + Electron.
 *
 * Launches the built app, measures key timing milestones,
 * and returns structured timing data.
 *
 * Usage:
 *   node benchmark/lib/measure-startup.mjs [--build] [--iterations=N]
 *
 * Requires:
 *   1. `pnpm run build:unpacked` (or --build flag to do it automatically)
 *   2. Playwright installed (already a devDep)
 *
 * Environment:
 *   E2E=1  — enabled automatically for benchmark runs
 */

import { _electron as electron } from '@playwright/test'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import { existsSync } from 'fs'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')

function getElectronPath() {
  const platform = process.platform

  // Prefer unpacked build (production-accurate)
  if (platform === 'win32') {
    const unpacked = join(PROJECT_ROOT, 'dist', 'win-unpacked', '3D_Viewer.exe')
    if (existsSync(unpacked)) return unpacked
  }
  if (platform === 'darwin') {
    const appName = 'Faicad 3D Viewer'
    for (const dir of ['mac-arm64', 'mac']) {
      const p = join(PROJECT_ROOT, 'dist', dir, `${appName}.app`, 'Contents', 'MacOS', appName)
      if (existsSync(p)) return p
    }
  }
  if (platform === 'linux') {
    const p = join(PROJECT_ROOT, 'dist', 'linux-unpacked', '3d_viewer_electron')
    if (existsSync(p)) return p
  }

  // Fallback: use electron binary from node_modules with out/ directory
  const electronBin = join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
  if (existsSync(electronBin)) {
    return electronBin
  }
  throw new Error(`Could not find Electron binary for ${platform}`)
}

function needsUnpackedBuild() {
  const platform = process.platform
  if (platform === 'win32') {
    return existsSync(join(PROJECT_ROOT, 'dist', 'win-unpacked', '3D_Viewer.exe'))
  }
  return false
}

function ensureBuild() {
  const appPath = getElectronPath()
  if (!existsSync(appPath)) {
    console.log('[startup] App not found at', appPath)
    if (isNodeModulesElectron()) {
      // Just need electron-vite build (out/ directory)
      console.log('[startup] Running pnpm run build...')
      execSync('pnpm run build', {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        timeout: 120000,
      })
    } else {
      console.log('[startup] Running pnpm run build:unpacked...')
      execSync('pnpm run build:unpacked', {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        timeout: 5 * 60 * 1000,
      })
    }
  } else {
    console.log('[startup] Found existing build at', appPath)
  }
}

function isNodeModulesElectron() {
  const electronBin = join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
  return existsSync(electronBin)
}

/**
 * Measure startup timing for one launch.
 * Returns timing data in milliseconds.
 */
async function measureOneLaunch() {
  const electronPath = getElectronPath()
  const isRawElectron = electronPath.includes('node_modules')

  const launchArgs = [
    '--no-sandbox',
    '--disable-gpu-shader-disk-cache',
  ]
  // When using raw electron binary, point it to the app directory
  if (isRawElectron) {
    launchArgs.push(PROJECT_ROOT)
  }

  const launchStart = performance.now()

  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: launchArgs,
    env: {
      ...process.env,
      E2E: '1',
      NODE_ENV: 'production',
    },
  })

  const afterLaunch = performance.now()
  const timeToWindow = afterLaunch - launchStart

  const window = await electronApp.firstWindow()

  const afterFirstWindow = performance.now()
  const timeToFirstWindow = afterFirstWindow - launchStart

  // Wait for DOM to be interactive
  await window.waitForLoadState('domcontentloaded')
  const afterDCL = performance.now()
  const timeToDCL = afterDCL - launchStart

  // Wait for full page load
  await window.waitForLoadState('load')
  const afterLoad = performance.now()
  const timeToLoad = afterLoad - launchStart

  // Gather performance timings from the renderer
  let perfTiming = {}
  let resourceTiming = []
  let initialChunkLoadTime = 0

  try {
    perfTiming = await window.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      if (!nav) return {}
      return {
        type: nav.type,
        redirectCount: nav.redirectCount,
        domContentLoadedEventStart: nav.domContentLoadedEventStart,
        domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
        domComplete: nav.domComplete,
        loadEventStart: nav.loadEventStart,
        loadEventEnd: nav.loadEventEnd,
        domInteractive: nav.domInteractive,
        requestStart: nav.requestStart,
        responseStart: nav.responseStart,
        responseEnd: nav.responseEnd,
        duration: nav.duration,
      }
    })

    resourceTiming = await window.evaluate(() => {
      return performance.getEntriesByType('resource').map(r => ({
        name: r.name.split('/').pop(),
        initiatorType: r.initiatorType,
        transferSize: r.transferSize,
        encodedBodySize: r.encodedBodySize,
        decodedBodySize: r.decodedBodySize,
        duration: r.duration,
        startTime: r.startTime,
      }))
    })

    // Sum up load time for initial JS assets (from faicad-viewer:// protocol)
    const jsResources = resourceTiming.filter(
      r => r.name && r.name.endsWith('.js') && !r.name.includes('chunk-')
    )
    initialChunkLoadTime = jsResources.reduce((sum, r) => sum + r.duration, 0)
  } catch (e) {
    console.warn('[startup] Could not read performance API:', e.message)
  }

  // Close the app
  await electronApp.close()
  const afterClose = performance.now()

  return {
    launchStart,
    timeToLaunch: Math.round(timeToWindow),
    timeToFirstWindow: Math.round(timeToFirstWindow),
    timeToDCL: Math.round(timeToDCL),
    timeToLoad: Math.round(timeToLoad),
    totalTestDuration: Math.round(afterClose - launchStart),
    performanceTiming: perfTiming,
    resourceCount: resourceTiming.length,
    initialChunkLoadTime: Math.round(initialChunkLoadTime),
    resourceTiming,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Run the startup benchmark.
 * @param {object} options
 * @param {number} options.iterations  Number of launches to average (default: 3)
 * @param {boolean} options.build     Whether to build the app first
 */
export async function measureStartup(options = {}) {
  const iterations = options.iterations || 3

  if (options.build) {
    ensureBuild()
  }

  const results = []

  for (let i = 0; i < iterations; i++) {
    console.log(`[startup] Launch ${i + 1}/${iterations}...`)
    const result = await measureOneLaunch()
    results.push(result)
    console.log(`  window: ${result.timeToFirstWindow}ms  DCL: ${result.timeToDCL}ms  load: ${result.timeToLoad}ms`)
  }

  // Compute averages (excluding outliers via median)
  const sortedByWindow = [...results].sort((a, b) => a.timeToFirstWindow - b.timeToFirstWindow)
  const sortedByDCL = [...results].sort((a, b) => a.timeToDCL - b.timeToDCL)
  const sortedByLoad = [...results].sort((a, b) => a.timeToLoad - b.timeToLoad)

  const mid = Math.floor(iterations / 2)

  return {
    iterations,
    appPath: getElectronPath(),
    results,
    summary: {
      timeToFirstWindow: {
        values: results.map(r => r.timeToFirstWindow),
        median: sortedByWindow[mid].timeToFirstWindow,
        min: sortedByWindow[0].timeToFirstWindow,
        max: sortedByWindow[iterations - 1].timeToFirstWindow,
      },
      timeToDCL: {
        values: results.map(r => r.timeToDCL),
        median: sortedByDCL[mid].timeToDCL,
        min: sortedByDCL[0].timeToDCL,
        max: sortedByDCL[iterations - 1].timeToDCL,
      },
      timeToLoad: {
        values: results.map(r => r.timeToLoad),
        median: sortedByLoad[mid].timeToLoad,
        min: sortedByLoad[0].timeToLoad,
        max: sortedByLoad[iterations - 1].timeToLoad,
      },
    },
    timestamp: new Date().toISOString(),
  }
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const buildFlag = process.argv.includes('--build')
  const iterArg = process.argv.find(a => a.startsWith('--iterations='))
  const iterations = iterArg ? parseInt(iterArg.split('=')[1], 10) : 3

  console.log('='.repeat(50))
  console.log('STARTUP TIME MEASUREMENT')
  console.log('='.repeat(50))
  console.log(`Iterations: ${iterations}`)
  console.log(`Auto-build: ${buildFlag}`)
  console.log('')

  const result = await measureStartup({ iterations, build: buildFlag })

  console.log('')
  console.log('--- Summary (median) ---')
  console.log(`Time to first window : ${result.summary.timeToFirstWindow.median} ms`)
  console.log(`Time to DOM ready    : ${result.summary.timeToDCL.median} ms`)
  console.log(`Time to page load    : ${result.summary.timeToLoad.median} ms`)

  if (process.argv.includes('--json')) {
    process.stdout.write('\n' + JSON.stringify(result, null, 2))
  }
}
