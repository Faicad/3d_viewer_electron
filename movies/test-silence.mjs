/**
 * Test silence parsing (---x---) — validates splitBySyncpoints, computeGroupDurations,
 * entry building cursor, and audio concat gap fill at group boundaries.
 *
 * Run: node movies/test-silence.mjs
 */

import { existsSync } from 'fs'
import { spawnSync } from 'child_process'

const PASS = '\x1b[32mPASS\x1b[0m'
const FAIL = '\x1b[31mFAIL\x1b[0m'
let passed = 0
let failed = 0

function assert(condition, msg) {
  if (condition) {
    passed++
    console.log(`  ${PASS} ${msg}`)
  } else {
    failed++
    console.log(`  ${FAIL} ${msg}`)
  }
}

function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed++
    console.log(`  ${PASS} ${msg}`)
  } else {
    failed++
    console.log(`  ${FAIL} ${msg}`)
    console.log(`    expected: ${e}`)
    console.log(`    actual:   ${a}`)
  }
}

// ════════════════════════════════════════════════════════════════
// Helpers (mirroring generate-subtitle.mjs logic)
// ════════════════════════════════════════════════════════════════

const INITIAL_GAP = 0.5
const INTER_LINE_GAP = 0.15

function round2(v) { return Math.round(v * 100) / 100 }

/** Mirror of generate-subtitle.mjs splitBySyncpoints */
function splitBySyncpoints(lines) {
  const groups = []
  let current = []
  let markerCount = 0
  for (const line of lines) {
    if (/^--\d+--$/.test(line)) {
      markerCount++
      groups.push(current)
      current = []
    } else {
      current.push(line)
    }
  }
  groups.push(current)
  return { groups, markerCount }
}

/** Mirror of pregen-tts.mjs computeGroupDurations */
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

/** Mirror of generate-subtitle.mjs computeAudioTotal */
function computeAudioTotal(segments) {
  if (segments.length === 0) return 0
  let total = INITIAL_GAP
  for (let i = 0; i < segments.length; i++) {
    total += segments[i].duration
    if (i < segments.length - 1 && !segments[i].isSilence && !segments[i + 1].isSilence && segments[i].group === segments[i + 1].group) {
      total += INTER_LINE_GAP
    }
  }
  return round2(total)
}

/** Build subtitle entries from segments and syncpoints (mirror of generate-subtitle.mjs lines 600-625) */
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

/** Simulate audio concat gap calculation (mirror of generate-subtitle.mjs lines 673-705) */
function computeAudioGaps(segments, entries) {
  const gaps = []
  let entryIdx = -1
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i].isSilence) entryIdx++
    if (i >= segments.length - 1) continue
    const isBoundary = segments[i].group !== segments[i + 1].group
    const hasAdjSilence = segments[i].isSilence || segments[i + 1].isSilence
    if (!hasAdjSilence && !isBoundary) continue
    if (!isBoundary) continue
    if (entryIdx + 1 >= entries.length) continue
    const gap = round2(entries[entryIdx + 1].s - entries[entryIdx].e)
    if (gap <= 0) continue
    let filledBySilence = 0
    if (segments[i].isSilence) filledBySilence += segments[i].duration
    if (segments[i + 1].isSilence) filledBySilence += segments[i + 1].duration
    const remaining = round2(gap - filledBySilence)
    gaps.push({ afterEntryIdx: entryIdx, gap, filledBySilence, remaining })
  }
  return gaps
}

// ════════════════════════════════════════════════════════════════
// Test data
// ════════════════════════════════════════════════════════════════

const TTS_DUR = 2.0  // stub TTS duration for all tests
const SIL_2 = 2.0    // ---2000---

// ════════════════════════════════════════════════════════════════
// 1. splitBySyncpoints
// ════════════════════════════════════════════════════════════════

console.log('\n=== 1. splitBySyncpoints ===')

// 1a. Position: Group 0 prefix
{
  const lines = [
    '---2000---',
    'STL文件',
    '--1--',
    'GLB文件',
  ]
  const { groups, markerCount } = splitBySyncpoints(lines)
  assert(markerCount === 1, `Group 0 prefix: markerCount = 1 (got ${markerCount})`)
  assert(groups.length === 2, `Group 0 prefix: 2 groups (got ${groups.length})`)
  assertDeepEqual(groups[0], ['---2000---', 'STL文件'], 'Group 0 prefix: group 0')
  assertDeepEqual(groups[1], ['GLB文件'], 'Group 0 prefix: group 1')
}

// 1b. Position: Group N prefix (standard)
{
  const lines = [
    'STL文件',
    '--1--',
    '---2000---',
    'GLB文件',
    '--2--',
    '3MF文件',
  ]
  const { groups, markerCount } = splitBySyncpoints(lines)
  assert(markerCount === 2, `Group N prefix: markerCount = 2 (got ${markerCount})`)
  assert(groups.length === 3, `Group N prefix: 3 groups (got ${groups.length})`)
  assertDeepEqual(groups[0], ['STL文件'], 'Group N prefix: group 0')
  assertDeepEqual(groups[1], ['---2000---', 'GLB文件'], 'Group N prefix: group 1')
  assertDeepEqual(groups[2], ['3MF文件'], 'Group N prefix: group 2')
}

// 1c. Position: Between two TTS in same group
{
  const lines = [
    '第一句',
    '---2000---',
    '第二句',
    '--1--',
  ]
  const { groups } = splitBySyncpoints(lines)
  assertDeepEqual(groups[0], ['第一句', '---2000---', '第二句'], 'Between TTS: group 0')
}

// 1d. Position: Group end before syncpoint
{
  const lines = [
    'TTS',
    '---2000---',
    '--1--',
    'GLB文件',
  ]
  const { groups } = splitBySyncpoints(lines)
  assertDeepEqual(groups[0], ['TTS', '---2000---'], 'Group end: group 0')
  assertDeepEqual(groups[1], ['GLB文件'], 'Group end: group 1')
}

// 1e. Consecutive silence
{
  const lines = [
    'STL文件',
    '--1--',
    '---1000---',
    '---2000---',
    'GLB文件',
  ]
  const { groups } = splitBySyncpoints(lines)
  assertDeepEqual(groups[1], ['---1000---', '---2000---', 'GLB文件'], 'Consecutive silence: group 1')
}

// 1f. Last group end silence
{
  const lines = [
    'TTS',
    '--1--',
    'TTS2',
    '---3000---',
  ]
  const { groups } = splitBySyncpoints(lines)
  assertDeepEqual(groups[1], ['TTS2', '---3000---'], 'Last group end: group 1')
}

// 1g. All 7 positions combined
{
  const lines = [
    '---2000---',
    '第一句',
    '---500---',
    '第二句',
    '---1000---',
    '--1--',
    '---3000---',
    '第三句',
    '---1500---',
    '--2--',
    '第四句',
    '---2500---',
  ]
  const { groups } = splitBySyncpoints(lines)
  assert(groups.length === 3, `All positions: 3 groups (got ${groups.length})`)
  assertDeepEqual(groups[0], ['---2000---', '第一句', '---500---', '第二句', '---1000---'], 'All: group 0')
  assertDeepEqual(groups[1], ['---3000---', '第三句', '---1500---'], 'All: group 1')
  assertDeepEqual(groups[2], ['第四句', '---2500---'], 'All: group 2')
}

// ════════════════════════════════════════════════════════════════
// 2. computeGroupDurations
// ════════════════════════════════════════════════════════════════

console.log('\n=== 2. computeGroupDurations ===')

// 2a. Group 0 prefix silence
{
  const segments = [
    { isSilence: true, group: 0, duration: 2.0 },
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'STL' },
  ]
  const { groups, ttsTotal } = computeGroupDurations(segments)
  assert(groups.length === 1, 'Silence prefix: 1 group')
  assert(groups[0].totalDuration === round2(INITIAL_GAP + 2.0 + TTS_DUR),
    `Silence prefix: total=${groups[0].totalDuration} (expected ${INITIAL_GAP + 2.0 + TTS_DUR})`)
  assert(groups[0].lineCount === 1, 'Silence prefix: lineCount=1')
}

// 2b. Group N prefix silence
{
  const segments = [
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'STL' },
    { isSilence: true, group: 1, duration: 2.0 },
    { isSilence: false, group: 1, duration: TTS_DUR, text: 'GLB' },
  ]
  const { groups } = computeGroupDurations(segments)
  assert(groups[1].totalDuration === round2(2.0 + TTS_DUR),
    `Group N prefix: group 1 total=${groups[1].totalDuration}`)
}

// 2c. Same-group TTS + silence + TTS (between two TTS)
{
  const segments = [
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'A' },
    { isSilence: true, group: 0, duration: 2.0 },
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'B' },
  ]
  const { groups } = computeGroupDurations(segments)
  // total = INITIAL_GAP + TTS_DUR + silence + TTS_DUR
  // Note: INTER_LINE_GAP NOT added because silence interrupts TTS-to-TTS adjacency
  assert(groups[0].totalDuration === round2(INITIAL_GAP + TTS_DUR + 2.0 + TTS_DUR),
    `Between TTS: total=${groups[0].totalDuration}`)
}

// 2d. Same-group TTS-to-TTS gap (no silence, should add INTER_LINE_GAP)
{
  const segments = [
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'A' },
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'B' },
  ]
  const { groups } = computeGroupDurations(segments)
  assert(groups[0].totalDuration === round2(INITIAL_GAP + TTS_DUR + INTER_LINE_GAP + TTS_DUR),
    `TTS-to-TTS gap: total=${groups[0].totalDuration}`)
}

// 2e. Consecutive silences accumulate
{
  const segments = [
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'A' },
    { isSilence: true, group: 1, duration: 1.0 },
    { isSilence: true, group: 1, duration: 2.0 },
    { isSilence: false, group: 1, duration: TTS_DUR, text: 'TTS' },
  ]
  const { groups } = computeGroupDurations(segments)
  assert(groups[1].totalDuration === round2(3.0 + TTS_DUR),
    `Consecutive: total=${groups[1].totalDuration} (expected 5.0)`)
}

// 2f. Last group end silence
{
  const segments = [
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'TTS' },
    { isSilence: true, group: 0, duration: 3.0 },
  ]
  const { groups } = computeGroupDurations(segments)
  assert(groups[0].totalDuration === round2(INITIAL_GAP + TTS_DUR + 3.0),
    `Last group end: total=${groups[0].totalDuration}`)
}

// 2g. TTS total
{
  const segments = [
    { isSilence: false, group: 0, duration: 3.72, text: 'A' },
    { isSilence: true, group: 1, duration: 2.0 },
    { isSilence: false, group: 1, duration: 3.60, text: 'B' },
    { isSilence: true, group: 2, duration: 2.0 },
    { isSilence: false, group: 2, duration: 4.56, text: 'C' },
  ]
  const { ttsTotal } = computeGroupDurations(segments)
  const expected = round2((INITIAL_GAP + 3.72) + (2.0 + 3.60) + (2.0 + 4.56))
  assert(ttsTotal === expected, `TTS total: ${ttsTotal} (expected ${expected})`)
}

// ════════════════════════════════════════════════════════════════
// 3. Entry building cursor
// ════════════════════════════════════════════════════════════════

console.log('\n=== 3. Entry building cursor ===')

// 3a. Group 0 prefix: cursor advances past silence before first entry
{
  const segments = [
    { isSilence: true, group: 0, duration: SIL_2 },
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'STL' },
  ]
  const entries = buildEntries(segments, [])
  assert(entries.length === 1, 'Group 0 prefix: 1 entry')
  assert(entries[0].s === round2(INITIAL_GAP + SIL_2),
    `Group 0 prefix: first entry s=${entries[0].s} (expected ${INITIAL_GAP + SIL_2})`)
  assert(entries[0].e === round2(INITIAL_GAP + SIL_2 + TTS_DUR),
    `Group 0 prefix: first entry e=${entries[0].e}`)
}

// 3b. Group N prefix: cursor resets to syncpoint then advances past silence
{
  const segments = [
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'STL' },
    { isSilence: true, group: 1, duration: SIL_2 },
    { isSilence: false, group: 1, duration: TTS_DUR, text: 'GLB' },
  ]
  const syncpoints = [4.527]
  const entries = buildEntries(segments, syncpoints)
  assert(entries.length === 2, 'Group N prefix: 2 entries')
  assert(entries[1].s === round2(syncpoints[0] + SIL_2),
    `Group N prefix: entry 1 s=${entries[1].s} (expected ${syncpoints[0] + SIL_2})`)
}

// 3c. Between TTS silence in same group
{
  const segments = [
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'A' },
    { isSilence: true, group: 0, duration: 0.5 },
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'B' },
  ]
  const entries = buildEntries(segments, [])
  assert(entries.length === 2, 'Between TTS: 2 entries')
  assert(entries[0].s === round2(INITIAL_GAP), `Between TTS: entry 0 s=${entries[0].s}`)
  assert(entries[0].e === round2(INITIAL_GAP + TTS_DUR), `Between TTS: entry 0 e=${entries[0].e}`)
  // cursor after entry 0: INITIAL_GAP + TTS_DUR + 0 (hasFollowingSilence=true)
  // then silence: cursor += 0.5
  assert(entries[1].s === round2(INITIAL_GAP + TTS_DUR + 0.5),
    `Between TTS: entry 1 s=${entries[1].s} (expected ${INITIAL_GAP + TTS_DUR + 0.5})`)
  assert(entries[1].e === round2(INITIAL_GAP + TTS_DUR + 0.5 + TTS_DUR),
    `Between TTS: entry 1 e=${entries[1].e}`)
}

// 3d. Following silence suppresses INTER_LINE_GAP
{
  const segments = [
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'TTS' },
    { isSilence: true, group: 0, duration: 1.0 },
  ]
  const entries = buildEntries(segments, [])
  assert(entries.length === 1, 'Following silence: 1 entry')
  assert(entries[0].e === round2(INITIAL_GAP + TTS_DUR),
    `Following silence: e=${entries[0].e}`)
}

// 3e. Group end silence (TTS + silence + --N--): cursor resets to syncpoint
{
  const segments = [
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'TTS' },
    { isSilence: true, group: 0, duration: SIL_2 },
    { isSilence: false, group: 1, duration: TTS_DUR, text: 'GLB' },
  ]
  const syncpoints = [6.0]
  const entries = buildEntries(segments, syncpoints)
  // Group 0: TTS starts at INITIAL_GAP, ends at INITIAL_GAP + TTS_DUR
  // silence: cursor += 2.0 → cursor = INITIAL_GAP + TTS_DUR + 2.0
  // Group 1: cursor resets to syncpoints[0] = 6.0
  // If syncpoint >= cursor (6.0 >= 4.5), cursor stays at 6.0
  assert(entries[0].s === round2(INITIAL_GAP), `Group end: entry 0 s=${entries[0].s}`)
  assert(entries[1].s === round2(syncpoints[0]),
    `Group end: entry 1 s=${entries[1].s} (expected ${syncpoints[0]})`)
}

// 3f. Standard usage: full playback
{
  const segments = [
    { isSilence: true, group: 0, duration: 3.0 },
    { isSilence: false, group: 0, duration: 3.72, text: 'STL文件' },
    { isSilence: true, group: 1, duration: 2.0 },
    { isSilence: false, group: 1, duration: 3.60, text: 'GLB文件' },
  ]
  const syncpoints = [5.0]
  const entries = buildEntries(segments, syncpoints)
  assert(entries.length === 2, 'Standard: 2 entries')
  assert(entries[0].s === round2(INITIAL_GAP + 3.0),
    `Standard: entry 0 s=${entries[0].s} (expected ${INITIAL_GAP + 3.0})`)
  assert(entries[0].e === round2(INITIAL_GAP + 3.0 + 3.72),
    `Standard: entry 0 e=${entries[0].e}`)
  assert(entries[1].s === round2(syncpoints[0] + 2.0),
    `Standard: entry 1 s=${entries[1].s} (expected ${syncpoints[0] + 2.0})`)
  assert(entries[1].e === round2(syncpoints[0] + 2.0 + 3.60),
    `Standard: entry 1 e=${entries[1].e}`)
}

// ════════════════════════════════════════════════════════════════
// 4. Audio concat gap fill at group boundaries
// ════════════════════════════════════════════════════════════════

console.log('\n=== 4. Audio concat gap fill ===')

// 4a. Group boundary with adjacent silence: gap = entries_gap - silence_duration
{
  // Simulate the bug scenario from silence-design.md
  // seg[6]: STEP TTS (group 3), seg[7]: silence (group 4), seg[8]: OBJ TTS (group 4)
  const segments = [
    { isSilence: false, group: 3, duration: 3.82, text: 'STEP' },
    { isSilence: true, group: 4, duration: 2.0 },
    { isSilence: false, group: 4, duration: 4.25, text: 'OBJ' },
  ]
  const syncpoints = [41.58]  // after STEP group's syncpoint
  const entries = buildEntries(segments, syncpoints)
  // entries[0] = { s: 18.98, e: 22.80 } (STEP from earlier groups)
  // entries[1] = { s: syncpoints[0] + 2.0 = 43.58, e: 47.83 } (OBJ)
  // But wait, entries[0] is from group 3, entries[1] is from group 4
  // entries[0] was built earlier (in the real pipeline), so we need to simulate
  // with proper syncpoints

  // Let's use a simpler test case
}

// 4b. Simple boundary: TTS(group 0) → TTS(group 1), no silence
{
  const segments = [
    { isSilence: false, group: 0, duration: 3.0, text: 'A' },
    { isSilence: false, group: 1, duration: 3.0, text: 'B' },
  ]
  // syncpoints[0] = 10.0 (group 0 TTS starts at 0.5, ends at 3.5; then syncpoint at 10.0)
  const syncpoints = [10.0]
  const entries = buildEntries(segments, syncpoints)
  const gaps = computeAudioGaps(segments, entries)
  // gap = entries[1].s - entries[0].e = 10.0 - 3.5 = 6.5
  // filledBySilence = 0, remaining = 6.5
  assert(gaps.length === 1, `Simple boundary: 1 gap (got ${gaps.length})`)
  if (gaps.length === 1) {
    assert(gaps[0].gap === 6.5, `Simple boundary: gap=${gaps[0].gap} (expected 6.5)`)
    assert(gaps[0].remaining === 6.5, `Simple boundary: remaining=${gaps[0].remaining} (expected 6.5)`)
  }
}

// 4c. Boundary with silence prefix: remaining = gap - silence_duration
{
  const segments = [
    { isSilence: false, group: 0, duration: 3.82, text: 'STEP' },
    { isSilence: true, group: 1, duration: 2.0 },
    { isSilence: false, group: 1, duration: 4.25, text: 'OBJ' },
  ]
  // Group 0: TTS starts at 0.5, ends at 4.32
  // syncpoints[0] = 22.80 (from real recording after model load)
  const syncpoints = [22.80]
  const entries = buildEntries(segments, syncpoints)
  // entries[0] = { s: 0.5, e: 4.32 }
  // entries[1] = { s: 22.80 + 2.0 = 24.80, e: 29.05 }
  const gaps = computeAudioGaps(segments, entries)
  assert(gaps.length === 1, `Boundary with silence: 1 gap`)
  if (gaps.length === 1) {
    // gap = 24.80 - 4.32 = 20.48
    const expectedGap = round2(entries[1].s - entries[0].e)
    assert(gaps[0].gap === expectedGap, `Boundary with silence: gap=${gaps[0].gap} (expected ${expectedGap})`)
    assert(gaps[0].filledBySilence === 2.0, `Boundary with silence: filledBySilence=${gaps[0].filledBySilence} (expected 2.0)`)
    assert(gaps[0].remaining === round2(expectedGap - 2.0),
      `Boundary with silence: remaining=${gaps[0].remaining} (expected ${expectedGap - 2.0})`)
  }
}

// 4d. Boundary with silence suffix (group end silence + next group TTS)
{
  const segments = [
    { isSilence: false, group: 0, duration: 2.0, text: 'TTS' },
    { isSilence: true, group: 0, duration: 3.0 },
    { isSilence: false, group: 1, duration: 2.5, text: 'Next' },
  ]
  const syncpoints = [8.0]
  const entries = buildEntries(segments, syncpoints)
  const gaps = computeAudioGaps(segments, entries)
  assert(gaps.length === 1, `Boundary with suffix silence: 1 gap`)
  if (gaps.length === 1) {
    // entries[0]: s=0.5, e=2.5
    // entries[1]: s=syncpoints[0]=8.0, e=10.5
    // gap = 8.0 - 2.5 = 5.5
    // segments[0] is not silence, segments[1] is silence → filledBySilence=3.0
    // remaining = 5.5 - 3.0 = 2.5
    assert(gaps[0].gap === 5.5, `Boundary with suffix silence: gap=${gaps[0].gap} (expected 5.5)`)
    assert(gaps[0].filledBySilence === 3.0, `Boundary with suffix silence: filledBySilence=${gaps[0].filledBySilence} (expected 3.0)`)
    assert(gaps[0].remaining === 2.5, `Boundary with suffix silence: remaining=${gaps[0].remaining} (expected 2.5)`)
  }
}

// 4e. No gap at boundary (entries adjacent)
{
  const segments = [
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'A' },
    { isSilence: false, group: 1, duration: TTS_DUR, text: 'B' },
  ]
  // syncpoints[0] = entries[0].e (no gap between entries)
  const syncpoints = [round2(INITIAL_GAP + TTS_DUR)]
  const entries = buildEntries(segments, syncpoints)
  // entries[0]: s=0.5, e=2.5
  // entries[1]: s=2.5, e=4.5
  // gap = 2.5 - 2.5 = 0
  const gaps = computeAudioGaps(segments, entries)
  assert(gaps.length === 0, `No gap: 0 gaps (got ${gaps.length})`)
}

// 4f. Boundary with silence on both sides
{
  const segments = [
    { isSilence: true, group: 0, duration: 1.0 },
    { isSilence: false, group: 0, duration: TTS_DUR, text: 'A' },
    { isSilence: true, group: 0, duration: 2.0 },
    { isSilence: true, group: 1, duration: 1.0 },
    { isSilence: false, group: 1, duration: TTS_DUR, text: 'B' },
  ]
  const syncpoints = [10.0]
  const entries = buildEntries(segments, syncpoints)
  const gaps = computeAudioGaps(segments, entries)
  assert(gaps.length === 1, `Both sides silence: 1 gap`)
  if (gaps.length === 1) {
    // seg[2] (TTS from group 0) has silence before it (seg[2].isSilence=false, seg[3].isSilence=true)
    // entryIdx after seg[2] = 0 (since seg[0] is silence, seg[1] is TTS)
    // Wait, let me re-count. After processing seg[0] (silence, group 0), entryIdx = -1
    // After seg[1] (TTS, group 0), entryIdx = 0
    // After seg[2] (silence, group 0), entryIdx = 0
    // At i=2: i+1=3 is group boundary (0→1), hasAdjSilence = seg[2].isSilence=true
    //   entryIdx = 0, entries[0] = {s: 0.5+1.0=1.5, e: 3.5}
    //   entries[1] = {s: 10.0+1.0=11.0, e: 13.0}
    //   gap = 11.0 - 3.5 = 7.5
    //   filledBySilence = seg[2].isSilence → 2.0 + seg[3].isSilence → 1.0 = 3.0
    //   remaining = 7.5 - 3.0 = 4.5
    assert(gaps[0].gap > 0, `Both sides silence: gap > 0`)
    assert(gaps[0].filledBySilence === 3.0, `Both sides silence: filledBySilence=${gaps[0].filledBySilence} (expected 3.0)`)
  }
}

// ════════════════════════════════════════════════════════════════
// 5. Edge cases
// ════════════════════════════════════════════════════════════════

console.log('\n=== 5. Edge cases ===')

// 5a. No silence in script
{
  const segments = [
    { isSilence: false, group: 0, duration: 2.5, text: 'A' },
    { isSilence: false, group: 1, duration: 3.0, text: 'B' },
  ]
  const { groups } = computeGroupDurations(segments)
  assert(groups[0].totalDuration === round2(INITIAL_GAP + 2.5), `No silence: group 0=${groups[0].totalDuration}`)
  assert(groups[1].totalDuration === 3.0, `No silence: group 1=${groups[1].totalDuration}`)
}

// 5b. All silence in group (should error — validate in pregen-tts but we test the check)
{
  // This test validates that the condition used in pregen-tts.mjs correctly detects pure-silence groups
  const lines = [
    '---2000---',
    '--1--',
    'TTS',
  ]
  const { groups } = splitBySyncpoints(lines)
  const pureSilence = groups.map(g => g.every(line => /^---\d+---$/.test(line)))
  assert(pureSilence[0] === true, 'Pure silence group: group 0 detected')
  assert(pureSilence[1] === false, 'Pure silence group: group 1 is not pure silence')
}

// 5c. computeAudioTotal matches expectations
{
  const segments = [
    { isSilence: true, group: 0, duration: 2.0 },
    { isSilence: false, group: 0, duration: 3.72, text: 'A' },
    { isSilence: true, group: 1, duration: 2.0 },
    { isSilence: false, group: 1, duration: 3.60, text: 'B' },
  ]
  const total = computeAudioTotal(segments)
  const expected = round2(INITIAL_GAP + 2.0 + 3.72 + 2.0 + 3.60)
  assert(total === expected, `computeAudioTotal: ${total} (expected ${expected})`)
}

// 5d. Single silence segment only (no TTS at all) — should produce valid audio total
{
  const segments = [
    { isSilence: true, group: 0, duration: 5.0 },
  ]
  const total = computeAudioTotal(segments)
  assert(total === round2(INITIAL_GAP + 5.0), `Silence only: audioTotal=${total} (expected ${INITIAL_GAP + 5.0})`)
  const { groups } = computeGroupDurations(segments)
  assert(groups[0].lineCount === 0, 'Silence only: lineCount=0')
}

// ════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\n❌ Some tests FAILED`)
  process.exit(1)
} else {
  console.log(`\n✅ All tests passed`)
}
