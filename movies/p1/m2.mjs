import { makeMovie, MOVIE_PORT, postMessage, postMessageAndWait } from '../lib.mjs'

makeMovie(
  import.meta.url,
  'src/test/fixtures/box_boss.glb',
  { embed: '1', AutoRotate: '0' },
  async (page, suffix, tPageOpen) => {
    await page.waitForTimeout(1500)

    const HDR_URL = `http://localhost:${MOVIE_PORT}/kloppenheim_02.hdr`
    await postMessageAndWait(page, {
      id: 'm2-env',
      command: 'setEnv',
      params: { value: HDR_URL },
      expectedCommand: 'setEnv',
      timeout: 15000,
    })

    await page.waitForTimeout(2000)

    await postMessage(page, { id: 'm2-rotate', command: 'startRotate', params: {} })

    await page.waitForTimeout(3000)
  },
  3.5,
)
