/**
 * GSAP 爆炸图动画 Demo — 直接页面内实现
 *
 * 通过 startExplodeDemo() 注入控制面板 UI，用 GSAP 控制零件爆炸动画。
 *
 * 所有零件沿指定坐标轴均匀散开，爆炸距离 = 该轴上包围盒跨度 × Spread 倍率（1–5×），
 * 1× = 原始分布（不分开），最中心零件不动，Spread 倍率由滑块控制。
 *
 * ── Debug Log（移植过程错误记录，2026-06-11）─────────────
 *
 * 1. NaN bug — getVisibleRangeOnAxis 读到了空的全局 parts 数组
 *    getVisibleRangeOnAxis 内部用 centre.divideScalar(positions.length)，
 *    但传入的是空的全局 parts[]（computeTargets 赋值前），0/0 → NaN。
 *    修复: 传入 localPositions 参数，不依赖全局 parts。
 *
 * 2. 零件不动 — GSAP .to() 在创建时缓存起始值（同 assemble bug #3）
 *    timeline.to(proxy.position, { z: targetZ }) 在创建时缓存了 position.z，
 *    此时 z 是 localPos.z（起始值），导致从 localPos → localPos，无动画。
 *    修复: 改用 .fromTo() 显式指定起止值。
 *
 * 3. origMin === origMax 时零件不动 — GLB 所有子 mesh 位置相同
 *    GLB 导出时所有子 mesh 的 pivot 可能都是 {0,0,0}（或相同值），
 *    导致 origMin === origMax，代码跳过 target 计算，所有零件 target = localPos。
 *    修复: 当轴无变化时，将零件均匀铺开到 spread 范围。
 *
 * 4. 中位零件不居中 — <= centerVal 把等于 centerVal 的零件归入左分支
 *    lPos[axis] <= centerVal 包含了恰好在 centerVal 的零件（中位零件），
 *    当 origMin === centerVal 时 t=0 → target = spreadMin 而非 centerVal。
 *    修复: 改用 < centerVal 和 > centerVal 分开，等于 centerVal 的零件不动。
 *
 * 5. 爆炸距离改用轴上包围盒跨度 × 倍率替代摄像机视口计算
 *    原版用摄像机视口四角投影到轴作为爆炸范围，在摄像机朝向轴上范围=0。
 *    改为: axisModelRange × multiplier (1× = 不分开, 2× = 2倍包围盒)
 *
 * 6. Spread 滑块无效 — pivot 位置 ≈ 0，乘任何倍率都看不到变化
 *    getVisibleRangeOnAxis 用 proxy.position（局部 pivot 位置），
 *    GLB 所有 mesh pivot 都在原点附近 → axisModelRange ≈ 0 → spread 永远是 0。
 *    修复: computeTargets 改用 Box3.setFromObject(mesh).getCenter()
 *    获取每个零件的几何体世界中心来计算 offset。
 *    offset = (worldGeomCenter - worldCenterOfMass) × (multiplier - 1)
 *    1×: offset=0 无变化, 2×: spread 翻倍, 3×: spread 三倍。
 *
 * 7. 跨 demo 位置干扰 — 先执行 explode 再执行 assemble，
 *    buildExplode / captureParts 捕获的是前一个 demo 修改后的位置。
 *    修复: 增加 resetPartsPosition()，首次调用时缓存所有零件原始 position
 *    到 window.__gsap_initial_positions，后续 demo 开始前恢复。
 * ────────────────────────────────────────────────
 */

export function startExplodeDemo(spreadOverride?: number, rangeOverride?: number): () => void {
  const gsap = window.__gsap as typeof import('gsap')['default']
  const THREE = window.__THREE as typeof import('three')
  const api = window.__viewerAPI!

  if (!gsap || !THREE || !api) {
    console.warn('[gsap-explode] Missing dependencies')
    return () => {}
  }

  const panelId = 'gsap-demo-explode'
  const styleId = 'gsap-demo-explode-style'

  // Remove existing
  document.getElementById(panelId)?.remove()
  document.getElementById(styleId)?.remove()

  // Create panel
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

  // Add styles
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
  #${panelId} .ctrl-row {
    display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  }
  #${panelId} .ctrl-row label {
    font-size: 11px; color: #888; white-space: nowrap;
  }
  #${panelId} .ctrl-row .value {
    font-size: 11px; color: #88cc44; font-weight: 600; min-width: 24px;
    text-align: right; font-variant-numeric: tabular-nums;
  }
  #${panelId} .btn-icon {
    width: 24px; height: 24px; border-radius: 5px; border: none;
    cursor: pointer; font-size: 12px; display: flex; align-items: center;
    justify-content: center; transition: all 0.15s;
  }
  #${panelId} .btn-play { background: #88cc44; color: #0d0d1a; }
  #${panelId} .btn-play:hover { background: #a0e060; }
  #${panelId} .btn-play.paused { background: #ff8844; }
  #${panelId} .btn-play.paused:hover { background: #ffaa66; }
  #${panelId} .btn-icon.secondary { background: rgba(255,255,255,0.08); color: #ccc; }
  #${panelId} .btn-icon.secondary:hover { background: rgba(255,255,255,0.15); }
  #${panelId} .sep-line { border: none; border-top: 1px solid rgba(255,255,255,0.04); margin: 1px 0; }
  #${panelId} .scrub-wrap {
    display: flex; align-items: center; gap: 4px; flex: 1;
  }
  #${panelId} .scrub-wrap input[type="range"] { max-width: none; }
  #${panelId} .time-label {
    font-size: 11px; color: #888; min-width: 65px; text-align: right; font-variant-numeric: tabular-nums;
  }
  #${panelId} input[type="range"] {
    flex: 1; min-width: 40px; height: 3px; -webkit-appearance: none;
    appearance: none; background: rgba(255,255,255,0.12); border-radius: 2px;
    outline: none; cursor: pointer;
  }
  #${panelId} input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
    background: #88cc44; cursor: pointer; border: 2px solid #0d0d1a;
    transition: transform 0.1s;
  }
  #${panelId} input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); }
  #${panelId} input[type="range"]::-moz-range-thumb {
    width: 10px; height: 10px; border-radius: 50%;
    background: #88cc44; cursor: pointer; border: 2px solid #0d0d1a;
  }
  #${panelId} .ctrl-select {
    padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06); color: #ccc; font-size: 11px; outline: none; cursor: pointer; max-width: 56px;
  }
  #${panelId} .ctrl-select:focus { border-color: #88cc44; }`

  document.head.appendChild(style)

  const layer = document.getElementById('ai-layer') ?? document.body
  layer.appendChild(panel)

  // ---- Animation state ----
  let parts: any[] = []
  let timeline: any = null
  let isPlaying = false

  // ---- Cross-demo position reset ----
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

  // ---- Find mesh by partId ----
  function findMeshByPartId(partId: string) {
    const scene = (window as any).__r3f_dev && (window as any).__r3f_dev.scene
    if (!scene) return null
    let found: any = null
    scene.traverse(function(child: any) {
      if (found) return
      if (child.isMesh && child.userData && child.userData.partId === partId) {
        found = child
      }
    })
    return found
  }

  // ---- Build explode data ----
  function buildExplode() {
    resetPartsPosition()
    if (timeline) { timeline.progress(0).kill(); timeline = null }
    isPlaying = false
    const btnPlay = document.getElementById('e-btn-play')
    btnPlay!.textContent = '▶'
    btnPlay!.classList.remove('paused')

    const partInfos = api.getParts()
    if (!partInfos || !partInfos.length) {
      return
    }

    const localPositions: any[] = []
    const partIds: string[] = []

    for (let i = 0; i < partInfos.length; i++) {
      const info = partInfos[i]
      const proxy = api.getPartProxy(info.partId)
      if (!proxy) continue

      const lPos = proxy.position.clone()
      localPositions.push(lPos)
      partIds.push(info.partId)
    }

    if (!partIds.length) {
      return
    }

    computeTargets(partIds, localPositions, partInfos)

    buildTimeline()
  }

  function computeTargets(partIds: string[], localPositions: any[], partInfos: any[]) {
    const axis = (document.getElementById('e-axis-select') as HTMLSelectElement).value
    const multiplier = parseFloat((document.getElementById('e-spread-slider') as HTMLInputElement).value)

    // Compute world geometric centers via Box3 (geometry-aware, not pivot positions)
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

    // Sort by world position on chosen axis
    const indexed: { idx: number; wVal: number }[] = []
    for (let i = 0; i < partIds.length; i++) {
      indexed.push({ idx: i, wVal: (worldPositions[i] as any)[axis] })
    }
    indexed.sort(function(a, b) { return a.wVal - b.wVal })

    const N = indexed.length
    const worldMin = indexed[0].wVal
    const worldMax = indexed[N - 1].wVal
    const worldRange = worldMax - worldMin
    const worldCenter = (worldMin + worldMax) / 2

    // Overall model bounding box (union of all parts' geometry, not just centers)
    const modelBox = new THREE.Box3()
    for (let i = 0; i < partInfos.length; i++) {
      const mesh = findMeshByPartId(partInfos[i].partId)
      if (mesh) {
        const partBox = new THREE.Box3().setFromObject(mesh)
        modelBox.union(partBox)
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
        // Rank-based uniform spread: every part gets a unique position
        // evenly distributed across [-spread/2, +spread/2] on the chosen axis.
        // This guarantees all parts separate regardless of original positions.
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

    // All parts simultaneously — fromTo to avoid GSAP caching start values at creation
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      // Verify proxy.position is a valid THREE.Vector3
      if (!p.proxy || !p.proxy.position || typeof p.proxy.position.x !== 'number') {
        continue
      }
      timeline.fromTo(p.proxy.position, {
        x: p.localPos.x, y: p.localPos.y, z: p.localPos.z,
      }, {
        x: p.target.x, y: p.target.y, z: p.target.z,
        duration: duration, ease: easing, overwrite: true,
      }, 0)
    }

    syncUI()
  }

  // ---- Playback ----
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

  // ---- UI Bindings ----
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

  document.getElementById('e-strict-sep')!.addEventListener('change', function() {
    buildExplode()
  })

  // ---- Keyboard ----
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

  // ---- Init ----
  if (spreadOverride != null) {
    if (spreadOverride > parseFloat(spreadSlider.max)) spreadSlider.max = String(spreadOverride)
    spreadSlider.value = String(spreadOverride)
    document.getElementById('e-spread-val')!.textContent = spreadOverride.toFixed(1) + '×'
  }
  if (rangeOverride != null) {
    if (rangeOverride > parseFloat(durSlider.max)) durSlider.max = String(rangeOverride)
    durSlider.value = String(rangeOverride)
    document.getElementById('e-dur-val')!.textContent = rangeOverride.toFixed(1) + 's'
  }
  buildExplode()

  return function cleanup() {
    if (timeline) { timeline.progress(0).kill(); timeline = null }
    document.getElementById(panelId)?.remove()
    document.getElementById(styleId)?.remove()
    document.removeEventListener('keydown', onKey)
  }
}
