import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const scriptName = 'm5'
const pad4 = (i) => String(i).padStart(4, '0')

async function getBox(page, text) {
  const el = page.getByText(text, { exact: false }).first()
  const box = await el.boundingBox()
  const scrollY = await page.evaluate(() => window.scrollY)
  if (box) return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height), fullY: Math.round(box.y + scrollY) }
  return null
}

async function capture() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const page = await context.newPage()

  // ── URL 0: GitHub repo ──
  console.log('\n=== URL 0: GitHub ===')
  await page.goto('https://github.com/faicad/3d_viewer_electron/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(5000)

  // Find Releases section via BorderGrid-row (完整侧边栏区域，不是仅标题文字)
  const releasesSection = await page.evaluate(() => {
    const rows = document.querySelectorAll('.BorderGrid-row')
    for (const row of rows) {
      if (row.textContent.includes('Releases') && row.textContent.includes('Latest')) {
        const r = row.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fullY: Math.round(r.y + window.scrollY) }
      }
    }
    return null
  })

  await page.screenshot({ path: join(__dirname, `${scriptName}_0000_h_full.png`), fullPage: true })

  const marks0 = {}
  if (releasesSection) {
    marks0['Releases sidebar'] = releasesSection
    console.log('  Releases sidebar:', JSON.stringify(releasesSection))
  } else {
    // Fallback
    const box = await getBox(page, 'Releases')
    if (box) { marks0['Releases sidebar'] = box; console.log('  (fallback) Releases:', JSON.stringify(box)) }
  }
  writeFileSync(join(__dirname, `${scriptName}_0000_h_marks.json`), JSON.stringify(marks0, null, 2) + '\n')

  // ── URL 1: GitCode repo ──
  console.log('\n=== URL 1: GitCode repo ===')
  await page.goto('https://gitcode.com/Faicad/3d_viewer_electron', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)

  let allReleases = await getBox(page, '查看全部发行版')
  if (!allReleases) allReleases = await getBox(page, 'All releases')

  await page.screenshot({ path: join(__dirname, `${scriptName}_0001_h_full.png`), fullPage: true })

  const marks1 = {}
  if (allReleases) {
    marks1['All releases'] = allReleases
    console.log('  All releases:', JSON.stringify(allReleases))
  }
  writeFileSync(join(__dirname, `${scriptName}_0001_h_marks.json`), JSON.stringify(marks1, null, 2) + '\n')

  // ── URL 2: GitCode releases ──
  console.log('\n=== URL 2: GitCode releases ===')
  await page.goto('https://gitcode.com/Faicad/3d_viewer_electron/releases/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)

  let exeLink = await getBox(page, '3D_Viewer_1.7.2_x64_cn_Setup.exe')
  if (!exeLink) exeLink = await getBox(page, 'Setup.exe')

  await page.screenshot({ path: join(__dirname, `${scriptName}_0002_h_full.png`), fullPage: true })

  const marks2 = {}
  if (exeLink) {
    marks2['3D_Viewer_1.7.2_x64_cn_Setup.exe'] = exeLink
    console.log('  Download link:', JSON.stringify(exeLink))
  }
  writeFileSync(join(__dirname, `${scriptName}_0002_h_marks.json`), JSON.stringify(marks2, null, 2) + '\n')

  // ── URL 3: same page, screenshot only ──
  console.log('\n=== URL 3: screenshot only ===')
  await page.screenshot({ path: join(__dirname, `${scriptName}_0003_h_full.png`), fullPage: true })

  await browser.close()

  console.log('\n=== Done ===')
  console.log('  ai_gen/m5_0000_h_full.png + marks')
  console.log('  ai_gen/m5_0001_h_full.png + marks')
  console.log('  ai_gen/m5_0002_h_full.png + marks')
  console.log('  ai_gen/m5_0003_h_full.png (caption bg)')
}

capture().catch(err => { console.error(err); process.exit(1) })
