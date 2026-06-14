/**
 * GSAP 爆炸图动画 Demo — AI code injection 载荷
 *
 * 复刻 animation_gen/demos/raw/gsap_explode_demo.html 的控制面板 UI 和动画逻辑。
 * 通过 postMessage executeCode 注入到 #ai-layer，用 GSAP 控制零件爆炸动画。
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

export const GSAP_EXPLODE_DEMO_HTML = /* html */ `
<div id="gsap-panel">
  <div class="ctrl-row">
    <button class="btn-icon btn-play" id="btn-play" title="播放 (Space)">▶</button>
    <button class="btn-icon secondary" id="btn-reset" title="重置 (R)">⟲</button>
    <div class="scrub-wrap">
      <input type="range" id="scrub" min="0" max="1000" value="0">
      <span class="time-label" id="time-label">0.00s / 0.00s</span>
    </div>
    <label>轴</label>
    <select class="ctrl-select" id="axis-select" style="max-width:40px">
      <option value="x">X</option>
      <option value="y">Y</option>
      <option value="z" selected>Z</option>
    </select>
    <label>运动</label>
    <select class="ctrl-select" id="easing-select">
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
    <input type="range" id="dur-slider" min="0.3" max="5" step="0.1" value="1.5">
    <span class="value" id="dur-val">1.5s</span>
    <label>扩散</label>
    <input type="range" id="spread-slider" min="1" max="6" step="0.1" value="2">
    <span class="value" id="spread-val">2.0×</span>
  </div>
  <div class="ctrl-row">
    <label><input type="checkbox" id="strict-sep" checked> 严格分散</label>
  </div>
</div>
`

export const GSAP_EXPLODE_DEMO_CSS = /* css */ `
#gsap-panel {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  background: rgba(13,13,26,0.6); backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;
  padding: 5px 8px; min-width: 260px;
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
  font-size: 11px; color: #88cc44; font-weight: 600; min-width: 24px;
  text-align: right; font-variant-numeric: tabular-nums;
}
#gsap-panel .btn-icon {
  width: 24px; height: 24px; border-radius: 5px; border: none;
  cursor: pointer; font-size: 12px; display: flex; align-items: center;
  justify-content: center; transition: all 0.15s;
}
#gsap-panel .btn-play { background: #88cc44; color: #0d0d1a; }
#gsap-panel .btn-play:hover { background: #a0e060; }
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
  background: #88cc44; cursor: pointer; border: 2px solid #0d0d1a;
  transition: transform 0.1s;
}
#gsap-panel input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); }
#gsap-panel input[type="range"]::-moz-range-thumb {
  width: 10px; height: 10px; border-radius: 50%;
  background: #88cc44; cursor: pointer; border: 2px solid #0d0d1a;
}
#gsap-panel .ctrl-select {
  padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06); color: #ccc; font-size: 11px; outline: none; cursor: pointer; max-width: 56px;
}
#gsap-panel .ctrl-select:focus { border-color: #88cc44; }
`

export const GSAP_EXPLODE_DEMO_JS = /* js */ `
;(function() {
  var gsap = window.__gsap
  var THREE = window.__THREE
  var api = window.viewerAPI || window.__viewerAPI

  if (!gsap || !THREE || !api) {
    console.error('[gsap-explode] Missing dependencies')
    return
  }

  // ---- Cross-demo position reset ----
  function resetPartsPosition() {
    var saved = window.__gsap_initial_positions
    if (saved) {
      var all = api.getParts()
      for (var i = 0; i < all.length; i++) {
        var s = saved[all[i].partId]
        if (s) { var p = api.getPartProxy(all[i].partId); if (p) p.position.set(s[0], s[1], s[2]) }
      }
    } else {
      window.__gsap_initial_positions = {}
      var all = api.getParts()
      for (var i = 0; i < all.length; i++) {
        var p = api.getPartProxy(all[i].partId)
        if (p) window.__gsap_initial_positions[all[i].partId] = [p.position.x, p.position.y, p.position.z]
      }
    }
  }

  var parts = []
  var timeline = null
  var isPlaying = false

  // ---- Find mesh by partId ----
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

  // Spread offset = (worldGeomCenter - worldCenterOfMass) × (multiplier - 1)
  // 1× = no offset (parts stay at original position), 2× = double the original spread

  // ---- Build explode data ----
  function buildExplode() {
    resetPartsPosition()
    if (timeline) { timeline.progress(0).kill(); timeline = null }
    isPlaying = false
    var btnPlay = document.getElementById('btn-play')
    btnPlay.textContent = '▶'
    btnPlay.classList.remove('paused')

    var partInfos = api.getParts()
    if (!partInfos || !partInfos.length) {
      return
    }

    var localPositions = []
    var partIds = []

    for (var i = 0; i < partInfos.length; i++) {
      var info = partInfos[i]
      var proxy = api.getPartProxy(info.partId)
      if (!proxy) continue

      var lPos = proxy.position.clone()
      localPositions.push(lPos)
      partIds.push(info.partId)
    }

    if (!partIds.length) {
      return
    }

    console.log('[gsap-explode] parts:', partIds.length, 'first:', partIds[0], 'pos:', localPositions[0].x.toFixed(3), localPositions[0].y.toFixed(3), localPositions[0].z.toFixed(3), 'last:', partIds[partIds.length-1], 'pos:', localPositions[localPositions.length-1].x.toFixed(3), localPositions[localPositions.length-1].y.toFixed(3), localPositions[localPositions.length-1].z.toFixed(3))
    var camera = window.__r3f_dev && window.__r3f_dev.camera
    console.log('[gsap-explode] camera:', !!camera, camera ? 'pos: ' + [camera.position.x.toFixed(2), camera.position.y.toFixed(2), camera.position.z.toFixed(2)].join(',') : 'null', camera ? 'fov: ' + camera.fov : '')

    computeTargets(partIds, localPositions, partInfos)

    buildTimeline()
  }

  function computeTargets(partIds, localPositions, partInfos) {
    var axis = document.getElementById('axis-select').value
    var multiplier = parseFloat(document.getElementById('spread-slider').value)

    // Compute world geometric centers via Box3 (geometry-aware, not pivot positions)
    var worldPositions = []
    for (var i = 0; i < partInfos.length; i++) {
      var mesh = findMeshByPartId(partInfos[i].partId)
      if (mesh) {
        var box = new THREE.Box3().setFromObject(mesh)
        worldPositions.push(box.getCenter(new THREE.Vector3()))
      } else {
        worldPositions.push(localPositions[i].clone())
      }
    }

    // Sort by world position on chosen axis
    var indexed = []
    for (var i = 0; i < partIds.length; i++) {
      indexed.push({ idx: i, wVal: worldPositions[i][axis] })
    }
    indexed.sort(function(a, b) { return a.wVal - b.wVal })

    var N = indexed.length
    var worldMin = indexed[0].wVal
    var worldMax = indexed[N - 1].wVal
    var worldRange = worldMax - worldMin
    var worldCenter = (worldMin + worldMax) / 2

    // Overall model bounding box (union of all parts' geometry, not just centers)
    var modelBox = new THREE.Box3()
    for (var i = 0; i < partInfos.length; i++) {
      var mesh = findMeshByPartId(partInfos[i].partId)
      if (mesh) {
        var partBox = new THREE.Box3().setFromObject(mesh)
        modelBox.union(partBox)
      }
    }
    var modelSize = modelBox.getSize(new THREE.Vector3())
    var modelDiagonal = Math.max(modelSize.x, modelSize.y, modelSize.z) || 1

    console.log('[gsap-explode] axis:', axis, 'multiplier:', multiplier, 'worldCenter:', worldCenter.toFixed(3), 'worldRange:', worldRange.toFixed(3), 'modelDiagonal:', modelDiagonal.toFixed(3))

    var strictSep = document.getElementById('strict-sep').checked

    parts = []
    for (var si = 0; si < N; si++) {
      var k = indexed[si].idx
      var lPos = localPositions[k]
      var target = lPos.clone()

      if (strictSep) {
        // Rank-based uniform spread: every part gets a unique position
        // evenly distributed across [-spread/2, +spread/2] on the chosen axis.
        // This guarantees all parts separate regardless of original positions.
        var norm = (si / (N - 1 || 1)) * 2 - 1
        var spread = modelDiagonal * Math.max(0, multiplier - 1) * 0.5
        target[axis] = lPos[axis] + norm * spread
      } else if (worldRange < 0.001) {
        var partCount = N - 1 || 1
        target[axis] = lPos[axis] + ((si / partCount) - 0.5) * modelDiagonal * Math.max(0, multiplier - 1)
      } else {
        target[axis] = lPos[axis] + (worldPositions[k][axis] - worldCenter) * Math.max(0, multiplier - 1)
      }

      parts.push({
        partId: partIds[k],
        proxy: api.getPartProxy(partIds[k]),
        localPos: lPos,
        target: target,
        name: partInfos[k].name,
      })
    }

    console.log('[gsap-explode] first 3 targets:', parts.slice(0, 3).map(function(p) { return (p.target[axis]).toFixed(3) }).join(', '), 'last 3:', parts.slice(-3).map(function(p) { return (p.target[axis]).toFixed(3) }).join(', '))
  }

  function buildTimeline() {
    if (!parts.length) return
    if (timeline) { timeline.progress(0).kill(); timeline = null }

    var btnPlay = document.getElementById('btn-play')
    var easing = document.getElementById('easing-select').value
    var duration = parseFloat(document.getElementById('dur-slider').value)

    timeline = gsap.timeline({
      paused: true,
      onUpdate: syncUI,
      onComplete: function() {
        isPlaying = false
        btnPlay.textContent = '⟳'
        btnPlay.classList.remove('paused')
      },
      onReverseComplete: function() {
        isPlaying = false
        btnPlay.textContent = '▶'
        btnPlay.classList.remove('paused')
        syncUI()
      },
    })

    // All parts simultaneously — fromTo to avoid GSAP caching start values at creation
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]
      // Verify proxy.position is a valid THREE.Vector3
      if (!p.proxy || !p.proxy.position || typeof p.proxy.position.x !== 'number') {
        console.log('[gsap-explode] INVALID proxy at index', i, p.partId)
        continue
      }
      timeline.fromTo(p.proxy.position, {
        x: p.localPos.x, y: p.localPos.y, z: p.localPos.z,
      }, {
        x: p.target.x, y: p.target.y, z: p.target.z,
        duration: duration, ease: easing, overwrite: true,
      }, 0)
    }

    console.log('[gsap-explode] timeline built with', timeline.totalDuration().toFixed(3), 's total,', timeline.getChildren ? timeline.getChildren().length + ' children' : '')
    syncUI()
  }

  // ---- Playback ----
  function togglePlay() {
    if (!timeline || !parts.length) return
    var btnPlay = document.getElementById('btn-play')

    if (isPlaying) {
      timeline.pause()
      isPlaying = false
      btnPlay.textContent = '▶'
      btnPlay.classList.remove('paused')
    } else {
      if (timeline.progress() >= 1) timeline.progress(0)
      console.log('[gsap-explode] play, progress:', timeline.progress().toFixed(3), 'duration:', timeline.duration().toFixed(3))
      timeline.play()
      isPlaying = true
      btnPlay.textContent = '⏸'
      btnPlay.classList.add('paused')
    }
  }

  function resetAnim() {
    if (!timeline) return
    if (timeline.progress() === 0) return
    var btnPlay = document.getElementById('btn-play')
    isPlaying = true
    btnPlay.textContent = '⏸'
    btnPlay.classList.add('paused')
    timeline.reverse()
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
  var durSlider = document.getElementById('dur-slider')
  var spreadSlider = document.getElementById('spread-slider')

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

  document.getElementById('axis-select').addEventListener('change', function() { buildExplode() })

  easingSelect.addEventListener('change', buildTimeline)

  durSlider.addEventListener('input', function() {
    document.getElementById('dur-val').textContent = parseFloat(durSlider.value).toFixed(1) + 's'
  })
  durSlider.addEventListener('change', buildTimeline)

  spreadSlider.addEventListener('input', function() {
    document.getElementById('spread-val').textContent = parseFloat(spreadSlider.value).toFixed(1) + '×'
  })
  spreadSlider.addEventListener('change', function() { buildExplode() })

  document.getElementById('strict-sep').addEventListener('change', function() {
    buildExplode()
  })

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
  buildExplode()
  console.log('[gsap-explode] ready')
})()
`

/** Construct the postMessage payload for injecting the GSAP explode demo */
export function buildGSAPExplodePayload() {
  return JSON.stringify({
    type: '3d-viewer',
    command: 'executeCode',
    params: {
      html: GSAP_EXPLODE_DEMO_HTML,
      css: GSAP_EXPLODE_DEMO_CSS,
      js: GSAP_EXPLODE_DEMO_JS,
      mode: 'replace',
    },
    id: 'gsap-explode-' + Date.now(),
  })
}
