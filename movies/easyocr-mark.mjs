/**
 * Run easyocr on a screenshot to find text coordinates and write marks.json.
 *
 * Usage:
 *   node movies/easyocr-mark.mjs <screenshot.png> <output.json> <text1> [text2 ...]
 *
 * Examples:
 *   node movies/easyocr-mark.mjs \
 *     movies/screenshot/win_h.png \
 *     movies/e1/ai_gen/m0_refactor_0000_h_marks.json \
 *     "3D查看器"
 *
 *   node movies/easyocr-mark.mjs \
 *     movies/screenshot/3D查看器_h.png \
 *     movies/e1/ai_gen/m0_refactor_0002_h_marks.json \
 *     "详细信息"
 *
 * Output marks.json format:
 *   { "3D查看器": { "x": 1090, "y": 569, "w": 160, "h": 60, "fullY": 569 } }
 */

import { spawnSync } from 'child_process'
import { existsSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const [screenshot, outputJson, ...texts] = process.argv.slice(2)

if (!screenshot || !outputJson || texts.length === 0) {
  console.error(`Usage: node movies/easyocr-mark.mjs <screenshot.png> <output.json> <text1> [text2 ...]`)
  process.exit(1)
}

const absScreenshot = resolve(screenshot)
if (!existsSync(absScreenshot)) {
  console.error(`Screenshot not found: ${absScreenshot}`)
  process.exit(1)
}

const r = spawnSync('python3', ['movies/easyocr-mark.py', absScreenshot, ...texts], {
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 120000,
  maxBuffer: 50 * 1024 * 1024,
  encoding: 'utf-8',
})

if (r.error) {
  console.error(`Failed to run easyocr:`, r.error.message)
  process.exit(1)
}

if (r.status !== 0) {
  console.error(`easyocr failed (exit ${r.status})`)
  if (r.stderr) process.stderr.write(r.stderr)
  process.exit(1)
}

// stderr has progress info, stdout has JSON
if (r.stderr) process.stderr.write(r.stderr)

let marks
try {
  marks = JSON.parse(r.stdout)
} catch (e) {
  console.error(`Failed to parse easyocr output:`, r.stdout?.slice(0, 500))
  process.exit(1)
}

if (marks.error) {
  console.error(`easyocr error:`, marks.error)
  process.exit(1)
}

// Check which texts were not found
const notFound = texts.filter(t => !marks[t])
if (notFound.length > 0) {
  console.error(`Warning: text(s) not found by easyocr: ${notFound.join(', ')}`)
  console.error(`  Found keys: ${Object.keys(marks).join(', ') || '(none)'}`)
}

// Write marks.json
writeFileSync(outputJson, JSON.stringify(marks, null, 2) + '\n', 'utf-8')
console.log(`\nWrote ${Object.keys(marks).length}/${texts.length} marks to ${outputJson}`)
