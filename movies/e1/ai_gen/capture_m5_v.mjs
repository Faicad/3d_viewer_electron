// 竖屏 (v) 截图 + marks：1080×1920 视口
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
  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })
  const page = await context.newPage()

  // ── URL 0: GitHub repo ──
  console.log('\n=== URL 0: GitHub (竖屏) ===')
  await page.goto('https://github.com/faicad/3d_viewer_electron/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(5000)

  // 竖屏 GitHub 可能无侧边栏，尝试找到 Releases 区域
  let releasesSection = await page.evaluate(() => {
    const rows = document.querySelectorAll('.BorderGrid-row')
    for (const row of rows) {
      if (row.textContent.includes('Releases') && row.textContent.includes('Latest')) {
        const r = row.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fullY: Math.round(r.y + window.scrollY) }
      }
    }
    return null
  })

  if (!releasesSection) {
    const box = await getBox(page, 'Releases')
    if (box) releasesSection = box
  }

  await page.screenshot({ path: join(__dirname, `${scriptName}_0000_v_full.png`), fullPage: true })

  const marks0 = {}
  if (releasesSection) {
    marks0['Releases sidebar'] = releasesSection
    console.log('  Releases sidebar:', JSON.stringify(releasesSection))
  }
  writeFileSync(join(__dirname, `${scriptName}_0000_v_marks.json`), JSON.stringify(marks0, null, 2) + '\n')

  // ── URL 1: GitCode repo ──
  console.log('\n=== URL 1: GitCode repo (竖屏) ===')
  await page.goto('https://gitcode.com/Faicad/3d_viewer_electron', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)

  let allReleases = await getBox(page, '查看全部发行版')
  if (!allReleases) allReleases = await getBox(page, 'All releases')

  await page.screenshot({ path: join(__dirname, `${scriptName}_0001_v_full.png`), fullPage: true })

  const marks1 = {}
  if (allReleases) {
    marks1['All releases'] = allReleases
    console.log('  All releases:', JSON.stringify(allReleases))
  }
  writeFileSync(join(__dirname, `${scriptName}_0001_v_marks.json`), JSON.stringify(marks1, null, 2) + '\n')

  // ── URL 2: GitCode releases ──
  console.log('\n=== URL 2: GitCode releases (竖屏) ===')
  await page.goto('https://gitcode.com/Faicad/3d_viewer_electron/releases/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)

  let exeLink = await getBox(page, '3D_Viewer_1.7.2_x64_cn_Setup.exe')
  if (!exeLink) exeLink = await getBox(page, 'Setup.exe')

  await page.screenshot({ path: join(__dirname, `${scriptName}_0002_v_full.png`), fullPage: true })

  const marks2 = {}
  if (exeLink) {
    marks2['3D_Viewer_1.7.2_x64_cn_Setup.exe'] = exeLink
    console.log('  Download link:', JSON.stringify(exeLink))
  }
  writeFileSync(join(__dirname, `${scriptName}_0002_v_marks.json`), JSON.stringify(marks2, null, 2) + '\n')

  // ── URL 3: screenshot only ──
  console.log('\n=== URL 3: screenshot only (竖屏) ===')
  await page.screenshot({ path: join(__dirname, `${scriptName}_0003_v_full.png`), fullPage: true })

  await browser.close()

  console.log('\n=== Done ===')
  for (let i = 0; i < 4; i++) {
    console.log(`  ai_gen/m5_${pad4(i)}_v_full.png + ${i < 3 ? 'marks' : '(no marks)'}`)
  }
}

capture().catch(err => { console.error(err); process.exit(1) })
