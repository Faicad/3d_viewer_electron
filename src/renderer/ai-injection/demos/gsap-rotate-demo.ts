/**
 * GSAP 场景旋转 Demo — AI code injection 载荷
 *
 * 复刻 animation_gen/demos/raw/gsap_rotate_demo.html 的控制面板 UI 和动画逻辑。
 * 通过 postMessage executeCode 注入到 #ai-layer，用 GSAP 控制 3D 场景旋转。
 *
 * 两种模式：
 * - 相机绕目标旋转（camera orbit）
 * - 物体绕轴自转（object rotation —— 通过 setPartTransform('__model__', ...) 旋转模型组）
 */

export const GSAP_ROTATE_DEMO_HTML = /* html */ `
<div id="gsap-panel">
  <div class="ctrl-row">
    <button class="btn-icon btn-play" id="btn-play" title="播放/暂停">▶</button>
    <label>速度</label>
    <input type="range" id="speed" min="0" max="4" step="0.05" value="1">
    <span class="value" id="speed-val">1.00</span>
    <button class="btn-icon secondary" id="btn-dir" title="切换方向">⟳</button>
    <button class="btn-icon secondary" id="btn-mode" title="切换模式">📷</button>
    <span id="mode-label">相机</span>
  </div>
  <div class="ctrl-row">
    <label>轴</label>
    <select id="axis-select">
      <option value="y">Y</option>
      <option value="x">X</option>
      <option value="z">Z</option>
    </select>
    <label>运动</label>
    <select id="ease-select">
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
  </div>
</div>
`

export const GSAP_ROTATE_DEMO_CSS = /* css */ `
#gsap-panel {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  background: rgba(13,13,26,0.6); backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;
  padding: 5px 8px; min-width: 140px;
  display: flex; flex-direction: column; gap: 3px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
  font-family: 'Segoe UI', system-ui, sans-serif; color: #ccc;
  pointer-events: auto;
}
#gsap-panel .ctrl-row {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
}
#gsap-panel .ctrl-row label {
  font-size: 11px; color: #888; white-space: nowrap;
}
#gsap-panel .ctrl-row .value {
  font-size: 11px; color: #66bbff; font-weight: 600; min-width: 24px;
  text-align: right; font-variant-numeric: tabular-nums;
}
#gsap-panel input[type="range"] {
  flex: 1; min-width: 40px; height: 3px; -webkit-appearance: none;
  appearance: none; background: rgba(255,255,255,0.12); border-radius: 2px;
  outline: none; cursor: pointer;
}
#gsap-panel input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
  background: #66bbff; cursor: pointer; border: 2px solid #0d0d1a;
}
#gsap-panel .btn-icon {
  width: 24px; height: 24px; border-radius: 5px; border: none;
  cursor: pointer; font-size: 12px; display: flex; align-items: center;
  justify-content: center; transition: all 0.15s;
}
#gsap-panel .btn-play { background: #66bbff; color: #0d0d1a; }
#gsap-panel .btn-play:hover { background: #88ddff; }
#gsap-panel .btn-play.paused { background: #ff8844; }
#gsap-panel .btn-play.paused:hover { background: #ffaa66; }
#gsap-panel .btn-icon.secondary { background: rgba(255,255,255,0.08); color: #ccc; }
#gsap-panel .btn-icon.secondary:hover { background: rgba(255,255,255,0.18); }
#gsap-panel .btn-icon.active { background: #66bbff33; color: #66bbff; border: 1px solid #66bbff66; }
#gsap-panel select {
  padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06); color: #ccc; font-size: 11px;
  outline: none; cursor: pointer; max-width: 56px;
}
#gsap-panel select:focus { border-color: #66bbff; }
`

export const GSAP_ROTATE_DEMO_JS = /* js */ `
;(function() {
  var gsap = window.__gsap
  var THREE = window.__THREE
  var api = window.viewerAPI || window.__viewerAPI

  if (!gsap || !THREE || !api) {
    console.error('[gsap-demo] Missing dependencies: gsap=' + !!gsap + ' THREE=' + !!THREE + ' viewerAPI=' + !!api)
    return
  }

  // ---- State ----
  var orbit = { angle: 0 }
  var cfg = { speed: 1, dir: 1, paused: false, axis: 'y', ease: 'elastic.inOut', mode: 'camera' }
  var _axisVec = new THREE.Vector3(0, 1, 0)
  var _offset = new THREE.Vector3()

  function initOrbit() {
    var cam = api.getCameraState()
    var target = new THREE.Vector3(cam.target[0], cam.target[1], cam.target[2])
    _offset.copy(new THREE.Vector3(cam.position[0], cam.position[1], cam.position[2])).sub(target)
    orbit.angle = 0
  }

  function rebuild() {
    gsap.killTweensOf(orbit)
    orbit.angle = 0
    // Reset model rotation when in object mode
    if (cfg.mode === 'object') {
      api.setPartTransform('__model__', { quaternion: [0, 0, 0, 1] })
    }
    if (cfg.paused) return
    var total = cfg.dir * (Math.PI * 2)
    var dur = Math.max(0.1, 6 / Math.max(0.01, cfg.speed))

    if (cfg.mode === 'camera') {
      var cam = api.getCameraState()
      var target = new THREE.Vector3(cam.target[0], cam.target[1], cam.target[2])
      _offset.copy(new THREE.Vector3(cam.position[0], cam.position[1], cam.position[2])).sub(target)
      gsap.to(orbit, {
        angle: total, duration: dur, ease: cfg.ease, overwrite: true,
        onUpdate: function() {
          var q = new THREE.Quaternion().setFromAxisAngle(_axisVec, orbit.angle)
          var pos = _offset.clone().applyQuaternion(q)
          api.setCameraPosition(
            [target.x + pos.x, target.y + pos.y, target.z + pos.z],
            [target.x, target.y, target.z]
          )
        },
        onComplete: function() { rebuild() }
      })
    } else {
      gsap.to(orbit, {
        angle: total, duration: dur, ease: cfg.ease, overwrite: true,
        onUpdate: function() {
          var q = new THREE.Quaternion().setFromAxisAngle(_axisVec, orbit.angle)
          api.setPartTransform('__model__', { quaternion: [q.x, q.y, q.z, q.w] })
        },
        onComplete: function() { rebuild() }
      })
    }
  }

  // ---- UI Bindings ----
  var btnPlay = document.getElementById('btn-play')
  var speedSlider = document.getElementById('speed')
  var speedVal = document.getElementById('speed-val')
  var btnDir = document.getElementById('btn-dir')
  var btnMode = document.getElementById('btn-mode')
  var modeLabel = document.getElementById('mode-label')
  var axisSelect = document.getElementById('axis-select')
  var easeSelect = document.getElementById('ease-select')

  btnPlay.addEventListener('click', function() {
    cfg.paused = !cfg.paused
    btnPlay.textContent = cfg.paused ? '▶' : '⏸'
    if (cfg.paused) { btnPlay.classList.add('paused') }
    else { btnPlay.classList.remove('paused') }
    rebuild()
  })

  speedSlider.addEventListener('input', function() {
    cfg.speed = parseFloat(speedSlider.value)
    speedVal.textContent = cfg.speed.toFixed(2)
    rebuild()
  })

  btnDir.addEventListener('click', function() {
    cfg.dir *= -1
    rebuild()
  })

  btnMode.addEventListener('click', function() {
    cfg.mode = cfg.mode === 'camera' ? 'object' : 'camera'
    if (cfg.mode === 'object') {
      btnMode.textContent = '🧊'
      modeLabel.textContent = '物体'
    } else {
      btnMode.textContent = '📷'
      modeLabel.textContent = '相机'
    }
    rebuild()
  })

  axisSelect.addEventListener('change', function() {
    cfg.axis = axisSelect.value
    _axisVec = cfg.axis === 'x' ? new THREE.Vector3(1, 0, 0)
      : cfg.axis === 'z' ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0)
    initOrbit()
    rebuild()
  })

  easeSelect.addEventListener('change', function() {
    cfg.ease = easeSelect.value
    rebuild()
  })

  // ---- Keyboard shortcut ----
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
    if (e.key === ' ') { e.preventDefault(); btnPlay.click() }
  })

  // ---- Start ----
  initOrbit()
  rebuild()
  console.log('[gsap-demo] ready')
})()
`

/** Construct the postMessage payload for injecting the GSAP rotate demo */
export function buildGSAPRotatePayload() {
  return JSON.stringify({
    type: '3d-viewer',
    command: 'executeCode',
    params: {
      html: GSAP_ROTATE_DEMO_HTML,
      css: GSAP_ROTATE_DEMO_CSS,
      js: GSAP_ROTATE_DEMO_JS,
      mode: 'replace',
    },
    id: 'gsap-rotate-' + Date.now(),
  })
}
