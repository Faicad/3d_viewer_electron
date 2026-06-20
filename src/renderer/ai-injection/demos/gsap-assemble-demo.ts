/**
 * GSAP 装配动画 Demo — 直接页面内实现
 *
 * 通过 startAssembleDemo() 注入控制面板 UI，用 GSAP 控制零件装配动画。
 *
 * ── Debug Log（移植过程错误记录，2026-06-11）─────────────
 *
 * 1. scenePosZ = 0 硬编码错误
 *    原版用 currentScene.position.z 做世界→局部坐标转换，移植时写死 0。
 *    修复: dropZ = localPos.z + (worldDropZ - worldPos.z)
 *
 * 2. proxyZ 绕弯子（fromTo + onUpdate 代理对象）
 *    错误认为 GSAP 不能直接 tween Vector3.z，创建中间对象 + onUpdate。
 *    GSAP 可以直接操作 Vector3 属性。
 *    修复: 改用 timeline.fromTo(proxy.position, { x, y, z: dropZ }, { z: localPos.z }, t)
 *
 * 3. 零件不动 — GSAP .to() 在创建时缓存起始值
 *    使用 timeline.call(setPosition) + timeline.to(position, { z }) 时，
 *    .to() 在创建时缓存起始值（当时 position.z = localPos.z），而非播放时读取。
 *    导致 call() 虽然设了 dropZ，但 to() 仍从 localPos.z → localPos.z，无动画。
 *    修复: 改用 .fromTo() 显式指定起止值。
 *
 * 4. 所有零件一起下落 — world position 获取错误
 *    使用 mesh.getWorldPosition() 只返回 mesh pivot 位置。
 *    对于 pivot 都在 Z=0.05/0.09 的模型（如 53 个零件 o0~o52），排序无效。
 *    原版能工作是因为测试模型 mold_assemble.glb 的 pivot 按高度分布。
 *    修复: 改用 new THREE.Box3().setFromObject(mesh).getCenter()
 *
 * 5. updateWorldMatrix 缺失
 *    getWorldPosition 内部会调 updateWorldMatrix，但 Box3.setFromObject 也需要
 *    世界矩阵最新。修复: 两种方式都已确保（Box3.setFromObject 自动处理）。
 *
 * 6. 跨 demo 位置干扰 — 先执行 explode 再执行 assemble，
 *    captureParts 捕获的是 explode 修改后的位置，导致装配终点错误。
 *    修复: 增加 resetPartsPosition()，首次调用时缓存所有零件原始 position
 *    到 window.__gsap_initial_positions，后续 demo 开始前恢复。
 * ────────────────────────────────────────────────
 */

export function startAssembleDemo(): () => void {
  const gsap = window.__gsap as typeof import('gsap')['default']
  const THREE = window.__THREE as typeof import('three')
  const api = window.__viewerAPI!

  if (!gsap || !THREE || !api) {
    console.warn('[gsap-assemble] Missing dependencies')
    return () => {}
  }

  const panelId = 'gsap-demo-assemble'
  const styleId = 'gsap-demo-assemble-style'

  // Remove existing
  document.getElementById(panelId)?.remove()
  document.getElementById(styleId)?.remove()

  // Create panel
  const panel = document.createElement('div')
  panel.id = panelId
  panel.innerHTML = `<div class="ctrl-row">
    <button class="btn-icon btn-play" id="a-btn-play" title="播放 (Space)">▶</button>
    <button class="btn-icon secondary" id="a-btn-reset" title="重置 (R)">⟲</button>
    <div class="scrub-wrap">
      <input type="range" id="a-scrub" min="0" max="1000" value="0">
      <span class="time-label" id="a-time-label">0.00s / 0.00s</span>
    </div>
    <label>运动</label>
    <select class="ctrl-select" id="a-easing-select">
      <option value="power3.in" selected>重力加速</option>
      <option value="back.out(2.5)">强锁定</option>
      <option value="elastic.out(1,0.2)">弹簧着陆</option>
      <option value="bounce.out">弹跳着陆</option>
      <option value="back.out(1.5)">锁定回弹</option>
      <option value="power3.inOut">缓入缓出</option>
      <option value="expo.in">重重力感</option>
      <option value="none">线性</option>
    </select>
  </div>
  <div class="ctrl-row">
    <label>高度</label>
    <input type="range" id="a-height-slider" min="1.0" max="5.0" step="0.1" value="3.0">
    <span class="value" id="a-height-val">3.0×</span>
    <label>时长</label>
    <input type="range" id="a-duration-slider" min="0.2" max="3.0" step="0.1" value="0.8">
    <span class="value" id="a-duration-val">0.8s</span>
  </div>`

  // Add styles
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `#${panelId} {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(13,13,26,0.6); backdrop-filter: blur(6px);
    border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;
    padding: 5px 8px; min-width: 220px;
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
    font-size: 11px; color: #44aaff; font-weight: 600; min-width: 24px;
    text-align: right; font-variant-numeric: tabular-nums;
  }
  #${panelId} .btn-icon {
    width: 24px; height: 24px; border-radius: 5px; border: none;
    cursor: pointer; font-size: 12px; display: flex; align-items: center;
    justify-content: center; transition: all 0.15s;
  }
  #${panelId} .btn-play { background: #44aaff; color: #0d0d1a; }
  #${panelId} .btn-play:hover { background: #66ccff; }
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
    background: #44aaff; cursor: pointer; border: 2px solid #0d0d1a;
    transition: transform 0.1s;
  }
  #${panelId} input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); }
  #${panelId} input[type="range"]::-moz-range-thumb {
    width: 10px; height: 10px; border-radius: 50%;
    background: #44aaff; cursor: pointer; border: 2px solid #0d0d1a;
  }
  #${panelId} .ctrl-select {
    padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06); color: #ccc; font-size: 11px; outline: none; cursor: pointer; max-width: 56px;
  }
  #${panelId} .ctrl-select:focus { border-color: #44aaff; }`

  document.head.appendChild(style)

  const layer = document.getElementById('ai-layer') ?? document.body
  layer.appendChild(panel)

  // ---- Animation state ----
  let parts: any[] = []
  let initialPositions: any[] = []
  let timeline: any = null
  let isPlaying = false
  let _assemblyData: any = null

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

  // ---- Capture parts and initial positions ----
  function captureParts() {
    resetPartsPosition()
    const partInfos = api.getParts()
    if (!partInfos || !partInfos.length) {
      return false
    }

    initialPositions = []
    parts = []
    const worldPositions: any[] = []

    for (let i = 0; i < partInfos.length; i++) {
      const info = partInfos[i]
      const proxy = api.getPartProxy(info.partId)
      if (!proxy) continue

      const localPos = proxy.position.clone()
      initialPositions.push({ partId: info.partId, pos: localPos.clone() })

      // Compute world-space bounding box center (geometry-aware)
      const mesh = findMeshByPartId(info.partId)
      let worldPos: any
      let height = 0
      if (mesh) {
        const box = new THREE.Box3().setFromObject(mesh)
        worldPos = box.getCenter(new THREE.Vector3())
        height = box.max.z - box.min.z
      } else {
        worldPos = localPos.clone()
      }
      worldPositions.push(worldPos)

      parts.push({
        partId: info.partId,
        proxy: proxy,
        localPos: localPos,
        worldPos: worldPos,
        height: height,
        name: info.name,
      })
    }

    if (!parts.length) {
      return false
    }

    // Compute bounding box from world positions
    const box = new THREE.Box3()
    for (let j = 0; j < worldPositions.length; j++) {
      box.expandByPoint(worldPositions[j])
    }
    const assemblyTopZ = box.max.z

    _assemblyData = { parts: parts, assemblyTopZ: assemblyTopZ }
    return true
  }

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

  // ---- Restore initial positions ----
  function restorePositions() {
    for (let i = 0; i < initialPositions.length; i++) {
      const ref = initialPositions[i]
      const proxy = api.getPartProxy(ref.partId)
      if (proxy) proxy.position.copy(ref.pos)
      // Ensure visible
      const m = findMeshByPartId(ref.partId)
      if (m) m.visible = true
    }
  }

  // ---- Build timeline ----
  function buildAssembly() {
    if (timeline) { timeline.progress(0).kill(); timeline = null }
    isPlaying = false
    const btnPlay = document.getElementById('a-btn-play')
    btnPlay!.textContent = '▶'
    btnPlay!.classList.remove('paused')

    if (!_assemblyData) return

    const pData = _assemblyData.parts
    const assemblyTopZ = _assemblyData.assemblyTopZ
    const dropRatio = parseFloat((document.getElementById('a-height-slider') as HTMLInputElement).value)
    const partDuration = parseFloat((document.getElementById('a-duration-slider') as HTMLInputElement).value)
    const easing = (document.getElementById('a-easing-select') as HTMLSelectElement).value

    // Sort by world-space bounding box Z (lowest first)
    pData.sort(function(a: any, b: any) { return a.worldPos.z - b.worldPos.z })

    // Restore initial positions first
    restorePositions()

    // Compute dropZ for each part
    // dropZ is the local Z at which the part starts (above assembled position)
    const worldDropZ = assemblyTopZ * dropRatio
    for (let m = 0; m < pData.length; m++) {
      pData[m].dropZ = pData[m].localPos.z + (worldDropZ - pData[m].worldPos.z)
    }

    // Group by (worldPos.z, height) — same Z and same height fall together
    const groups: Record<string, any[]> = {}
    let groupIdx = 0
    for (let i = 0; i < pData.length; i++) {
      const p = pData[i]
      const key = p.worldPos.z.toFixed(2) + '|' + p.height.toFixed(2)
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    }
    const groupKeys = Object.keys(groups).sort(function(a, b) {
      return parseFloat(a.split('|')[0]) - parseFloat(b.split('|')[0])
    })

    // Build timeline
    timeline = gsap.timeline({
      paused: true,
      onComplete: function() {
        isPlaying = false
        btnPlay!.textContent = '⟳'
        btnPlay!.classList.remove('paused')
      },
    })

    // Phase 1: hide all at t=0
    for (let n = 0; n < pData.length; n++) {
      const mm = findMeshByPartId(pData[n].partId)
      if (mm) timeline.set(mm, { visible: false }, 0)
    }

    // Phase 2: each group drops sequentially; parts in same group drop simultaneously
    const EPS = 1 / 60
    for (let gi = 0; gi < groupKeys.length; gi++) {
      const tStart = groupIdx * partDuration
      const t = tStart < EPS ? EPS : tStart
      const groupParts = groups[groupKeys[gi]]

      for (let pi = 0; pi < groupParts.length; pi++) {
        const gp = groupParts[pi]

        // Make visible at t
        const gm = findMeshByPartId(gp.partId)
        if (gm) timeline.set(gm, { visible: true }, t)

        // From dropZ to localPos.z (x, y stay at localPos)
        timeline.fromTo(gp.proxy.position, {
          x: gp.localPos.x,
          y: gp.localPos.y,
          z: gp.dropZ,
        }, {
          x: gp.localPos.x,
          y: gp.localPos.y,
          z: gp.localPos.z,
          duration: partDuration,
          ease: easing,
          overwrite: true,
        }, t)
      }
      groupIdx++
    }

    syncUI()
  }

  function rebuild() {
    buildAssembly()
  }

  // ---- Playback ----
  function togglePlay() {
    if (!timeline) return
    const btnPlay = document.getElementById('a-btn-play')

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
    if (timeline) {
      timeline.progress(0).pause()
      isPlaying = false
      const btnPlay = document.getElementById('a-btn-play')
      btnPlay!.textContent = '▶'
      btnPlay!.classList.remove('paused')
      syncUI()
    }
  }

  function syncUI() {
    const scrub = document.getElementById('a-scrub') as HTMLInputElement
    const timeLabel = document.getElementById('a-time-label')
    if (!timeline) { scrub.value = '0'; timeLabel!.textContent = '0.00s / 0.00s'; return }
    const p = timeline.progress()
    scrub.value = String(p * 1000)
    timeLabel!.textContent = (p * timeline.duration()).toFixed(2) + 's / ' + timeline.duration().toFixed(2) + 's'
  }

  // ---- UI Bindings ----
  const btnPlay = document.getElementById('a-btn-play')!
  const btnReset = document.getElementById('a-btn-reset')!
  const scrub = document.getElementById('a-scrub')! as HTMLInputElement
  const easingSelect = document.getElementById('a-easing-select')! as HTMLSelectElement
  const heightSlider = document.getElementById('a-height-slider')! as HTMLInputElement
  const durationSlider = document.getElementById('a-duration-slider')! as HTMLInputElement
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

  easingSelect.addEventListener('change', rebuild)

  heightSlider.addEventListener('input', function() {
    document.getElementById('a-height-val')!.textContent = parseFloat(heightSlider.value).toFixed(1) + '×'
  })
  heightSlider.addEventListener('change', rebuild)

  durationSlider.addEventListener('input', function() {
    document.getElementById('a-duration-val')!.textContent = parseFloat(durationSlider.value).toFixed(1) + 's'
  })
  durationSlider.addEventListener('change', rebuild)

  // ---- Keyboard ----
  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
    if (e.key === ' ') { e.preventDefault(); togglePlay() }
    if (e.key === 'r') resetAnim()
    if (e.key === 'ArrowRight' && timeline) {
      const p = Math.min(1, timeline.progress() + 0.02)
      timeline.progress(p).pause()
      isPlaying = false
      const btnPlay = document.getElementById('a-btn-play')
      btnPlay!.textContent = '▶'
      btnPlay!.classList.remove('paused')
      syncUI()
    }
    if (e.key === 'ArrowLeft' && timeline) {
      const p = Math.max(0, timeline.progress() - 0.02)
      timeline.progress(p).pause()
      isPlaying = false
      const btnPlay = document.getElementById('a-btn-play')
      btnPlay!.textContent = '▶'
      btnPlay!.classList.remove('paused')
      syncUI()
    }
  }
  document.addEventListener('keydown', onKey)

  // ---- Init ----
  if (captureParts()) {
    buildAssembly()
  }

  return function cleanup() {
    if (timeline) { timeline.progress(0).kill(); timeline = null }
    document.getElementById(panelId)?.remove()
    document.getElementById(styleId)?.remove()
    document.removeEventListener('keydown', onKey)
  }
}
