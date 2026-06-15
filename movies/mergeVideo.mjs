import { existsSync, readFileSync } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { pathToFileURL } from 'url'
import { renderVideo } from './lib.mjs'

/**
 * mergeVideo — general merge + subtitle burn.
 *
 * Usage:
 *   node movies/mergeVideo.mjs <config.json>
 *
 * Config:
 * {
 *   "fps": 25,
 *   "subtitle": "m1.ass",
 *   "clips_h": ["intro_h.mp4", "m1_h.webm", "outro_h.mp4"],
 *   "clips_v": ["intro_v.mp4", "m1_v.webm", "outro_v.mp4"],
 *   "output_h": "m1_final_h.mp4",
 *   "output_v": "m1_final_v.mp4"
 * }
 *
 * Any clip file that doesn't exist is silently skipped.
 */
/**
 * mergeVideo — 多片段合并，从 JSON 配置读取。
 *
 * audioVoice 可从 subtitle 自动推导（同目录 gen/{name}.mp3），
 * 无需写在 JSON 中。
 *
 * Config:
 * {
 *   "fps": 25,
 *   "subtitle": "movies/p1/m1m2.ass",               // → audioVoice 自动推导
 *   "audioBg": "movies/alex-productions-....wav",    // 背景音乐（可选）
 *   "clips_h": ["..."],
 *   "clips_v": ["..."],
 *   "output_h": "...",
 *   "output_v": "..."
 * }
 */
export function mergeVideo(config) {
  const { fps = 25, subtitle, audioVoice: audioVoiceRaw, audioBg, clips_h, clips_v, output_h, output_v } = config
  if (!subtitle || !existsSync(subtitle)) {
    console.error('Subtitle file not found:', subtitle)
    return
  }
  const assPath = join(process.cwd(), subtitle)
  const assRel = subtitle.replace(/\\/g, '/')
  const audioVoice = audioVoiceRaw || join(dirname(subtitle), 'gen', basename(subtitle, extname(subtitle)) + '.mp3')

  console.log('\n=== Horizontal (1920×1080) ===')
  renderVideo({ clips: clips_h || [], audioVoice, audioBg, assPath, assRel, output: output_h || 'output_h.mp4', targetW: 1920, targetH: 1080, fps })

  console.log('\n=== Vertical (1080×1920) ===')
  renderVideo({ clips: clips_v || [], audioVoice, audioBg, assPath, assRel, output: output_v || 'output_v.mp4', targetW: 1080, targetH: 1920, fps })

  console.log('\nDone!')
}

// --- CLI ---
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const configPath = process.argv[2]
  if (!configPath) {
    console.error('Usage: node movies/mergeVideo.mjs <config.json>')
    process.exit(1)
  }
  const cfg = JSON.parse(readFileSync(configPath, 'utf-8'))
  mergeVideo(cfg)
}
