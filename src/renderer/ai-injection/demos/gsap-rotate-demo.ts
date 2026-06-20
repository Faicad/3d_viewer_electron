export function startRotateDemo(): () => void {
  const gsap = window.__gsap as typeof import('gsap')['default']
  const THREE = window.__THREE as typeof import('three')
  const api = window.__viewerAPI

  if (!gsap || !THREE || !api) {
    console.warn('[gsap-rotate] Missing dependencies: gsap=' + !!gsap + ' THREE=' + !!THREE + ' api=' + !!api)
    return () => {}
  }

  const panelId = 'gsap-demo-rotate'
  const styleId = 'gsap-demo-rotate-style'

  // Create panel
  const existing = document.getElementById(panelId)
  if (existing) existing.remove()

  const panel = document.createElement('div')
  panel.id = panelId
  panel.innerHTML = `<div class="ctrl-row">
    <button class="btn-icon btn-play" id="r-btn-play" title="播放/暂停">▶</button>
    <label>速度</label>
    <input type="range" id="r-speed" min="0" max="4" step="0.05" value="1">
    <span class="value" id="r-speed-val">1.00</span>
    <button class="btn-icon secondary" id="r-dir" title="切换方向">⟳</button>
    <button class="btn-icon secondary" id="r-mode" title="切换模式">📷</button>
    <span id="r-mode-label">相机</span>
  </div>
  <div class="ctrl-row">
    <label>轴</label>
    <select id="r-axis">
      <option value="y">Y</option>
      <option value="x">X</option>
      <option value="z">Z</option>
    </select>
    <label>运动</label>
    <select id="r-ease">
      <option value="none">linear</option>
      <option value="power1.inOut">power1</option>
      <option value="power2.inOut">power2</option>
      <option value="power3.inOut">power3</option>
      <option value="sine.inOut">sine</option>
      <option value="expo.inOut">expo</option>
      <option value="back.inOut">back</option>
      <option value="elastic.inOut" selected>elastic</option>
      <option value="bounce.inOut">bounce</option>
    </select>
  </div>`

  // Add styles
  const oldStyle = document.getElementById(styleId)
  if (oldStyle) oldStyle.remove()
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `#${panelId} {
    position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(13,13,26,0.85); backdrop-filter: blur(6px);
    border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;
    padding: 5px 8px; min-width: 140px; z-index: 9999;
    display: flex; flex-direction: column; gap: 3px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    font-family: 'Segoe UI', system-ui, sans-serif; color: #ccc; pointer-events: auto;
  }
  #${panelId} .ctrl-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  #${panelId} label { font-size: 11px; color: #888; white-space: nowrap; }
  #${panelId} .value { font-size: 11px; color: #66bbff; font-weight: 600; min-width: 24px; text-align: right; font-variant-numeric: tabular-nums; }
  #${panelId} input[type="range"] { flex: 1; min-width: 40px; height: 3px; -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.12); border-radius: 2px; outline: none; cursor: pointer; }
  #${panelId} input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%; background: #66bbff; cursor: pointer; border: 2px solid #0d0d1a; }
  #${panelId} .btn-icon { width: 24px; height: 24px; border-radius: 5px; border: none; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; }
  #${panelId} .btn-play { background: #66bbff; color: #0d0d1a; }
  #${panelId} .btn-play.paused { background: #ff8844; }
  #${panelId} .btn-icon.secondary { background: rgba(255,255,255,0.08); color: #ccc; }
  #${panelId} .btn-icon.secondary:hover { background: rgba(255,255,255,0.18); }
  #${panelId} select { padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #ccc; font-size: 11px; outline: none; cursor: pointer; max-width: 56px; }
  #${panelId} select:focus { border-color: #66bbff; }`

  document.head.appendChild(style)

  const layer = document.getElementById('ai-layer') ?? document.body
  layer.appendChild(panel)

  // Animation state
  const orbit = { angle: 0 }
  const cfg = { speed: 1, dir: 1, paused: false, axis: 'y', ease: 'elastic.inOut', mode: 'camera' }
  let _axisVec = new THREE.Vector3(0, 1, 0)
  const _offset = new THREE.Vector3()

  function initOrbit() {
    const cam = api.getCameraState()
    const target = new THREE.Vector3(cam.target[0], cam.target[1], cam.target[2])
    _offset.copy(new THREE.Vector3(cam.position[0], cam.position[1], cam.position[2])).sub(target)
    orbit.angle = 0
  }

  function rebuild() {
    gsap.killTweensOf(orbit)
    orbit.angle = 0
    if (cfg.mode === 'object') api.setPartTransform('__model__', { quaternion: [0, 0, 0, 1] })
    if (cfg.paused) return
    const total = cfg.dir * (Math.PI * 2)
    const dur = Math.max(0.1, 6 / Math.max(0.01, cfg.speed))
    if (cfg.mode === 'camera') {
      const cam = api.getCameraState()
      const target = new THREE.Vector3(cam.target[0], cam.target[1], cam.target[2])
      _offset.copy(new THREE.Vector3(cam.position[0], cam.position[1], cam.position[2])).sub(target)
      gsap.to(orbit, {
        angle: total, duration: dur, ease: cfg.ease, overwrite: true,
        onUpdate: function() {
          const q = new THREE.Quaternion().setFromAxisAngle(_axisVec, orbit.angle)
          const pos = _offset.clone().applyQuaternion(q)
          api.setCameraPosition([target.x + pos.x, target.y + pos.y, target.z + pos.z], [target.x, target.y, target.z])
        },
        onComplete: function() { rebuild() }
      })
    } else {
      gsap.to(orbit, {
        angle: total, duration: dur, ease: cfg.ease, overwrite: true,
        onUpdate: function() {
          const q = new THREE.Quaternion().setFromAxisAngle(_axisVec, orbit.angle)
          api.setPartTransform('__model__', { quaternion: [q.x, q.y, q.z, q.w] })
        },
        onComplete: function() { rebuild() }
      })
    }
  }

  const btnPlay = document.getElementById('r-btn-play')!
  const speedSlider = document.getElementById('r-speed')! as HTMLInputElement
  const speedVal = document.getElementById('r-speed-val')!
  const btnDir = document.getElementById('r-dir')!
  const btnMode = document.getElementById('r-mode')!
  const modeLabel = document.getElementById('r-mode-label')!
  const axisSelect = document.getElementById('r-axis')! as HTMLSelectElement
  const easeSelect = document.getElementById('r-ease')! as HTMLSelectElement

  function onClickPlay() { cfg.paused = !cfg.paused; btnPlay.textContent = cfg.paused ? '▶' : '⏸'; btnPlay.classList.toggle('paused', cfg.paused); rebuild() }
  btnPlay.addEventListener('click', onClickPlay)
  speedSlider.addEventListener('input', function() { cfg.speed = parseFloat(speedSlider.value); speedVal.textContent = cfg.speed.toFixed(2); rebuild() })
  btnDir.addEventListener('click', function() { cfg.dir *= -1; rebuild() })
  btnMode.addEventListener('click', function() { cfg.mode = cfg.mode === 'camera' ? 'object' : 'camera'; btnMode.textContent = cfg.mode === 'object' ? '🧊' : '📷'; modeLabel.textContent = cfg.mode === 'object' ? '物体' : '相机'; rebuild() })
  axisSelect.addEventListener('change', function() { cfg.axis = axisSelect.value; _axisVec = cfg.axis === 'x' ? new THREE.Vector3(1, 0, 0) : cfg.axis === 'z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0); initOrbit(); rebuild() })
  easeSelect.addEventListener('change', function() { cfg.ease = easeSelect.value; rebuild() })

  function onKey(e: KeyboardEvent) { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return; if (e.key === ' ') { e.preventDefault(); onClickPlay() } }
  document.addEventListener('keydown', onKey)

  initOrbit()
  rebuild()

  return function cleanup() {
    gsap.killTweensOf(orbit)
    document.getElementById(panelId)?.remove()
    document.getElementById(styleId)?.remove()
    document.removeEventListener('keydown', onKey)
  }
}
