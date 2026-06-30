import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const GSAP_SRC = join(dirname(fileURLToPath(import.meta.url)), 'templates', 'gsap.min.js')

export function buildHtmlComposition({ urls, marks, segments, imageDurations, genDir, aiGenDir, scriptName, suffix, width, height }) {
  const hfDir = join(genDir, `.hf_${scriptName}${suffix}`)
  mkdirSync(hfDir, { recursive: true })

  const totalDuration = imageDurations.reduce((a, b) => a + b, 0)

  // Scene timing from subtitle entries.
  // Each URL → one subtitle line. Merged groups span from first line's s to last line's e.
  const entries = segments[0]?.entries
  if (!entries || entries.length < urls.length) {
    console.error(`ERROR: entries count (${entries?.length ?? 0}) < urls count (${urls.length})`)
    process.exit(1)
  }

  // Auto-inject scroll + group. Work on copies to avoid mutating shared urls.
  const groups = []
  for (let i = 0; i < urls.length; i++) {
    const anims = injectAutoScroll([...(urls[i].anim || [])], marks[i] || {}, height)
    // Tag each step with its own scene's start time.
    //   i=0: scene starts at t=0 (includes 0.5s INITIAL_GAP before TTS)
    //   i>0: scene starts at entries[i].s (= previous imageDurations sum)
    for (const step of anims) step._baseS = i === 0 ? 0 : entries[i].s
    const prev = groups[groups.length - 1]
    if (prev && (urls[i].url === prev.url || !urls[i].url)) {
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
    const src = join(aiGenDir || genDir, `${scriptName}_${pad4(g.bgIndex)}${suffix}_full.png`)
    if (existsSync(src)) {
      copyFileSync(src, join(hfDir, `bg_${g.urlIndices[0]}.png`))
    }
  }
  if (existsSync(GSAP_SRC)) {
    copyFileSync(GSAP_SRC, join(hfDir, 'gsap.min.js'))
  }

  // Scene timing: use cumulative imageDurations so silent gaps (INITIAL_GAP,
  // INTER_LINE_GAP) are included in each scene's window.
  const cumEnds = []
  imageDurations.reduce((acc, dur, i) => { cumEnds[i] = acc + dur; return acc + dur }, 0)

  const sceneStart = groups.map(g => {
    const firstIdx = g.urlIndices[0]
    return firstIdx === 0 ? 0 : cumEnds[firstIdx - 1]
  })
  const sceneEnd = groups.map(g => {
    const lastIdx = g.urlIndices[g.urlIndices.length - 1]
    return cumEnds[lastIdx]
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
      gsapChunks.push(`  tl.set('#s${sceneIdx}', {opacity:1}, ${gi === 0 ? 0 : sceneStart[gi].toFixed(3)});`)
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
    /* Arrow on left edge — annotation is right of target, arrow points left */
    .text-annotation.right::after,
    .text-annotation.top-right::after,
    .text-annotation.bottom-right::after{right:100%;border-right-color:#ff6b35}
    .text-annotation.right::after{top:50%;transform:translateY(-50%)}
    .text-annotation.top-right::after{top:12px}
    .text-annotation.bottom-right::after{bottom:12px}
    /* Arrow on right edge — annotation is left of target, arrow points right */
    .text-annotation.left::after,
    .text-annotation.top-left::after,
    .text-annotation.bottom-left::after{left:100%;border-left-color:#ff6b35}
    .text-annotation.left::after{top:50%;transform:translateY(-50%)}
    .text-annotation.top-left::after{top:12px}
    .text-annotation.bottom-left::after{bottom:12px}
    /* Arrow on bottom edge — annotation above target, arrow points down */
    .text-annotation.top::after{top:100%;left:50%;transform:translateX(-50%);border-top-color:#ff6b35}
    .text-annotation.center::after{display:none}
    /* Arrow on top edge — annotation below target, arrow points up */
    .text-annotation.bottom::after{bottom:100%;left:50%;transform:translateX(-50%);border-bottom-color:#ff6b35}
    .caption{position:absolute;font-weight:bold;font-family:'Microsoft YaHei','PingFang SC',sans-serif;text-shadow:0 4px 20px rgba(0,0,0,.95);white-space:nowrap;pointer-events:none}
    .cursor-overlay{position:absolute;pointer-events:none;z-index:100}
    .cursor-pointer{width:32px;height:32px;background:radial-gradient(circle,#fff 2px,#000 2px,#000 4px,transparent 4px);border-radius:50%;position:absolute}
    .move-cursor{width:48px;height:60px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 40'%3E%3Cpath d='M0 0 L0 32 L8 24 L16 36 L20 34 L12 22 L28 22 Z' fill='white' stroke='%23222' stroke-width='2.5' stroke-linejoin='round'/%3E%3C/svg%3E");background-size:contain;background-repeat:no-repeat;position:absolute;pointer-events:none;filter:drop-shadow(1px 2px 3px rgba(0,0,0,0.5))}
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

// ── Mark vs Caption ──────────────────────────────────────────────
// Mark:    content-positioned (tied to a page element found via Playwright).
//          Lookup key → marks.json entry. Not found → hard error.
// Caption: screen-positioned (viewport coords), no mark lookup.
//          Must provide explicit style/size/position in .mjs.
//
const MARK_TYPES = new Set(['highlight-area', 'click-highlight', 'move-click', 'text-annotation', 'scroll-to-text'])

function isMarkType(type) {
  return MARK_TYPES.has(type)
}

// Resolve the marks.json lookup key for a step.  Must stay in sync with
// resolveMark() below.  Callers should guard non-mark types with !isMarkType()
// first — non-mark types don't have marks.
function getMarkKey(step) {
  // text-annotation: step.text is display content, step.target is the lookup key
  if (step.type === 'text-annotation') {
    return step.target || step.selector
  }
  return step.selector || step.text || step.target
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
    // Non-mark types: no element lookup → skip auto-scroll
    if (!isMarkType(step.type)) {
      result.push(step)
      continue
    }

    const markKey = getMarkKey(step)
    const needsTarget = step.type === 'highlight-area'
      || step.type === 'click-highlight'
      || step.type === 'text-annotation'

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

    // Non-mark types: no mark lookup needed
    if (!isMarkType(step.type)) {
      if (step.type === 'caption') {
        const splitParts = splitCaptionText(step.text)
        const style = captionStyle(step, width, height)
        if (splitParts.length > 1) {
          // One div, full text as layout anchor. Spans for progressive reveal — layout never shifts.
          let html = `<div class="caption" id="s${index}_c${ai}" style="${style};opacity:0">`
          for (let si = 0; si < splitParts.length; si++) {
            html += `<span id="s${index}_c${ai}_p${si}" style="opacity:0">${splitParts[si]}</span>`
          }
          html += '</div>'
          sceneExtras += html
        } else {
          sceneExtras += `<div class="caption" id="s${index}_c${ai}" style="${style};opacity:0">${step.text}</div>`
        }
      }
      continue
    }

    // Mark type: requires a mark from marks.json
    const mark = resolveMark(step, marks)

    // Use fullY for vertical position inside scroll layer (absolute page coords)
    const fy = mark.fullY != null ? mark.fullY : mark.y

    if (step.type === 'click-highlight') {
      const cx = mark.x + mark.w / 2
      const cy = fy + mark.h / 2
      scrollHtml += `<div class="overlay cursor-pointer" id="s${index}_cursor${ai}" style="left:${cx - 16}px;top:${cy - 16}px;opacity:0"></div>`
      scrollHtml += `<div class="overlay click-ripple" id="s${index}_ripple${ai}" style="left:${cx - 20}px;top:${cy - 20}px"></div>`
    }
    if (step.type === 'move-click') {
      const cx = mark.x + mark.w / 2
      const cy = fy + mark.h / 2
      scrollHtml += `<div class="overlay move-cursor" id="s${index}_cursor${ai}" style="left:${cx}px;top:${cy + 80}px;opacity:0"></div>`
    }
    if (step.type === 'highlight-area') {
      const pad = step.padding || 20
      const color = step.color || '#ff6b35'
      scrollHtml += `<div class="overlay highlight-box" id="s${index}_area${ai}" style="left:${mark.x - pad}px;top:${fy - pad}px;width:${mark.w + pad * 2}px;height:${mark.h + pad * 2}px;opacity:0;border:3px solid ${color};box-shadow:0 0 20px ${color}80"></div>`
    }
    if (step.type === 'text-annotation') {
      const pos = step.position || 'top-right'
      const gap = 12
      const { annoX, annoY, xform } = computeAnnotationPos(pos, mark, fy, gap)
      scrollHtml += `<div class="overlay text-annotation ${pos}" id="s${index}_anno${ai}" style="left:${annoX}px;top:${annoY}px;${xform}opacity:0">${step.text}</div>`
    }
  }

  scrollHtml += '</div>'

  return `<div class="scene" id="s${index}"${index === 0 ? ' style="opacity:1"' : ''}>${scrollHtml}${sceneExtras}</div>`
}

// Compute annotation position relative to its target mark element.
// Returns { annoX, annoY, xform } — xform is a CSS transform string (or '').
function computeAnnotationPos(pos, mark, fy, gap) {
  const cx = mark.x + mark.w / 2
  const cy = fy + mark.h / 2

  switch (pos) {
    case 'top':
      return { annoX: cx, annoY: fy - gap, xform: 'transform:translate(-50%,-100%);' }
    case 'center':
      return { annoX: cx, annoY: cy, xform: 'transform:translate(-50%,-50%);' }
    case 'bottom':
      return { annoX: cx, annoY: fy + mark.h + gap, xform: 'transform:translate(-50%,0);' }
    case 'left':
      return { annoX: mark.x - gap, annoY: cy, xform: 'transform:translate(-100%,-50%);' }
    case 'right':
      return { annoX: mark.x + mark.w + gap, annoY: cy, xform: 'transform:translate(0,-50%);' }
    case 'top-left':
      return { annoX: mark.x - gap, annoY: fy, xform: 'transform:translate(-100%,0);' }
    case 'top-right':
      return { annoX: mark.x + mark.w + gap, annoY: fy, xform: '' }
    case 'bottom-left':
      return { annoX: mark.x - gap, annoY: fy + mark.h, xform: 'transform:translate(-100%,-100%);' }
    case 'bottom-right':
      return { annoX: mark.x + mark.w + gap, annoY: fy + mark.h, xform: 'transform:translate(0,-100%);' }
    default:
      // fallback: same as top-right
      return { annoX: mark.x + mark.w + gap, annoY: fy, xform: '' }
  }
}

function resolveMark(step, marks) {
  const key = getMarkKey(step)
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
    const baseS = step._baseS != null ? step._baseS : sceneStart
    const t = step.triggerAt != null ? baseS + step.triggerAt : baseS
    const dur = step.duration != null ? step.duration : 1

    // caption: ONE div (full text = layout anchor), spans control progressive reveal
    if (step.type === 'caption') {
      const splitParts = splitCaptionText(step.text)
      const absT = t.toFixed(3)
      chunks.push(`  tl.to('#s${sceneIndex}_c${ai}', {opacity:1,duration:0.3}, ${absT});`)
      if (splitParts.length > 1) {
        const subDur = dur / splitParts.length
        for (let si = 0; si < splitParts.length; si++) {
          const segT = (t + si * subDur).toFixed(3)
          chunks.push(`  tl.to('#s${sceneIndex}_c${ai}_p${si}', {opacity:1,duration:0.3}, ${segT});`)
        }
      }
      // Only hide if hideAt is explicitly set; otherwise caption persists indefinitely
      if (step.hideAt != null) {
        const hideAtRel = typeof step.hideAt === 'number' ? baseS + step.hideAt : baseS + parseFloat(step.hideAt)
        chunks.push(`  tl.to('#s${sceneIndex}_c${ai}', {opacity:0,duration:0.3}, ${hideAtRel.toFixed(3)});`)
      }
      continue
    }

    // Mark types require a mark from marks.json; non-mark types pass null
    const mark = isMarkType(step.type) ? resolveMark(step, marks) : null

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
          chunks.push(`  tl.to('#s${sceneIndex}_ripple${ai}', {opacity:1,scale:3,duration:0.4,ease:"power2.out"}, ${(t + 0.15).toFixed(3)});`)
          chunks.push(`  tl.to('#s${sceneIndex}_ripple${ai}', {opacity:0,duration:0.3}, ${(t + 0.55).toFixed(3)});`)
        }
        break
      }
      case 'move-click': {
        if (mark) {
          const fy = mark.fullY != null ? mark.fullY : mark.y
          const cx = mark.x + mark.w / 2
          const cy = fy + mark.h / 2
          const moveMs = step.moveMs || 500
          const moveSec = moveMs / 1000
          const arriveT = t + moveSec
          chunks.push(`  tl.to('#s${sceneIndex}_cursor${ai}', {opacity:1,top:${cy},duration:${moveSec.toFixed(3)},ease:"power2.out"}, ${t.toFixed(3)});`)
          chunks.push(`  tl.to('#s${sceneIndex}_cursor${ai}', {y:6,duration:0.15,ease:"power1.in"}, ${arriveT.toFixed(3)});`)
          chunks.push(`  tl.to('#s${sceneIndex}_cursor${ai}', {y:0,duration:0.15,ease:"power1.out"}, ${(arriveT + 0.15).toFixed(3)});`)
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

// Resolve a scalar or {h, v} object.  When the value is an object with h/v
// keys, pick the key matching the current orientation (landscape = width > height).
// Falls back to the other key if the matching one is missing.  Scalars pass through.
function hv(value, isLandscape) {
  if (value != null && typeof value === 'object' && ('h' in value || 'v' in value)) {
    return isLandscape ? (value.h != null ? value.h : value.v) : (value.v != null ? value.v : value.h)
  }
  return value
}

// Split caption text by punctuation (、，,：:) into segments with delimiters preserved.
// 3+ consecutive dots are each split into individual dot segments.
// Each segment (except first) includes its leading delimiter.
// Examples:
//   "正在处理...请稍候" → ["正在处理", ".", ".", ".", "请稍候"]
//   "提示：注意，开始" → ["提示", "：注意", "，开始"]
function splitCaptionText(text) {
  const raw = text.split(/\.{3,}|[/.]|[、，,：:]/)
  const seps = text.match(/\.{3,}|[/.]|[、，,：:]/g) || []
  const result = [raw[0]]
  for (let i = 1; i < raw.length; i++) {
    const sep = seps[i - 1]
    if (/^\.{3,}$/.test(sep)) {
      for (let j = 0; j < sep.length; j++) {
        result.push('.')
      }
      result.push(raw[i])
    } else {
      result.push(sep + raw[i])
    }
  }
  return result
}

function captionStyle(step, width, height) {
  const isLandscape = width > height
  const fontSize = hv(step.fontSize, isLandscape) || 28
  const color = hv(step.color, isLandscape) || '#ff6b35'
  const align = hv(step.align, isLandscape) || 'center'
  const topPct = hv(step.top, isLandscape) ?? 50
  const pad = hv(step.pad, isLandscape) || 5

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

export { isMarkType, pad4 }
