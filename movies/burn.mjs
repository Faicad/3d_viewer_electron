import { readFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { dirname, join, basename, extname } from 'path'
import { spawnSync } from 'child_process'
import { burnVideo } from './lib-electron.mjs'

const args = process.argv.slice(2)
const scriptArg = args[0]
if (!scriptArg) {
  console.error('Usage: node movies/burn.mjs <script.mjs> [-s|-m|-g] [-h|-v] [-30] [-f] [--tts <provider>]')
  process.exit(1)
}

const absPath = join(process.cwd(), scriptArg)
const scriptUrl = pathToFileURL(absPath).href
const genDir = join(dirname(absPath), 'gen')
const scriptName = basename(absPath, extname(absPath))

// Detect script type (scene must be checked first — it may also have const image)
const src = readFileSync(absPath, 'utf-8')
const isSceneScript = /\bexport\s+function\s+scene\s*\(/.test(src)
const isImageScript = !isSceneScript && /(?:^|\n)const\s+image\s*=\s*['"][^'"]+['"]\s*;?\s*\n/.test(src)
const isUrlScript = !isSceneScript && /(?:^|\n)const\s+urls\s*=/.test(src)
const isImageConfigScript = !isSceneScript && /(?:^|\n)const\s+image_config\s*=/.test(src)

// Flags to forward to child processes (exclude burn.mjs-only flags)
const childFlags = args.slice(1)

// Extract --tts <provider> for forwarding
const ttsIdx = args.indexOf('--tts')
const ttsArgs = ttsIdx >= 0 ? ['--tts', args[ttsIdx + 1]] : []

// ── Step 1: Generate video ──
if (isSceneScript) {
  console.log(`\n=== Generating scene video: ${scriptName} ===`)
  const r = spawnSync('node', [
    'movies/generate-html-video.mjs', absPath, '--no-burn', ...childFlags, ...ttsArgs,
  ], { stdio: 'inherit', timeout: 600000 })
  if (r.status !== 0) process.exit(r.status ?? 1)
} else if (isUrlScript) {
  console.log(`\n=== Generating URL video: ${scriptName} ===`)
  const r = spawnSync('node', [
    'movies/generate-url-video.mjs', absPath, ...childFlags, ...ttsArgs,
  ], { stdio: 'inherit', timeout: 600000 })
  if (r.status !== 0) process.exit(r.status ?? 1)
} else if (isImageScript) {
  console.log(`\n=== Generating image video: ${scriptName} ===`)
  const r = spawnSync('node', [
    'movies/generate-image-video.mjs', absPath, '--no-burn', ...childFlags, ...ttsArgs,
  ], { stdio: 'inherit', timeout: 600000 })
  if (r.status !== 0) process.exit(r.status ?? 1)
} else if (isImageConfigScript) {
  console.log(`\n=== Generating image_config video: ${scriptName} ===`)
  const r = spawnSync('node', [
    'movies/generate-image2-video.mjs', absPath, ...childFlags, ...ttsArgs,
  ], { stdio: 'inherit', timeout: 600000 })
  if (r.status !== 0) process.exit(r.status ?? 1)
} else {
  console.log(`\n=== Recording 3D video: ${scriptName} ===`)
  const r = spawnSync('node', [absPath, ...childFlags], { stdio: 'inherit', timeout: 3600000 })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

// ── Step 2: Generate subtitle + audio ──
// Hyper/Image/URL scripts: TTS already generated internally (step 1).
// 3D scripts: generate via generate-subtitle.mjs.
if (!isSceneScript && !isImageScript && !isUrlScript && !isImageConfigScript) {
  console.log(`\n=== Generating subtitle + audio: ${scriptName} ===`)
  const subFlags = [...ttsArgs]
  const isForce = args.includes('-f') || args.includes('--force')
  if (isForce) subFlags.unshift('-f')
  const r = spawnSync('node', [
    'movies/generate-subtitle.mjs', absPath, ...subFlags,
  ], { stdio: 'inherit', timeout: 600000 })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

// ── Step 3: Burn subtitles + audio into final video ──
// URL scripts: burn already done inside generate-url-video.mjs.
// Hyper/Image scripts: burn done here via burnVideo (generate-hyper/mage-video.mjs was called with --no-burn).
if (!isUrlScript && !isImageConfigScript) {
  console.log(`\n=== Burning subtitles: ${scriptName} ===`)
  burnVideo(scriptUrl, genDir)
}
