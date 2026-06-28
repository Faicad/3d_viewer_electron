import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const GSAP_SRC = join(dirname(fileURLToPath(import.meta.url)), 'templates', 'gsap.min.js')

export function buildHtmlComposition({ urls, marks, segments, imageDurations, genDir, scriptName, suffix, width, height }) {
  const hfDir = join(genDir, `.hf_${scriptName}${suffix}`)
  mkdirSync(hfDir, { recursive: true })

  const totalDuration = imageDurations.reduce((a, b) => a + b, 0)

  // Copy screenshots + GSAP into composition dir
  for (let i = 0; i < urls.length; i++) {
    const src = join(genDir, `${scriptName}_${pad4(i)}${suffix}_full.png`)
    if (existsSync(src)) {
      copyFileSync(src, join(hfDir, `bg_${i}.png`))
    }
  }
  if (existsSync(GSAP_SRC)) {
    copyFileSync(GSAP_SRC, join(hfDir, 'gsap.min.js'))
  }

  // Determine scene transition times: after each URL's last anim completes
  const sceneEnd = []
  for (let i = 0; i < urls.length; i++) {
    const anims = urls[i].anim || []
    let latest = i < urls.length - 1 ? totalDuration : totalDuration
    for (const step of anims) {
      const end = (step.triggerAt || 0) + (step.duration || 1)
      if (end > latest) latest = end
    }
    sceneEnd.push(latest)
  }
  // Scene transition = sceneEnd[i-1] (scene i starts when previous scene ends)
  const sceneStart = [0]
  for (let i = 1; i < urls.length; i++) {
    sceneStart.push(sceneEnd[i - 1])
  }
  // Scene duration (used for timeline gaps at end)
  const sceneDurations = sceneEnd.map((e, i) => e - sceneStart[i])

  // Build scene HTMLs + GSAP chunks
  const sceneHtmls = []
  const gsapChunks = []

  for (let i = 0; i < urls.length; i++) {
    const scene = urls[i]
    const sceneMarks = marks[i] || {}

    sceneHtmls.push(buildSceneHtml(scene, sceneMarks, i, width, height))

    // Scene visibility: fade out previous, fade in current
    const transitionDur = 0.3
    if (i > 0) {
      gsapChunks.push(`  tl.to('#s${i-1}', {opacity:0,duration:${transitionDur}}, ${(sceneStart[i] - transitionDur).toFixed(3)});`)
    }
    gsapChunks.push(`  tl.set('#s${i}', {opacity:1}, ${sceneStart[i].toFixed(3)});`)

    // Per-scene GSAP animations
    const sceneGsap = buildSceneGsap(scene, sceneMarks, i, sceneStart[i], sceneDurations[i], width, height)
    gsapChunks.push(...sceneGsap)
  }

  gsapChunks.push(`  tl.to({}, {duration: ${totalDuration.toFixed(3)}}, ${totalDuration.toFixed(3)});`)

  // Assemble HTML
  const scenesHtml = sceneHtmls.join('\n')
  const gsapCode = gsapChunks.join('\n')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, height=${height}">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${width}px;height:${height}px;overflow:hidden;background:#1a1a1a}
    .scene{position:absolute;top:0;left:0;width:${width}px;height:${height}px;overflow:hidden;opacity:0;background:#1a1a1a}
    .scene-bg{position:absolute;top:0;left:0;width:100%}
    .overlay{position:absolute;pointer-events:none}
    .highlight-box{position:absolute;border:3px solid #ff6b35;border-radius:8px;box-shadow:0 0 20px rgba(255,107,53,0.5);pointer-events:none}
    .text-annotation{position:absolute;background:#ff6b35;color:#fff;padding:6px 14px;border-radius:6px;font:bold 18px sans-serif;white-space:nowrap;pointer-events:none;box-shadow:0 2px 12px rgba(0,0,0,0.3)}
    .text-annotation::after{content:'';position:absolute;width:0;height:0;border:8px solid transparent}
    .text-annotation.top-right::after{bottom:100%;right:24px;border-bottom-color:#ff6b35}
    .cursor-overlay{position:absolute;pointer-events:none;z-index:100}
    .cursor-pointer{width:32px;height:32px;background:radial-gradient(circle,#fff 2px,#000 2px,#000 4px,transparent 4px);border-radius:50%;position:absolute}
    .click-ripple{position:absolute;border:3px solid #ff6b35;border-radius:50%;width:40px;height:40px;opacity:0}
  </style>
</head>
<body>
<div style="position:relative;width:${width}px;height:${height}px;overflow:hidden">
${scenesHtml}
</div>
<script src="gsap.min.js"></script>
<script>
  const tl = gsap.timeline({paused:false});
${gsapCode}
</script>
</body>
</html>`

  writeFileSync(join(hfDir, 'index.html'), html)
  return { hfDir, totalDuration }
}

function buildSceneHtml(scene, marks, index, width, height) {
  const firstVisible = index === 0
  let html = `<div class="scene" id="s${index}"${firstVisible ? ' style="opacity:1"' : ''}>`
  html += `<img class="scene-bg" id="bg${index}" src="bg_${index}.png">`

  const anims = scene.anim || []
  for (let ai = 0; ai < anims.length; ai++) {
    const step = anims[ai]
    const mark = resolveMark(step, marks)
    if (!mark) continue

    if (step.type === 'click-highlight') {
      const cx = mark.x + mark.w / 2
      const cy = mark.y + mark.h / 2
      html += `<div class="overlay cursor-pointer" id="s${index}_cursor${ai}" style="left:${cx - 16}px;top:${cy - 16}px;opacity:0"></div>`
      html += `<div class="overlay click-ripple" id="s${index}_ripple${ai}" style="left:${cx - 20}px;top:${cy - 20}px"></div>`
      html += `<div class="overlay highlight-box" id="s${index}_hl${ai}" style="left:${mark.x - 4}px;top:${mark.y - 4}px;width:${mark.w + 8}px;height:${mark.h + 8}px;opacity:0"></div>`
    }
    if (step.type === 'highlight-area') {
      const pad = step.padding || 20
      html += `<div class="overlay highlight-box" id="s${index}_area${ai}" style="left:${mark.x - pad}px;top:${mark.y - pad}px;width:${mark.w + pad * 2}px;height:${mark.h + pad * 2}px;opacity:0"></div>`
    }
    if (step.type === 'text-annotation') {
      const pos = step.position || 'top-right'
      const annoX = mark.x + mark.w + 10
      const annoY = mark.y - 10
      html += `<div class="overlay text-annotation ${pos}" id="s${index}_anno${ai}" style="left:${annoX}px;top:${annoY}px;opacity:0">${step.text}</div>`
    }
  }

  html += '</div>'
  return html
}

function resolveMark(step, marks) {
  // Try selector first, then text, then target
  const key = step.selector || step.text || step.target
  if (key && marks[key]) return marks[key]

  // Fallback: search marks by approximate match
  if (step.text) {
    for (const [k, v] of Object.entries(marks)) {
      if (k.toLowerCase().includes(step.text.toLowerCase())) return v
    }
  }
  return null
}

function buildSceneGsap(scene, marks, sceneIndex, sceneStart, sceneDuration, width, height) {
  const chunks = []
  const anims = scene.anim || []

  for (let ai = 0; ai < anims.length; ai++) {
    const step = anims[ai]
    const t = step.triggerAt != null ? step.triggerAt : sceneStart
    const dur = step.duration != null ? step.duration : 1
    const mark = resolveMark(step, marks)

    switch (step.type) {
      case 'scroll-down': {
        const speed = step.speed || 0.03
        const scrollPx = Math.min(sceneDuration * speed * height, step.maxScroll || 99999)
        chunks.push(`  tl.to('#bg${sceneIndex}', {y: -${scrollPx.toFixed(1)}, duration: ${(sceneDuration - (step.pauseTop || 0) - (step.pauseBottom || 0)).toFixed(2)}, ease: "none"}, ${sceneStart + (step.pauseTop || 0)});`)
        break
      }
      case 'scroll-to-text': {
        if (mark && mark.fullY != null) {
          const targetY = Math.max(0, mark.fullY - height * 0.3)
          chunks.push(`  tl.to('#bg${sceneIndex}', {y: -${targetY.toFixed(1)}, duration: ${dur.toFixed(2)}, ease: "power2.out"}, ${t.toFixed(3)});`)
        }
        break
      }
      case 'click-highlight': {
        if (mark) {
          const cx = mark.x + mark.w / 2
          const cy = mark.y + mark.h / 2
          const ms = step.highlightMs || 600
          chunks.push(`  tl.set('#s${sceneIndex}_cursor${ai}', {opacity:1,left:${cx - 16},top:${cy - 16}}, ${t.toFixed(3)});`)
          chunks.push(`  tl.to('#s${sceneIndex}_hl${ai}', {opacity:1,scale:1.05,duration:0.2}, ${(t + 0.1).toFixed(3)});`)
          if (step.ripple !== false) {
            chunks.push(`  tl.to('#s${sceneIndex}_ripple${ai}', {opacity:1,scale:3,duration:0.4,ease:"power2.out"}, ${(t + 0.15).toFixed(3)});`)
            chunks.push(`  tl.to('#s${sceneIndex}_ripple${ai}', {opacity:0,duration:0.3}, ${(t + 0.55).toFixed(3)});`)
          }
          chunks.push(`  tl.to('#s${sceneIndex}_hl${ai}', {opacity:0,duration:0.3}, ${(t + ms / 1000 - 0.3).toFixed(3)});`)
        }
        break
      }
      case 'highlight-area': {
        if (mark) {
          const ms = step.highlightMs || 1500
          chunks.push(`  tl.to('#s${sceneIndex}_area${ai}', {opacity:1,duration:0.3}, ${t.toFixed(3)});`)
          chunks.push(`  tl.to('#s${sceneIndex}_area${ai}', {opacity:0,duration:0.5}, ${(t + ms / 1000).toFixed(3)});`)
        }
        break
      }
      case 'text-annotation': {
        if (mark) {
          chunks.push(`  tl.to('#s${sceneIndex}_anno${ai}', {opacity:1,duration:0.3}, ${t.toFixed(3)});`)
          chunks.push(`  tl.to('#s${sceneIndex}_anno${ai}', {opacity:0,duration:0.3}, ${(t + dur).toFixed(3)});`)
        }
        break
      }
      case 'page-transition': {
        const trans = step.transition || 'fade'
        if (trans === 'slide-right') {
          chunks.push(`  tl.fromTo('#s${sceneIndex}', {xPercent:100},{xPercent:0,duration:${dur.toFixed(2)},ease:"power2.out"}, ${t.toFixed(3)});`)
        } else if (trans === 'fade') {
          chunks.push(`  tl.fromTo('#s${sceneIndex}', {opacity:0},{opacity:1,duration:${dur.toFixed(2)},ease:"power1.out"}, ${t.toFixed(3)});`)
        }
        break
      }
      case 'custom': {
        if (step.gsap) chunks.push(`  ${step.gsap}`)
        break
      }
    }
  }

  return chunks
}

function pad4(i) { return String(i).padStart(4, '0') }

export { pad4 }
