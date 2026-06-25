import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'


const subtitle = `
我们这个软件(3d_viewer)
支持编辑模型的材质
编辑的时候要显示缩略图
我没说缩略图何时生成
AI就自作主张
在加载时一次性全生成了
结果卡死了
所以目前让AI写代码
需求还是要尽可能详细
你不说就很可能踩坑
AI似乎还没有时间观念
--1--
而且，AI还没有金钱观念
花token时，一点都不心疼
你们用AI写代码碰到了哪些坑
欢迎在评论区分享
`;


lib.makeMovie(
  import.meta.url,
  'movies/dungeon_warkarma.glb',
  {
    embed: '1',
    AutoRotate: '0',
    entryAnim: 'zoom', 
    entryZoomDist: '5;10',
    entryZoomEndDist: '1.0;1.2',
    entryDuration: '1000',
    entryTargetShiftY: '0.1',
  },
  async (page, suffix, tPageOpen) => {

    await page.waitForTimeout(1000)

    // 打开右侧场景树面板
    await page.evaluate(() => {
      const s = window.__uiStore?.getState()
      if (!s?.rightPanelOpen) s?.toggleRightPanel()
    })
    await page.waitForTimeout(300)

    // 在场景树中找到文件节点，右键打开上下文菜单
    const fileNode = page.locator('[data-testid="scene-tree-file"]').first()
    await fileNode.click({ button: 'right' })

    // 停留三秒，让观众看到上下文菜单
    await page.waitForTimeout(2000)
  
    // 点击"材质管理"
    const materialManager = page.getByText(/Material Manager|材质管理/)
    await materialManager.click()

    await page.waitForTimeout(2000)

    // 关闭右侧场景树面板
    await page.evaluate(() => {
      const s = window.__uiStore?.getState()
      if (s?.rightPanelOpen) s?.toggleRightPanel()
    })

    // 等面板打开
    await page.waitForTimeout(1000)

    // 慢速滚动面板到底部
    await page.evaluate(async () => {
      const container = document.querySelector('.overflow-y-auto.flex-1')
      if (!container) return
      const maxScroll = container.scrollHeight - container.clientHeight
      if (maxScroll <= 0) return
      const duration = 9000
      const startTime = performance.now()
      const startScroll = container.scrollTop
      return new Promise(resolve => {
        const step = (now) => {
          const t = Math.min((now - startTime) / duration, 1)
          const ease = 1 - Math.pow(1 - t, 3)
          container.scrollTop = startScroll + (maxScroll - startScroll) * ease
          if (t < 1) requestAnimationFrame(step)
          else resolve()
        }
        requestAnimationFrame(step)
      })
    })

    // 点击纹理缩略图（Textures 表格中第一张）
    const panelBody = page.locator('.overflow-y-auto.flex-1')
    await panelBody.locator('img.cursor-zoom-in').first().click()
    await page.waitForTimeout(3000)

    // 点击屏幕左上角关闭预览覆盖层
    await page.mouse.click(5, 5)
    await page.waitForTimeout(500)

    // 反向滚动到顶部
    await page.evaluate(async () => {
      const container = document.querySelector('.overflow-y-auto.flex-1')
      if (!container) return
      const duration = 7000
      const startTime = performance.now()
      const startScroll = container.scrollTop
      return new Promise(resolve => {
        const step = (now) => {
          const t = Math.min((now - startTime) / duration, 1)
          const ease = 1 - Math.pow(1 - t, 3)
          container.scrollTop = startScroll * (1 - ease)
          if (t < 1) requestAnimationFrame(step)
          else resolve()
        }
        requestAnimationFrame(step)
      })
    })


    // 关闭材质管理面板
    await page.locator('button[aria-label="Close"]').click()

    await lib.syncpoint(page)

    // 将所有金币节点随机放大 5-10 倍并向随机方向移动，动画时长 8 秒
    await page.evaluate(async () => {
      const gsap = window.__gsap
      const api = window.__viewerAPI
      if (!gsap || !api) return
      const parts = api.getParts()
      const coinParts = parts.filter(p =>
        /coin|金币/i.test(p.name) && api.getPartProxy(p.partId)
      )
      if (coinParts.length === 0) return
      const range = 30
      const tl = gsap.timeline()
      for (const p of coinParts) {
        const proxy = api.getPartProxy(p.partId)
        const s = 5 + Math.random() * 5
        const dx = (Math.random() - 0.5) * range * 2 + 50
        const dy = (Math.random() - 0.5) * range * 2
        const dz = (Math.random() - 0.5) * range * 2
        tl.to(proxy.position, { x: proxy.position.x + dx, y: proxy.position.y + dy, z: proxy.position.z + dz, duration: 12, ease: 'power2.inOut' }, 0)
        tl.to(proxy.scale, { x: s, y: s, z: s, duration: 12, ease: 'power2.inOut' }, 0)
      }
    })
    await page.waitForTimeout(12500)

  },
)
