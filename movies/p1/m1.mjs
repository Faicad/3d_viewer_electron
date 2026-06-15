import { makeMovie, postMessageAndWait } from '../lib.mjs'

makeMovie(
  import.meta.url,
  'movies/Car.glb',
  { embed: '1', AutoRotate: '0' },
  async (page, suffix, tPageOpen) => {
    await page.waitForTimeout(2000)

    const endPos = { x: 0, y: -0.1, z: 0.69 }
    await page.evaluate(async (target) => {
      const dev = window.__r3f_dev
      return new Promise((resolve) => {
        window.__gsap.to(dev.camera.position, {
          x: target.x, y: target.y, z: target.z,
          duration: 4, ease: 'power2.inOut',
          onUpdate: () => dev.camera.lookAt(0, 0, 0),
          onComplete: resolve,
        })
      })
    }, endPos)

    const firstPartName = await page.evaluate(() => {
      const ms = window.__modelStore.getState()
      return ms.glbPartInfos[0]?.name || null
    })

    await postMessageAndWait(page, {
      id: 'movie-gold',
      command: 'setPartMaterialByPreset',
      params: { preset: 'gold', partName: firstPartName },
      expectedCommand: 'setPartMaterialByPreset',
    })

    await page.waitForTimeout(4000)
  },
  8,
)
