export function startExplodeDemo(): () => void {
  const gsap = window.__gsap as typeof import('gsap')['default']
  const THREE = window.__THREE as typeof import('three')
  const api = window.__viewerAPI!

  if (!gsap || !THREE || !api) {
    console.warn('[gsap-explode] Missing dependencies')
    return () => {}
  }

  const panelId = 'gsap-demo-explode'
  const styleId = 'gsap-demo-explode-style'

  document.getElementById(panelId)?.remove()
  document.getElementById(styleId)?.remove()

  const panel = document.createElement('div')
  panel.id = panelId
  panel.innerHTML = `<div class="ctrl-row">
    <button class="btn-icon btn-play" id="e-btn-play" title="播放 (Space)">▶</button>
    <button class="btn-icon secondary" id="e-btn-reset" title="重置 (R)">⟲</button>
    <div class="scrub-wrap">
      <input type="range" id="e-scrub" min="0" max="1000" value="0">
      <span class="time-label" id="e-time-label">0.00s / 0.00s</span>
    </div>
    <label>轴</label>
    <select class="ctrl-select" id="e-axis-select" style="max-width:40px">
      <option value="x">X</option>
      <option value="y">Y</option>
      <option value="z" selected>Z</option>
    </select>
    <label>运动</label>
    <select class="ctrl-select" id="e-easing-select">
      <option value="back.out(1.7)">微回弹</option>
      <option value="back.out(2.5)">强回弹</option>
      <option value="elastic.out(1,0.2)">弹簧震荡</option>
      <option value="bounce.out">弹跳</option>
      <option value="power3.out" selected>平滑缓出</option>
      <option value="expo.out">指数缓出</option>
      <option value="power3.inOut">缓入缓出</option>
      <option value="none">线性</option>
    </select>
  </div>
  <div class="ctrl-row">
    <label>时长</label>
    <input type="range" id="e-dur-slider" min="0.3" max="5" step="0.1" value="1.5">
    <span class="value" id="e-dur-val">1.5s</span>
    <label>扩散</label>
    <input type="range" id="e-spread-slider" min="1" max="6" step="0.1" value="2">
    <span class="value" id="e-spread-val">2.0×</span>
  </div>
  <div class="ctrl-row">
    <label><input type="checkbox" id="e-strict-sep" checked> 严格分散</label>
  </div>`

  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `#${panelId} {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(13,13,26,0.6); backdrop-filter: blur(6px);
    border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;
    padding: 5px 8px; min-width: 260px;
    display: flex; flex-direction: column; gap: 3px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    font-family: 'Segoe UI', system-ui, sans-serif; color: #ccc;
    pointer-events: auto;
  }
  #${panelId} .ctrl-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  #${panelId} .ctrl-row label { font-size: 11px; color: #888; white-space: nowrap; }
  #${panelId} .ctrl-row .value { font-size: 11px; color: #88cc44; font-weight: 600; min-width: 24px; text-align: right; font-variant-numeric: tabular-nums; }
  #${panelId} .btn-icon { width: 24px; height: 24px; border-radius: 5px; border: none; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
  #${panelId} .btn-play { background: #88cc44; color: #0d0d1a; }
  #${panelId} .btn-play:hover { background: #a0e060; }
  #${panelId} .btn-play.paused { background: #ff8844; }
  #${panelId} .btn-play.paused:hover { background: #ffaa66; }
  #${panelId} .btn-icon.secondary { background: rgba(255,255,255,0.08); color: #ccc; }
  #${panelId} .btn-icon.secondary:hover { background: rgba(255,255,255,0.15); }
  #${panelId} .scrub-wrap { display: flex; align-items: center; gap: 4px; flex: 1; }
  #${panelId} .scrub-wrap input[type="range"] { max-width: none; }
  #${panelId} .time-label { font-size: 11px; color: #888; min-width: 65px; text-align: right; font-variant-numeric: tabular-nums; }
  #${panelId} input[type="range"] { flex: 1; min-width: 40px; height: 3px; -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.12); border-radius: 2px; outline: none; cursor: pointer; }
  #${panelId} input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%; background: #88cc44; cursor: pointer; border: 2px solid #0d0d1a; transition: transform 0.1s; }
  #${panelId} input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); }
  #${panelId} input[type="range"]::-moz-range-thumb { width: 10px; height: 10px; border-radius: 50%; background: #88cc44; cursor: pointer; border: 2px solid #0d0d1a; }
  #${panelId} .ctrl-select { padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #ccc; font-size: 11px; outline: none; cursor: pointer; max-width: 56px; }
  #${panelId} .ctrl-select:focus { border-color: #88cc44; }`

  document.head.appendChild(style)

  const layer = document.getElementById('ai-layer') ?? document.body
  layer.appendChild(panel)

  let parts: any[] = []
  let timeline: any = null
  let isPlaying = false

  function resetPartsPosition() {
    const saved = (window as any).__gsap_initial_positions
    if (saved) {
      const all = api.getParts()
      for (let i = 0; i < all.length; i++) {
        const s = saved[all[i].partId]
        if (s) { const p = api.getPartProxy(all[i].partId); if (p) p.position.set(s[0], s[1], s[2]) }
      }
    } else {
      (window as any).__gsap_initial_positions = {}
      const all = api.getParts()
      for (let i = 0; i < all.length; i++) {
        const p = api.getPartProxy(all[i].partId)
        if (p) (window as any).__gsap_initial_positions[all[i].partId] = [p.position.x, p.position.y, p.position.z]
      }
    }
  }

  function findMeshByPartId(partId: string) {
    const scene = (window as any).__r3f_dev && (window as any).__r3f_dev.scene
    if (!scene) return null
    let found: any = null
    scene.traverse(function(child: any) {
      if (found) return
      if (child.isMesh && child.userData && child.userData.partId === partId) found = child
    })
    return found
  }

  function buildExplode() {
    resetPartsPosition()
    if (timeline) { timeline.progress(0).kill(); timeline = null }
    isPlaying = false
    const btnPlay = document.getElementById('e-btn-play')
    btnPlay!.textContent = '▶'
    btnPlay!.classList.remove('paused')

    const partInfos = api.getParts()
    if (!partInfos || !partInfos.length) return

    const localPositions: any[] = []
    const partIds: string[] = []

    for (let i = 0; i < partInfos.length; i++) {
      const info = partInfos[i]
      const proxy = api.getPartProxy(info.partId)
      if (!proxy) continue
      localPositions.push(proxy.position.clone())
      partIds.push(info.partId)
    }

    if (!partIds.length) return
    computeTargets(partIds, localPositions, partInfos)
    buildTimeline()
  }

  function computeTargets(partIds: string[], localPositions: any[], partInfos: any[]) {
    const axis = (document.getElementById('e-axis-select') as HTMLSelectElement).value
    const multiplier = parseFloat((document.getElementById('e-spread-slider') as HTMLInputElement).value)

    const worldPositions: any[] = []
    for (let i = 0; i < partInfos.length; i++) {
      const mesh = findMeshByPartId(partInfos[i].partId)
      if (mesh) {
        const box = new THREE.Box3().setFromObject(mesh)
        worldPositions.push(box.getCenter(new THREE.Vector3()))
      } else {
        worldPositions.push(localPositions[i].clone())
      }
    }

    const indexed: { idx: number; wVal: number }[] = []
    for (let i = 0; i < partIds.length; i++) {
      indexed.push({ idx: i, wVal: (worldPositions[i] as any)[axis] })
    }
    indexed.sort(function(a, b) { return a.wVal - b.wVal })

    const N = indexed.length
    const worldRange = indexed[N - 1].wVal - indexed[0].wVal
    const worldCenter = (indexed[0].wVal + indexed[N - 1].wVal) / 2

    const modelBox = new THREE.Box3()
    for (let i = 0; i < partInfos.length; i++) {
      const mesh = findMeshByPartId(partInfos[i].partId)
      if (mesh) {
        modelBox.union(new THREE.Box3().setFromObject(mesh))
      }
    }
    const modelSize = modelBox.getSize(new THREE.Vector3())
    const modelDiagonal = Math.max(modelSize.x, modelSize.y, modelSize.z) || 1

    const strictSep = (document.getElementById('e-strict-sep') as HTMLInputElement).checked

    parts = []
    for (let si = 0; si < N; si++) {
      const k = indexed[si].idx
      const lPos = localPositions[k]
      const target = lPos.clone()

      if (strictSep) {
        const norm = (si / (N - 1 || 1)) * 2 - 1
        const spread = modelDiagonal * Math.max(0, multiplier - 1) * 0.5
        ;(target as any)[axis] = (lPos as any)[axis] + norm * spread
      } else if (worldRange < 0.001) {
        const partCount = N - 1 || 1
        ;(target as any)[axis] = (lPos as any)[axis] + ((si / partCount) - 0.5) * modelDiagonal * Math.max(0, multiplier - 1)
      } else {
        ;(target as any)[axis] = (lPos as any)[axis] + ((worldPositions[k] as any)[axis] - worldCenter) * Math.max(0, multiplier - 1)
      }

      parts.push({
        partId: partIds[k],
        proxy: api.getPartProxy(partIds[k]),
        localPos: lPos,
        target: target,
        name: partInfos[k].name,
      })
    }
  }

  function buildTimeline() {
    if (!parts.length) return
    if (timeline) { timeline.progress(0).kill(); timeline = null }

    const btnPlay = document.getElementById('e-btn-play')
    const easing = (document.getElementById('e-easing-select') as HTMLSelectElement).value
    const duration = parseFloat((document.getElementById('e-dur-slider') as HTMLInputElement).value)

    timeline = gsap.timeline({
      paused: true,
      onUpdate: syncUI,
      onComplete: function() {
        isPlaying = false
        btnPlay!.textContent = '⟳'
        btnPlay!.classList.remove('paused')
      },
      onReverseComplete: function() {
        isPlaying = false
        btnPlay!.textContent = '▶'
        btnPlay!.classList.remove('paused')
        syncUI()
      },
    })

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (!p.proxy || !p.proxy.position || typeof p.proxy.position.x !== 'number') continue
      timeline.fromTo(p.proxy.position, {
        x: p.localPos.x, y: p.localPos.y, z: p.localPos.z,
      }, {
        x: p.target.x, y: p.target.y, z: p.target.z,
        duration: duration, ease: easing, overwrite: true,
      }, 0)
    }
    syncUI()
  }

  function togglePlay() {
    if (!timeline || !parts.length) return
    const btnPlay = document.getElementById('e-btn-play')
    if (isPlaying) {
      timeline.pause()
      isPlaying = false
      btnPlay!.textContent = '▶'
      btnPlay!.classList.remove('paused')
    } else {
      if (timeline.progress() >= 1) timeline.progress(0)
      timeline.play()
      isPlaying = true
      btnPlay!.textContent = '⏸'
      btnPlay!.classList.add('paused')
    }
  }

  function resetAnim() {
    if (!timeline) return
    if (timeline.progress() === 0) return
    const btnPlay = document.getElementById('e-btn-play')
    isPlaying = true
    btnPlay!.textContent = '⏸'
    btnPlay!.classList.add('paused')
    timeline.reverse()
  }

  function syncUI() {
    const scrub = document.getElementById('e-scrub') as HTMLInputElement
    const timeLabel = document.getElementById('e-time-label')
    if (!timeline) { scrub.value = '0'; timeLabel!.textContent = '0.00s / 0.00s'; return }
    const p = timeline.progress()
    scrub.value = String(p * 1000)
    timeLabel!.textContent = (p * timeline.duration()).toFixed(2) + 's / ' + timeline.duration().toFixed(2) + 's'
  }

  const btnPlay = document.getElementById('e-btn-play')!
  const btnReset = document.getElementById('e-btn-reset')!
  const scrub = document.getElementById('e-scrub')! as HTMLInputElement
  const easingSelect = document.getElementById('e-easing-select')! as HTMLSelectElement
  const durSlider = document.getElementById('e-dur-slider')! as HTMLInputElement
  const spreadSlider = document.getElementById('e-spread-slider')! as HTMLInputElement

  btnPlay.addEventListener('click', togglePlay)
  btnReset.addEventListener('click', resetAnim)

  scrub.addEventListener('input', function() {
    if (!timeline) return
    timeline.progress(parseFloat(scrub.value) / 1000).pause()
    isPlaying = false
    btnPlay.textContent = '▶'
    btnPlay.classList.remove('paused')
    syncUI()
  })

  document.getElementById('e-axis-select')!.addEventListener('change', function() { buildExplode() })
  easingSelect.addEventListener('change', buildTimeline)

  durSlider.addEventListener('input', function() {
    document.getElementById('e-dur-val')!.textContent = parseFloat(durSlider.value).toFixed(1) + 's'
  })
  durSlider.addEventListener('change', buildTimeline)

  spreadSlider.addEventListener('input', function() {
    document.getElementById('e-spread-val')!.textContent = parseFloat(spreadSlider.value).toFixed(1) + '×'
  })
  spreadSlider.addEventListener('change', function() { buildExplode() })

  document.getElementById('e-strict-sep')!.addEventListener('change', function() { buildExplode() })

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
    if (e.key === ' ') { e.preventDefault(); togglePlay() }
    if (e.key === 'r') resetAnim()
    if (e.key === 'ArrowRight' && timeline) {
      const p = Math.min(1, timeline.progress() + 0.02)
      timeline.progress(p).pause()
      isPlaying = false
      const btnPlay = document.getElementById('e-btn-play')
      btnPlay!.textContent = '▶'
      btnPlay!.classList.remove('paused')
      syncUI()
    }
    if (e.key === 'ArrowLeft' && timeline) {
      const p = Math.max(0, timeline.progress() - 0.02)
      timeline.progress(p).pause()
      isPlaying = false
      const btnPlay = document.getElementById('e-btn-play')
      btnPlay!.textContent = '▶'
      btnPlay!.classList.remove('paused')
      syncUI()
    }
  }
  document.addEventListener('keydown', onKey)

  buildExplode()

  return function cleanup() {
    if (timeline) { timeline.progress(0).kill(); timeline = null }
    document.getElementById(panelId)?.remove()
    document.getElementById(styleId)?.remove()
    document.removeEventListener('keydown', onKey)
  }
}
