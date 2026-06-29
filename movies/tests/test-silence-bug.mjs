/**
 * Reproduce: first sentence not delayed by ---3000--- at beginning.
 * Reads the actual m1.mjs, runs through real pipeline functions.
 *
 * Run: node movies/tests/test-silence-bug.mjs
 */

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'

// ── Import real pipeline functions ──
const gsPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'generate-subtitle.mjs')
const gs = await import(`file://${gsPath.replace(/\\/g, '/')}?t=${Date.now()}`)

const {
  parseSubtitleLines, splitBySyncpoints,
  INITIAL_GAP, INTER_LINE_GAP, generateSilence,
} = gs

const PASS = '\x1b[32mPASS\x1b[0m'
const FAIL = '\x1b[31mFAIL\x1b[0m'
let p = 0, f = 0
function assert(ok, msg) { if (ok) { p++; console.log(`  ${PASS} ${msg}`) } else { f++; console.log(`  ${FAIL} ${msg}`) } }

function round2(v) { return Math.round(v * 100) / 100 }

// ── Mock computeGroupDurations (same logic as pregen-tts.mjs) ──
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

// ── Entry building (mirrors generate-subtitle.mjs lines 600-625) ──
function buildEntries(segments, syncpoints) {
  const entries = []
  let cursor = INITIAL_GAP
  let prevGroup = 0
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.group !== prevGroup) {
      cursor = syncpoints[seg.group - 1]
      prevGroup = seg.group
    }
    if (seg.isSilence) {
      cursor += seg.duration
      continue
    }
    const e = { s: round2(cursor), e: round2(cursor + seg.duration), t: seg.text }
    entries.push(e)
    const hasFollowingSilence = i < segments.length - 1 && segments[i + 1].isSilence
    const gap = hasFollowingSilence ? 0 : INTER_LINE_GAP
    cursor += seg.duration + gap
  }
  return entries
}

// ── Simulate audio parts (mirrors generate-subtitle.mjs 673-705) ──
function simulateAudioParts(segments, entries) {
  let firstTtsAt = INITIAL_GAP
  for (const seg of segments) {
    if (seg.isSilence) {
      firstTtsAt += seg.duration
      continue
    }
    break
  }
  return { firstTtsAt }
}

// ════════════════════════════════════════════════════════════════

console.log('\n=== Reproduce: is first sentence delayed by ---3000---? ===\n')

// 1. Parse real m1.mjs
const scriptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'e2', 'm1.mjs')
const lines = parseSubtitleLines(scriptPath)
console.log(`  Lines: ${lines.length}`)
console.log(`  Line 0: "${lines[0]}"`)
console.log(`  Line 1: "${lines[1]}"`)

assert(lines[0] === '---3000---', `Line 0 is ---3000---`)
assert(lines[1] === 'STL文件——最常见的3D打印格式', 'Line 1 is first TTS')

// 2. Split by syncpoints
const { groups, markerCount } = splitBySyncpoints(lines)
assert(groups.length === 25, `25 groups (got ${groups.length})`)
assert(groups[0].length === 2, `Group 0 has 2 lines (got ${groups[0].length})`)
assert(groups[0][0] === '---3000---', 'Group 0[0] is silence')
assert(groups[0][1] === 'STL文件——最常见的3D打印格式', 'Group 0[1] is TTS')

// 3. Build segments (same logic as generate-subtitle.mjs)
const segments = []
for (let g = 0; g < groups.length; g++) {
  for (let i = 0; i < groups[g].length; i++) {
    const rawText = groups[g][i]
    const silenceMatch = rawText.match(/^---(\d+)---$/)
    if (silenceMatch) {
      const secs = parseInt(silenceMatch[1], 10) / 1000
      segments.push({ isSilence: true, group: g, duration: secs })
    } else {
      // Use a stub TTS duration (2.0s)
      const dur = 2.0
      segments.push({ isSilence: false, group: g, duration: dur, text: rawText })
    }
  }
}

assert(segments.length > 0, 'Segments created')
assert(segments[0].isSilence === true, 'Segments[0] is silence')
assert(segments[0].duration === 3.0, 'Segments[0] duration = 3.0')
assert(segments[1].isSilence === false, 'Segments[1] is TTS')

// 4. Compute group durations (timing.json simulation)
const timing = computeGroupDurations(segments)
console.log(`\n  Group 0 totalDuration: ${timing.groups[0].totalDuration.toFixed(2)}s`)
console.log(`  Group 1 totalDuration: ${timing.groups[1].totalDuration.toFixed(2)}s`)
console.log(`  TTS total: ${timing.ttsTotal.toFixed(2)}s`)

assert(timing.groups[0].totalDuration > 3.0, `Group 0 duration includes silence (${timing.groups[0].totalDuration})`)

// 5. Build entries with realistic syncpoints
// Simulate: elapsed = 1.5s (entry anim) + 3.0s (rotateModel) = 4.5s
// But totalDuration = 5.5s, so syncpoint waits 1.0s → syncpoints[0] = 5.5
const simulatedSyncpoints = [timing.groups[0].totalDuration]
for (let i = 1; i < timing.groups.length; i++) {
  simulatedSyncpoints.push(round2(simulatedSyncpoints[i - 1] + timing.groups[i].totalDuration))
}

const entries = buildEntries(segments, simulatedSyncpoints)
const firstEntry = entries[0]

console.log(`\n  First entry: s=${firstEntry?.s?.toFixed(2)}s, e=${firstEntry?.e?.toFixed(2)}s`)
console.log(`  First text: "${firstEntry?.t}"`)
console.log(`  Expected: s >= ${(INITIAL_GAP + 3.0).toFixed(2)}s`)

assert(firstEntry !== undefined, 'First entry exists')
assert(firstEntry.s >= INITIAL_GAP + 3.0,
  `❓ First entry s=${firstEntry.s.toFixed(2)} >= ${(INITIAL_GAP + 3.0).toFixed(2)} ? ${firstEntry.s >= INITIAL_GAP + 3.0}`)
assert(firstEntry.s === INITIAL_GAP + 3.0,
  `FIRST ENTRY DELAY: s = ${firstEntry.s.toFixed(2)}s (= INITIAL_GAP(${INITIAL_GAP}) + ---3000---(3.0))`)

// 6. Audio concat: when does first TTS play?
const audio = simulateAudioParts(segments, entries)
console.log(`\n  Audio first TTS at: ${audio.firstTtsAt.toFixed(2)}s`)
assert(audio.firstTtsAt === INITIAL_GAP + 3.0,
  `Audio delay matches: ${audio.firstTtsAt.toFixed(2)}s`)

// ════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`)
console.log(`  ${p} passed, ${f} failed`)

if (f > 0) {
  console.log(`❌ BUG REPRODUCED — entry timing incorrect`)
  process.exit(1)
} else {
  console.log(`✅ Pipeline produces correct timing — ` +
    `first entry delayed by 3.5s`)
}
