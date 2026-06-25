import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'

//用3D模型查看器直接CAD建模，text-to-cad现在是通用技能了

// 3D建模、预览、打印，一个SKILL搞定
// 对于有自己的3D打印机的朋友，下载3d_viewer技能， 一些小的零件工具之类的，AI帮你建模

// 下载3d_viewer技能，实现3D建模、预览、打印一次性完成。适合玩3D打印，偶尔有一些小的建模需求的朋友。
// 通过自然语言描述自己的需求，AI生成OpenSCAD代码，然后转换成STL和3MF文件格式，可以自动发送到拓竹的Bambu Studio中进行打印。

const subtitle = `
{zh-CN-YunyangNeural}3D建模、预览、打印
{zh-CN-YunyangNeural}AI 一次性搞定
--1--
上个视频我发布了3D模型查看的技能(SKILL)
可以查看各种3D模型文件和动画
但其实它能做更多
下面演示如何建模
一个机械键盘的键帽
`;


lib.makeMovie(
  import.meta.url,
  'movies/car.glb',
  // 'movies/p1/exported.glb',
  {
    embed: '1',
    AutoRotate: '0',
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
    await lib.animateCamera(page, { rotate: 'y', angle:180, duration: 5000, ease: 'none' })
    await lib.clickById(page, 'e-btn-reset')
    await lib.animateCamera(page, { rotate: 'y', angle:270, duration: 5000, ease: 'none' })
    await page.waitForTimeout(1000)


  },
)
