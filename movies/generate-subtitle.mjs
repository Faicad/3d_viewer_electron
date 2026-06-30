import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'fs'
import { resolve, dirname, basename, extname, join } from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'
import { generateTencentTts } from './tencent-tts.mjs'
import { loadProjectEnv } from './env.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))

// ── Timing constants ──
const INITIAL_GAP = 0.5     // silence before first line (s)
const INTER_LINE_GAP = 0.15 // silence between lines (s) — both audio gap and subtitle gap
const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'
const DEFAULT_TTS_PROVIDER = process.env.DEFAULT_TTS || 'spark-tts'

// Comma-separated list of TTS providers that get karaoke word-highlight subtitles.
// Not set or empty → no karaoke. Example: KARAOKE_TTS_PROVIDERS=edge-tts
const KARAOKE_PROVIDERS = (() => {
  const raw = process.env.KARAOKE_TTS_PROVIDERS
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
})()


// edge-tts --list-voices | rg zh-CN
// zh-CN-XiaoxiaoNeural               Female    News, Novel            Warm
// zh-CN-XiaoyiNeural                 Female    Cartoon, Novel         Lively
// zh-CN-YunjianNeural                Male      Sports,  Novel         Passion
// zh-CN-YunxiNeural                  Male      Novel                  Lively, Sunshine
// zh-CN-YunxiaNeural                 Male      Cartoon, Novel         Cute
// zh-CN-YunyangNeural                Male      News                   Professional, Reliable
// zh-CN-liaoning-XiaobeiNeural       Female    Dialect                Humorous
// zh-CN-shaanxi-XiaoniNeural         Female    Dialect                Bright

// ── Helpers ──

/**
 * Strip parenthetical content that TTS should not speak.
 * Removes both Chinese （）and English () parentheses and their contents.
 */
function cleanDisplayText(text) {
  text = text.replace(/（（([^）]*)））/g, '$1').replace(/\(\(([^)]*)\)\)/g, '$1')
  text = text.replace(/\[\[([^\]]*)\]\]/g, '')  // [[...]] spoken only, not displayed
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

function cleanTtsText(text) {
  text = text.replace(/（（[^）]*））/g, '').replace(/\(\([^)]*\)\)/g, '')
  text = text.replace(/\[\[([^\]]*)\]\]/g, '$1')  // [[...]] unwrap: TTS speaks the content
  text = text.replace(/[（(][^）)]*[）)]/g, '')
  text = text.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
  return text
}

/**
 * Normalize text for Spark-TTS (Chinese TTS model that can't pronounce
 * English acronyms, math symbols, or special characters).
 *
 * Transformations:
 *   + → 加, - between digits → 减, = → 等于
 *   -> → removed, => and arrows → removed
 *   STL → S T L (3+ uppercase letters spaced out)
 */
function normalizeSparkTtsText(text) {
  // ── Strip multi-char sequences first (before single-char replacements) ──
  text = text.replace(/->/g, '')
  text = text.replace(/=>/g, '')
  text = text.replace(/[→←↑↓]/g, '')

  // ── Math symbols → Chinese ──
  // + always means 加
  text = text.replace(/\+/g, '加')
  // - between digits → 减 (e.g. "5-3" → "5减3")
  text = text.replace(/(\d)\s*-\s*(\d)/g, '$1减$2')
  // - before a digit (negative) → 负 (e.g. "-5" → "负5")
  text = text.replace(/-(\d)/g, '负$1')
  // = → 等于
  text = text.replace(/=/g, '等于')

  // Remove remaining standalone dashes / hyphens
  text = text.replace(/\s*-\s*/g, ' ')

  // ── Acronyms (3+ uppercase letters) → letter-by-letter ──
  text = text.replace(/(?<![a-zA-Z])[A-Z]{3,}(?![a-zA-Z])/g, m => m.split('').join(' '))

  // Normalize whitespace after all replacements
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

function round2(v) { return Math.round(v * 100) / 100 }

function ttsCacheKey(ttsText, voice, provider) {
  return createHash('md5').update(ttsText + '\0' + voice + '\0' + provider).digest('hex')
}

/**
 * Parse {voiceName} prefix from the beginning of a text line.
 * Returns { voice, text } — voice is null if no prefix found.
 */
function parseVoicePrefix(text) {
  const m = text.match(/^\{([^}]+)\}\s*(.*)/s)
  if (m) {
    return { voice: m[1], text: m[2] }
  }
  return { voice: null, text }
}

/**
 * Parse `const subtitle = \`...\`` from a .mjs script file.
 * Returns array of text lines (non-empty, trimmed).
 */
function parseSubtitleLines(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  const m = src.match(/(?:^|\n)const\s+subtitle\s*=\s*`([\s\S]*?)`\s*;?\s*\n/)
  if (!m) {
    console.error('No `const subtitle = `...`` found in', scriptPath)
    process.exit(1)
  }
  return m[1].split('\n').map(s => s.trim()).filter(Boolean)
}

/**
 * Split subtitle lines by --N-- markers into groups.
 * Returns { groups, markerCount } where groups is an array of string arrays.
 */
function splitBySyncpoints(lines) {
  const groups = []
  let current = []
  let markerCount = 0

  for (const line of lines) {
    if (/^--\d+--$/.test(line)) {
      markerCount++
      if (current.length === 0) {
        console.error(`ERROR: empty group before --${markerCount}--`)
        process.exit(1)
      }
      groups.push(current)
      current = []
    } else {
      current.push(line)
    }
  }
  if (current.length === 0) {
    console.error('ERROR: --N-- at end of subtitle with no following lines')
    process.exit(1)
  }
  groups.push(current)

  return { groups, markerCount }
}

/**
 * Count lib.syncpoint() calls in the .mjs script source.
 * Handles the common pattern where syncpoint is conditionally called
 * inside a for loop: if (i < MODELS.length - 1) await lib.syncpoint(
 */
function countSyncpointsInScript(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  const matches = src.match(/lib\.syncpoint\(/g)
  const rawCount = matches ? matches.length : 0

  // Detect conditional pattern: if (i < MODELS.length[-1]) await lib.syncpoint(
  const condMatch = src.match(
    /if\s*\(\s*\w+\s*<\s*MODELS\.length(\s*-\s*\d+)?\s*\)\s*await\s+lib\.syncpoint\s*\(/
  )
  if (condMatch) {
    const modelCount = (src.match(/\{\s*path\s*:/g) || []).length
    if (modelCount > 0) {
      const hasOffset = condMatch[1] !== undefined // e.g. " - 1"
      const condCalls = hasOffset ? modelCount - 2 : modelCount - 1
      // Replace the 1 matched conditional call with actual runtime count
      return rawCount - 1 + Math.max(0, condCalls)
    }
  }

  return rawCount
}

/**
 * Read syncpoint timestamps from gen/{name}.syncpoints.json.
 */
function readSyncpoints(genDir, scriptName) {
  const spPath = join(genDir, `${scriptName}.syncpoints.json`)
  if (!existsSync(spPath)) {
    console.error(`ERROR: ${spPath} not found — record the video first`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(spPath, 'utf-8'))
}

/**
 * Probe audio/video duration with ffprobe.
 */
function probeDuration(filePath) {
  if (!existsSync(filePath)) return 0
  const r = spawnSync('ffprobe', [
    '-v', 'quiet', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', filePath,
  ], { stdio: 'pipe', timeout: 10000 })
  if (r.status !== 0) return 0
  const dur = parseFloat(r.stdout.toString().trim())
  return isNaN(dur) ? 0 : dur
}

/**
 * Find video file and return its duration.
 * Tries non-segmented then segmented patterns.
 */
function findVideoDuration(scriptDir, scriptName) {
  for (const candidate of [
    resolve(scriptDir, 'gen', `${scriptName}_h.webm`),
    resolve(scriptDir, 'gen', `${scriptName}_v.webm`),
  ]) {
    const dur = probeDuration(candidate)
    if (dur > 0) {
      console.log(`Video: ${basename(candidate)} (${dur.toFixed(2)}s)`)
      return dur
    }
  }
  return 0
}

/**
 * Generate TTS audio for one line via edge-tts.
 * Returns { path, duration, words? } or null on failure.
 */
function scriptHasImage(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  return /(?:^|\n)const\s+image\s*=\s*['"][^'"]+['"]\s*;?\s*\n/.test(src)
}

function scriptHasUrls(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  return /(?:^|\n)const\s+urls\s*=/.test(src)
}

function scriptHasImageConfig(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  return /(?:^|\n)const\s+image_config\s*=/.test(src)
}

async function generateTtsSegment(text, outPath, voice = DEFAULT_VOICE, ttsProvider = DEFAULT_TTS_PROVIDER) {
  let ttsText = cleanTtsText(text)
  if (ttsProvider === 'spark-tts') {
    const normalized = normalizeSparkTtsText(ttsText)
    if (normalized !== ttsText) {
      console.log(`  TTS normalize: "${ttsText}" → "${normalized}"`)
      ttsText = normalized
    }
  }
  if (ttsText !== text) {
    console.log(`  TTS clean: "${text}" → "${ttsText}"`)
  }
  if (!ttsText) {
    console.error(`  ERROR: text is empty after cleaning: "${text}"`)
    return null
  }

  if (ttsProvider === 'tencent-tts') {
    return await generateTencentTts(ttsText, outPath)
  }

  if (ttsProvider === 'indextts') {
    const voicePath = process.env.INDEXTTS_VOICE || join(__dir, 'voice.wav')
    const scriptPath = join(__dir, 'indextts_tts.py')
    const r = spawnSync('python3', [
      scriptPath, '--voice', voicePath, '--text', ttsText, '--output', outPath,
    ], { stdio: 'pipe', timeout: 300000 })
    if (r.status !== 0) {
      if (r.stderr) {
        console.error(`  indextts stderr:\n${r.stderr.toString().trimEnd().split('\n').map(l => '    ' + l).join('\n')}`)
      }
      const signal = r.signal ? ` (signal: ${r.signal})` : ''
      console.error(`  indextts failed: exit code ${r.status}${signal}`)
      return null
    }
    try {
      const result = JSON.parse(r.stdout.toString().trim())
      return { path: result.path, duration: result.duration }
    } catch {
      console.error(`  indextts: cannot parse output: ${r.stdout.toString().slice(0, 200)}`)
      return null
    }
  }

  if (ttsProvider === 'spark-tts') {
    const scriptPath = join(__dir, 'sparktts_tts.py')
    const args = [scriptPath, '--text', ttsText, '--output', outPath]
    if (process.env.SPARKTTS_VOICE) {
      args.push('--voice', process.env.SPARKTTS_VOICE)
    } else {
      args.push('--gender', process.env.SPARKTTS_GENDER || 'male')
      args.push('--pitch', process.env.SPARKTTS_PITCH || 'moderate')
      args.push('--speed', process.env.SPARKTTS_SPEED || 'moderate')
    }
    const r = spawnSync('python3', args, { stdio: 'pipe', timeout: 300000 })
    if (r.status !== 0) {
      if (r.stderr) {
        console.error(`  spark-tts stderr:\n${r.stderr.toString().trimEnd().split('\n').map(l => '    ' + l).join('\n')}`)
      }
      const signal = r.signal ? ` (signal: ${r.signal})` : ''
      console.error(`  spark-tts failed: exit code ${r.status}${signal}`)
      return null
    }
    let result
    try {
      const lines = r.stdout.toString().trim().split('\n').filter(Boolean)
      result = JSON.parse(lines[lines.length - 1])
    } catch {
      console.error(`  spark-tts: cannot parse output: ${r.stdout.toString().slice(0, 200)}`)
      return null
    }
    // Normalize loudness before caching
    if (existsSync(result.path)) {
      const normPath = result.path.replace(/\.\w+$/, '_norm.mp3')
      const nr = spawnSync('ffmpeg', [
        '-y', '-i', result.path,
        '-af', 'loudnorm=I=-16:LRA=11:TP=-1.5',
        '-c:a', 'libmp3lame', '-b:a', '192k',
        normPath,
      ], { stdio: 'pipe', timeout: 60000 })
      if (nr.status === 0 && existsSync(normPath)) {
        rmSync(result.path, { force: true })
        renameSync(normPath, result.path)
        const newDur = probeDuration(result.path)
        if (newDur > 0) result.duration = newDur
      }
    }
    return { path: result.path, duration: result.duration }
  }

  const scriptPath = join(__dir, 'edgetts_tts.py')
  const r = spawnSync('python3', [
    scriptPath, '--text', ttsText, '--voice', voice, '--output', outPath,
  ], { stdio: 'pipe', timeout: 60000 })
  if (r.status !== 0) {
    if (r.stderr) {
      console.error(`  edge-tts stderr:\n${r.stderr.toString().trimEnd().split('\n').map(l => '    ' + l).join('\n')}`)
    }
    const signal = r.signal ? ` (signal: ${r.signal})` : ''
    console.error(`  edge-tts failed: exit code ${r.status}${signal}`)
    return null
  }
  try {
    const lines = r.stdout.toString().trim().split('\n').filter(Boolean)
    const result = JSON.parse(lines[lines.length - 1])
    return { path: result.path, duration: result.duration, words: result.words }
  } catch {
    console.error(`  edge-tts: cannot parse output: ${r.stdout.toString().slice(0, 200)}`)
    return null
  }
}

/**
 * Generate a silence mp3 file of given duration.
 */
function generateSilence(duration, outPath) {
  const r = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`,
    '-t', duration.toFixed(3),
    '-c:a', 'libmp3lame', '-b:a', '192k',
    outPath,
  ], { stdio: 'pipe', timeout: 10000 })
  return r.status === 0 && existsSync(outPath) ? outPath : null
}

/**
 * Concatenate audio parts (TTS segments + silence gaps) into final mp3.
 * parts: [{ path }] — absolute paths to mp3 files.
 */
function concatAudio(parts, outputPath) {
  const concatList = parts.map(p => {
    const absPath = resolve(p.path).replace(/\\/g, '/')
    return `file '${absPath}'`
  }).join('\n')

  const listPath = join(dirname(outputPath), 'concat.txt')
  writeFileSync(listPath, concatList, 'utf-8')

  const tempOutput = outputPath.replace(/\.\w+$/, '.tmp$&')
  const r = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:a', 'libmp3lame', '-b:a', '192k',
    tempOutput,
  ], { stdio: 'pipe', timeout: 120000 })

  if (r.status !== 0) {
    console.error('  Concat failed:', r.stderr.toString().slice(0, 500))
    try { rmSync(tempOutput, { force: true }) } catch {}
    return false
  }
  // Atomically replace old file
  if (existsSync(outputPath)) rmSync(outputPath, { force: true })
  renameSync(tempOutput, outputPath)
  return true
}

/**
 * Compute total audio duration from segments.
 * total = INITIAL_GAP + sum(seg.duration) + (n-1) * INTER_LINE_GAP
 */
function computeAudioTotal(segments) {
  if (segments.length === 0) return 0
  let total = INITIAL_GAP
  for (let i = 0; i < segments.length; i++) {
    total += segments[i].duration
    // Same-group TTS-to-TTS: INTER_LINE_GAP
    if (i < segments.length - 1 && !segments[i].isSilence && !segments[i + 1].isSilence && segments[i].group === segments[i + 1].group) {
      total += INTER_LINE_GAP
    }
  }
  return round2(total)
}

// ── Main ──

/**
 * Generate subtitle and audio from a .mjs script.
 *
 * Automatically detects if the script has a `const image = '...'` declaration.
 * If yes (image-based script), skips video duration probing and validation.
 * If no (video-based script), probes video and validates TTS fits within it.
 *
 * Always generates:
 *   {scriptDir}/gen/{scriptName}.subtitle   — JSON subtitle
 *   {scriptDir}/gen/{scriptName}.mp3        — concatenated TTS audio
 *
 * @returns {{ segments, entries, videoDuration, imageDurations }}
 */
async function generateSubtitle(scriptPath, { ttsProvider = DEFAULT_TTS_PROVIDER, force = false } = {}) {
  loadProjectEnv(scriptPath)

  const scriptDir = dirname(scriptPath)
  const scriptName = basename(scriptPath, extname(scriptPath))
  const genDir = join(scriptDir, 'gen')
  const segDir = join(genDir, 'tts')
  mkdirSync(segDir, { recursive: true })

  // ── Check if subtitle + mp3 are up-to-date vs source + timing ──
  if (!force) {
    const subPath = join(genDir, `${scriptName}.subtitle`)
    const audioPath = join(genDir, `${scriptName}.mp3`)
    const timingPath = join(genDir, `${scriptName}.tts-timing.json`)
    if (existsSync(subPath) && existsSync(audioPath) && existsSync(timingPath)) {
      const srcMtime = statSync(scriptPath).mtimeMs
      const timingMtime = statSync(timingPath).mtimeMs
      if (statSync(subPath).mtimeMs >= srcMtime && statSync(subPath).mtimeMs >= timingMtime &&
          statSync(audioPath).mtimeMs >= srcMtime && statSync(audioPath).mtimeMs >= timingMtime) {
        console.log(`\n✓ Subtitle + audio up-to-date for ${scriptName} — skipping`)
        return { segments: [], entries: [], videoDuration: 0, imageDurations: [] }
      }
    }
  }

  // 1. Parse lines
  const lines = parseSubtitleLines(scriptPath)
  console.log(`Lines: ${lines.length}\n`)

  // 1b. Split by --N-- syncpoint markers
  const { groups, markerCount } = splitBySyncpoints(lines)
  const errors = []
  let syncpoints = []
  if (markerCount > 0) {
    console.log(`Syncpoint groups: ${groups.length} (${markerCount} markers)\n`)

    // Validate each group has at least one TTS line
    for (let g = 0; g < groups.length; g++) {
      if (groups[g].every(line => /^---\d+---$/.test(line))) {
        errors.push(`group ${g} has no TTS line (only ---x--- silence markers)`)
      }
    }

    // Validate count matches lib.syncpoint() calls in source
    const codeCount = countSyncpointsInScript(scriptPath)
    if (markerCount !== codeCount) {
      errors.push(
        `syncpoint count mismatch:\n` +
        `  --N-- markers in subtitle: ${markerCount}\n` +
        `  lib.syncpoint() calls:     ${codeCount}\n` +
        `  Each --N-- must have a corresponding lib.syncpoint(page) call.`
      )
    }

    syncpoints = readSyncpoints(genDir, scriptName)
    if (markerCount !== syncpoints.length) {
      errors.push(
        `syncpoint count mismatch:\n` +
        `  --N-- markers:  ${markerCount}\n` +
        `  syncpoints.json: ${syncpoints.length} entries`
      )
    }
  }

  // 2. Detect script type
  const isSlideScript = scriptHasImage(scriptPath) || scriptHasUrls(scriptPath) || scriptHasImageConfig(scriptPath)
  if (isSlideScript) {
    console.log('Slide script detected (image/urls) — skipping video duration check')
  }

  // 3. Probe video duration (skip for slide scripts)
  let videoDuration = 0
  if (!isSlideScript) {
    videoDuration = findVideoDuration(scriptDir, scriptName)
    if (videoDuration <= 0) {
      console.error('\nNo video found in gen/ — record first with `node ' + scriptPath + '`')
      process.exit(1)
    }
  }

  // 4. Read project-level TTS cache (shared across all scripts in this project)
  const ttsCachePath = join(genDir, 'tts-cache.json')
  let ttsCache = {}
  if (existsSync(ttsCachePath)) {
    try {
      ttsCache = JSON.parse(readFileSync(ttsCachePath, 'utf-8'))
    } catch {
      console.error(`\nERROR: failed to parse ${ttsCachePath}`)
      process.exit(1)
    }
  }

  // 5. Assemble segments from cache
  const totalNonMarker = groups.reduce((sum, g) => sum + g.length, 0)
  const segments = []
  let ttsIndex = 0
  for (let g = 0; g < groups.length; g++) {
    for (let i = 0; i < groups[g].length; i++) {
      const rawText = groups[g][i]

      // ---x--- insert pure silence segment (milliseconds)
      const silenceMatch = rawText.match(/^---(\d+)---$/)
      if (silenceMatch) {
        const secs = parseInt(silenceMatch[1], 10) / 1000
        const silencePath = join(segDir, `silence_${silenceMatch[1]}ms_${g}_${i}.mp3`)
        if (!existsSync(silencePath)) {
          generateSilence(secs, silencePath)
        }
        segments.push({ isSilence: true, group: g, path: silencePath, duration: secs })
        continue
      }

      const { voice, text } = parseVoicePrefix(rawText)
      const effectiveProvider = voice ? 'edge-tts' : ttsProvider
      const usedVoice = effectiveProvider === 'edge-tts' ? (voice || DEFAULT_VOICE) : effectiveProvider
      let ttsText = cleanTtsText(text)
      if (effectiveProvider === 'spark-tts') {
        ttsText = normalizeSparkTtsText(ttsText)
      }
      const cacheKey = ttsCacheKey(ttsText, usedVoice, effectiveProvider)
      const outPath = join(segDir, `${cacheKey}.mp3`)
      const cached = ttsCache[cacheKey]
      if (cached && cached.text === text && cached.ttsText === ttsText && cached.voice === usedVoice && cached.provider === effectiveProvider && existsSync(outPath)) {
        const dur = probeDuration(outPath)
        if (dur > 0) {
          process.stdout.write(`[${String(ttsIndex + 1).padStart(2)}/${totalNonMarker}] "${text.length > 50 ? text.slice(0, 47) + '...' : text}" cached ${dur.toFixed(2)}s\n`)
          segments.push({ text, group: g, voice, provider: effectiveProvider, path: outPath, duration: dur, words: cached.words })
          ttsIndex++
          continue
        }
      }

      console.error(`\nERROR: cache miss for "${text.length > 50 ? text.slice(0, 47) + '...' : text}" — run pregen-tts.mjs first`)
      process.exit(1)
    }
  }

  if (segments.length === 0) {
    console.error('\nNo TTS segments were generated.')
    process.exit(1)
  }

  console.log(`\nGenerated ${segments.length}/${totalNonMarker} segments`)

  // 5. Audio total and validation
  const audioTotal = computeAudioTotal(segments)
  console.log(`TTS audio total: ${audioTotal.toFixed(2)}s (speech + gaps)`)

  if (isSlideScript) {
    videoDuration = audioTotal
    console.log(`Video duration:  ${videoDuration.toFixed(2)}s (from TTS)`)
  } else {
    console.log(`Video duration:  ${videoDuration.toFixed(2)}s`)
  }

  // 6. Build subtitle timing from actual TTS durations
  // Group 0 starts at INITIAL_GAP; subsequent groups anchor to syncpoint times
  const entries = []
  let cursor = INITIAL_GAP
  let prevGroup = 0
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.group !== prevGroup) {
      cursor = syncpoints[seg.group - 1]  // group N anchors at syncpoints[N-1]
      prevGroup = seg.group
    }
    if (seg.isSilence) {
      cursor += seg.duration
      continue
    }
    const e = {
      s: round2(cursor),
      e: round2(cursor + seg.duration),
      t: cleanDisplayText(seg.text),
    }
    const segProvider = seg.provider || 'edge-tts'  // fallback for legacy cache
    if (seg.words && seg.words.length > 0 && KARAOKE_PROVIDERS.includes(segProvider)) {
      e.words = seg.words
    }
    entries.push(e)
    const hasFollowingSilence = i < segments.length - 1 && segments[i + 1].isSilence
    const gap = hasFollowingSilence ? 0 : INTER_LINE_GAP
    cursor += seg.duration + gap
  }

  // 6b. Duration validation per group removed — handled during recording via syncpoint()

  // 7. Compute per-image display durations
  const imageDurations = entries.map((e, i) => {
    const effectiveStart = i === 0 ? 0 : e.s
    const nextS = i < entries.length - 1 ? entries[i + 1].s : e.e
    return round2(nextS - effectiveStart)
  })

  // 8. Write .subtitle
  const subtitleOutput = {
    version: 1,
    segments: [{ duration: round2(videoDuration), entries }],
  }
  const subtitlePath = join(genDir, `${scriptName}.subtitle`)
  const subtitleTemp = subtitlePath + '.tmp'
  writeFileSync(subtitleTemp, JSON.stringify(subtitleOutput, null, 2) + '\n', 'utf-8')
  if (existsSync(subtitlePath)) rmSync(subtitlePath, { force: true })
  renameSync(subtitleTemp, subtitlePath)
  console.log(`\nSubtitle: ${subtitlePath}`)
  console.log(`  ${entries.length} entries, duration: ${videoDuration.toFixed(2)}s`)

  // Print timeline preview
  console.log(`\nTimeline:`)
  for (const e of entries) {
    const preview = e.t.length > 55 ? e.t.slice(0, 52) + '...' : e.t
    console.log(`  ${e.s.toFixed(2).padStart(6)} → ${e.e.toFixed(2).padStart(6)}  ${preview}`)
  }

  // 9. Build audio concat parts: initial silence + seg_0 + gap silence + seg_1 + ...
  const audioParts = []

  // Initial silence (prefixed with scriptName to avoid collisions in shared segDir)
  const initialSilencePath = join(segDir, `${scriptName}_silence_initial.mp3`)
  if (INITIAL_GAP > 0) {
    if (generateSilence(INITIAL_GAP, initialSilencePath)) {
      audioParts.push({ path: initialSilencePath })
    }
  }

  // Gap silence (reused between segments within the same group)
  const gapSilencePath = join(segDir, `${scriptName}_silence_gap.mp3`)
  if (segments.length > 1 && INTER_LINE_GAP > 0) {
    generateSilence(INTER_LINE_GAP, gapSilencePath)
  }

  let entryIdx = -1
  for (let i = 0; i < segments.length; i++) {
    audioParts.push({ path: segments[i].path })
    if (!segments[i].isSilence) entryIdx++

    if (i < segments.length - 1) {
      const isBoundary = segments[i].group !== segments[i + 1].group
      const hasAdjSilence = segments[i].isSilence || segments[i + 1].isSilence

      if (!hasAdjSilence && !isBoundary && INTER_LINE_GAP > 0) {
        // Same-group TTS-to-TTS: standard gap
        audioParts.push({ path: gapSilencePath })
        continue
      }
      if (!isBoundary) continue    // Same-group silence → spacing already in silence segment

      // Group boundary: fill gap between entries
      if (entryIdx + 1 >= entries.length) continue
      const gap = round2(entries[entryIdx + 1].s - entries[entryIdx].e)
      if (gap <= 0) continue

      // Subtract silence segment durations already in audio chain
      let filledBySilence = 0
      if (segments[i].isSilence) filledBySilence += segments[i].duration
      if (segments[i + 1].isSilence) filledBySilence += segments[i + 1].duration
      const remaining = round2(gap - filledBySilence)
      if (remaining > 0.001) {
        const customGapPath = join(segDir, `${scriptName}_silence_gap_${i}.mp3`)
        if (generateSilence(remaining, customGapPath)) {
          audioParts.push({ path: customGapPath })
        }
      }
    }
  }

  // 10. Concat → final audio (natural speed, no pad/trim)
  const audioOutputPath = join(genDir, `${scriptName}.mp3`)
  console.log(`\nConcatenating ${audioParts.length} audio parts → ${audioOutputPath} ...`)

  if (concatAudio(audioParts, audioOutputPath)) {
    const actualDur = probeDuration(audioOutputPath)
    const mb = (readFileSync(audioOutputPath).length / 1024 / 1024).toFixed(2)
    console.log(`Audio: ${audioOutputPath}`)
    console.log(`  Duration: ${actualDur.toFixed(2)}s, Size: ${mb} MB`)
    if (Math.abs(actualDur - audioTotal) > 0.1) {
      console.log(`  (expected: ${audioTotal.toFixed(2)}s, delta: ${(actualDur - audioTotal).toFixed(2)}s)`)
    }
  } else {
    console.error('Failed to concatenate audio.')
    process.exit(1)
  }

  // 11. Report all collected errors (after outputs are written — never discard work results)
  if (errors.length > 0) {
    console.error(`\n========================================`)
    console.error(`${errors.length} error(s) found:\n`)
    for (let i = 0; i < errors.length; i++) {
      console.error(`[${i + 1}] ${errors[i]}`)
      console.error('')
    }
    console.error(`========================================`)
    process.exit(1)
  }

  console.log('\nDone!')

  return { segments, entries, videoDuration, imageDurations }
}

// ── Exports ──
export { generateSubtitle, INITIAL_GAP, INTER_LINE_GAP, DEFAULT_TTS_PROVIDER, DEFAULT_VOICE, parseSubtitleLines, splitBySyncpoints, countSyncpointsInScript, probeDuration, generateTtsSegment, cleanTtsText, normalizeSparkTtsText, parseVoicePrefix, generateSilence, ttsCacheKey, scriptHasImage, scriptHasUrls, scriptHasImageConfig }

// ── CLI ──
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let scriptPath = null
  let ttsProvider = DEFAULT_TTS_PROVIDER
  let force = false
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-f' || arg === '--force') {
      force = true
    } else if (arg === '--tts') {
      ttsProvider = args[++i] || DEFAULT_TTS_PROVIDER
    } else if (!scriptPath) {
      scriptPath = resolve(arg)
    }
  }
  if (!scriptPath) {
    console.error('Usage: node movies/generate-subtitle.mjs [--tts spark-tts|edge-tts|tencent-tts|indextts] <script.mjs>')
    process.exit(1)
  }
  if (!existsSync(scriptPath)) {
    console.error('Script not found:', scriptPath)
    process.exit(1)
  }

  generateSubtitle(scriptPath, { ttsProvider, force }).catch(err => {
    console.error(err.stack || err)
    process.exit(1)
  })
}
