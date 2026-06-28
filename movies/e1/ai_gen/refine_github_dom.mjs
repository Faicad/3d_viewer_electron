// 细化 GitHub 侧边栏 DOM 分析：找出 BorderGrid-row 中 Releases 位置
import { chromium } from 'playwright'

async function refine() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })

  await page.goto('https://github.com/faicad/3d_viewer_electron/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(5000)

  // 精确找到 Releases 所在的 BorderGrid-row
  const releasesRow = await page.evaluate(() => {
    const rows = document.querySelectorAll('.BorderGrid-row')
    for (const row of rows) {
      if (row.textContent.includes('Releases')) {
        const r = row.getBoundingClientRect()
        return {
          selector: '.BorderGrid-row',
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          text: row.textContent.trim().slice(0, 200)
        }
      }
    }
    return null
  })

  console.log('Releases BorderGrid-row:', JSON.stringify(releasesRow, null, 2))

  // 同时列出所有 BorderGrid-row
  const allRows = await page.evaluate(() => {
    const results = []
    document.querySelectorAll('.BorderGrid-row').forEach(row => {
      const r = row.getBoundingClientRect()
      results.push({
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        text: row.textContent.trim().slice(0, 80).replace(/\n/g, ' ')
      })
    })
    return results
  })

  console.log('\nAll BorderGrid-rows:')
  for (const row of allRows) {
    console.log(`  (${row.rect.x},${row.rect.y} ${row.rect.w}x${row.rect.h}) "${row.text}"`)
  }

  await browser.close()
}

refine().catch(err => { console.error(err); process.exit(1) })
