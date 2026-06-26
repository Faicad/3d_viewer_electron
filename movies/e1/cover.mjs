import { existsSync, writeFileSync, unlinkSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { spawnSync } from 'child_process'
import { chromium } from 'playwright'

const projectDir = dirname(fileURLToPath(import.meta.url))
const projectName = basename(projectDir)
const genDir = join(projectDir, 'gen')

// ===== 文案 =====
const text1 = 'AI写代码'
const text2 = '踩坑了？'

// ===== 预设 =====
// 改这一行即可切换：gold-blue | rose-teal | amber-violet | coral-navy | emerald-peach | platinum-slate | neon-cyan | copper-sage | ruby-ice | lavender-mint
const PRESET = 'amber-violet'
const SWAP = false  // true → text1/text2 颜色互换

// ===== 布局 =====
// 横屏(h)竖屏(v)分开，每行文字独立配置 { top: 百分比数字, align: 'left'|'center'|'right' }
const LAYOUT = {
  h: {
    text1: { top: 44, align: 'left', pad:15 },
    text2: { top: 70, align: 'right', pad:15 },
  },
  v: {
    text1: { top: 23, align: 'center' },
    text2: { top: 80, align: 'center' },
  },
}

// 每个预设定义两行文字各自的渐变三色 [亮, 中, 暗]
// 中色同时作为不支持 background-clip 时的 fallback
const PRESETS = {
  'gold-blue': {       // 金蓝 · 暖冷互补
    text1: ['#F8ECD0', '#F0D898', '#E4C878'],
    text2: ['#E0ECF8', '#C4D8EC', '#A8C4E0'],
  },
  'rose-teal': {       // 玫青 · 温柔互补
    text1: ['#F5D5E0', '#E8A0B8', '#D07890'],
    text2: ['#C8F0E5', '#90D8C0', '#68C0A8'],
  },
  'amber-violet': {    // 琥珀紫 · 强烈互补
    text1: ['#FDE8C8', '#F5B860', '#E89828'],
    text2: ['#E0D8F8', '#B098E8', '#8878D0'],
  },
  'coral-navy': {      // 珊瑚藏蓝 · 活力对比
    text1: ['#F8D8D0', '#F09080', '#E06850'],
    text2: ['#D0D8F0', '#8898D0', '#6070B8'],
  },
  'emerald-peach': {   // 翠蜜桃 · 自然清新
    text1: ['#D0F0E0', '#80D0A8', '#50B880'],
    text2: ['#F8E8D8', '#F0C098', '#E8A068'],
  },
  'platinum-slate': {  // 铂石灰 · 极简单色
    text1: ['#F0F0F0', '#D0D0D0', '#A8A8A8'],
    text2: ['#E0E4E8', '#B0B8C0', '#889098'],
  },
  'neon-cyan': {       // 霓虹青 · 科技感
    text1: ['#F8F8B8', '#F0E840', '#E0D810'],
    text2: ['#B8F8F8', '#40E0E0', '#00B8C8'],
  },
  'copper-sage': {     // 铜绿灰 · 复古大地
    text1: ['#F0D8C0', '#D8A080', '#C08050'],
    text2: ['#E0E8D8', '#B8C8A8', '#90A878'],
  },
  'ruby-ice': {        // 宝石冰 · 强烈冷暖
    text1: ['#F0C8D0', '#E06078', '#C83050'],
    text2: ['#D0E8F8', '#88C0E8', '#58A0D0'],
  },
  'lavender-mint': {   // 薰衣草薄荷 · 柔和梦幻
    text1: ['#F0E0F8', '#C8A8E8', '#A880D0'],
    text2: ['#D8F8E8', '#98E8C0', '#68D098'],
  },
}

// ===== cover.png 叠加 =====
const coverPngPath = join(projectDir, 'cover.png')
const hasCoverOverlay = existsSync(coverPngPath)
const coverImgUrl = hasCoverOverlay ? pathToFileURL(coverPngPath).href : null
if (hasCoverOverlay) console.log(`[cover] Found cover.png, overlaying on base`)

function gradientStyle(stops) {
  return `color:${stops[1]};background-image:linear-gradient(180deg,${stops.join(',')});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent`
}

function positionCss({ top, align, pad = 20 }) {
  switch (align) {
    case 'left':   return `top:${top}%;left:${pad}%;text-align:left;`
    case 'right':  return `top:${top}%;right:${pad}%;text-align:right;`
    case 'center':
    default:       return `top:${top}%;left:50%;text-align:center;transform:translate(-50%,-50%);`
  }
}

function probePng(path) {
  const r = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0', path,
  ], { stdio: 'pipe', timeout: 5000 })
  const [w, h] = r.stdout.toString().trim().split(',').map(Number)
  return w && h ? { w, h } : null
}

function fontSizeForWidth(width, text) {
  let wide = 0, narrow = 0
  for (const ch of text) {
    if (/[一-鿿　-〿＀-￯]/.test(ch)) wide++
    else narrow++
  }
  return Math.floor(width * 0.8 / (wide + narrow * 0.6))
}

// h/v 格式尺寸
const COVER_SIZE = { h: { w: 1920, h: 1080 }, v: { w: 1080, h: 1920 } }

const orientations = ['h', 'v']
let anyWork = false
const browser = await chromium.launch()

try {
  for (const orient of orientations) {
    const isH = orient === 'h'
    let w, h, imgUrl, rawPath

    if (hasCoverOverlay) {
      // 有 cover.png → 忽略 gen 图片，用灰色底图
      const size = COVER_SIZE[orient]
      w = size.w; h = size.h
      imgUrl = null
      rawPath = null
    } else {
      rawPath = join(genDir, `${projectName}_cover_${orient}.png`)
      if (!existsSync(rawPath)) {
        console.log(`[cover] ${basename(rawPath)} not found, skipping`)
        continue
      }
      const dims = probePng(rawPath)
      if (!dims) { console.error(`[cover] Cannot probe ${basename(rawPath)}`); continue }
      w = dims.w; h = dims.h
      imgUrl = pathToFileURL(rawPath).href
    }

    const baseFs = fontSizeForWidth(w, text1)
    const fs = isH ? Math.round(baseFs * 0.5) : baseFs
    const finalPath = join(genDir, `${projectName}_cover_final_${orient}.png`)

    const raw = PRESETS[PRESET] ?? PRESETS['gold-blue']
    const p = SWAP ? { text1: raw.text2, text2: raw.text1 } : raw
    const layout = LAYOUT[orient]
    const text1Css = positionCss(layout.text1) + gradientStyle(p.text1)
    const text2Css = positionCss(layout.text2) + gradientStyle(p.text2)

    const targetRatio = isH ? 4 / 3 : 3 / 4
    const bgStyle = hasCoverOverlay
      ? `background:radial-gradient(ellipse at 50% 30%,#d8d8d8 0%,#b0b0b0 100%)`
      : `background:url('${imgUrl}') no-repeat center/cover`

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${w}px;height:${h}px;${bgStyle};position:relative}
.t{font-size:${fs}px;font-weight:bold;font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Noto Sans CJK',sans-serif;filter:drop-shadow(0 2px 4px rgba(0,0,0,.85)) drop-shadow(0 6px 28px rgba(0,0,0,.45));line-height:1.2;position:absolute;word-break:keep-all;z-index:2}.overlay{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:1;mix-blend-mode:multiply}
.text1{${text1Css}}
.text2{${text2Css}}
</style></head><body>
${hasCoverOverlay ? `<img class="overlay" src="${coverImgUrl}">` : ''}
<div class="t text1" id="text1El">${text1}</div>
<div class="t text2" id="text2El">${text2}</div>
<script>
console.log('__CV__ viewport w='+document.documentElement.clientWidth+' h='+document.documentElement.clientHeight);var r=document.getElementById.bind(document),R=Math.round,W=${w},H=${h},tr=${targetRatio},tx={text1El:'${text1}',text2El:'${text2}'};var sl=0,st=0,sw=W,sh=H;if(W/H>tr){sw=R(H*tr);sl=R((W-sw)/2)}else{sh=R(W/tr);st=R((H-sh)/2)};['text1El','text2El'].forEach(function(id){var e=r(id);if(!e)return;var b=e.getBoundingClientRect(),ok=b.left>=sl&&b.top>=st&&b.right<=sl+sw&&b.bottom<=st+sh;console.log('__CV__ '+id+' text="'+tx[id]+'" b=['+R(b.left)+','+R(b.top)+','+R(b.right)+','+R(b.bottom)+'] safe=['+sl+','+st+','+R(sl+sw)+','+R(st+sh)+'] ok='+ok)})
</script>
</body></html>`

    const htmlTmp = join(genDir, `_cover_tmp_${orient}.html`)
    writeFileSync(htmlTmp, html)

    const page = await browser.newPage({ viewport: { width: w, height: h } })
    let checkOk = true
    page.on('console', msg => {
      const t = msg.text()
      if (!t.startsWith('__CV__')) return
      if (t.includes(' ok=')) {
        const ok = t.includes(' ok=true')
        if (!ok) {
          checkOk = false
          const m = t.replace('__CV__ ', '')
          console.error(`[cover] 安全区越界: ${basename(finalPath)} (${orient}) ${m}`)
        }
      }
    })
    page.on('pageerror', err => {
      console.error(`[cover] Page error:`, err.message)
      checkOk = false
    })
    await page.goto(`file://${htmlTmp}`, { waitUntil: 'networkidle' })
    if (!checkOk) { await page.close(); unlinkSync(htmlTmp); process.exit(1) }
    await page.screenshot({ path: finalPath, fullPage: false })
    await page.close()
    unlinkSync(htmlTmp)

    const srcLabel = hasCoverOverlay ? 'cover.png + gray bg' : basename(rawPath)
    console.log(`[cover] ${srcLabel} → ${basename(finalPath)} (${w}×${h}, font ${fs}px${isH?', 60% scale':''})`)
    anyWork = true
  }
} finally {
  await browser.close()
}

if (!anyWork) process.exit(1)
