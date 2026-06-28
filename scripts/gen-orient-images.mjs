import { execSync } from 'child_process'
import { resolve, dirname, basename } from 'path'
import { existsSync } from 'fs'

const SIZES = {
  s: { h: [960, 540], v: [540, 720] },
  m: { h: [1280, 720], v: [720, 960] },
  g: { h: [1920, 1080], v: [1080, 1440] },
}

function usage() {
  console.error(`
Usage: node scripts/gen-orient-images.mjs <image.png> [preset]

Generate _h and _v orientation images from a single source image.
The source is scaled proportionally to fit, then centered on a transparent canvas.

Preset (default: g):
  s  540p   (960×540 / 540×720)
  m  720p   (1280×720 / 720×960)
  g  1080p  (1920×1080 / 1080×1440)

Example:
  node scripts/gen-orient-images.mjs movies/screenshot/win.png
  node scripts/gen-orient-images.mjs movies/screenshot/model.png -m
`)
  process.exit(1)
}

const src = process.argv[2]
if (!src || !existsSync(src)) usage()

const presetKey = process.argv[3]?.replace(/^-/, '') || 'g'
const preset = SIZES[presetKey]
if (!preset) usage()

const base = src.replace(/\.\w+$/, '')

for (const orient of ['h', 'v']) {
  const [w, h] = preset[orient]
  const out = `${base}_${orient}.png`
  const filter = `scale='if(gt(iw/ih,${w}/${h}),${w},-1)':'if(gt(iw/ih,${w}/${h}),-1,${h})'`
  console.log(`Generating ${out} (${w}×${h})...`)
  execSync(
    `ffmpeg -y -i "${src}" -vf "${filter},pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -update 1 "${out}"`,
    { stdio: 'inherit' },
  )
}
