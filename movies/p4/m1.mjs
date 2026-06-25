import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'

// AI写代码
// 踩坑了？

const subtitle = `
AI写代码是真的快
但是也真的有坑
今天调试一个bug
图中的模型，浏览器加载的时候卡死了
通过分析发现，原来是AI写代码不考虑性能导致的
这个地牢模型有大几百个零件
AI不分大小全部生成实时的阴影效果
包括很小的金币也不例外
还有一个更严重的问题
AI一次性生成所有零部件的纹理缩略图
还不考虑去重复
直接导致浏览器卡死
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
    entryDuration: '2000',
    entryTargetShiftY: '0.1',
  },
  async (page, suffix, tPageOpen) => {
    await page.waitForTimeout(1000)
    await lib.captureCover(page)

    // GSAP爆炸 → 播放 → 重置
    await lib.callDemo(page, 'GSAPExplode', { spread: '5', range:'12' })
    await page.waitForSelector('#gsap-demo-explode')  // 等待动态 import 完成、面板创建
    await lib.setSelectValue(page, 'e-axis-select', 'y')
    // await lib.setSelectValue(page, 'e-easing-select', 'none')
    await lib.clickById(page, 'e-btn-play')
    await lib.animateCamera(page, { rotate: 'y', angle:180, duration: 12000, ease: 'none' })
    await lib.clickById(page, 'e-btn-reset')
    await lib.animateCamera(page, { rotate: 'y', angle:180, duration: 12000, ease: 'none' })
    await page.waitForTimeout(1000)

    // 相机逐步拉近，模型逐渐变大直到消失
    await lib.animateCamera(page, { factor: '0.001', duration: 4000, ease: 'none' })
    await lib.unloadModel(page)
  },
)
