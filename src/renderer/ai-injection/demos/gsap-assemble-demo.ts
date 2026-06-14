/**
 * GSAP 装配动画 Demo — AI code injection 载荷
 *
 * 复刻 animation_gen/demos/raw/gsap_assemble_demo.html 的控制面板 UI 和动画逻辑。
 * 通过 postMessage executeCode 注入到 #ai-layer，用 GSAP 控制零件装配动画。
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

export const GSAP_ASSEMBLE_DEMO_HTML = /* html */ `
<div id="gsap-panel">
  <div class="ctrl-row">
    <button class="btn-icon btn-play" id="btn-play" title="播放 (Space)">▶</button>
    <button class="btn-icon secondary" id="btn-reset" title="重置 (R)">⟲</button>
    <div class="scrub-wrap">
      <input type="range" id="scrub" min="0" max="1000" value="0">
      <span class="time-label" id="time-label">0.00s / 0.00s</span>
    </div>
    <label>运动</label>
    <select class="ctrl-select" id="easing-select">
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
    <input type="range" id="height-slider" min="1.0" max="5.0" step="0.1" value="3.0">
    <span class="value" id="height-val">3.0×</span>
    <label>时长</label>
    <input type="range" id="duration-slider" min="0.2" max="3.0" step="0.1" value="0.8">
    <span class="value" id="duration-val">0.8s</span>
  </div>
</div>
`

export const GSAP_ASSEMBLE_DEMO_CSS = /* css */ `
#gsap-panel {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  background: rgba(13,13,26,0.6); backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;
  padding: 5px 8px; min-width: 220px;
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
  font-size: 11px; color: #44aaff; font-weight: 600; min-width: 24px;
  text-align: right; font-variant-numeric: tabular-nums;
}
#gsap-panel .btn-icon {
  width: 24px; height: 24px; border-radius: 5px; border: none;
  cursor: pointer; font-size: 12px; display: flex; align-items: center;
  justify-content: center; transition: all 0.15s;
}
#gsap-panel .btn-play { background: #44aaff; color: #0d0d1a; }
#gsap-panel .btn-play:hover { background: #66ccff; }
#gsap-panel .btn-play.paused { background: #ff8844; }
#gsap-panel .btn-play.paused:hover { background: #ffaa66; }
#gsap-panel .btn-icon.secondary { background: rgba(255,255,255,0.08); color: #ccc; }
#gsap-panel .btn-icon.secondary:hover { background: rgba(255,255,255,0.15); }
#gsap-panel .sep-line { border: none; border-top: 1px solid rgba(255,255,255,0.04); margin: 1px 0; }
#gsap-panel .scrub-wrap {
  display: flex; align-items: center; gap: 4px; flex: 1;
}
#gsap-panel .scrub-wrap input[type="range"] { max-width: none; }
#gsap-panel .time-label {
  font-size: 11px; color: #888; min-width: 65px; text-align: right; font-variant-numeric: tabular-nums;
}
#gsap-panel input[type="range"] {
  flex: 1; min-width: 40px; height: 3px; -webkit-appearance: none;
  appearance: none; background: rgba(255,255,255,0.12); border-radius: 2px;
  outline: none; cursor: pointer;
}
#gsap-panel input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
  background: #44aaff; cursor: pointer; border: 2px solid #0d0d1a;
  transition: transform 0.1s;
}
#gsap-panel input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); }
#gsap-panel input[type="range"]::-moz-range-thumb {
  width: 10px; height: 10px; border-radius: 50%;
  background: #44aaff; cursor: pointer; border: 2px solid #0d0d1a;
}
#gsap-panel .ctrl-select {
  padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06); color: #ccc; font-size: 11px; outline: none; cursor: pointer; max-width: 56px;
}
#gsap-panel .ctrl-select:focus { border-color: #44aaff; }
`

export const GSAP_ASSEMBLE_DEMO_JS = /* js */ `
;(function() {
  var gsap = window.__gsap
  var THREE = window.__THREE
  var api = window.viewerAPI || window.__viewerAPI

  if (!gsap || !THREE || !api) {
    console.error('[gsap-assemble] Missing dependencies')
    return
  }

  var parts = []
  var initialPositions = [] // [{partId, pos: THREE.Vector3}]
  var timeline = null
  var isPlaying = false
  var sceneProxy = null
  var _assemblyData = null

  // ---- Capture parts and initial positions ----
  function captureParts() {
    resetPartsPosition()
    var partInfos = api.getParts()
    if (!partInfos || !partInfos.length) {
      return false
    }

    initialPositions = []
    parts = []
    var worldPositions = []

    for (var i = 0; i < partInfos.length; i++) {
      var info = partInfos[i]
      var proxy = api.getPartProxy(info.partId)
      if (!proxy) continue

      var localPos = proxy.position.clone()
      initialPositions.push({ partId: info.partId, pos: localPos.clone() })

      // Compute world-space bounding box center (geometry-aware)
      var mesh = findMeshByPartId(info.partId)
      var worldPos
      var height = 0
      if (mesh) {
        var box = new THREE.Box3().setFromObject(mesh)
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
    var box = new THREE.Box3()
    for (var j = 0; j < worldPositions.length; j++) {
      box.expandByPoint(worldPositions[j])
    }
    var assemblyTopZ = box.max.z

    _assemblyData = { parts: parts, assemblyTopZ: assemblyTopZ }
    return true
  }

  function findMeshByPartId(partId) {
    var scene = window.__r3f_dev && window.__r3f_dev.scene
    if (!scene) return null
    var found = null
    scene.traverse(function(child) {
      if (found) return
      if (child.isMesh && child.userData && child.userData.partId === partId) {
        found = child
      }
    })
    return found
  }

  // ---- Restore initial positions ----
  function restorePositions() {
    for (var i = 0; i < initialPositions.length; i++) {
      var ref = initialPositions[i]
      var proxy = api.getPartProxy(ref.partId)
      if (proxy) proxy.position.copy(ref.pos)
      // Ensure visible
      var m = findMeshByPartId(ref.partId)
      if (m) m.visible = true
    }
  }

  // ---- Build timeline ----
  function buildAssembly() {
    if (timeline) { timeline.progress(0).kill(); timeline = null }
    isPlaying = false
    var btnPlay = document.getElementById('btn-play')
    btnPlay.textContent = '▶'
    btnPlay.classList.remove('paused')

    if (!_assemblyData) return

    var pData = _assemblyData.parts
    var assemblyTopZ = _assemblyData.assemblyTopZ
    var dropRatio = parseFloat(document.getElementById('height-slider').value)
    var partDuration = parseFloat(document.getElementById('duration-slider').value)
    var easing = document.getElementById('easing-select').value

    // Sort by world-space bounding box Z (lowest first)
    pData.sort(function(a, b) { return a.worldPos.z - b.worldPos.z })

    // Restore initial positions first
    restorePositions()

    // Compute dropZ for each part
    // dropZ is the local Z at which the part starts (above assembled position)
    var worldDropZ = assemblyTopZ * dropRatio
    for (var m = 0; m < pData.length; m++) {
      pData[m].dropZ = pData[m].localPos.z + (worldDropZ - pData[m].worldPos.z)
    }

    // Group by (worldPos.z, height) — same Z and same height fall together
    var groups = {}
    var groupKeys
    var groupIdx = 0
    for (var i = 0; i < pData.length; i++) {
      var p = pData[i]
      var key = p.worldPos.z.toFixed(2) + '|' + p.height.toFixed(2)
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    }
    groupKeys = Object.keys(groups).sort(function(a, b) {
      return parseFloat(a.split('|')[0]) - parseFloat(b.split('|')[0])
    })

    // Build timeline
    timeline = gsap.timeline({
      paused: true,
      onComplete: function() {
        isPlaying = false
        btnPlay.textContent = '⟳'
        btnPlay.classList.remove('paused')
      },
    })

    // Phase 1: hide all at t=0
    for (var n = 0; n < pData.length; n++) {
      var mm = findMeshByPartId(pData[n].partId)
      if (mm) timeline.set(mm, { visible: false }, 0)
    }

    // Phase 2: each group drops sequentially; parts in same group drop simultaneously
    var EPS = 1 / 60
    for (var gi = 0; gi < groupKeys.length; gi++) {
      var tStart = groupIdx * partDuration
      var t = tStart < EPS ? EPS : tStart
      var groupParts = groups[groupKeys[gi]]

      for (var pi = 0; pi < groupParts.length; pi++) {
        var gp = groupParts[pi]

        // Make visible at t
        var gm = findMeshByPartId(gp.partId)
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
    var btnPlay = document.getElementById('btn-play')

    if (isPlaying) {
      timeline.pause()
      isPlaying = false
      btnPlay.textContent = '▶'
      btnPlay.classList.remove('paused')
    } else {
      if (timeline.progress() >= 1) timeline.progress(0)
      timeline.play()
      isPlaying = true
      btnPlay.textContent = '⏸'
      btnPlay.classList.add('paused')
    }
  }

  function resetAnim() {
    if (timeline) {
      timeline.progress(0).pause()
      isPlaying = false
      var btnPlay = document.getElementById('btn-play')
      btnPlay.textContent = '▶'
      btnPlay.classList.remove('paused')
      syncUI()
    }
  }

  function syncUI() {
    var scrub = document.getElementById('scrub')
    var timeLabel = document.getElementById('time-label')
    if (!timeline) { scrub.value = 0; timeLabel.textContent = '0.00s / 0.00s'; return }
    var p = timeline.progress()
    scrub.value = p * 1000
    timeLabel.textContent = (p * timeline.duration()).toFixed(2) + 's / ' + timeline.duration().toFixed(2) + 's'
  }

  // ---- UI Bindings ----
  var btnPlay = document.getElementById('btn-play')
  var btnReset = document.getElementById('btn-reset')
  var scrub = document.getElementById('scrub')
  var easingSelect = document.getElementById('easing-select')
  var heightSlider = document.getElementById('height-slider')
  var durationSlider = document.getElementById('duration-slider')
  btnPlay.addEventListener('click', togglePlay)
  btnReset.addEventListener('click', resetAnim)

  scrub.addEventListener('input', function() {
    if (!timeline) return
    timeline.progress(scrub.value / 1000).pause()
    isPlaying = false
    btnPlay.textContent = '▶'
    btnPlay.classList.remove('paused')
    syncUI()
  })

  easingSelect.addEventListener('change', rebuild)

  heightSlider.addEventListener('input', function() {
    document.getElementById('height-val').textContent = parseFloat(heightSlider.value).toFixed(1) + '×'
  })
  heightSlider.addEventListener('change', rebuild)

  durationSlider.addEventListener('input', function() {
    document.getElementById('duration-val').textContent = parseFloat(durationSlider.value).toFixed(1) + 's'
  })
  durationSlider.addEventListener('change', rebuild)

  // ---- Keyboard ----
  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
    if (e.key === ' ') { e.preventDefault(); togglePlay() }
    if (e.key === 'r') resetAnim()
    if (e.key === 'ArrowRight' && timeline) {
      var p = Math.min(1, timeline.progress() + 0.02)
      timeline.progress(p).pause()
      isPlaying = false
      btnPlay.textContent = '▶'
      btnPlay.classList.remove('paused')
      syncUI()
    }
    if (e.key === 'ArrowLeft' && timeline) {
      var p = Math.max(0, timeline.progress() - 0.02)
      timeline.progress(p).pause()
      isPlaying = false
      btnPlay.textContent = '▶'
      btnPlay.classList.remove('paused')
      syncUI()
    }
  })

  // ---- Init ----
  if (captureParts()) {
    buildAssembly()
  }
  console.log('[gsap-assemble] ready')
})()
`

/** Construct the postMessage payload for injecting the GSAP assemble demo */
export function buildGSAPAssemblePayload() {
  return JSON.stringify({
    type: '3d-viewer',
    command: 'executeCode',
    params: {
      html: GSAP_ASSEMBLE_DEMO_HTML,
      css: GSAP_ASSEMBLE_DEMO_CSS,
      js: GSAP_ASSEMBLE_DEMO_JS,
      mode: 'replace',
    },
    id: 'gsap-assemble-' + Date.now(),
  })
}
