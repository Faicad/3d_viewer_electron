import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as lib from '../lib.mjs'


const subtitle = `
STL文件——最常见的3D打印格式
--1--
GLB文件——通用的3D模型交换格式
--2--
3MF文件——专为3D打印设计的完整格式
--3--
STEP文件——工业级CAD数据交换标准
--4--
OBJ文件——最广泛支持的3D网格格式
--5--
PLY文件——3D扫描生成的顶点数据格式
--6--
FBX文件——动画和游戏行业的通用格式
--7--
DAE文件——基于XML的3D交互格式
--8--
3DS文件——经典3D建模软件的标准格式
--9--
USDZ文件——苹果AR生态的3D格式
--10--
DRC文件—— Google Draco高压缩率3D格式
--11--
BVH文件——人体骨骼动画数据格式
--12--
VTK文件——科学可视化的体积数据格式
--13--
XYZ文件——纯文本格式的点云数据
--14--
PDB文件——蛋白质分子三维结构格式
--15--
NRRD文件——医学影像的体素数据格式
--16--
GCode文件——3D打印机的运动指令格式
--17--
WRL文件——早期Web3D的虚拟现实格式
--18--
VOX文件——体素风格的立体像素格式
--19--
KMZ文件——Google Earth的地理3D格式
--20--
AMF文件——增强型3D打印格式
--21--
LWO文件——影视特效行业的建模格式
--22--
MD2文件——经典3D游戏的角色模型格式
--23--
PCD文件——点云库标准数据格式
--24--
3DM文件——Rhino的工业设计模型格式
`

const MODELS = [
  { path: 'testdata/688_Bearing_Assembled.stl', label: 'STL' },
  { path: 'AnisotropyBarnLamp.glb', label: 'GLB' },
  { path: 'vise.3mf', label: '3MF' },
  { path: 'Mini注塑模具.stp', label: 'STEP' },
  { path: 'Cerberus.obj', label: 'OBJ' },
  { path: 'dolphins_be.ply', label: 'PLY' },
  { path: 'mixamo.fbx', label: 'FBX' },
  { path: 'elf.dae', label: 'DAE' },
  { path: 'portalgun.3ds', label: '3DS' },
  { path: 'saeukkang.usdz', label: 'USDZ' },
  { path: 'bunny.drc', label: 'DRC' },
  { path: 'pirouette.bvh', label: 'BVH' },
  { path: 'bunny.vtk', label: 'VTK' },
  { path: 'helix_201.xyz', label: 'XYZ' },
  { path: 'Al2O3.pdb', label: 'PDB' },
  { path: 'I.nrrd', label: 'NRRD' },
  { path: 'benchy.gcode', label: 'GCode' },
  { path: 'camera.wrl', label: 'WRL' },
  { path: 'menger.vox', label: 'VOX' },
  { path: 'Box.kmz', label: 'KMZ' },
  { path: 'rook.amf', label: 'AMF' },
  { path: 'Demo.lwo', label: 'LWO' },
  { path: 'ogro.md2', label: 'MD2' },
  { path: 'simple.pcd', label: 'PCD' },
  { path: 'Rhino_Logo.3dm', label: '3DM' },
]

const ENTRY_MS = 1500

lib.makeMovie(
  import.meta.url,
  join(lib.fixtureDir, MODELS[0].path),
  {
    AutoRotate: '0',
    closeLeftPanel: '1',
    entryAnim: 'fade',
    entryDuration: String(ENTRY_MS),
  },
  async (page, suffix, tPageOpen) => {
    lib.showOverlay(page, 'fmt', '1. STL', 'top-left', 'color:#fff;font-size:42px;font-weight:700;background:rgba(0,0,0,0.5);padding:12px 24px;border-radius:10px;font-family:sans-serif')
    await lib.rotateModel(page, 180, 3000)
    await lib.syncpoint(page)

    for (let i = 1; i < MODELS.length; i++) {
      try {
        await lib.loadModel(page, join(lib.fixtureDir, MODELS[i].path), {
          entryAnim: 'fade',
          entryDuration: ENTRY_MS,
        })
        lib.showOverlay(page, 'fmt', `${i + 1}. ${MODELS[i].label}`, 'top-left', 'color:#fff;font-size:42px;font-weight:700;background:rgba(0,0,0,0.5);padding:12px 24px;border-radius:10px;font-family:sans-serif')
        await page.waitForTimeout(500)
        await lib.rotateModel(page, 180, 3000)
        await page.waitForTimeout(1000)
      } catch {
        console.log(`  [${suffix}] Failed to load ${MODELS[i].label}, skipping`)
        await page.waitForTimeout(1000)
      }
      if (i < MODELS.length - 1) await lib.syncpoint(page)
    }
  },
)
