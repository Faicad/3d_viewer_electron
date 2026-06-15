import { makeMovie, waitForModel, zoomUI } from '../lib.mjs'

makeMovie(
  import.meta.url,
  'src/test/fixtures/AnisotropyBarnLamp.glb',
  { embed: '1', AutoRotate: '0' },
  async (page, suffix, tPageOpen) => {
    await zoomUI(page)
    await waitForModel(page)

    await page.waitForTimeout(2000)

    const trimStart = (Date.now() - tPageOpen) / 1000

    const endPos = { x: 0, y: -0.1, z: 0.69 }
    await page.evaluate(async (target) => {
      const dev = window.__r3f_dev
      if (dev.controls) dev.controls.enabled = false
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

    await page.evaluate(async (partName) => {
      return new Promise((resolve, reject) => {
        const handler = (e) => {
          if (e.data?.type === '3d-viewer' && e.data.command === 'setPartMaterialByPreset' && e.data.status) {
            window.removeEventListener('message', handler)
            resolve(e.data)
          }
        }
        window.addEventListener('message', handler)
        window.postMessage({
          type: '3d-viewer',
          id: 'movie-gold',
          command: 'setPartMaterialByPreset',
          params: { preset: 'gold', partName },
        }, '*')
        setTimeout(() => {
          window.removeEventListener('message', handler)
          reject(new Error('Material command timeout'))
        }, 5000)
      })
    }, firstPartName)

    await page.waitForTimeout(4000)

    return trimStart
  },
  8,
)
