import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const GSAP_SRC = join(dirname(fileURLToPath(import.meta.url)), 'templates', 'gsap.min.js')

export function buildHtmlComposition({ urls, marks, segments, imageDurations, genDir, scriptName, suffix, width, height }) {
  const hfDir = join(genDir, `.hf_${scriptName}${suffix}`)
  mkdirSync(hfDir, { recursive: true })

  const totalDuration = imageDurations.reduce((a, b) => a + b, 0)

  // Auto-inject scroll + group. Work on copies to avoid mutating shared urls.
  const groups = []
  for (let i = 0; i < urls.length; i++) {
    const anims = injectAutoScroll([...(urls[i].anim || [])], marks[i] || {}, height)
    const prev = groups[groups.length - 1]
    if (prev && urls[i].url === prev.url) {
      prev.urlIndices.push(i)
      prev.anims.push(...anims)
      Object.assign(prev.marks, marks[i] || {})
    } else {
      groups.push({
        url: urls[i].url,
        urlIndices: [i],
        bgIndex: i,
        anims,
        marks: { ...(marks[i] || {}) },
      })
    }
  }

  // Copy only needed screenshots
  for (const g of groups) {
    const src = join(genDir, `${scriptName}_${pad4(g.bgIndex)}${suffix}_full.png`)
    if (existsSync(src)) {
      copyFileSync(src, join(hfDir, `bg_${g.urlIndices[0]}.png`))
    }
  }
  if (existsSync(GSAP_SRC)) {
    copyFileSync(GSAP_SRC, join(hfDir, 'gsap.min.js'))
  }

  // Scene timing from subtitle entries.
  // Each URL → one subtitle line. Merged groups span from first line's s to last line's e.
  const entries = segments[0]?.entries
  if (!entries || entries.length < urls.length) {
    console.error(`ERROR: entries count (${entries?.length ?? 0}) < urls count (${urls.length})`)
    process.exit(1)
  }
  const sceneStart = groups.map(g => entries[g.urlIndices[0]].s)
  const sceneEnd = groups.map(g => {
    const lastIdx = g.urlIndices[g.urlIndices.length - 1]
    return lastIdx < urls.length - 1 ? entries[lastIdx].e : totalDuration
  })
  const sceneDurations = sceneEnd.map((e, i) => e - sceneStart[i])

  // Build scene HTMLs + GSAP chunks
  const sceneHtmls = []
  const gsapChunks = []

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]
    const sceneIdx = g.urlIndices[0] // use first index as HTML id prefix

    const sceneObj = { anim: g.anims }
    sceneHtmls.push(buildSceneHtml(sceneObj, g.marks, sceneIdx, width, height))

    // Scene visibility: crossfade (both scenes overlap, no black flash)
    const transitionDur = 0.3
    if (gi > 0) {
      const prevIdx = groups[gi - 1].urlIndices[0]
      const xfadeStart = (sceneStart[gi] - transitionDur).toFixed(3)
      gsapChunks.push(`  tl.set('#s${sceneIdx}', {opacity:0}, ${xfadeStart});`)
      gsapChunks.push(`  tl.to('#s${prevIdx}', {opacity:0,duration:${transitionDur}}, ${xfadeStart});`)
      gsapChunks.push(`  tl.to('#s${sceneIdx}', {opacity:1,duration:${transitionDur}}, ${xfadeStart});`)
    } else {
      gsapChunks.push(`  tl.set('#s${sceneIdx}', {opacity:1}, ${sceneStart[gi].toFixed(3)});`)
    }

    // Per-scene GSAP animations
    const sceneGsap = buildSceneGsap(sceneObj, g.marks, sceneIdx, sceneStart[gi], sceneDurations[gi], width, height)
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
    .scroll-layer{position:absolute;top:0;left:0;width:100%}
    .scene-bg{display:block;width:100%}
    .overlay{position:absolute;pointer-events:none}
    .highlight-box{position:absolute;border:3px solid #ff6b35;border-radius:8px;box-shadow:0 0 20px rgba(255,107,53,0.5);pointer-events:none}
    .text-annotation{position:absolute;background:#ff6b35;color:#fff;padding:6px 14px;border-radius:6px;font:bold 18px sans-serif;white-space:nowrap;pointer-events:none;box-shadow:0 2px 12px rgba(0,0,0,0.3)}
    .text-annotation::after{content:'';position:absolute;width:0;height:0;border:8px solid transparent}
    .text-annotation.top-right::after{bottom:100%;right:24px;border-bottom-color:#ff6b35}
    .text-overlay{position:absolute;font-weight:bold;font-family:'Microsoft YaHei','PingFang SC',sans-serif;text-shadow:0 4px 20px rgba(0,0,0,.95);white-space:nowrap;pointer-events:none}
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

function injectAutoScroll(anims, marks, viewportHeight) {
  if (!anims.length) return anims

  // Collect element keys that already have a user-specified scroll
  const hasScroll = new Set()
  for (const step of anims) {
    if (step.type === 'scroll-to-text' || step.type === 'scroll-down') {
      const key = step.text || step.selector
      if (key) hasScroll.add(key)
    }
  }

  const result = []
  const autoScrolled = new Set()

  for (const step of anims) {
    const markKey = step.selector || step.text || step.target
    const needsTarget = step.type === 'highlight-area'
      || step.type === 'click-highlight'
      || (step.type === 'text-annotation' && step.target)

    if (needsTarget && markKey && marks[markKey] && !hasScroll.has(markKey) && !autoScrolled.has(markKey)) {
      const mark = marks[markKey]
      // Element not fully inside viewport (below fold or above top)
      if (mark.y < 0 || mark.y + mark.h > viewportHeight) {
        const scrollDur = 0.5
        const triggerAt = step.triggerAt != null ? step.triggerAt : 0
        const scrollTrigger = Math.max(0, triggerAt - scrollDur)
        result.push({
          type: 'scroll-to-text',
          text: markKey,
          triggerAt: scrollTrigger,
          duration: scrollDur,
          _auto: true,
        })
        autoScrolled.add(markKey)
      }
    }

    result.push(step)
  }

  return result
}

function buildSceneHtml(scene, marks, index, width, height) {
  // Scroll layer contains bg + mark-dependent overlays (move together on scroll).
  // Centered text stays in scene (viewport-relative, unaffected by scroll).
  let scrollHtml = `<div class="scroll-layer" id="scroll${index}">`
  scrollHtml += `<img class="scene-bg" id="bg${index}" src="bg_${index}.png">`

  let sceneExtras = ''
  const anims = scene.anim || []
  for (let ai = 0; ai < anims.length; ai++) {
    const step = anims[ai]

    // text-overlay: viewport-positioned, no mark, stays outside scroll layer
    if (step.type === 'text-overlay') {
      sceneExtras += `<div class="text-overlay" id="s${index}_overlay${ai}" style="${textOverlayStyle(step, width, height)};opacity:0">${step.text}</div>`
      continue
    }

    // All other types require a mark (resolved from selector/text/target)
    const mark = resolveMark(step, marks)

    // Use fullY for vertical position inside scroll layer (absolute page coords)
    const fy = mark.fullY != null ? mark.fullY : mark.y

    if (step.type === 'click-highlight') {
      const cx = mark.x + mark.w / 2
      const cy = fy + mark.h / 2
      scrollHtml += `<div class="overlay cursor-pointer" id="s${index}_cursor${ai}" style="left:${cx - 16}px;top:${cy - 16}px;opacity:0"></div>`
      scrollHtml += `<div class="overlay click-ripple" id="s${index}_ripple${ai}" style="left:${cx - 20}px;top:${cy - 20}px"></div>`
      scrollHtml += `<div class="overlay highlight-box" id="s${index}_hl${ai}" style="left:${mark.x - 4}px;top:${fy - 4}px;width:${mark.w + 8}px;height:${mark.h + 8}px;opacity:0"></div>`
    }
    if (step.type === 'highlight-area') {
      const pad = step.padding || 20
      scrollHtml += `<div class="overlay highlight-box" id="s${index}_area${ai}" style="left:${mark.x - pad}px;top:${fy - pad}px;width:${mark.w + pad * 2}px;height:${mark.h + pad * 2}px;opacity:0"></div>`
    }
    if (step.type === 'text-annotation') {
      const pos = step.position || 'top-right'
      const annoX = mark.x + mark.w + 10
      const annoY = fy - 10
      scrollHtml += `<div class="overlay text-annotation ${pos}" id="s${index}_anno${ai}" style="left:${annoX}px;top:${annoY}px;opacity:0">${step.text}</div>`
    }
  }

  scrollHtml += '</div>'

  return `<div class="scene" id="s${index}">${scrollHtml}${sceneExtras}</div>`
}

function resolveMark(step, marks) {
  // text-annotation: step.text is display content, step.target is the lookup key
  const key = step.type === 'text-annotation'
    ? (step.target || step.selector)
    : (step.selector || step.text || step.target)
  if (!key) {
    console.error(`ERROR: animation type="${step.type}" has no selector/text/target`)
    process.exit(1)
  }
  if (!marks[key]) {
    console.error(`ERROR: mark "${key}" not found in marks.json. Available: ${Object.keys(marks).join(', ') || '(none)'}`)
    process.exit(1)
  }
  return marks[key]
}

function buildSceneGsap(scene, marks, sceneIndex, sceneStart, sceneDuration, width, height) {
  const chunks = []
  const anims = scene.anim || []

  for (let ai = 0; ai < anims.length; ai++) {
    const step = anims[ai]
    const t = step.triggerAt != null ? step.triggerAt : sceneStart
    const dur = step.duration != null ? step.duration : 1

    // text-overlay: no mark, viewport-positioned
    if (step.type === 'text-overlay') {
      chunks.push(`  tl.to('#s${sceneIndex}_overlay${ai}', {opacity:1,duration:0.3}, ${t.toFixed(3)});`)
      chunks.push(`  tl.to('#s${sceneIndex}_overlay${ai}', {opacity:0,duration:0.3}, ${(t + dur).toFixed(3)});`)
      continue
    }

    // All other types require a mark
    const mark = resolveMark(step, marks)

    switch (step.type) {
      case 'scroll-down': {
        const speed = step.speed || 0.03
        const scrollPx = Math.min(sceneDuration * speed * height, step.maxScroll || 99999)
        chunks.push(`  tl.to('#scroll${sceneIndex}', {y: -${scrollPx.toFixed(1)}, duration: ${(sceneDuration - (step.pauseTop || 0) - (step.pauseBottom || 0)).toFixed(2)}, ease: "none"}, ${sceneStart + (step.pauseTop || 0)});`)
        break
      }
      case 'scroll-to-text': {
        if (mark && mark.fullY != null) {
          const offset = step.offset || 0
          const targetY = Math.max(0, mark.fullY - height * 0.3 + offset)
          chunks.push(`  tl.to('#scroll${sceneIndex}', {y: -${targetY.toFixed(1)}, duration: ${dur.toFixed(2)}, ease: "power2.out"}, ${t.toFixed(3)});`)
        }
        break
      }
      case 'click-highlight': {
        if (mark) {
          const fy = mark.fullY != null ? mark.fullY : mark.y
          const cx = mark.x + mark.w / 2
          const cy = fy + mark.h / 2
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
        chunks.push(`  tl.to('#s${sceneIndex}_anno${ai}', {opacity:1,duration:0.3}, ${t.toFixed(3)});`)
        chunks.push(`  tl.to('#s${sceneIndex}_anno${ai}', {opacity:0,duration:0.3}, ${(t + dur).toFixed(3)});`)
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

function textOverlayStyle(step, width, height) {
  const fontSize = step.fontSize || 28
  const color = step.color || '#ff6b35'
  const align = step.align || 'center'
  const topPct = step.top != null ? step.top : 50
  const pad = step.pad || 5

  let pos
  switch (align) {
    case 'left':
      pos = `top:${topPct}%;left:${pad}%;text-align:left;transform:translate(0,-50%)`
      break
    case 'right':
      pos = `top:${topPct}%;right:${pad}%;text-align:right;transform:translate(0,-50%)`
      break
    case 'center':
    default:
      pos = `top:${topPct}%;left:50%;text-align:center;transform:translate(-50%,-50%)`
      break
  }
  return `${pos};color:${color};font-size:${fontSize}px`
}

function pad4(i) { return String(i).padStart(4, '0') }

export { pad4 }
