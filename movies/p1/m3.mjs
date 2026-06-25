import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'

const __mdir = dirname(fileURLToPath(import.meta.url))
const PART_NAMES_PATH = join(__mdir, 'part-names.json')
const NAME_MAP = JSON.parse(readFileSync(PART_NAMES_PATH, 'utf-8'))


const subtitle = `
你可以让ai给模型更换材质
--1--
{zh-CN-YunxiaNeural}((提示词： ))把汽车模型的外壳都换成黄金材质
于是外壳材质就都换掉了
车身、车门、翼子板都变成了黄金做的
--2--
还支持各种动画效果
模型旋转、视角切换等
--3--
还可以让ai做更多
{zh-CN-YunxiaNeural}((提示词：  ))帮我设置田园风格的环境贴图
ai会自动下载图片并替换
--4--
欢迎安装试用！
`;


lib.makeMovie(
  import.meta.url,
  'movies/Car.glb',
  { embed: '1', 
    AutoRotate: '0', 
    entryAnim: 'zoom', 
    entryZoomDist: '5;10', 
    entryZoomEndDist:'1.0;1.8', 
    entryDuration: '2500', 
    entryTargetShiftY: '0.5', 
  },
  async (page, suffix, tPageOpen) => {
    await page.waitForTimeout(1300)
    lib.syncpoint(page)
    const partResult = await page.evaluate(() =>
      window.__queryParts({ color: { rgb: [42, 0, 204], tolerance: 0 } })
    )
    const blueParts = partResult.map(r => r.partName)

    let labelText = ''
    for (let i = 0; i < blueParts.length; i++) {
      if(i ==0) continue; // esta80_interior_LHD 车内饰
      await lib.postMessageAndWait(page, {
        id: `movie-gold-${i}`,
        command: 'setPartMaterialByPreset',
        params: { preset: 'gold', partName: blueParts[i] },
      })
      const raw = blueParts[i]
      const display = NAME_MAP[raw]?.zh || raw
      labelText += `⚙ ${display}\n`
      await lib.showOverlay(page, 'part-list', labelText.trimEnd(), 'top-left', 'font-size:28px;color:#fff;white-space:pre-line;text-align:left')
      await page.waitForTimeout(900)
    }
    await page.waitForTimeout(300)
    lib.syncpoint(page)

    // 模型加载完成后，绕 Y 轴旋转 1/4 圈（90°），动画 2 秒，自动停止
    await lib.rotateModel(page, 90, 2000)
    await page.waitForTimeout(1000)

    await lib.clearOverlays(page)

    // 选择本时刻截图当视频封面
    await lib.captureCover(page)

    // 旋转后从俯视切换为平视，同时拉远1.3倍让侧面完整显示
    const cam = await page.evaluate(() => window.__viewerAPI.getCameraState())
    await lib.animateCamera(page, {
      to: { x: cam.position[0], y: cam.target[1], z: cam.position[2] },
      factor: 1.0,
      duration: 1800,
    })
    await page.waitForTimeout(1000)
    lib.syncpoint(page)

    await lib.setEnv(page, '/movies/kloppenheim_02')
    await page.waitForTimeout(3300)

    await lib.animateCamera(page, { rotate: 'y', duration: 5500, ease: 'none' })
    await page.waitForTimeout(1200)

    lib.syncpoint(page)
    await lib.translateModel(page, 100, 0, 0, 2000, 'power3.in')
    await page.waitForTimeout(1000)
  },
)
