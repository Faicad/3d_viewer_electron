/**
 * pregen-tts.mjs — Pre-generate TTS timing for TTS-aware recording.
 *
 * Standalone script. Generates TTS audio for all subtitle lines, measures
 * durations, groups by --N-- markers, writes gen/{name}.tts-timing.json.
 * TTS cache is shared per-project: gen/tts-cache.json + gen/tts/<hash>.mp3
 * Cache key is content-based (hash of ttsText + voice + provider), so
 * identical text+voice across scripts share a single cache entry.
 *
 * Called automatically by makeMovie() before recording. Also usable standalone:
 *   node movies/pregen-tts.mjs movies/p2/m2.mjs
 *   node movies/pregen-tts.mjs --force movies/p2/m2.mjs
 *   node movies/pregen-tts.mjs --tts spark-tts movies/p2/m2.mjs
 */

import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname, basename, extname, join } from 'path'
import {
  parseSubtitleLines, splitBySyncpoints, countSyncpointsInScript,
  generateTtsSegment, probeDuration, cleanTtsText, normalizeSparkTtsText,
  parseVoicePrefix, ttsCacheKey,
  INITIAL_GAP, INTER_LINE_GAP, DEFAULT_TTS_PROVIDER, DEFAULT_VOICE,
} from './generate-subtitle.mjs'
import { loadProjectEnv } from './env.mjs'

function round2(v) { return Math.round(v * 100) / 100 }

/** Compute per-group total durations from segments. */
function computeGroupDurations(segments) {
  if (segments.length === 0) return { groups: [], ttsTotal: 0 }

  const groupMap = new Map()
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (!groupMap.has(seg.group)) {
      groupMap.set(seg.group, { index: seg.group, lineCount: 0, totalDuration: 0 })
    }
    const g = groupMap.get(seg.group)
    if (!seg.isSilence) g.lineCount++
    g.totalDuration += seg.duration

    // Same-group TTS-to-TTS: add INTER_LINE_GAP
    if (i < segments.length - 1 && !seg.isSilence && !segments[i + 1].isSilence && segments[i + 1].group === seg.group) {
      g.totalDuration += INTER_LINE_GAP
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => a.index - b.index)
  for (const g of groups) {
    if (g.index === 0) g.totalDuration += INITIAL_GAP
    g.totalDuration = round2(g.totalDuration)
  }

  const ttsTotal = round2(groups.reduce((sum, g) => sum + g.totalDuration, 0))

  return { groups, ttsTotal }
}

async function pregenTts(scriptPath, { force = false, ttsProvider } = {}) {
  const scriptName = basename(scriptPath, extname(scriptPath))
  const projectDir = dirname(scriptPath)
  const genDir = join(projectDir, 'gen')
  const segDir = join(genDir, 'tts')
  mkdirSync(segDir, { recursive: true })

  const timingPath = join(genDir, `${scriptName}.tts-timing.json`)
  console.log(`\n=== Pre-generating TTS timing: ${scriptName} ===\n`)

  // 1. Parse lines
  const lines = parseSubtitleLines(scriptPath)
  console.log(`Lines: ${lines.length}\n`)

  // 2. Split by --N-- markers
  const { groups, markerCount } = splitBySyncpoints(lines)
  if (markerCount > 0) {
    console.log(`Syncpoint groups: ${groups.length} (${markerCount} markers)\n`)

    // Validate each group has at least one TTS line
    for (let g = 0; g < groups.length; g++) {
      if (groups[g].every(line => /^---\d+---$/.test(line))) {
        console.error(`ERROR: group ${g} has no TTS line (only ---x--- silence markers)`)
        process.exit(1)
      }
    }

    // Validate count matches lib.syncpoint() calls
    const codeCount = countSyncpointsInScript(scriptPath)
    if (markerCount !== codeCount) {
      console.error(
        `ERROR: syncpoint count mismatch:\n` +
        `  --N-- markers in subtitle: ${markerCount}\n` +
        `  lib.syncpoint() calls:     ${codeCount}`
      )
      process.exit(1)
    }
  }

  // 3. Load project-level TTS cache (shared across all scripts in this project)
  const ttsCachePath = join(genDir, 'tts-cache.json')
  let ttsCache = {}
  if (!force && existsSync(ttsCachePath)) {
    try { ttsCache = JSON.parse(readFileSync(ttsCachePath, 'utf-8')) } catch {}
  }

  // 4. Generate TTS per line
  const totalNonMarker = groups.reduce((sum, g) => sum + g.length, 0)
  const segments = []
  let ttsIndex = 0
  let hadMiss = false
  loadProjectEnv(scriptPath)

  for (let g = 0; g < groups.length; g++) {
    for (let i = 0; i < groups[g].length; i++) {
      const rawText = groups[g][i]

      // ---x--- insert pure silence segment (milliseconds)
      const silenceMatch = rawText.match(/^---(\d+)---$/)
      if (silenceMatch) {
        const secs = parseInt(silenceMatch[1], 10) / 1000
        segments.push({ isSilence: true, group: g, duration: secs })
        continue
      }

      const { voice, text } = parseVoicePrefix(rawText)
      const effectiveProvider = voice ? 'edge-tts' : (ttsProvider || DEFAULT_TTS_PROVIDER)
      const usedVoice = effectiveProvider === 'edge-tts' ? (voice || DEFAULT_VOICE) : effectiveProvider

      let configStr
      if (voice) {
        configStr = `voice=${voice}`
      } else if (effectiveProvider === 'spark-tts') {
        if (process.env.SPARKTTS_VOICE) {
          configStr = `voice=${basename(process.env.SPARKTTS_VOICE)}`
        } else {
          configStr = `gender=${process.env.SPARKTTS_GENDER || 'male'} pitch=${process.env.SPARKTTS_PITCH || 'moderate'} speed=${process.env.SPARKTTS_SPEED || 'moderate'}`
        }
      } else if (effectiveProvider === 'edge-tts') {
        configStr = `voice=${usedVoice}`
      } else {
        configStr = effectiveProvider
      }
      const preview = rawText.length > 50 ? rawText.slice(0, 47) + '...' : rawText
      process.stdout.write(`[${String(ttsIndex + 1).padStart(2)}/${totalNonMarker}] TTS "${preview}" (${configStr}) ... `)

      // Check cache
      let ttsText = cleanTtsText(text)
      if (effectiveProvider === 'spark-tts') {
        ttsText = normalizeSparkTtsText(ttsText)
      }
      const cacheKey = ttsCacheKey(ttsText, usedVoice, effectiveProvider)
      const outPath = join(segDir, `${cacheKey}.mp3`)
      const cached = ttsCache[cacheKey]
      if (!force && cached && cached.text === text && cached.ttsText === ttsText && cached.voice === usedVoice && cached.provider === effectiveProvider && existsSync(outPath)) {
        const dur = probeDuration(outPath)
        if (dur > 0) {
          console.log(`cached ${dur.toFixed(2)}s`)
          segments.push({ text, group: g, voice, path: outPath, duration: dur, words: cached.words })
          ttsIndex++
          continue
        }
      }

      hadMiss = true
      const result = await generateTtsSegment(text, outPath, usedVoice, effectiveProvider)
      if (result) {
        console.log(`${result.duration.toFixed(2)}s`)
        segments.push({ text, group: g, voice, ...result })
        ttsCache[cacheKey] = { text, ttsText, voice: usedVoice, provider: effectiveProvider, words: result.words }
        // Persist cache after each segment so completed work survives a crash
        writeFileSync(ttsCachePath, JSON.stringify(ttsCache, null, 2) + '\n', 'utf-8')
      } else {
        console.log('SKIP')
      }
      ttsIndex++
    }
  }

  if (segments.length === 0) {
    console.error('\nNo TTS segments were generated.')
    process.exit(1)
  }

  // All cached and not forced → timing unchanged, exit early
  // But only if source script hasn't changed since timing was generated
  // (so group structure from --N-- markers is still current)
  if (!hadMiss && !force) {
    const timingExists = existsSync(timingPath)
    if (timingExists) {
      const srcMtime = statSync(scriptPath).mtimeMs
      const timingMtime = statSync(timingPath).mtimeMs
      if (timingMtime >= srcMtime) {
        console.log(`\nAll ${segments.length} segments cached — timing unchanged`)
        return
      }
    }
  }

  console.log(`\nGenerated ${segments.length}/${totalNonMarker} segments`)

  // 5. Compute group durations and write timing JSON
  const { groups: groupTimings, ttsTotal } = computeGroupDurations(segments)

  const segList = segments.map((s, i) => ({
    index: i,
    duration: s.duration,
    group: s.group,
  }))

  const timing = {
    version: 1,
    ttsTotal,
    groups: groupTimings,
    segments: segList,
  }

  writeFileSync(timingPath, JSON.stringify(timing, null, 2) + '\n', 'utf-8')
  console.log(`\nTiming: ${timingPath}`)
  console.log(`  Groups: ${groupTimings.length}, Segments: ${segList.length}, Total: ${ttsTotal.toFixed(2)}s`)
  for (const g of groupTimings) {
    console.log(`  Group ${g.index}: ${g.totalDuration.toFixed(2)}s (${g.lineCount} lines)`)
  }
}

// ── CLI ──
const scriptPath = resolve(process.argv[2])
if (!scriptPath || !existsSync(scriptPath)) {
  console.error('Usage: node movies/pregen-tts.mjs [--force] [--tts <provider>] <script.mjs>')
  process.exit(1)
}

const args = process.argv.slice(2)
const force = args.includes('-f') || args.includes('--force')
const ttsIdx = args.indexOf('--tts')
const ttsProvider = ttsIdx >= 0 ? args[ttsIdx + 1] : undefined

pregenTts(scriptPath, { force, ttsProvider }).catch(err => {
  console.error(err.stack || err)
  process.exit(1)
})
