import { spawnSync } from 'child_process'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Parse ASS time string (H:MM:SS.cc) to seconds.
 */
function assTimeToSec(t) {
  const parts = t.trim().split(':')
  const h = parseInt(parts[0]) || 0
  const m = parseInt(parts[1]) || 0
  const s = parseFloat(parts[2].replace(',', '.')) || 0
  return h * 3600 + m * 60 + s
}

/**
 * Parse an ASS file and return an array of { start, end, text } objects.
 */
function parseAss(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const dialogues = []
  for (const line of content.split('\n')) {
    if (!line.startsWith('Dialogue:')) continue
    // Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
    const parts = line.split(',')
    if (parts.length < 10) continue
    const start = assTimeToSec(parts[1])
    const end = assTimeToSec(parts[2])
    // Text is everything after the 9th comma (index 9 onwards)
    const text = parts.slice(9).join(',').trim()
    if (text) {
      dialogues.push({ start, end, text, duration: end - start })
    }
  }
  return dialogues
}

/**
 * Generate audio from a subtitle segment using edge-tts.
 * Returns { path, duration } of the generated audio.
 */
function generateSegment(text, outPath) {
  const r = spawnSync('edge-tts', [
    '--voice', 'zh-CN-XiaoxiaoNeural',
    '--text', text,
    '--write-media', outPath,
  ], { stdio: 'pipe', timeout: 60000 })
  if (r.status !== 0) {
    console.error(`  edge-tts failed for "${text.slice(0, 30)}": ${r.stderr.toString().slice(0, 200)}`)
    return null
  }
  // Get actual duration
  const probe = spawnSync('ffprobe', [
    '-v', 'quiet', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', outPath,
  ], { stdio: 'pipe', timeout: 10000 })
  const duration = probe.status === 0 ? parseFloat(probe.stdout.toString().trim()) || 0 : 0
  return { path: outPath, duration }
}

/**
 * Pad/trim audio to match exact duration.
 * Returns path to adjusted audio.
 */
function adjustDuration(inputPath, targetSec, outputPath) {
  const currentSec = (() => {
    const r = spawnSync('ffprobe', [
      '-v', 'quiet', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', inputPath,
    ], { stdio: 'pipe', timeout: 10000 })
    return r.status === 0 ? parseFloat(r.stdout.toString().trim()) || 0 : 0
  })()

  if (currentSec <= 0) return null

  if (Math.abs(currentSec - targetSec) < 0.05) {
    // Close enough, just copy
    spawnSync('ffmpeg', ['-y', '-i', inputPath, '-c', 'copy', outputPath], { stdio: 'pipe', timeout: 30000 })
    return outputPath
  }

  if (currentSec < targetSec) {
    // Shorter → pad with silence at the end
    const padSec = (targetSec - currentSec).toFixed(3)
    spawnSync('ffmpeg', [
      '-y', '-i', inputPath,
      '-af', `apad=pad_dur=${padSec}`,
      '-t', targetSec.toFixed(3),
      '-c:a', 'libmp3lame', '-b:a', '192k',
      outputPath,
    ], { stdio: 'pipe', timeout: 30000 })
  } else {
    // Longer → speed up with atempo
    const ratio = (currentSec / targetSec).toFixed(4)
    // atempo range is 0.5-2.0, cascade if needed
    let filter = `atempo=${Math.min(Math.max(parseFloat(ratio), 0.5), 2.0)}`
    let actualRatio = parseFloat(ratio)
    while (actualRatio > 2.0) {
      filter = `atempo=2.0,${filter}`
      actualRatio /= 2.0
    }
    while (actualRatio < 0.5) {
      filter = `atempo=0.5,${filter}`
      actualRatio /= 0.5
    }
    spawnSync('ffmpeg', [
      '-y', '-i', inputPath,
      '-af', filter,
      '-t', targetSec.toFixed(3),
      '-c:a', 'libmp3lame', '-b:a', '192k',
      outputPath,
    ], { stdio: 'pipe', timeout: 30000 })
  }
  return existsSync(outputPath) ? outputPath : null
}

/**
 * Generate audio from an ASS subtitle file.
 *
 * Usage:
 *   node movies/generateAudio.mjs movies/p1/m1.ass
 *
 * Output: movies/p1/gen/m1.mp3 (ASS 同名，gen/ 目录)
 *         movies/p1/gen/m1_segments/ (intermediate files)
 *
 * The output audio will have the same total duration as the subtitle timeline.
 * The generated .mp3 is automatically used as `audioVoice` by burn/merge.
 */
function generateAudio(assPath) {
  if (!existsSync(assPath)) {
    console.error('ASS file not found:', assPath)
    return null
  }

  const dialogues = parseAss(assPath)
  if (dialogues.length === 0) {
    console.error('No dialogue entries found in:', assPath)
    return null
  }

  const totalDuration = dialogues[dialogues.length - 1].end
  const assDir = dirname(assPath)
  const baseName = basename(assPath, extname(assPath))
  const genDir = join(assDir, 'gen')
  mkdirSync(genDir, { recursive: true })
  const segDir = join(genDir, `${baseName}_segments`)
  mkdirSync(segDir, { recursive: true })

  console.log(`ASS: ${assPath}`)
  console.log(`Dialogues: ${dialogues.length}, total duration: ${totalDuration.toFixed(2)}s`)

  // Generate each segment
  const segPaths = []
  for (let i = 0; i < dialogues.length; i++) {
    const { text, duration } = dialogues[i]
    const rawPath = join(segDir, `seg_${i}_raw.mp3`)
    const adjPath = join(segDir, `seg_${i}.mp3`)

    process.stdout.write(`  [${i + 1}/${dialogues.length}] "${text}" (${duration.toFixed(2)}s) ... `)
    const gen = generateSegment(text, rawPath)
    if (!gen) {
      console.log('FAIL')
      segPaths.push(null)
      continue
    }
    console.log(`raw ${gen.duration.toFixed(2)}s → target ${duration.toFixed(2)}s`)
    const adj = adjustDuration(rawPath, duration, adjPath)
    segPaths.push(adj)
  }

  // Build concat file list
  const concatList = join(segDir, 'concat.txt')
  const validSegs = segPaths.filter(p => p !== null)
  if (validSegs.length === 0) {
    console.error('No valid audio segments generated')
    return null
  }

  const concatContent = validSegs.map(p => `file '${join(process.cwd(), p).replace(/\\/g, '/')}'`).join('\n')
  writeFileSync(concatList, concatContent, 'utf-8')

  // Concat all segments
  const outputPath = join(genDir, `${baseName}.mp3`)
  console.log(`\nConcatenating ${validSegs.length} segments → ${outputPath}`)
  const r = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatList,
    '-c:a', 'libmp3lame', '-b:a', '192k',
    outputPath,
  ], { stdio: 'pipe', timeout: 60000 })

  if (r.status === 0) {
    const mb = (readFileSync(outputPath).length / 1024 / 1024).toFixed(2)
    console.log(`Done: ${outputPath} (${mb} MB, ${totalDuration.toFixed(2)}s)`)
    return outputPath
  } else {
    console.error(`Concat failed: ${r.stderr.toString().slice(0, 500)}`)
    return null
  }
}

// --- CLI ---
const assPath = process.argv[2]
if (assPath) {
  generateAudio(assPath)
}
