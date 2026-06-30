import { existsSync, readFileSync, mkdirSync, rmSync, renameSync, statSync } from 'fs'
import { resolve, dirname, basename, extname, join } from 'path'
import { spawnSync } from 'child_process'
import { pathToFileURL } from 'url'
import { chromium } from 'playwright'
import * as lib from './lib.mjs'
import { generateSubtitle, parseSubtitleLines, INITIAL_GAP, INTER_LINE_GAP, DEFAULT_TTS_PROVIDER } from './generate-subtitle.mjs'
import { buildHtmlComposition, isMarkType, pad4 } from './html-composer.mjs'

const round2 = (v) => Math.round(v * 100) / 100

export async function generateVideo(scriptPath, { urls, mode, onBeforeRecord }) {
  const scriptDir = dirname(scriptPath)
  const scriptName = basename(scriptPath, extname(scriptPath))
  const genDir = join(scriptDir, 'gen')
  const aiGenDir = join(scriptDir, 'ai_gen')

  console.log(`Generate: ${basename(scriptPath)}`)
  mkdirSync(genDir, { recursive: true })
  mkdirSync(aiGenDir, { recursive: true })

  // 1. Validate
  const lines = parseSubtitleLines(scriptPath)
  console.log(`Lines: ${lines.length}, ${mode === 'image' ? 'Image configs' : 'URLs'}: ${urls.length}`)
  if (urls.length !== lines.length) {
    console.error(`\nERROR: ${urls.length} entries vs ${lines.length} subtitle lines — must match 1:1`)
    process.exit(1)
  }

  // 2. Generate subtitle timing (or reuse)
  const noTts = process.argv.slice(2).includes('--no-tts')
  const force = process.argv.slice(2).includes('-f') || process.argv.slice(2).includes('--force')
  const ttsArgIndex = process.argv.slice(2).indexOf('--tts')
  const ttsProvider = ttsArgIndex >= 0 ? process.argv.slice(2)[ttsArgIndex + 1] : DEFAULT_TTS_PROVIDER

  let segments, imageDurations

  if (noTts) {
    const subtitlePath = join(genDir, `${scriptName}.subtitle`)
    if (!existsSync(subtitlePath)) {
      console.error(`\n--no-tts: subtitle not found in ${genDir}/`)
      process.exit(1)
    }
    const data = JSON.parse(readFileSync(subtitlePath, 'utf-8'))
    const entries = data.segments[0].entries
    const segDurs = entries.map(e => round2(e.e - e.s))
    imageDurations = segDurs.map((d, i) => {
      let dur = d
      if (i === 0) dur += INITIAL_GAP
      if (i < segDurs.length - 1) dur += INTER_LINE_GAP
      return round2(dur)
    })
    segments = [{ entries }]
    console.log(`Reusing existing subtitle (${entries.length} entries, ${data.segments[0]?.duration?.toFixed(2) || '?'}s)`)
  } else {
    console.log(`\n=== Pre-generating TTS ===`)
    const pregenArgs = ['movies/pregen-tts.mjs', scriptPath]
    if (ttsProvider) pregenArgs.push('--tts', ttsProvider)
    const pregenR = spawnSync('node', pregenArgs, { stdio: 'inherit', timeout: 600000 })
    if (pregenR.status !== 0) process.exit(pregenR.status ?? 1)

    const result = await generateSubtitle(scriptPath, { ttsProvider })
    imageDurations = result.imageDurations

    if (result.entries && result.entries.length > 0) {
      segments = [{ entries: result.entries }]
    } else {
      const subtitlePath = join(genDir, `${scriptName}.subtitle`)
      const data = JSON.parse(readFileSync(subtitlePath, 'utf-8'))
      const entries = data.segments[0].entries
      const segDurs = entries.map(e => round2(e.e - e.s))
      imageDurations = segDurs.map((d, i) => {
        let dur = d
        if (i === 0) dur += INITIAL_GAP
        if (i < segDurs.length - 1) dur += INTER_LINE_GAP
        return round2(dur)
      })
      segments = [{ entries }]
    }
  }

  // 3. Validate anim (warn but allow empty — some scenes have no visuals, e.g. hideAt on prior item)
  for (let i = 0; i < urls.length; i++) {
    if (!urls[i].anim || urls[i].anim.length === 0) {
      const label = mode === 'image' ? `image_config[${i}]` : `URL ${i}`
      console.warn(`  ${label} has no anim array — skipping`)
      urls[i].anim = []
    }
  }

  const totalDuration = imageDurations.reduce((a, b) => a + b, 0)

  // 4. Resolve orientations
  const preset = lib.resolveSizePreset()
  const orientationFilter = lib.resolveOrientationFilter()
  const orientations = orientationFilter !== 'both'
    ? preset.orientations.filter(o => o.suffix === `_${orientationFilter}`)
    : preset.orientations

  console.log(`\n=== Building composition (${totalDuration.toFixed(2)}s total) ===`)

  for (const { width, height, suffix } of orientations) {
    // ── 缓存检查 ──
    const outputVideo = join(genDir, `${scriptName}${suffix}.webm`)
    if (!force) {
      const timingPath = join(genDir, `${scriptName}.tts-timing.json`)
      const srcMtime = statSync(scriptPath).mtimeMs
      const timingMtime = existsSync(timingPath) ? statSync(timingPath).mtimeMs : 0
      if (existsSync(outputVideo) &&
          statSync(outputVideo).mtimeMs >= srcMtime &&
          statSync(outputVideo).mtimeMs >= timingMtime) {
        console.log(`  [${suffix}] ✓ Video up-to-date — skipping recording`)
        continue
      }
    }

    // ── 图片来源（image 模式复制本地截图，url 模式跳过）──
    if (mode === 'image' && onBeforeRecord) {
      await onBeforeRecord({ aiGenDir, scriptName, suffix, urlCount: urls.length })
    }

    // ── Load marks ──
    const allMarks = []
    for (let i = 0; i < urls.length; i++) {
      const anims = urls[i].anim || []
      const needsMarks = anims.some(a => isMarkType(a.type))

      if (!needsMarks) {
        allMarks.push({})
        continue
      }

      const marksName = `${scriptName}_${pad4(i)}${suffix}_marks.json`
      const marksPath = join(aiGenDir, marksName)
      if (existsSync(marksPath)) {
        allMarks.push(JSON.parse(readFileSync(marksPath, 'utf-8')))
      } else {
        const label = mode === 'image' ? `image_config[${i}]` : `URL ${i}`
        console.error(`ERROR: ${label} needs marks but file not found: ${marksName}`)
        console.error(`  URL: ${urls[i].url}`)
        console.error(`  Anim types: ${anims.map(a => a.type).join(', ')}`)
        console.error(`  (looked in ${aiGenDir}/)`)
        process.exit(1)
      }
    }

    // ── Build HTML composition ──
    const { hfDir, totalDuration: td } = buildHtmlComposition({
      urls, marks: allMarks, segments, imageDurations,
      genDir, aiGenDir, scriptName, suffix, width, height,
    })
    console.log(`  Composition: ${hfDir}/index.html`)

    // ── Playwright record ──
    const tempOutput = outputVideo.replace(/\.\w+$/, '.tmp$&')

    console.log(`  Recording ${td.toFixed(2)}s video...`)
    const browser = await chromium.launch({ headless: false, args: ['--force-device-scale-factor=1'] })
    try {
      const context = await browser.newContext({
        recordVideo: { dir: hfDir, size: { width, height } },
        viewport: { width, height },
        deviceScaleFactor: 1,
        ignoreHTTPSErrors: true,
      })
      const page = await context.newPage()
      page.on('pageerror', err => console.error('  Page error:', err.message))

      const htmlPath = join(hfDir, 'index.html')
      await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle', timeout: 30000 })

      const waitMs = Math.round(td * 1000) + 1500
      console.log(`  Waiting ${(waitMs / 1000).toFixed(1)}s...`)
      await page.waitForTimeout(waitMs)

      await context.close()
      const video = page.video()
      if (video) {
        const recordedPath = await video.path()
        if (existsSync(recordedPath)) {
          renameSync(recordedPath, tempOutput)
        }
      }
    } finally {
      await browser.close()
    }

    // Cleanup
    rmSync(hfDir, { recursive: true, force: true })

    if (!existsSync(tempOutput)) {
      console.error(`  Failed to record video`)
      process.exit(1)
    }

    // Trim exact duration
    const r = spawnSync('ffmpeg', [
      '-y', '-i', tempOutput,
      '-t', td.toFixed(3),
      '-c', 'copy',
      outputVideo,
    ], { stdio: 'pipe', timeout: 60000 })
    rmSync(tempOutput, { force: true })

    if (r.status !== 0) {
      console.error(`  FFmpeg trim failed:`, r.stderr.toString().slice(0, 500))
      process.exit(1)
    }
    const mb = (readFileSync(outputVideo).length / 1024 / 1024).toFixed(2)
    console.log(`  Saved: ${basename(outputVideo)} (${mb} MB)`)
  }

  // 5. Burn subtitles
  const noBurn = process.argv.slice(2).includes('--no-burn')
  if (!noBurn) {
    console.log('\n=== Burning subtitles ===')
    const scriptUrl = pathToFileURL(scriptPath).href
    for (const { suffix } of orientations) {
      const clip = join(genDir, `${scriptName}${suffix}.webm`)
      if (!existsSync(clip)) continue
      const subtitlePath = join(genDir, `${scriptName}.subtitle`)
      const audioVoice = join(genDir, `${scriptName}.mp3`)
      const output = join(genDir, `${scriptName}_burn${suffix}.mp4`)
      const { width: targetW, height: targetH } = orientations.find(o => o.suffix === suffix) || { width: 1920, height: 1080 }
      const targetFps = lib.resolve30fps() ? 30 : 25
      const useDefaultBg = process.argv.slice(2).includes('--default-bg')
      const audioBg = useDefaultBg ? lib.DEFAULT_BGM : null

      console.log(`  ${suffix} → ${basename(output)}`)
      lib.renderVideo({
        clips: [clip],
        audioVoice,
        audioBg: audioBg ? audioBg : null,
        output,
        subtitlePath: existsSync(subtitlePath) ? subtitlePath : null,
        targetW, targetH, fps: targetFps,
      })
    }
  } else {
    console.log('\n--no-burn: skipping subtitle burn')
  }

  console.log('\nDone!')
}

export { pad4 }
