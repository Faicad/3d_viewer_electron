import { existsSync, readFileSync, copyFileSync } from 'fs'
import { resolve, join } from 'path'
import { generateVideo, pad4 } from './lib_gen_url_image.mjs'

function parseImageConfig(scriptPath) {
  const src = readFileSync(scriptPath, 'utf-8')
  const m = src.match(/(?:^|\n)const\s+image_config\s*=\s*(\[[\s\S]*?\])\s*;?\s*(?:\n|$)/)
  if (!m) {
    console.error('No `const image_config = [...]` found in', scriptPath)
    process.exit(1)
  }
  return new Function(`return ${m[1]}`)()
}

function resolveImagePath(imageBase, suffix) {
  if (!imageBase) return null
  const suffixed = `${imageBase}${suffix}.png`
  if (existsSync(suffixed)) return resolve(suffixed)
  const plain = `${imageBase}.png`
  if (existsSync(plain)) return resolve(plain)
  return null
}

// ── CLI ──
const scriptPath = resolve(process.argv[2])
if (!scriptPath || !existsSync(scriptPath)) {
  console.error('Usage: node movies/generate-image2-video.mjs [--tts edge-tts|tencent-tts] [--no-tts] [--no-burn] [-f] <script.mjs>')
  process.exit(1)
}

const rawConfig = parseImageConfig(scriptPath)
const urls = rawConfig.map(entry => ({
  url: entry.image || '',
  anim: entry.anim || [],
}))

generateVideo(scriptPath, {
  urls,
  mode: 'image',
  onBeforeRecord: async ({ aiGenDir, scriptName, suffix, urlCount }) => {
    let prevImage = null
    for (let i = 0; i < urlCount; i++) {
      const imageBase = rawConfig[i].image || prevImage
      prevImage = imageBase
      if (!imageBase) {
        console.error(`\nERROR: image_config[${i}] has no image and no previous image.`)
        process.exit(1)
      }
      const absPath = resolveImagePath(imageBase, suffix)
      if (!absPath) {
        console.error(`\nERROR: Image not found: ${imageBase}${suffix}.png (also tried plain .png)`)
        process.exit(1)
      }
      const dstPath = join(aiGenDir, `${scriptName}_${pad4(i)}${suffix}_full.png`)
      copyFileSync(absPath, dstPath)
    }
  },
}).catch(err => {
  console.error(err)
  process.exit(1)
})
