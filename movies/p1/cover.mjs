import { existsSync, writeFileSync, unlinkSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { spawnSync } from 'child_process'
import { chromium } from 'playwright'

const projectDir = dirname(fileURLToPath(import.meta.url))
const projectName = basename(projectDir)
const genDir = join(projectDir, 'gen')

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
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) wide++
    else narrow++
  }
  return Math.floor(width * 0.8 / (wide + narrow * 0.6))
}

const orientations = ['h', 'v']
let anyWork = false
const browser = await chromium.launch()

try {
  for (const orient of orientations) {
    const rawPath = join(genDir, `${projectName}_cover_${orient}.png`)
    if (!existsSync(rawPath)) {
      console.log(`[cover] ${basename(rawPath)} not found, skipping`)
      continue
    }
    const dims = probePng(rawPath)
    if (!dims) { console.error(`[cover] Cannot probe ${basename(rawPath)}`); continue }

    const { w, h } = dims
    const imgUrl = pathToFileURL(rawPath).href
    const baseFs = fontSizeForWidth(w, '3D模型查看')
    const fs = orient === 'h' ? Math.round(baseFs * 0.5) : baseFs
    const finalPath = join(genDir, `${projectName}_cover_final_${orient}.png`)

    const isH = orient === 'h'
    const aiColor = 'color:#C4D8EC;background-image:linear-gradient(180deg,#E0ECF8,#C4D8EC,#A8C4E0);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent'
    const aiCss = isH
      ? 'top:25%;left:20%;text-align:left;transform:translateY(-50%);' + aiColor
      : 'top:30%;left:50%;text-align:center;transform:translate(-50%,-50%);' + aiColor
    const textColor = 'color:#F0D898;background-image:linear-gradient(180deg,#F8ECD0,#F0D898,#E4C878);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent'
    const textCss = isH
      ? 'top:80%;right:20%;text-align:right;transform:translateY(-50%);' + textColor
      : 'top:75%;right:5%;text-align:right;transform:translateY(-50%);' + textColor

    const targetRatio = isH ? 4 / 3 : 3 / 4

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${w}px;height:${h}px;background:url('${imgUrl}') no-repeat center/cover;position:relative}
.t{font-size:${fs}px;font-weight:bold;font-family:'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Noto Sans CJK',sans-serif;filter:drop-shadow(0 2px 4px rgba(0,0,0,.85)) drop-shadow(0 6px 28px rgba(0,0,0,.45));line-height:1.2;position:absolute;word-break:keep-all}
.ai{${aiCss}}
.text{${textCss}}
</style></head><body>
<div class="t ai" id="aiEl"><span id="aiEn">AI</span><span id="aiCn">新技能</span></div>
<div class="t text" id="textEl">3D模型查看</div>
<script>
console.log('__CV__ viewport w='+document.documentElement.clientWidth+' h='+document.documentElement.clientHeight);var r=document.getElementById.bind(document),R=Math.round,W=${w},H=${h},tr=${targetRatio},tx={aiEl:'AI新技能',textEl:'3D模型查看'};var sl=0,st=0,sw=W,sh=H;if(W/H>tr){sw=R(H*tr);sl=R((W-sw)/2)}else{sh=R(W/tr);st=R((H-sh)/2)};['aiEl','textEl'].forEach(function(id){var e=r(id);if(!e)return;var b=e.getBoundingClientRect(),ok=b.left>=sl&&b.top>=st&&b.right<=sl+sw&&b.bottom<=st+sh;console.log('__CV__ '+id+' text="'+tx[id]+'" b=['+R(b.left)+','+R(b.top)+','+R(b.right)+','+R(b.bottom)+'] safe=['+sl+','+st+','+R(sl+sw)+','+R(st+sh)+'] ok='+ok)})
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

    console.log(`[cover] ${basename(rawPath)} → ${basename(finalPath)} (${w}×${h}, font ${fs}px${isH?', 60% scale':''})`)
    anyWork = true
  }
} finally {
  await browser.close()
}

if (!anyWork) process.exit(1)
