import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { generateVideo } from './lib_gen_url_image.mjs'

function parseUrls(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  const m = src.match(/(?:^|\n)const\s+urls\s*=\s*(\[[\s\S]*?\])\s*;?\s*(?:\n|$)/)
  if (!m) {
    console.error('No `const urls = [...]` found in', scriptPath)
    process.exit(1)
  }
  return new Function(`return ${m[1]}`)()
}

// ── CLI ──
const scriptPath = resolve(process.argv[2])
if (!scriptPath || !existsSync(scriptPath)) {
  console.error('Usage: node movies/generate-url-video.mjs [--tts edge-tts|tencent-tts] [--no-tts] [--no-burn] <script.mjs>')
  process.exit(1)
}

generateVideo(scriptPath, {
  urls: parseUrls(scriptPath),
  mode: 'url',
}).catch(err => {
  console.error(err)
  process.exit(1)
})
