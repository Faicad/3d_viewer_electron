import { test, _electron } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getElectronLaunchArgs, getElectronPath, createUserDataDir, cleanupUserDataDir } from './utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CUBE1_STL = readFileSync(path.join(__dirname, 'fixtures', 'testdata', 'cube1.stl'))

test('diagnose modelLoad→phaseDone', async () => {
  test.setTimeout(60000)
  const userDataDir = createUserDataDir()
  const app = await _electron.launch({
    executablePath: getElectronPath(),
    args: getElectronLaunchArgs(),
    env: { ...process.env, E2E: '1' },
    userDataDir,
  })
  const page = await app.firstWindow()
  const logs: string[] = []
  page.on('console', m => { if (m.text().includes('uploadFile') || m.text().includes('ModelGroup')) logs.push(`[${m.type()}] ${m.text()}`) })

  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })

  const t0 = Date.now()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'cube1.stl', mimeType: 'application/sla', buffer: CUBE1_STL,
  })
  console.log(`setInputFiles returned after ${Date.now()-t0}ms`)

  await page.waitForFunction(
    () => (window as any).__modelStore?.getState().__loadingPhase === 'done',
    { timeout: 45000 },
  )
  console.log(`__loadingPhase done after ${Date.now()-t0}ms`)

  for (const l of logs) console.log(l)
  await app.close()
  cleanupUserDataDir(userDataDir)
})
