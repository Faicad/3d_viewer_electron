import { test, _electron } from '@playwright/test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getElectronPath } from './utils'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXE = getElectronPath()
const GLB = readFileSync(path.join(__dirname, 'fixtures', 'test-box.glb'))

test('full IBL diagnostic', async () => {
  test.setTimeout(60000)
  const app = await _electron.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu-sandbox'] })
  const page = await app.firstWindow()

  // Capture ALL console messages
  const allLogs: string[] = []
  page.on('console', m => allLogs.push(`[${m.type()}] ${m.text().slice(0,300)}`))

  await page.waitForLoadState('domcontentloaded')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 15000 })

  // Load model
  await page.locator('input[type="file"]').setInputFiles({ name: 't.glb', mimeType: 'model/gltf-binary', buffer: GLB })
  await page.waitForFunction(() => (window as any).__modelStore?.getState().__loadingPhase === 'done', { timeout: 15000 }).catch(() => {})

  // Check EVERYTHING
  const state = await page.evaluate(() => {
    const d = (window as any).__r3f_dev; if (!d) return { err: 'no __r3f_dev' }
    const s = d.scene; const g = d.gl
    const r: any = {}

    // Environment
    r.hasEnv = !!s.environment
    r.envUuid = s.environment?.uuid || 'none'
    r.envIntensity = s.environmentIntensity

    // Background
    r.bgIsColor = !!(s.background?.isColor)
    r.bgIsTex = !!(s.background?.isTexture)
    if (s.background?.isColor) r.bgHex = '#' + s.background.getHexString()
    if (s.background?.isTexture) r.bgUuid = s.background.uuid

    // Renderer
    r.toneMapping = g.toneMapping
    r.shadowMapEnabled = g.shadowMap?.enabled

    // Store state
    const es = (window as any).__engineStore
    if (es) {
      r.storeSelectedEnv = es.getState().selectedEnv
      r.storeEnvBackground = es.getState().envBackground
    }

    // Check if engine store selectedEnv differs from scene env
    r.envMatch = s.environment?.uuid || 'none'

    return r
  })
  console.log('STATE:', JSON.stringify(state, null, 2))

  // Filter relevant logs
  const relevant = allLogs.filter(l =>
    l.includes('EnvironmentManager') ||
    l.includes('Falling back') ||
    l.includes('HDR') ||
    l.includes('RGBE') ||
    l.includes('env') ||
    l.includes('environment') ||
    l.includes('ERROR') ||
    l.includes('error') ||
    l.includes('fail') ||
    l.includes('timeout') ||
    l.includes('empty_warehouse') ||
    l.includes('Shader') ||
    l.includes('WebGL')
  )
  console.log('RELEVANT LOGS (' + relevant.length + '):')
  relevant.forEach(l => console.log('  ' + l))

  if (allLogs.length === 0) console.log('  (zero console messages total)')

  await page.screenshot({ path: path.join(__dirname, '..', '..', 'diag.png') })
  await app.close()
})
