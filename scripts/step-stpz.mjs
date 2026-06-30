#!/usr/bin/env node

/**
 * STEP ↔ STPZ converter
 *
 * Per CAx-IF Recommended Practices v1.3 and ISO 10303-21:2016 Annex A.4,
 * STPZ uses the ZIP container format (PKZIP 2.04g+, deflate).
 *
 * Usage:
 *   node scripts/step-stpz.mjs <input> [output]
 *
 *   input  is .step / .stp  → compress to .stpz
 *   input  is .stpz         → decompress to .step
 *
 * Examples:
 *   node scripts/step-stpz.mjs model.step
 *   node scripts/step-stpz.mjs model.stpz
 *   node scripts/step-stpz.mjs part.stp part.stpz
 *   node scripts/step-stpz.mjs assembly.stpz assembly.step
 */

import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { zipSync, unzipSync } = require('../node_modules/three/examples/jsm/libs/fflate.module.js')

function fmt(bytes) {
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}

function isStep(filename) {
  const f = filename.toLowerCase()
  return f.endsWith('.step') || f.endsWith('.stp')
}

function isStpz(filename) {
  return filename.toLowerCase().endsWith('.stpz')
}

function replaceExt(filename, newExt) {
  const base = basename(filename).replace(/\.(step|stp|stpz)$/i, '')
  return `${base}${newExt}`
}

function parseArgs() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stderr.write([
      `Usage: node scripts/step-stpz.mjs <input> [output]`,
      ``,
      `  input  is .step / .stp  → compress to .stpz`,
      `  input  is .stpz         → decompress to .step`,
      ``,
      `  If output is omitted, the extension is auto-changed:`,
      `    .step / .stp  → .stpz`,
      `    .stpz         → .step`,
      ``,
      `Examples:`,
      `  node scripts/step-stpz.mjs model.step`,
      `  node scripts/step-stpz.mjs model.stpz`,
      `  node scripts/step-stpz.mjs part.stp part.stpz`,
      `  node scripts/step-stpz.mjs assembly.stpz assembly.step`,
    ].join('\n') + '\n')
    process.exit(1)
  }

  const input = args[0]
  const isCompress = isStep(input)
  const isDecompress = isStpz(input)

  if (!isCompress && !isDecompress) {
    process.stderr.write(`Error: input "${input}" must be .step/.stp (compress) or .stpz (decompress)\n`)
    process.exit(1)
  }

  let output = args[1]
  if (!output) {
    output = isCompress ? replaceExt(input, '.stpz') : replaceExt(input, '.step')
  }

  return { input, output, mode: isCompress ? 'compress' : 'decompress' }
}

function main() {
  const { input, output, mode } = parseArgs()

  const inputStat = statSync(input)
  const inputSize = inputStat.size
  process.stderr.write(`Mode: ${mode === 'compress' ? 'STEP → STPZ' : 'STPZ → STEP'}\n`)
  process.stderr.write(`Input:  ${input}  (${fmt(inputSize)})\n`)

  const data = readFileSync(input)

  let result
  const t0 = performance.now()
  if (mode === 'compress') {
    const entryName = basename(input).replace(/\.(step|stp)$/i, '.stp')
    result = zipSync({ [entryName]: new Uint8Array(data) })
  } else {
    const unzipped = unzipSync(new Uint8Array(data))
    const stepKey = Object.keys(unzipped).find(
      (k) => k.toLowerCase().endsWith('.stp') || k.toLowerCase().endsWith('.step'),
    )
    if (!stepKey) {
      process.stderr.write('Error: No STEP file found in STPZ archive. Entries: ' + (Object.keys(unzipped).join(', ') || '(empty)') + '\n')
      process.exit(1)
    }
    result = Buffer.from(unzipped[stepKey])
  }
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2)

  writeFileSync(output, result)

  const outSize = result.length
  const ratio = mode === 'compress' ? ((1 - outSize / inputSize) * 100).toFixed(1) : ((1 - inputSize / outSize) * 100).toFixed(1)
  process.stderr.write(`Output: ${output}  (${fmt(outSize)})\n`)
  process.stderr.write(`${mode === 'compress' ? `Compression: ${ratio}% smaller` : `Overhead: ${ratio}% of original`}  (${elapsed}s)\n`)
}

main()
