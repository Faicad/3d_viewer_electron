import { existsSync, readFileSync, statSync, readdirSync, rmSync, renameSync, writeFileSync } from 'fs'
import { join, dirname, basename, extname, relative, resolve } from 'path'
import { pathToFileURL } from 'url'
import { spawn, spawnSync } from 'child_process'
import { DEFAULT_BGM } from './lib-electron.mjs'
import { makeCoverClip } from './coverClip.mjs'

/**
 * Probe video file for dimensions and frame rate.
 */
function probeVideo(path) {
  const r = spawnSync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json',
    '-show_streams', '-show_format', path,
  ], { stdio: 'pipe', timeout: 15000 })
  if (r.status !== 0) return null
  const info = JSON.parse(r.stdout.toString())
  const vs = info.streams.find(s => s.codec_type === 'video')
  if (!vs) return null
  const [n, d] = vs.r_frame_rate.split('/').map(Number)
  return {
    width: vs.width, height: vs.height,
    fps: Math.round(d ? n / d : n),
    duration: info.format?.duration ? parseFloat(info.format.duration) : 0,
  }
}

/**
 * Probe a clip's audio stream.
 */
function clipHasAudio(path) {
  const r = spawnSync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json',
    '-show_streams', path,
  ], { stdio: 'pipe', timeout: 15000 })
  if (r.status !== 0) return false
  const info = JSON.parse(r.stdout.toString())
  return !!info.streams?.some(s => s.codec_type === 'audio')
}

/**
 * Generate a merged .subtitle file from individual clip subtitles (for reference).
 * Reads each gen/{name}.subtitle, shifts timestamps by cumulative duration.
 * Returns the merged subtitle path, or null if no subtitles found.
 */
function mergeSubtitles(genDir, baseNames, totalDuration) {
  const allEntries = []
  let offset = 0
  for (const name of baseNames) {
    const subPath = join(genDir, `${name}.subtitle`)
    if (!existsSync(subPath)) continue
    const data = JSON.parse(readFileSync(subPath, 'utf-8'))
    const seg = data.segments?.[0]
    if (!seg?.entries) continue
    for (const e of seg.entries) {
      const entry = {
        s: Math.round((e.s + offset) * 100) / 100,
        e: Math.round((e.e + offset) * 100) / 100,
        t: e.t,
      }
      if (e.words && process.env.KARAOKE_TTS_PROVIDERS !== '') {
        entry.words = e.words
      }
      allEntries.push(entry)
    }
    offset += seg.duration || 0
  }
  if (allEntries.length === 0) return null

  const merged = {
    version: 1,
    segments: [{
      duration: Math.round(totalDuration * 100) / 100,
      entries: allEntries,
    }],
  }
  const outPath = join(genDir, 'merged.subtitle')
  writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
  return outPath
}

/**
 * Concatenate burned clips (video + audio) and mix in background music.
 * Burned clips already have TTS voice and subtitles baked in —
 * this only concatenates them and adds a single BGM track on top.
 */
function concatBurnedClips(clipPaths, outputPath, bgmPath, targetW, targetH, fps, coverPng) {
  // Prepend cover as 1-frame clip if provided
  let coverCleanup = null
  if (coverPng && existsSync(coverPng)) {
    const coverClip = join(dirname(outputPath), `.cover_tmp_${basename(outputPath)}`)
    const ok = makeCoverClip(coverPng, coverClip, targetW, targetH, fps)
    if (ok) {
      clipPaths = [coverClip, ...clipPaths]
      coverCleanup = coverClip
      console.log(`  Cover: ${coverPng} → 1-frame clip prepended`)
    } else {
      console.error(`  Cover: FAILED — ${coverPng}`)
      return false
    }
  }

  const n = clipPaths.length
  const tempOutput = outputPath.replace(/\.\w+$/, '.tmp$&')

  const allHaveAudio = clipPaths.every(c => clipHasAudio(c))

  const filterParts = []

  // Scale+pad each video to target
  for (let i = 0; i < n; i++) {
    filterParts.push(
      `[${i}:v]fps=${fps},scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`
    )
    if (allHaveAudio) {
      filterParts.push(`[${i}:a]aresample=48000[a${i}]`)
    }
  }

  // Concat video+audio (or video only)
  if (allHaveAudio) {
    const concatInputs = []
    for (let i = 0; i < n; i++) {
      concatInputs.push(`[v${i}]`, `[a${i}]`)
    }
    filterParts.push(`${concatInputs.join('')}concat=n=${n}:v=1:a=1[outv][outa]`)
  } else {
    const vLabels = clipPaths.map((_, i) => `[v${i}]`).join('')
    filterParts.push(`${vLabels}concat=n=${n}:v=1:a=0[outv]`)
    filterParts.push(`anullsrc=r=48000:cl=stereo[outa]`)
  }

  // Mix background music
  const bgIdx = n
  filterParts.push(`[${bgIdx}:a]volume=0.1,aresample=48000[bg]`)
  filterParts.push(`[outa][bg]amix=inputs=2:duration=first:dropout_transition=2[finala]`)

  const args = [
    '-y',
    ...clipPaths.flatMap(f => ['-i', f]),
    '-i', bgmPath,
    '-filter_complex', filterParts.join(';'),
    '-map', '[outv]',
    '-map', '[finala]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    tempOutput,
  ]

  console.log(`  Inputs: ${clipPaths.map(p => basename(p)).join(', ')}`)
  console.log(`  Audio: ${allHaveAudio ? 'concat clips + ' : ''}BGM`)

  const r = spawnSync('ffmpeg', args, { stdio: 'pipe', timeout: 300000 })
  const errStr = r.stderr.toString()

  if (r.status === 0) {
    try {
      if (existsSync(outputPath)) rmSync(outputPath, { force: true })
      renameSync(tempOutput, outputPath)
      const mb = (readFileSync(outputPath).length / 1024 / 1024).toFixed(2)
      console.log(`  Saved: ${basename(outputPath)} (${mb} MB)`)
      return true
    } catch (e) {
      console.error(`  Failed to rename:`, e.message)
      return false
    } finally {
      if (coverCleanup) try { rmSync(coverCleanup, { force: true }) } catch {}
    }
  } else {
    try { rmSync(tempOutput, { force: true }) } catch {}
    if (coverCleanup) try { rmSync(coverCleanup, { force: true }) } catch {}
    console.error(`  FFmpeg exit code ${r.status}`)
    console.error(errStr.split('\n').slice(-10).join('\n'))
    return false
  }
}

/**
 * Auto-detect project-level cover images.
 * 只检测 _final_{h|v}.png（cover.mjs 预处理后的成品），不回退到原始截图。
 * Returns { h: path|null, v: path|null } for landscape and portrait covers.
 */
function detectProjectCover(projectDir) {
  const genDir = join(projectDir, 'gen')
  const projectName = basename(projectDir)
  const result = {}
  for (const orient of ['h', 'v']) {
    const path = join(genDir, `${projectName}_cover_final_${orient}.png`)
    if (existsSync(path) && statSync(path).size > 0) {
      console.log(`[cover] auto-detected: ${path}`)
      result[orient] = path
    }
  }
  return result
}

/**
 * Run project-level cover.mjs if present.
 * 约定：每个项目目录下可放 cover.mjs，对截图封面做预处理（如加文字）。
 * cover.mjs 在原位覆盖 {project}_cover_{h|v}.png。
 */
function processProjectCovers(projectDir) {
  const coverScript = join(projectDir, 'cover.mjs')
  if (!existsSync(coverScript)) return
  console.log(`\n[cover] running ${basename(coverScript)} ...`)
  const r = spawnSync('node', [coverScript], {
    stdio: 'inherit',
    timeout: 60000,
  })
  if (r.status !== 0) {
    console.error(`[cover] ${basename(coverScript)} failed (exit ${r.status ?? 1})`)
  } else {
    console.log(`[cover] ${basename(coverScript)} done`)
  }
}

/**
 * mergeProject — 合并项目内所有录制片段 + 封面 + BGM。
 *
 * 1. 扫描项目目录下所有 .mjs 文件（按文件名排序，排除 cover.mjs）
 * 2. 对每个文件调用 burn.mjs（透传 CLI 参数，--default-bg 由 merge 统一处理）
 * 3. 收集 gen/{name}_burn_{h|v}.mp4
 * 4. 运行 cover.mjs（可选）→ 自动检测封面
 * 5. 读项目目录下 merge.json（可选），取 audioBg 覆盖默认 BGM
 * 6. concat 合并视频+音频，混入 BGM
 * 7. （备查）生成合并字幕 merged.subtitle
 */
function mergeProject(dirPath) {
  const absDir = resolve(process.cwd(), dirPath)

  if (!existsSync(absDir) || !statSync(absDir).isDirectory()) {
    console.error(`Not a directory: ${dirPath}`)
    process.exit(1)
  }

  // 1. Scan .mjs files (exclude cover.mjs — 由 processProjectCovers 单独处理)
  const files = readdirSync(absDir)
    .filter(f => f.endsWith('.mjs') && f !== 'cover.mjs' && !f.startsWith('skip'))
    .sort()
  if (files.length === 0) {
    console.error(`No .mjs files found in ${dirPath}`)
    process.exit(1)
  }
  console.log(`Found ${files.length} script(s): ${files.join(', ')}`)

  // 2. Forwarded flags — 所有 CLI 参数透传，仅过滤 --default-bg（由 merge 统一加）
  const forwardedFlags = process.argv.slice(3).filter(f => f !== '--default-bg')

  // 3. Run burn.mjs for each script
  const cwdForBurn = process.cwd()
  for (const file of files) {
    const scriptArg = relative(cwdForBurn, join(absDir, file))
    console.log(`\n${'='.repeat(60)}`)
    console.log(`[${file}] Running burn.mjs ...`)
    console.log(`${'='.repeat(60)}`)
    const r = spawnSync('node', [
      'movies/burn.mjs', scriptArg, ...forwardedFlags,
    ], { stdio: 'inherit', timeout: 600000 })
    if (r.status !== 0) {
      console.error(`  ✗ ${file} failed (exit ${r.status ?? 1})`)
      process.exit(r.status ?? 1)
    }
  }

  // 4. Collect burned clips
  const genDir = join(absDir, 'gen')
  const baseNames = files.map(f => basename(f, '.mjs'))
  const clips_h = []
  const clips_v = []
  for (const name of baseNames) {
    const h = join(genDir, `${name}_burn_h.mp4`)
    const v = join(genDir, `${name}_burn_v.mp4`)
    if (existsSync(h) && statSync(h).size > 0) clips_h.push(h)
    if (existsSync(v) && statSync(v).size > 0) clips_v.push(v)
  }
  if (clips_h.length === 0 && clips_v.length === 0) {
    console.error('No usable burned clips found')
    process.exit(1)
  }

  // 5. Run project cover.mjs if present, then auto-detect (分横/竖)
  processProjectCovers(absDir)
  const covers = detectProjectCover(absDir)

  // 5b. Read optional merge.json from project directory for overrides
  const mergeCfgPath = join(absDir, 'merge.json')
  const mergeCfg = existsSync(mergeCfgPath)
    ? JSON.parse(readFileSync(mergeCfgPath, 'utf-8'))
    : {}
  const bgmPath = mergeCfg.audioBg || DEFAULT_BGM
  if (mergeCfg.audioBg) console.log(`  BGM: ${mergeCfg.audioBg} (from merge.json)`)

  // ── Check force flag for merge's own cache ──
  const mergeForce = process.argv.slice(3).includes('-f') || process.argv.slice(3).includes('--force')

  // 6. Merge each orientation
  for (const [clips, suffix] of [[clips_h, 'h'], [clips_v, 'v']]) {
    if (clips.length === 0) continue
    const mergedPath = join(genDir, `merged_${suffix}.mp4`)

    // ── Check if merged mp4 is up-to-date vs upstream files ──
    if (!mergeForce && existsSync(mergedPath)) {
      const mergedMtime = statSync(mergedPath).mtimeMs
      const upstreamMtimes = [
        ...clips.map(p => statSync(p).mtimeMs),
      ]
      if (existsSync(mergeCfgPath)) upstreamMtimes.push(statSync(mergeCfgPath).mtimeMs)
      if (covers[suffix] && existsSync(covers[suffix])) upstreamMtimes.push(statSync(covers[suffix]).mtimeMs)
      if (existsSync(bgmPath)) upstreamMtimes.push(statSync(bgmPath).mtimeMs)
      if (mergedMtime >= Math.max(...upstreamMtimes)) {
        console.log(`\n=== Merging ${suffix === 'h' ? 'horizontal' : 'vertical'} ===`)
        console.log(`✓ Merged video up-to-date for ${suffix} — skipping`)
        continue
      }
    }

    const info = probeVideo(clips[0])
    if (!info) {
      console.error(`Cannot probe clip: ${clips[0]}`)
      process.exit(1)
    }
    console.log(`\n=== Merging ${suffix === 'h' ? 'horizontal' : 'vertical'} (${clips.length} clips, ${info.width}×${info.height}, ${info.fps}fps) ===`)
    const ok = concatBurnedClips(
      clips,
      mergedPath,
      bgmPath,
      info.width, info.height, info.fps,
      covers[suffix] || null,
    )
    if (!ok) process.exit(1)
  }

  // 7. (备查) Generate merged subtitle from per-clip subtitles
  const refClips = clips_h.length > 0 ? clips_h : clips_v
  const totalDur = refClips.reduce((sum, c) => {
    const info = probeVideo(c)
    return sum + (info?.duration || 0)
  }, 0)
  const mergedSubPath = join(genDir, 'merged.subtitle')
  if (!mergeForce && existsSync(mergedSubPath)) {
    const subMtime = statSync(mergedSubPath).mtimeMs
    const allEntriesUpToDate = baseNames.every(name => {
      const subPath = join(genDir, `${name}.subtitle`)
      if (!existsSync(subPath)) return false
      return statSync(subPath).mtimeMs <= subMtime
    })
    if (allEntriesUpToDate) {
      console.log(`✓ Merged subtitle up-to-date — skipping`)
    } else {
      mergeSubtitles(genDir, baseNames, totalDur)
    }
  } else {
    mergeSubtitles(genDir, baseNames, totalDur)
  }

  // 8. Auto-play the merged video (horizontal preferred)
  const playPath = existsSync(join(genDir, 'merged_h.mp4'))
    ? join(genDir, 'merged_h.mp4')
    : existsSync(join(genDir, 'merged_v.mp4'))
      ? join(genDir, 'merged_v.mp4')
      : null
  if (playPath) {
    console.log(`\nPlaying: ${basename(playPath)}`)
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', playPath], { detached: true, stdio: 'ignore' }).unref()
    } else {
      const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
      spawn(cmd, [playPath], { detached: true, stdio: 'ignore' }).unref()
    }
  }

  console.log('\nDone!')
}

// --- CLI ---
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: node movies/mergeVideo.mjs <project-dir>')
    console.error('  <project-dir>   — 项目目录：自动 burn + 合并；可选项目目录下的 merge.json 覆盖默认配置')
    process.exit(1)
  }

  const absPath = resolve(process.cwd(), arg)

  if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
    console.error(`Not a directory: ${arg}`)
    process.exit(1)
  }
  mergeProject(arg)
}
