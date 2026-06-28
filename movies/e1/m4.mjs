import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'

// Windows自带3D查看器即将停用！替代神器来了


const subtitle = `
而我需要一个能快速浏览和搜索3D文件的工具
最终，我决定还是自己写一个3D查看器
就为解决三个痛点！
第一，要快，秒开模型零等待
--1--
第二，格式全
支持二十多种3D文件格式
还支持模型格式转换
比如可以把虚拟3D常用的GLB格式转换为
三维打印常用的3MF格式
第三，要方便
右侧缩略图列表可快速浏览同目录的3D模型
--3--
还可以全屏查看本目录所有模型的缩略图
是不是很酷！
最良心的是，这款工具完全开源免费
无广告、无收费、无捆绑
`;


lib.makeMovie(
  import.meta.url,
  "C:\\Users\\yuan_\\Downloads\\新下载\\15cm哈兰德.3mf.glb",
  // 'movies/p1/exported.glb',
  {
    AutoRotate: '0',
    closeLeftPanel: '0;1',
    entryAnim: 'zoom', 
    entryZoomDist: '5;10',
    entryZoomEndDist: '1.1;1.3',
    entryDuration: '3000',
    entryTargetShiftY: '0.1',
  },
  async (page, suffix, tPageOpen) => {
    // 1. 相机从高处俯视慢慢变为平视 (3秒)
    await page.evaluate(async () => {
      const dev = window.__r3f_dev
      const camera = dev.camera
      const controls = dev.controls
      const target = controls.target

      const dx = camera.position.x - target.x
      const dy = camera.position.y - target.y
      const dz = camera.position.z - target.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const horLen = Math.sqrt(dx * dx + dz * dz)

      let levelX, levelZ
      if (horLen > 0.001) {
        levelX = target.x + (dx / horLen) * dist
        levelZ = target.z + (dz / horLen) * dist
      } else {
        levelX = target.x
        levelZ = target.z - dist
      }

      await window.__animateCamera({
        to: { x: levelX, y: target.y, z: levelZ },
        duration: 3,
        ease: 'power2.inOut',
      })
    })

    // 2. 停1秒
    await page.waitForTimeout(1000)
    await lib.animateCamera(page, { rotate: 'y', angle:-120, duration: 5000, ease: 'none' })
    await page.waitForTimeout(3000)
    await lib.syncpoint(page)

    // 3. 连续加载右侧缩略图中接下来的多个模型
    const startIndex = await page.evaluate(
      () => window.__modelStore?.getState().selectedFileIndex ?? 0
    )

    for (let i = 1; i <= 3; i++) {
      await page.evaluate(async (idx) => {
        const gsap = window.__gsap
        const next = document.querySelector(`[data-index="${idx}"]`)
        if (!next) return
        next.scrollIntoView({ block: 'nearest' })

        const prev = document.querySelector(`[data-index="${idx - 1}"]`)
        const nextRect = next.getBoundingClientRect()
        const tx = nextRect.left + nextRect.width / 2
        const ty = nextRect.top + nextRect.height / 2

        let sx, sy
        if (prev) {
          const pr = prev.getBoundingClientRect()
          sx = pr.left + pr.width / 2
          sy = pr.top + pr.height / 2
        } else {
          sx = tx
          sy = ty + 120
        }

        const cursor = document.createElement('div')
        cursor.id = '__movie_cursor'
        cursor.innerHTML =
          `<svg width="48" height="48" viewBox="0 0 26 30">` +
          `<polygon points="3,2 3,26 10,20 17,29 21,25 13,18 22,11" ` +
          `fill="#fff" stroke="#222" stroke-width="1.8" stroke-linejoin="round"/></svg>`
        Object.assign(cursor.style, {
          position: 'fixed',
          zIndex: '10002',
          pointerEvents: 'none',
          left: '0px',
          top: '0px',
          filter: 'drop-shadow(2px 3px 4px rgba(0,0,0,0.45))',
        })
        cursor.style.transform = `translate(${sx - 6}px, ${sy - 4}px)`
        document.body.appendChild(cursor)

        const proxy = { x: sx, y: sy, scale: 1 }

        return new Promise(resolve => {
          gsap.to(proxy, {
            x: tx, y: ty,
            duration: 0.6,
            ease: 'power2.inOut',
            onUpdate: () => {
              cursor.style.transform = `translate(${proxy.x - 6}px, ${proxy.y - 4}px) scale(${proxy.scale})`
            },
            onComplete: () => {
              next.click()
              gsap.to(proxy, {
                scale: 0.65,
                duration: 0.1,
                yoyo: true,
                repeat: 1,
                ease: 'power2.out',
                onUpdate: () => {
                  cursor.style.transform = `translate(${proxy.x - 6}px, ${proxy.y - 4}px) scale(${proxy.scale})`
                },
                onComplete: () => {
                  gsap.to(cursor, {
                    opacity: 0,
                    duration: 0.2,
                    onComplete: () => {
                      cursor.remove()
                      resolve()
                    },
                  })
                },
              })
            },
          })
        })
      }, startIndex + i)
      await lib.waitForModel(page)
      await page.waitForTimeout(500)
      // await lib.animateCamera(page, { rotate: 'up', angle: 25, duration: 2000 })
      await page.waitForTimeout(2500)
    }

    await lib.syncpoint(page)

    // 4. 点击最大化按钮进入全屏缩略图模式
    await lib.animateCursorClick(page, 'button:has(svg.lucide-maximize2)', { duration: 1000, distanceY: 100 })
    await page.waitForTimeout(3000)

    // 5. 显示鼠标点击第五个缩略图，等待其加载完成
    await page.evaluate(() => {
      const grid = document.querySelector('.fixed.inset-0.z-50')
      if (grid) {
        const thumb = grid.querySelector('[data-index="4"]')
        if (thumb) thumb.dataset.movieTarget = 'true'
      }
    })
    await lib.animateCursorClick(page, '[data-movie-target="true"]', { duration: 1000, distanceY: 100 })
    await lib.waitForModel(page)
    await page.waitForTimeout(500)
    // 隐藏右侧的缩略图（仅竖屏）
    await page.evaluate(() => {
      if (window.innerHeight <= window.innerWidth) return
      const ui = window.__uiStore?.getState?.()
      if (ui?.rightPanelOpen) ui.toggleRightPanel()
    })

    // // 模型向up方向移动5%距离
    // await page.evaluate(async () => {
    //   const gsap = window.__gsap
    //   const api = window.__viewerAPI
    //   const THREE = window.__THREE
    //   const part = api.getPartProxy('__model__')
    //   if (!part) return

    //   // Resolve up-axis
    //   const up = window.__modelStore.getState().activeUpAxis
    //   const upIndex = up === 'z' ? 2 : 1 // 0=x, 1=y, 2=z

    //   // Compute model bounding box size
    //   const dev = window.__r3f_dev
    //   const box = new THREE.Box3()
    //   let hasGeom = false
    //   if (dev?.scene) {
    //     dev.scene.traverse((obj) => {
    //       if (obj.isMesh && obj.visible && obj.geometry) {
    //         box.expandByObject(obj)
    //         hasGeom = true
    //       }
    //     })
    //   }
    //   const size = hasGeom ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0)
    //   const upExtent = size.getComponent(upIndex)
    //   const distance = upExtent * 0.05

    //   const startPos = [part.position.x, part.position.y, part.position.z]
    //   const targetPos = [...startPos]
    //   targetPos[upIndex] += distance

    //   const proxy = { x: startPos[0], y: startPos[1], z: startPos[2] }
    //   return new Promise((resolve) => {
    //     gsap.to(proxy, {
    //       x: targetPos[0], y: targetPos[1], z: targetPos[2],
    //       duration: 2,
    //       ease: 'power2.inOut',
    //       onUpdate: () => {
    //         api.setPartTransform('__model__', { position: [proxy.x, proxy.y, proxy.z] })
    //       },
    //       onComplete: resolve,
    //     })
    //   })
    // })
    await page.waitForTimeout(2500)
  },
)
