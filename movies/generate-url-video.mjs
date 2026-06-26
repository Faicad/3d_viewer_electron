import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, statSync } from 'fs'
import { resolve, dirname, basename, extname, join, relative } from 'path'
import { spawnSync } from 'child_process'
import { pathToFileURL, fileURLToPath } from 'url'
import { chromium } from 'playwright'
import * as lib from './lib.mjs'
import { generateSubtitle, parseSubtitleLines, INITIAL_GAP, INTER_LINE_GAP, DEFAULT_TTS_PROVIDER } from './generate-subtitle.mjs'

// ── Constants ──
const STATIC_DURATION = 1         // 首屏停留秒数
const ORIENTATIONS = [
  // 横屏：屏幕高度 × 3%/秒
  { width: 1920, height: 1080, suffix: '_h', label: '横屏', scrollRatio: 0.03 },
  // 竖屏：屏幕高度 × 2%/秒
  { width: 1080, height: 1920, suffix: '_v', label: '竖屏', scrollRatio: 0.02 },
]

function pad4(i) { return String(i).padStart(4, '0') }
const round2 = (v) => Math.round(v * 100) / 100

// ── Helpers ──

function parseUrls(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  const m = src.match(/(?:^|\n)const\s+urls\s*=\s*(\[[\s\S]*?\])\s*;?\s*(?:\n|$)/)
  if (!m) {
    console.error('No `const urls = [...]` found in', scriptPath)
    process.exit(1)
  }
  return new Function(`return ${m[1]}`)()
}

function probeImageDimensions(imagePath) {
  const r = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0', imagePath,
  ], { stdio: 'pipe', timeout: 10000 })
  const [w, h] = r.stdout.toString().trim().split(',').map(Number)
  return w && h ? { width: w, height: h } : null
}

function computeImageDurations(entries) {
  const segDurs = entries.map(e => round2(e.e - e.s))
  return segDurs.map((d, i) => {
    let dur = d
    if (i === 0) dur += INITIAL_GAP
    if (i < segDurs.length - 1) dur += INTER_LINE_GAP
    return round2(dur)
  })
}

/**
 * 从全页截图生成滚动视频片段。
 * 首屏停留 STATIC_DURATION 秒，然后以 scrollSpeed px/s 向下滚动，到底停止。
 * 截图可能比 viewport 窄（如 1905px vs 1920px 由滚动条导致），先 pad 再 crop。
 */
function buildScrollClip(fullImagePath, outputPath, viewW, viewH, duration, scrollSpeed, scrollable, imageW, imageH) {
  console.log(`    ${basename(outputPath)} (${duration.toFixed(2)}s, scroll ${scrollSpeed}px/s, img ${imageW}×${imageH})`)

  const tempOutput = outputPath.replace(/\.\w+$/, '.tmp$&')
  const padFilter = `pad=${Math.max(imageW, viewW)}:${Math.max(imageH, viewH)}:${Math.floor((Math.max(imageW, viewW) - imageW) / 2)}:0:black`

  // 无需滚动：静止显示首屏
  if (scrollable <= 0 || duration <= STATIC_DURATION || scrollSpeed <= 0) {
    const r = spawnSync('ffmpeg', [
      '-y', '-loop', '1', '-t', duration.toFixed(3), '-i', fullImagePath,
      '-vf', `${padFilter},crop=${viewW}:${viewH}:0:0`,
      '-c:v', 'libvpx-vp9', '-b:v', '8M', '-pix_fmt', 'yuv420p',
      tempOutput,
    ], { stdio: 'pipe', timeout: 60000 })
    if (r.status !== 0) {
      console.error('    FFmpeg failed:', r.stderr.toString().split('\n').slice(-3).join('\n'))
      try { rmSync(tempOutput, { force: true }) } catch {}
      return false
    }
  } else {
    // 滚动：首屏静止 → 缓慢下移
    const r = spawnSync('ffmpeg', [
      '-y', '-loop', '1', '-i', fullImagePath,
      '-vf', `${padFilter},crop=${viewW}:${viewH}:0:'min(${scrollable}, max(0, (t-${STATIC_DURATION})*${scrollSpeed}))'`,
      '-t', duration.toFixed(3),
      '-c:v', 'libvpx-vp9', '-b:v', '8M', '-pix_fmt', 'yuv420p',
      tempOutput,
    ], { stdio: 'pipe', timeout: 120000 })
    if (r.status !== 0) {
      console.error('    FFmpeg failed:', r.stderr.toString().split('\n').slice(-3).join('\n'))
      try { rmSync(tempOutput, { force: true }) } catch {}
      return false
    }
  }

  if (existsSync(outputPath)) rmSync(outputPath, { force: true })
  renameSync(tempOutput, outputPath)
  return true
}

/** 用 concat demuxer 拼接同编码的 .webm 片段 */
function concatWebmClips(clipPaths, outputPath) {
  const existing = clipPaths.filter(p => existsSync(p) && statSync(p).size > 0)
  if (existing.length === 0) return false
  if (existing.length === 1) {
    if (existsSync(outputPath)) rmSync(outputPath, { force: true })
    renameSync(existing[0], outputPath)
    return true
  }

  const listPath = join(dirname(outputPath), `.concat_${basename(outputPath)}.txt`)
  writeFileSync(listPath, existing.map(p => `file '${resolve(p).replace(/\\/g, '/')}'`).join('\n'), 'utf-8')
  const tempOutput = outputPath.replace(/\.\w+$/, '.tmp$&')
  const r = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c', 'copy', tempOutput,
  ], { stdio: 'pipe', timeout: 120000 })
  try { rmSync(listPath, { force: true }) } catch {}

  if (r.status !== 0) {
    console.error('  Concat failed:', r.stderr.toString().slice(0, 500))
    try { rmSync(tempOutput, { force: true }) } catch {}
    return false
  }
  if (existsSync(outputPath)) rmSync(outputPath, { force: true })
  renameSync(tempOutput, outputPath)
  return true
}

/** 等价于 lib.burnVideo()，但使用 URL 模式自定义方向尺寸 */
function burnUrlVideo(scriptUrl, genDir, orientations) {
  const scriptName = basename(fileURLToPath(scriptUrl), '.mjs')
  const targetFps = lib.resolve30fps() ? 30 : 25
  const useDefaultBg = process.argv.slice(2).includes('--default-bg')
  const audioBg = useDefaultBg ? lib.DEFAULT_BGM : null
  const rel = (p) => relative(process.cwd(), p).replace(/\\/g, '/')

  for (const { width, height, suffix } of orientations) {
    const clip = rel(join(genDir, `${scriptName}${suffix}.webm`))
    if (!existsSync(join(genDir, `${scriptName}${suffix}.webm`))) {
      console.log(`  ${suffix} no video, skipping`)
      continue
    }
    const subtitlePath = join(genDir, `${scriptName}.subtitle`)
    const audioVoice = rel(join(genDir, `${scriptName}.mp3`))
    const output = rel(join(genDir, `${scriptName}_burn${suffix}.mp4`))

    console.log(`  ${suffix} (${width}×${height}) → ${basename(output)}`)
    const ok = lib.renderVideo({
      clips: [clip],
      audioVoice,
      audioBg: audioBg ? rel(audioBg) : null,
      output,
      subtitlePath: existsSync(subtitlePath) ? subtitlePath : null,
      targetW: width,
      targetH: height,
      fps: targetFps,
    })
    if (!ok) {
      console.error(`  Burn FAILED for ${suffix}`)
      process.exit(1)
    }
  }
}

// ── Main ──

async function generateUrlVideo(scriptPath) {
  const scriptDir = dirname(scriptPath)
  const scriptName = basename(scriptPath, extname(scriptPath))
  const genDir = join(scriptDir, 'gen')

  console.log(`Script: ${basename(scriptPath)}`)
  mkdirSync(genDir, { recursive: true })

  // 1. 解析台词和 URL
  const lines = parseSubtitleLines(scriptPath)
  const urls = parseUrls(scriptPath)
  if (lines.length !== urls.length) {
    console.error(`\nERROR: ${lines.length} subtitle lines but ${urls.length} URLs`)
    process.exit(1)
  }
  console.log(`URLs: ${urls.length}`)

  // 2. TTS + 字幕时间轴（与 generate-image-video.mjs 完全一致）
  const noTts = process.argv.slice(2).includes('--no-tts')
  const ttsArgIndex = process.argv.slice(2).indexOf('--tts')
  const ttsProvider = ttsArgIndex >= 0 ? process.argv.slice(2)[ttsArgIndex + 1] : DEFAULT_TTS_PROVIDER

  let segments, imageDurations

  if (noTts) {
    const subtitlePath = join(genDir, `${scriptName}.subtitle`)
    const audioPath = join(genDir, `${scriptName}.mp3`)
    if (!existsSync(subtitlePath) || !existsSync(audioPath)) {
      console.error(`\n--no-tts: subtitle or audio not found in ${genDir}/`)
      console.error('  Run without --no-tts first to generate TTS.')
      process.exit(1)
    }
    const data = JSON.parse(readFileSync(subtitlePath, 'utf-8'))
    const entries = data.segments[0].entries
    imageDurations = computeImageDurations(entries)
    segments = entries
    console.log(`Reusing existing subtitle (${entries.length} entries, ${data.segments[0].duration}s)`)
  } else {
    // 预生成 TTS
    console.log(`\n=== Pre-generating TTS timing: ${scriptName} ===`)
    const pregenArgs = ['movies/pregen-tts.mjs', scriptPath]
    if (ttsProvider) pregenArgs.push('--tts', ttsProvider)
    const pregenR = spawnSync('node', pregenArgs, { stdio: 'inherit', timeout: 600000 })
    if (pregenR.status !== 0) process.exit(pregenR.status ?? 1)

    // 从缓存组装字幕 + 音频
    const result = await generateSubtitle(scriptPath, { ttsProvider })
    segments = result.segments
    imageDurations = result.imageDurations

    // Fallback：subtitle 已是最新（跳过 → segments 为空），从文件读取
    if (segments.length === 0) {
      const subtitlePath = join(genDir, `${scriptName}.subtitle`)
      if (!existsSync(subtitlePath)) {
        console.error(`\nSubtitle not found at ${subtitlePath}`)
        process.exit(1)
      }
      const data = JSON.parse(readFileSync(subtitlePath, 'utf-8'))
      const entries = data.segments[0].entries
      imageDurations = computeImageDurations(entries)
      segments = entries
    }
  }

  // 3. 方向过滤
  const orientationFilter = lib.resolveOrientationFilter()
  const orientations = orientationFilter !== 'both'
    ? ORIENTATIONS.filter(o => o.suffix === `_${orientationFilter}`)
    : ORIENTATIONS

  // 4. 截图 → 滚动片段 → 拼接（URL 模式特有）
  console.log(`\n=== Capturing URLs with Chrome ===`)

  // 检查 Chrome 是否正在运行
  try {
    const tl = spawnSync('tasklist', ['/fi', 'IMAGENAME eq chrome.exe'], { stdio: 'pipe', timeout: 5000 })
    if (tl.stdout && tl.stdout.toString().toLowerCase().includes('chrome.exe')) {
      console.error('\nChrome 正在运行！请关闭 Chrome 后重试（Playwright 需要独占用户数据目录）。')
      process.exit(1)
    }
  } catch {}

  const browser = await chromium.launch({ channel: 'chrome', headless: false })

  try {
    for (const { width, height, suffix, label, scrollRatio } of orientations) {
      const clips = []
      let anyFailed = false

      for (let i = 0; i < urls.length; i++) {
        const fullPng = join(genDir, `${scriptName}_${pad4(i)}${suffix}_full.png`)
        const clipWebm = join(genDir, `${scriptName}_${pad4(i)}${suffix}.webm`)
        clips.push(clipWebm)

        console.log(`\n[${label}] ${i + 1}/${urls.length}`)

        // 全页截图
        if (!existsSync(fullPng)) {
          console.log(`  Screenshot: ${basename(fullPng)}`)
          const page = await browser.newPage({ viewport: { width, height } })
          try {
            await page.goto(urls[i], { waitUntil: 'domcontentloaded', timeout: 30000 })
            await page.waitForTimeout(3000)
            await page.screenshot({ path: fullPng, fullPage: true })
          } finally {
            await page.close()
          }
        }

        // 滚动片段
        if (!existsSync(clipWebm)) {
          const dims = probeImageDimensions(fullPng)
          if (!dims) { console.error(`  Cannot probe ${basename(fullPng)}`); anyFailed = true; continue }
          const scrollable = Math.max(0, dims.height - height)
          const scrollSpeed = Math.round(height * scrollRatio)
          if (!buildScrollClip(fullPng, clipWebm, width, height, imageDurations[i], scrollSpeed, scrollable, dims.width, dims.height)) {
            anyFailed = true
          }
        }
      }

      if (anyFailed) process.exit(1)

      // 拼接
      console.log(`\n[${label}] Concatenating ${clips.length} clips...`)
      const outputVideo = join(genDir, `${scriptName}${suffix}.webm`)
      if (concatWebmClips(clips, outputVideo)) {
        const mb = (readFileSync(outputVideo).length / 1024 / 1024).toFixed(2)
        console.log(`  ${basename(outputVideo)} (${mb} MB)`)
      } else {
        console.error(`  Concat FAILED for ${suffix}`)
        process.exit(1)
      }
    }
  } finally {
    await browser.close()
  }

  // 5. 烧录字幕（与 generate-image-video.mjs 一致：lib.burnVideo 等价调用）
  const noBurn = process.argv.slice(2).includes('--no-burn')
  if (!noBurn) {
    console.log('\n=== Burning subtitles ===')
    const scriptUrl = pathToFileURL(scriptPath).href
    burnUrlVideo(scriptUrl, genDir, orientations)
  } else {
    console.log('\n--no-burn: skipping subtitle burn')
  }

  console.log('\nDone!')
}

// ── CLI ──
const scriptPath = resolve(process.argv[2])
if (!scriptPath) {
  console.error('Usage: node movies/generate-url-video.mjs [--tts edge-tts|tencent-tts|indextts|spark-tts] <script.mjs>')
  process.exit(1)
}
if (!existsSync(scriptPath)) {
  console.error('Script not found:', scriptPath)
  process.exit(1)
}

generateUrlVideo(scriptPath).catch(err => {
  console.error(err)
  process.exit(1)
})
