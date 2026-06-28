import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, basename, extname, join } from 'path'
import { spawnSync } from 'child_process'
import { pathToFileURL } from 'url'
import * as lib from './lib.mjs'
import { generateSubtitle, INITIAL_GAP, INTER_LINE_GAP, DEFAULT_TTS_PROVIDER } from './generate-subtitle.mjs'

function naturalCompare(a, b) {
  const split = (s) => (s.match(/(\d+|\D+)/g) || []).map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p)
  const ca = split(a)
  const cb = split(b)
  for (let i = 0; i < Math.min(ca.length, cb.length); i++) {
    if (ca[i] !== cb[i]) {
      if (typeof ca[i] === 'number' && typeof cb[i] === 'number') return ca[i] - cb[i]
      if (typeof ca[i] === 'string' && typeof cb[i] === 'string') return ca[i] < cb[i] ? -1 : 1
      return typeof ca[i] === 'number' ? -1 : 1
    }
  }
  return ca.length - cb.length
}

function parseImageBase(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  const m = src.match(/(?:^|\n)const\s+image\s*=\s*['"]([^'"]+)['"]\s*;?\s*\n/)
  if (!m) {
    console.error('No `const image = \'...\'` found in', scriptPath)
    process.exit(1)
  }
  return m[1]
}

function stripOrientation(name, suffix) {
  return name.replaceAll(suffix, '')
}

function isMarked(netName) {
  return /_marked_\d+\.png$/.test(netName)
}

function getMarkedNumber(netName) {
  const m = netName.match(/_marked_(\d+)\.png$/)
  return m ? parseInt(m[1], 10) : 0
}

function scanOrientationImages(basePath, suffix) {
  const dirPath = dirname(basePath)
  const baseName = basename(basePath)

  let allFiles
  try { allFiles = readdirSync(dirPath).filter(f => f.endsWith('.png')) }
  catch { return [] }

  const matched = allFiles.filter(f =>
    f.startsWith(baseName) && f.includes(suffix)
  )

  const groups = new Map()
  for (const f of matched) {
    const net = stripOrientation(f, suffix)
    if (isMarked(net)) {
      const groupKey = net.replace(/_marked_\d+\.png$/, '.png')
      if (!groups.has(groupKey)) groups.set(groupKey, { baseFile: null, markedFiles: [] })
      groups.get(groupKey).markedFiles.push(f)
    } else {
      const groupKey = net
      if (!groups.has(groupKey)) groups.set(groupKey, { baseFile: null, markedFiles: [] })
      groups.get(groupKey).baseFile = f
    }
  }

  const sortedKeys = [...groups.keys()].sort(naturalCompare)
  const result = []
  for (const key of sortedKeys) {
    const g = groups.get(key)
    if (g.baseFile) result.push(join(dirPath, g.baseFile))
    g.markedFiles
      .sort((a, b) => getMarkedNumber(stripOrientation(a, suffix)) - getMarkedNumber(stripOrientation(b, suffix)))
      .forEach(f => result.push(join(dirPath, f)))
  }

  return result
}

function extractLastFrame(videoPath, outputPath) {
  const probeR = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', videoPath,
  ], { stdio: 'pipe', timeout: 15000 })
  if (probeR.status !== 0) return false
  const dur = parseFloat(probeR.stdout.toString().trim())
  if (!dur || dur <= 0) return false
  const seekTo = Math.max(0, dur - 0.3)
  const r = spawnSync('ffmpeg', [
    '-y', '-ss', seekTo.toFixed(3), '-i', videoPath,
    '-vframes', '1', '-update', '1', outputPath,
  ], { stdio: 'pipe', timeout: 60000 })
  return r.status === 0 && existsSync(outputPath) && statSync(outputPath).size > 0
}

function getOrderedScripts(scriptDir) {
  if (!existsSync(scriptDir)) return []
  return readdirSync(scriptDir)
    .filter(f => f.endsWith('.mjs') && f !== 'cover.mjs')
    .sort()
}

function buildImageVideo(imagePaths, imageDurations, outputPath, targetW, targetH, fps, prevFrameImage, isFirstVideo) {
  const n = imagePaths.length
  const totalDur = imageDurations.reduce((a, b) => a + b, 0)
  console.log(`  Images: ${n}, total ${totalDur.toFixed(2)}s → ${outputPath}`)
  for (let i = 0; i < n; i++) {
    console.log(`    ${basename(imagePaths[i])}: ${imageDurations[i].toFixed(2)}s`)
  }

  const AD = n > 1 ? Math.min(1, imageDurations[0]) : 0
  const hasEntrance = n > 1 && AD >= 1 / fps + 0.001 && !isFirstVideo

  const SCALE_FILTER = `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,` +
    `pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1`

  const tempOutput = outputPath.replace(/\.\w+$/, '.tmp$&')

  const inputs = []
  const filterParts = []
  const concatLabels = []
  let inputIdx = 0

  for (let i = 0; i < n; i++) {
    const dur = imageDurations[i].toFixed(3)
    const label = `v${i}`

    if (i === 0 && hasEntrance && prevFrameImage) {
      inputs.push('-loop', '1', '-t', dur, '-i', prevFrameImage)
      filterParts.push(`[${inputIdx}:v]${SCALE_FILTER},fps=${fps}[bg0]`)
      inputIdx++
      inputs.push('-loop', '1', '-t', dur, '-i', imagePaths[i])
      filterParts.push(`[${inputIdx}:v]${SCALE_FILTER},fps=${fps}[fg0]`)
      inputIdx++
      filterParts.push(`[bg0][fg0]overlay=x='min(0,-${targetW}+${targetW}*t/${AD})':y=0[${label}]`)
    } else {
      inputs.push('-loop', '1', '-t', dur, '-i', imagePaths[i])
      filterParts.push(`[${inputIdx}:v]${SCALE_FILTER},fps=${fps}[${label}]`)
      inputIdx++
    }

    concatLabels.push(label)
  }

  filterParts.push(`[${concatLabels.join('][')}]concat=n=${n}:v=1:a=0[outv]`)

  const r = spawnSync('ffmpeg', [
    '-y', ...inputs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[outv]',
    '-c:v', 'libvpx-vp9', '-b:v', '8M',
    '-pix_fmt', 'yuv420p',
    tempOutput,
  ], { stdio: 'pipe', timeout: 120000 })

  if (r.status !== 0) {
    console.error('  FFmpeg failed:', r.stderr.toString().slice(0, 1000))
    try { rmSync(tempOutput, { force: true }) } catch {}
    return false
  }

  if (existsSync(outputPath)) rmSync(outputPath, { force: true })
  renameSync(tempOutput, outputPath)
  const mb = (readFileSync(outputPath).length / 1024 / 1024).toFixed(2)
  console.log(`  Saved: ${basename(outputPath)} (${mb} MB)`)
  return true
}

// ── Main ──

async function generateImageVideo(scriptPath) {
  const scriptDir = dirname(scriptPath)
  const scriptName = basename(scriptPath, extname(scriptPath))
  const genDir = join(scriptDir, 'gen')
  const imageBase = parseImageBase(scriptPath)

  console.log(`Script: ${basename(scriptPath)}`)
  console.log(`Image base: ${imageBase}`)

  mkdirSync(genDir, { recursive: true })

  const noTts = process.argv.slice(2).includes('--no-tts')
  const force = process.argv.slice(2).includes('-f') || process.argv.slice(2).includes('--force')
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
    const round2 = (v) => Math.round(v * 100) / 100
    const segDurs = entries.map(e => round2(e.e - e.s))
    imageDurations = segDurs.map((d, i) => {
      let dur = d
      if (i === 0) dur += INITIAL_GAP
      if (i < segDurs.length - 1) dur += INTER_LINE_GAP
      return round2(dur)
    })
    segments = entries
    console.log(`Reusing existing subtitle (${entries.length} entries, ${data.segments[0].duration}s)`)
  } else {
    // 1. Pre-generate TTS segments → populate cache
    console.log(`\n=== Pre-generating TTS timing: ${scriptName} ===`)
    const pregenArgs = ['movies/pregen-tts.mjs', scriptPath]
    if (ttsProvider) pregenArgs.push('--tts', ttsProvider)
    const pregenR = spawnSync('node', pregenArgs, { stdio: 'inherit', timeout: 600000 })
    if (pregenR.status !== 0) process.exit(pregenR.status ?? 1)

    // 2. Assemble subtitle and audio from cache
    const result = await generateSubtitle(scriptPath, { ttsProvider })
    segments = result.segments
    imageDurations = result.imageDurations

    // Fallback: if subtitle was up-to-date (skipped → empty segments), read from file
    if (segments.length === 0) {
      const subtitlePath = join(genDir, `${scriptName}.subtitle`)
      if (!existsSync(subtitlePath)) {
        console.error(`\nSubtitle not found at ${subtitlePath}`)
        process.exit(1)
      }
      const data = JSON.parse(readFileSync(subtitlePath, 'utf-8'))
      const entries = data.segments[0].entries
      const round2 = (v) => Math.round(v * 100) / 100
      const segDurs = entries.map(e => round2(e.e - e.s))
      imageDurations = segDurs.map((d, i) => {
        let dur = d
        if (i === 0) dur += INITIAL_GAP
        if (i < segDurs.length - 1) dur += INTER_LINE_GAP
        return round2(dur)
      })
      segments = entries
    }
  }

  // 2. Build image videos per orientation
  const preset = lib.resolveSizePreset()
  const orientationFilter = lib.resolveOrientationFilter()
  const fps = lib.resolve30fps() ? 30 : 25

  const orientations = orientationFilter !== 'both'
    ? preset.orientations.filter(o => o.suffix === `_${orientationFilter}`)
    : preset.orientations

  // Find previous video in the same directory for entrance background
  const prevFrameDir = join(genDir, '.prev_frames')
  const allScripts = getOrderedScripts(scriptDir)
  const scriptFileName = basename(scriptPath)
  const scriptIdx = allScripts.indexOf(scriptFileName)
  const isFirstVideo = scriptIdx <= 0
  const prevName = scriptIdx > 0 ? allScripts[scriptIdx - 1].replace(/\.mjs$/, '') : null

  let anyVideo = false
  for (const { width, height, suffix } of orientations) {
    const outputVideo = join(genDir, `${scriptName}${suffix}.webm`)

    // ── 缓存检查：webm mtime >= 脚本源文件 + tts-timing ──
    if (!force) {
      const timingPath = join(genDir, `${scriptName}.tts-timing.json`)
      const srcMtime = statSync(scriptPath).mtimeMs
      const timingMtime = existsSync(timingPath) ? statSync(timingPath).mtimeMs : 0
      if (existsSync(outputVideo) &&
          statSync(outputVideo).mtimeMs >= srcMtime &&
          statSync(outputVideo).mtimeMs >= timingMtime) {
        console.log(`\n[${suffix}] ✓ Video up-to-date — skipping`)
        anyVideo = true
        continue
      }
    }

    const images = scanOrientationImages(imageBase, suffix)
    if (images.length === 0) {
      console.log(`\n[${suffix}] No images found matching "${basename(imageBase)}*${suffix}*.png", skipping`)
      continue
    }
    console.log(`\n[${suffix}] ${images.length} images found`)
    for (const img of images) {
      console.log(`  ${basename(img)}`)
    }

    if (images.length !== segments.length) {
      console.error(`\nERROR: ${images.length} images but ${segments.length} required for ${suffix}`)
      process.exit(1)
    }
    const perSegmentImages = images

    // Auto-find previous video's last frame for entrance background
    let prevFrameImage = null
    if (scriptIdx > 0 && prevName) {
      const prevVideo = join(genDir, `${prevName}${suffix}.webm`)
      if (existsSync(prevVideo)) {
        mkdirSync(prevFrameDir, { recursive: true })
        const framePath = join(prevFrameDir, `${scriptName}${suffix}_prev.png`)
        console.log(`  Extracting last frame from ${basename(prevVideo)}`)
        if (extractLastFrame(prevVideo, framePath)) {
          prevFrameImage = framePath
        }
      }
    }

    if (!isFirstVideo && !prevFrameImage) {
      console.warn(`\nWARN: ${scriptFileName} — previous video (${prevName}${suffix}.webm) not found, skipping entrance animation`)
    }

    buildImageVideo(perSegmentImages, imageDurations, outputVideo, width, height, fps, prevFrameImage, isFirstVideo)
    anyVideo = true
  }

  // Cleanup prev frame cache
  if (existsSync(prevFrameDir)) {
    rmSync(prevFrameDir, { recursive: true, force: true })
  }

  if (!anyVideo) {
    console.error('\nNo images found for any orientation.')
    process.exit(1)
  }

  // 3. Burn subtitles (default: yes, skip with --no-burn)
  const noBurn = process.argv.slice(2).includes('--no-burn')
  if (!noBurn) {
    console.log('\n=== Burning subtitles ===')
    const scriptUrl = pathToFileURL(scriptPath).href
    lib.burnVideo(scriptUrl, genDir)
  } else {
    console.log('\n--no-burn: skipping subtitle burn')
  }

  console.log('\nDone!')
}

// ── CLI ──
const scriptPath = resolve(process.argv[2])
if (!scriptPath) {
  console.error('Usage: node movies/generate-image-video.mjs [--tts edge-tts|tencent-tts|indextts|spark-tts] <script.mjs>')
  process.exit(1)
}
if (!existsSync(scriptPath)) {
  console.error('Script not found:', scriptPath)
  process.exit(1)
}

generateImageVideo(scriptPath).catch(err => {
  console.error(err)
  process.exit(1)
})
