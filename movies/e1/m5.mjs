import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'

// Windows自带3D查看器即将停用！替代神器来了

// 随着前年入坑3D打印
// 电脑上的3D模型越来越多
// 平时想快速浏览和查找模型
// 总是没有合适的软件
// 之前勉强用windows的
// 自带的3D查看器
// 但是它功能有限
// 而且将在3天后结束支持
// 还有拓竹的Bambu Studio可用
// 但是打开一个文件总是要等十多秒
// 有时甚至是几十秒
// 最终，我决定还是自己写一个3D查看器
// 就为解决三个痛点！

// 第一，要快，秒开模型零等待
// 第二，要方便，可快速浏览同目录所有3D模型
// 第三，格式全，支持20多种3D文件格式


// 最良心的是，这款工具完全开源免费！
// 国内用户前往 Gitcode 下载，
// 海外用户直接 Github 获取。
// 无广告、无收费、无捆绑。
// 如果你也需要一款稳定、快速
// 的本地3D模型查看工具，
// 建议你赶紧收藏自取！





const subtitle = `
{zh-CN-YunyangNeural}3D建模、预览、打印
--1--
上个视频我发布了3D模型查看的技能(SKILL)
`;


lib.makeMovie(
  import.meta.url,
  'movies/car.glb',
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
