// 分析 GitHub 页面 DOM，定位 Releases 侧边栏的完整容器
import { chromium } from 'playwright'

async function find() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })

  await page.goto('https://github.com/faicad/3d_viewer_electron/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(5000)

  // 找到所有包含 "Releases" 的 DOM 元素
  const info = await page.evaluate(() => {
    const results = []
    const iter = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT)
    let node
    while (node = iter.nextNode()) {
      if (node.textContent.includes('Releases')) {
        const el = node.parentElement
        const r = el.getBoundingClientRect()
        results.push({
          tag: el.tagName,
          class: el.className.slice(0, 100),
          text: node.textContent.trim().slice(0, 80),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        })
        if (results.length > 20) break
      }
    }
    return results
  })

  console.log('Elements containing "Releases":')
  for (const el of info) {
    console.log(`  <${el.tag}> class="${el.class}" rect=(${el.rect.x},${el.rect.y} ${el.rect.w}x${el.rect.h}) text="${el.text}"`)
  }

  // 查找右侧边栏容器
  const sidebar = await page.evaluate(() => {
    const results = []
    const layoutSidebar = document.querySelector('.Layout-sidebar')
    if (layoutSidebar) {
      const r = layoutSidebar.getBoundingClientRect()
      results.push({ selector: '.Layout-sidebar', rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })
    }
    const allDivs = document.querySelectorAll('div, aside, section')
    for (const el of allDivs) {
      const r = el.getBoundingClientRect()
      if (r.left > 1000 && r.width > 200 && r.width < 400 && r.height > 50) {
        results.push({ tag: el.tagName, id: el.id, class: el.className.slice(0, 80), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })
      }
    }
    return results
  })

  console.log('\nRight-side containers:')
  for (const el of sidebar) {
    console.log(`  ${el.selector || `<${el.tag}>`} id="${el.id}" class="${el.class}" rect=(${el.rect.x},${el.rect.y} ${el.rect.w}x${el.rect.h})`)
  }

  await browser.close()
}

find().catch(err => { console.error(err); process.exit(1) })
