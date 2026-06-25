import { existsSync, statSync, unlinkSync } from 'fs'
import { join, dirname, basename } from 'path'
import { pathToFileURL } from 'url'
import { spawnSync } from 'child_process'

/**
 * coverClip — 将封面 PNG 生成为 1 帧的 MP4 clip（视频+静音音频）。
 *
 * 解决的核心问题：ffmpeg 中 -loop 1 + anullsrc 生成的视频 timebase 为 1/12800，
 * 后续经过 scale → fps 时会因为 frame_rate 变成 0/0 而丢弃帧。
 *
 * 修复手段：
 *   1. 用 `-r` 强制输入帧率，让编码器输出正常的 timebase
 *   2. 用 `-frames:v 1 -t` 精确控制输出时长，替代有 bug 的 `-shortest`
 *   3. 不依赖后续 filter chain 中的 fps 重采样，clip 本身就是目标 fps
 *
 * @param {string}  coverPng   封面 PNG 路径
 * @param {string}  outPath    输出 MP4 路径
 * @param {number}  targetW    目标宽度
 * @param {number}  targetH    目标高度
 * @param {number}  [fps=25]   帧率
 * @returns {boolean}          是否成功
 */
export function makeCoverClip(coverPng, outPath, targetW, targetH, fps = 25) {
  if (!existsSync(coverPng)) {
    console.error(`[coverClip] PNG not found: ${coverPng}`)
    return false
  }
  const frameDur = (1 / fps).toFixed(6)
  const r = spawnSync('ffmpeg', [
    '-y',
    '-r', `${fps}`,            // 强制输入帧率，避免 timebase = 1/12800
    '-loop', '1', '-i', coverPng,
    '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${frameDur}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    '-vf', `scale=${targetW}:${targetH}`,
    '-frames:v', '1',
    '-t', frameDur,            // 精确控制输出时长，替代 -shortest
    outPath,
  ], { stdio: 'pipe', timeout: 30000 })

  if (r.status !== 0) {
    const err = r.stderr.toString().split('\n').slice(-5).join('\n')
    console.error(`[coverClip] ffmpeg failed (exit ${r.status}):\n${err}`)
    return false
  }
  if (!existsSync(outPath) || statSync(outPath).size === 0) {
    console.error(`[coverClip] output is empty: ${outPath}`)
    return false
  }
  // 校验 clip 是否包含正确帧数
  const probeFrames = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=nb_frames',
    '-of', 'csv=p=0', outPath,
  ], { stdio: 'pipe', timeout: 10000 })
  const frames = Number(probeFrames.stdout.toString().trim())
  if (frames !== 1) {
    console.error(`[coverClip] expected 1 video frame, got ${frames}`)
    try { unlinkSync(outPath) } catch {}
    return false
  }
  const probeDur = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=duration',
    '-of', 'csv=p=0', outPath,
  ], { stdio: 'pipe', timeout: 10000 })
  const dur = Number(probeDur.stdout.toString().trim()) || 0
  const kb = Math.round(statSync(outPath).size / 1024)
  console.log(`[coverClip] ${basename(outPath)} (${targetW}×${targetH}, ${fps}fps, ${frames} frame, ${dur.toFixed(3)}s, ${kb} KB)`)
  return true
}

// --- CLI ---
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [png, out, w, h, fpsStr] = process.argv.slice(2)
  if (!png || !out || !w || !h) {
    console.error('Usage: node movies/coverClip.mjs <cover.png> <output.mp4> <width> <height> [fps]')
    console.error('  <cover.png>   — 封面 PNG')
    console.error('  <output.mp4>  — 输出 1 帧视频')
    console.error('  <width>       — 目标宽度')
    console.error('  <height>      — 目标高度')
    console.error('  [fps]         — 帧率（默认 25）')
    process.exit(1)
  }
  const ok = makeCoverClip(png, out, Number(w), Number(h), fpsStr ? Number(fpsStr) : 25)
  process.exit(ok ? 0 : 1)
}
