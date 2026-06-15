import { makeMovie, dispatchEvent, animateCamera, callDemo, clickById, setSelectValue } from '../lib.mjs'

makeMovie(
  import.meta.url,
  'movies/Car.glb',
  { embed: '1' },
  async (page, suffix, tPageOpen) => {
    await page.waitForTimeout(2000)

    await dispatchEvent(page, 'stopRotate')
    await animateCamera(page, { factor: 1.5, duration: 2 })
    await callDemo(page, 'GSAPExplode')
    await page.waitForTimeout(500)

    await setSelectValue(page, 'axis-select', 'y')
    await page.waitForTimeout(300)

    await clickById(page, 'btn-play')
    await page.waitForTimeout(2000)

    await clickById(page, 'btn-reset')
    await page.waitForTimeout(3000)
  },
  10,
)
