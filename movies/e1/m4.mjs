import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'

// Windows自带3D查看器即将停用！替代神器来了


const subtitle = `
最终，我决定还是自己写一个3D查看器
就为解决三个痛点！
第一，要快，秒开模型零等待
第二，要方便，可快速浏览同目录所有3D模型
第三，格式全，支持20多种3D文件格式
最良心的是，这款工具完全开源免费！
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
    entryZoomEndDist: '1.1;1.8',
    entryDuration: '4000',
    entryTargetShiftY: '0.1',
  },
  async (page, suffix, tPageOpen) => {
    await lib.syncpoint(page)
    
    // GSAP爆炸 → 播放 → 重置
    await lib.callDemo(page, 'GSAPExplode', { spread: '5', range:'5' })
    await page.waitForSelector('#gsap-demo-explode')  // 等待动态 import 完成、面板创建
    await lib.setSelectValue(page, 'e-axis-select', 'y')
    // await lib.setSelectValue(page, 'e-easing-select', 'none')
    await lib.clickById(page, 'e-btn-play')
    // await lib.animateCamera(page, { rotate: 'y', angle:180, duration: 5000, ease: 'none' })


  },
)
