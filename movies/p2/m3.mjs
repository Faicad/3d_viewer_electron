import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'



//用3D模型查看器直接CAD建模，text-to-cad现在是通用技能了

const subtitle = `
我们得到了键帽最基本的轮廓
继续处理这个模型
--1--
{zh-CN-YunxiaNeural}((提示词：))给这个物体Z轴方向的四条边添加两毫米的圆角
于是4条边都加上了圆角
--2--
{zh-CN-YunxiaNeural}((提示词：))给z轴顶部居中刻一个1毫米深的字母 B
一个最简单的键帽就基本成形了
--3--
然后添加3D打印的热床显示，看尺寸是否合适
如果模型合适，就可以导出为 STL等格式
--4--
如果你有拓竹3D打印机，也支持直接打印
`;


lib.makeMovie(
  import.meta.url,
  'movies/p2/1.stl',
  // 'movies/p1/exported.glb',
  {
    embed: '1',
    AutoRotate: '0',
    // shadowFloorEnabled: '0',
    // entryAnim: 'slide', 
    entryZoomDist: '5;10',
    entryZoomEndDist: '2.5;3.5',
    entryDuration: '3000',
    entryTargetShiftY: '0',
  },
  async (page, suffix, tPageOpen) => {
    // await page.screenshot({ path: '1.stl.png', fullPage: false })
    // await lib.screenshot(page, '1.stl')

    await page.waitForTimeout(2000)
    lib.syncpoint(page)

    await lib.unloadModel(page, 'movies/p2/1.stl')
    await lib.loadModel(page, 'movies/p2/2.stl', {
      resetCanvas: false,
      entryAnim: 'fade',
      entryDuration: '2000',
    })
    await page.waitForTimeout(4000)
    await lib.rotateModel(page, 360, 5000)
    await page.waitForTimeout(1000)
    lib.syncpoint(page)

    await lib.unloadModel(page, 'movies/p2/2.stl')
    await lib.loadModel(page, 'movies/p2/B.stl', {
      resetCanvas: false,
      entryAnim: 'fade',
      entryDuration: '2000',
    })
    await page.waitForTimeout(4000)
    await lib.rotateModel(page, 360, 5000)
    lib.syncpoint(page)

    await page.waitForTimeout(500)

    // 显示热床 → 相机自适应到完整热床范围
    // 竖屏热床占屏面积仅横屏一半（窄边约束），用更小的 margin 补偿
    await page.locator('[data-testid="toolbar-heatbed"]').click()
    await page.waitForTimeout(500)
    await lib.fitCameraToHeatbed(page, 2000, '2;1.3')
    await page.waitForTimeout(2000)
    await lib.captureCover(page)
    await page.waitForTimeout(1000)


    // 点击导出按钮（红圈引导 + 点击动画）
    await lib.clickWithHighlight(
      page,
      '[data-testid="toolbar-export"]',
      '导出 STL',
    )
    await page.waitForTimeout(1000)

    // 导出为 STL
    // await lib.saveExportedModel(page, 'stl', './exported.stl')
    lib.syncpoint(page)

    // 放大工具栏，以 Bambu Studio 按钮为中心
    // 红圈闪烁 → 鼠标从下方移上去点击
    await lib.clickWithHighlight(
      page,
      '[aria-label="Bambu Studio"]',
      '拓竹 BambuStudio',
      3000
    );
    await page.waitForTimeout(3000);
  },
)


