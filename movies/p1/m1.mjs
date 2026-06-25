import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'

//AI新技能SKILL, 20多种3D文件格式直接查看，丰富的动画效果

const subtitle = `
这是沃龙三叉戟3D打印机的模型
利用我写的AI技能（SKILL)
可以直接查看，不需要额外装其它软件
支持 STL 、GLB 、STP等
二十多种3D模型文件格式
这里演示的是
通过爆炸动画看装配结构
`;


lib.makeMovie(
  import.meta.url,
  'movies/Trident_Assembly.glb',
  // 'movies/p1/exported.glb',
  { embed: '1', 
    AutoRotate: '0', 
    entryAnim: 'slide', 
    entryZoomEndDist:'1.0;1.8', 
    entryDuration: '3000', 
    entryTargetShiftY: '0.1', 
  },
  async (page, suffix, tPageOpen) => {

    await page.waitForTimeout(1000)

    // 模型加载完成后，绕 Y 轴旋转180度
    // await lib.rotateModel(page, 180, 3000)
    // // 导出当前场景为 GLB
    // await lib.saveExportedModel(page, 'glb', 'p1/exported.glb')
    // return
    // await lib.animateCamera(page, { rotate: 'y', angle:180, duration: 3000, ease: 'none' })
    // await page.waitForTimeout(1000)    
    
    // GSAP爆炸 → 播放 → 重置
    await lib.callDemo(page, 'GSAPExplode', { spread: '3.5', range:'3' })
    await page.waitForSelector('#gsap-demo-explode')  // 等待动态 import 完成、面板创建
    await lib.setSelectValue(page, 'e-axis-select', lib.minorAxis)
    // await lib.setSelectValue(page, 'e-easing-select', 'none')
    await lib.clickById(page, 'e-btn-play')
    lib.animateCamera(page, { rotate: 'y', angle:90, duration: 3000, ease: 'none' })
    await page.waitForTimeout(3000)
    await lib.clickById(page, 'e-btn-reset')
    lib.animateCamera(page, { rotate: 'y', angle:90, duration: 3000, ease: 'none' })
    await page.waitForTimeout(3000)

    await page.waitForTimeout(1000)


    await lib.callDemo(page, 'GSAPExplode', { spread: '4', range:'4' })
    await page.waitForSelector('#gsap-demo-explode')  // 等待动态 import 完成、面板创建
    await lib.setSelectValue(page, 'e-axis-select', lib.majorAxis)
    await lib.setSelectValue(page, 'e-easing-select', 'none')
    await lib.clickById(page, 'e-btn-play')
    await page.waitForTimeout(4000)
    await lib.clickById(page, 'e-btn-reset')
    await page.waitForTimeout(4000)

    await page.waitForTimeout(1000)



  },
)
