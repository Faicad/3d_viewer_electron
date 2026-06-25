// Verify: magnifier → clickWithHighlight (circle + cursor) → cleanup
import * as lib from '../lib.mjs'

lib.makeMovie(
  import.meta.url,
  'movies/p2/1.stl',
  {
    AutoRotate: '0', entryZoomDist: '5', entryZoomEndDist: '2.5',
    entryDuration: '2000', entryTargetShiftY: '0',
  },
  async (page, suffix, tPageOpen) => {
    let allPassed = true

    // ── Test 1: magnifyToolbar ──
    await lib.magnifyToolbar(page, { targetSelector: '[aria-label="Bambu Studio"]' })
    await page.waitForTimeout(500)

    const r1 = await page.evaluate(() => {
      const errors = []
      const w = document.getElementById('movie-toolbar-magnifier')
      if (!w) { errors.push('wrapper missing'); return errors }
      const c = w.firstElementChild
      if (!c || !c.style.zoom) { errors.push('clone/zoom missing'); return errors }

      const headerBg = getComputedStyle(document.querySelector('header')).backgroundColor
      if (getComputedStyle(c).backgroundColor !== headerBg) errors.push('bg mismatch')

      const btn = c.querySelector('[aria-label="Bambu Studio"]')
      if (!btn) { errors.push('target missing'); return errors }
      const br = btn.getBoundingClientRect()
      if (br.right < 0 || br.left > window.innerWidth) errors.push('btn off-screen')
      const dev = Math.abs((br.left + br.width/2) - window.innerWidth/2) / window.innerWidth
      if (dev > 0.20) errors.push(`btn not centered dev=${(dev*100).toFixed(0)}%`)

      if (!errors.length) errors.push('PASS')
      return errors
    })
    console.log(`[${suffix}] Test 1 (magnifyToolbar):`)
    r1.forEach(l => { console.log('  ' + l); if (!l.includes('PASS')) allPassed = false })

    // ── Test 2: clickWithHighlight (red circle → cursor → click) ──
    // Check the red circle appears (mid-animation)
    const circleCheck = lib.clickWithHighlight(
      page, '[aria-label="Bambu Studio"]', 'Test', 2000,
      { cursorDuration: 800, cursorDistanceY: 60, cursorSize: 32 },
    )
    await page.waitForTimeout(100) // circle should be visible now

    const r2 = await page.evaluate(() => {
      const errors = []
      const circle = document.getElementById('__click_highlight')
      if (!circle) { errors.push('circle missing during animation'); return errors }
      const cr = circle.getBoundingClientRect()
      const hBot = document.querySelector('header').getBoundingClientRect().bottom
      if ((cr.top + cr.height/2) < hBot + 20) errors.push('circle on orig toolbar')
      if (errors.length === 0) errors.push('PASS')
      return errors
    })
    console.log(`[${suffix}] Test 2 (red circle):`)
    r2.forEach(l => { console.log('  ' + l); if (!l.includes('PASS')) allPassed = false })

    await circleCheck

    // ── Test 3: cleanup after clickWithHighlight ──
    const r3 = await page.evaluate(() => {
      const errors = []
      if (document.getElementById('__click_highlight')) errors.push('circle not cleaned')
      if (document.getElementById('__movie_cursor')) errors.push('cursor not cleaned')
      if (errors.length === 0) errors.push('PASS')
      return errors
    })
    console.log(`[${suffix}] Test 3 (clickWithHighlight cleanup):`)
    r3.forEach(l => { console.log('  ' + l); if (!l.includes('PASS')) allPassed = false })

    // ── Test 4: removeMagnifyToolbar ──
    await lib.removeMagnifyToolbar(page)
    await page.waitForTimeout(400)

    const r4 = await page.evaluate(() => {
      const errors = []
      if (document.getElementById('movie-toolbar-magnifier')) errors.push('wrapper still in DOM')
      if (errors.length === 0) errors.push('PASS')
      return errors
    })
    console.log(`[${suffix}] Test 4 (removeMagnifyToolbar):`)
    r4.forEach(l => { console.log('  ' + l); if (!l.includes('PASS')) allPassed = false })

    console.log(`[${suffix}] ${allPassed ? 'ALL PASSED' : 'SOME FAILED'}`)
  },
)
