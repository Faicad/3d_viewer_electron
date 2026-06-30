import { _electron as electron } from 'playwright'
import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, renameSync, statSync, readdirSync } from 'fs'
import { join, extname, dirname, basename, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
export const moviesDir = __dirname
export const rootDir = join(__dirname, '..')
export const distDir = join(rootDir, 'dist')
export const fixtureDir = join(rootDir, 'src', 'test', 'fixtures')

mkdirSync(moviesDir, { recursive: true })

const MIME_MAP = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.hdr': 'image/vnd.radiance',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
}

function createStaticServer(root, port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = req.url.split('?')[0]
      const filePath = join(root, urlPath === '/' ? 'index.html' : urlPath)

      // CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        })
        res.end()
        return
      }

      // PUT: save request body to disk, return URL as JSON
      if (req.method === 'PUT') {
        const chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => {
          const dir = dirname(filePath)
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
          writeFileSync(filePath, Buffer.concat(chunks))
          const url = `http://localhost:${port}${urlPath}`
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(JSON.stringify({ url }))
        })
        return
      }

      if (!existsSync(filePath)) {
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
        res.end()
        return
      }
      const ext = extname(filePath)
      res.writeHead(200, {
        'Content-Type': MIME_MAP[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(readFileSync(filePath))
    })
    server.listen(port, () => resolve(server))
  })
}

const VIEWER_PORT = 4178
export const MODEL_PORT = 4179

export const SIZE_PRESETS = {
  s: { label: '540p', orientations: [
    { width: 960, height: 540, suffix: '_h' },   // 16:9 landscape
    { width: 540, height: 720, suffix: '_v' },   // 3:4 portrait
  ]},
  m: { label: '720p', orientations: [
    { width: 1280, height: 720, suffix: '_h' },  // 16:9 landscape
    { width: 720, height: 960, suffix: '_v' },   // 3:4 portrait
  ]},
  g: { label: '1080p', orientations: [
    { width: 1920, height: 1080, suffix: '_h' }, // 16:9 landscape
    { width: 1080, height: 1440, suffix: '_v' }, // 3:4 portrait
  ]},
}

/**
 * Resolve orientation-sensitive parameter value.
 * If value contains ';', first part is for landscape, second for portrait.
 * Otherwise returns value unchanged.
 */
export function resolveOrientParam(value, isLandscape) {
  if (typeof value === 'string') {
    const idx = value.indexOf(';')
    if (idx !== -1) {
      return isLandscape ? value.slice(0, idx).trim() : value.slice(idx + 1).trim()
    }
  }
  return value
}

/**
 * Recursively resolve orientation-sensitive values in an object or array.
 * Strings with ';' are split; objects/arrays are traversed; other types pass through.
 */
function resolveOrientParams(obj, isLandscape) {
  if (typeof obj === 'string') return resolveOrientParam(obj, isLandscape)
  if (Array.isArray(obj)) return obj.map(v => resolveOrientParams(v, isLandscape))
  if (obj && typeof obj === 'object') {
    const result = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolveOrientParams(v, isLandscape)
    }
    return result
  }
  return obj
}

// Module-level orientation context — set automatically by recordOne before pageFn runs
let _currentIsLandscape = true

// 长轴/短轴：横屏='x'/'y'，竖屏='y'/'x'（由 recordOne 自动更新）
export let majorAxis = 'x'
export let minorAxis = 'y'

// Module-level cover context — set by makeMovie before pageFn runs
let _genDir = null
let _scriptName = null

/** Resolve size preset from CLI args (-s / -m / -g), default to -g. */
export function resolveSizePreset() {
  const args = process.argv.slice(2)
  if (args.includes('-s')) return SIZE_PRESETS.s
  if (args.includes('-m')) return SIZE_PRESETS.m
  return SIZE_PRESETS.g
}

/**
 * Resolve orientation filter from CLI args.
 * Returns 'h' for landscape-only, 'v' for portrait-only, or 'both' (default) when neither -h nor -v is given.
 * If both -h and -v are given, defaults to 'both'.
 */
export function resolveOrientationFilter() {
  const args = process.argv.slice(2)
  const h = args.includes('-h')
  const v = args.includes('-v')
  if (h && !v) return 'h'
  if (v && !h) return 'v'
  return 'both'
}

/** Detect -30 flag: output 30fps (1.2× speed-up from 25fps source). */
export function resolve30fps() {
  return process.argv.slice(2).includes('-30')
}

/** Detect --no-warm flag: skip code warmup. */
export function resolveNoWarm() {
  return process.argv.slice(2).includes('--no-warm')
}

/** Extract --tts <provider> from CLI args, or undefined. */
export function resolveTtsProvider() {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--tts')
  return idx >= 0 ? args[idx + 1] : undefined
}

/**
 * Build HDR URL based on size preset.
 * With -g (1080p) returns the 4K version, otherwise returns the 2K version.
 * @param {string} name  e.g. '/movies/kloppenheim_02'
 */
export function hdrUrl(name) {
  const suffix = resolveSizePreset() === SIZE_PRESETS.g ? '_4k' : '_2k'
  return `http://localhost:${MODEL_PORT}${name}${suffix}.hdr`
}

/**
 * Set HDR environment map by filename.
 * @param {object} page  Playwright page
 * @param {string} name  e.g. '/movies/kloppenheim_02'
 * @param {number} [timeout=15000]
 */
export async function setEnv(page, name, timeout = 15000) {
  await postMessageAndWait(page, {
    id: 'env',
    command: 'setEnv',
    params: { value: hdrUrl(name) },
    expectedCommand: 'setEnv',
    timeout,
  })
}

/**
 * Electron 版：等待模型加载完成（轮询 store 而非 DOM 事件）。
 * Web 版用 addInitScript + model-loaded 事件，Electron 通过 executeCommand 加载。
 */
export async function waitForModel(page) {
  await page.waitForFunction(
    () => window.__modelStore?.getState().__loadingPhase === 'done',
    { timeout: 60000 },
  )
}

export function zoomUI(page, factor = 1) {
  factor = resolveOrientParam(factor, _currentIsLandscape)
  return page.evaluate((f) => {
    const header = document.querySelector('header')
    if (header) header.style.zoom = String(f)
    const overlay = document.querySelector('div[style*="z-index: 10"]')
    if (overlay) overlay.style.zoom = String(f)
  }, factor)
}

/** 标准录制开场：zoomUI → 等待模型加载 → 等待入场动画结束 → 计算 trimStart */
export async function startRecording(page, tPageOpen, entryDuration) {
  entryDuration = resolveOrientParam(entryDuration, _currentIsLandscape)
  await zoomUI(page)
  // Electron: poll store loadingPhase instead of DOM model-loaded event
  await waitForModel(page)
  const trimStart = Date.now() - tPageOpen
  const tModelBrowser = await page.evaluate(() => performance.now())
  // Inject tModelBrowser into page context for syncpoint() to read
  await page.evaluate((t) => { window.__tModelBrowser = t }, tModelBrowser)
  if (entryDuration > 0) {
    await page.waitForTimeout(entryDuration)
  }
  return { trimStart, tModelBrowser }
}

/** Translate the model by (dx, dy, dz) from its current position, animated via GSAP.
 *  Supports '1.5;2' orientation syntax for dx/dy/dz and duration. */
export function translateModel(page, dx, dy, dz, duration, ease) {
  dx = resolveOrientParam(dx, _currentIsLandscape)
  dy = resolveOrientParam(dy, _currentIsLandscape)
  dz = resolveOrientParam(dz, _currentIsLandscape)
  duration = resolveOrientParam(duration, _currentIsLandscape)
  ease = resolveOrientParam(ease, _currentIsLandscape)
  return page.evaluate(({ dx, dy, dz, duration, ease }) => {
    const gsap = window.__gsap
    const api = window.__viewerAPI
    const part = api.getPartProxy('__model__')
    if (!part) return
    const startX = part.position.x
    const startY = part.position.y
    const startZ = part.position.z
    const proxy = { x: startX, y: startY, z: startZ }
    return new Promise((resolve) => {
      gsap.to(proxy, {
        x: startX + dx, y: startY + dy, z: startZ + dz,
        duration: duration / 1000,
        ease: ease || 'power2.inOut',
        onUpdate: () => {
          api.setPartTransform('__model__', { position: [proxy.x, proxy.y, proxy.z] })
        },
        onComplete: resolve,
      })
    })
  }, { dx, dy, dz, duration, ease })
}

/** Rotate the model by given degrees around its center, animated via GSAP, auto-stops after completion.
 *  @param {object} [opts] - { axis, ease }. axis defaults to file's native up-axis (auto-detected).
 *  All numeric params support '1.5;2' orientation syntax. */
export function rotateModel(page, degrees, duration, opts = {}) {
  degrees = resolveOrientParam(degrees, _currentIsLandscape)
  duration = resolveOrientParam(duration, _currentIsLandscape)
  let axis = resolveOrientParam(opts.axis, _currentIsLandscape)
  let ease = resolveOrientParam(opts.ease, _currentIsLandscape) ?? 'power2.inOut'
  const radians = degrees * Math.PI / 180
  return page.evaluate(async ({ radians, duration, axis, ease }) => {
    const gsap = window.__gsap
    const api = window.__viewerAPI
    const THREE = window.__THREE
    // Resolve axis from store if not explicitly provided
    if (!axis) {
      const up = window.__modelStore.getState().activeUpAxis
      axis = up === 'z' ? [0, 0, 1] : [0, 1, 0]
    }
    // Compute model bounding box center from visible meshes
    const dev = window.__r3f_dev
    const box = new THREE.Box3()
    let hasGeom = false
    if (dev?.scene) {
      dev.scene.traverse((obj) => {
        if (obj.isMesh && obj.visible && obj.geometry) {
          box.expandByObject(obj)
          hasGeom = true
        }
      })
    }
    const center = hasGeom ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0)
    const axisVec = new THREE.Vector3(axis[0], axis[1], axis[2])
    const proxy = { angle: 0 }
    return new Promise((resolve) => {
      gsap.to(proxy, {
        angle: radians,
        duration: duration / 1000,
        ease,
        onUpdate: () => {
          const q = new THREE.Quaternion().setFromAxisAngle(axisVec, proxy.angle)
          // Rotate around model center: newPos = center + q * (0 - center) = center - q * center
          const newPos = center.clone().sub(center.clone().applyQuaternion(q))
          api.setPartTransform('__model__', {
            position: [newPos.x, newPos.y, newPos.z],
            quaternion: [q.x, q.y, q.z, q.w],
          })
        },
        onComplete: resolve,
      })
    })
  }, { radians, duration, axis, ease })
}

/**
 * Record a subtitle syncpoint.
 * Writes to a dedicated array (__movieSyncPoints) — does NOT split the video.
 * After recording, timestamps are persisted to {name}.syncpoints.json for
 * generate-subtitle.mjs to anchor --N-- subtitle groups.
 */
export async function syncpoint(page) {
  await page.evaluate(async () => {
    if (!window.__movieSyncPoints) window.__movieSyncPoints = []
    const timing = window.__ttsTiming
    if (timing) {
      const sps = window.__movieSyncPoints
      const startRef = sps.length > 0 ? sps[sps.length - 1] : window.__tModelBrowser
      const groupIdx = window.__ttsGroupIndex
      const group = timing.groups[groupIdx]
      if (group) {
        const elapsed = performance.now() - startRef
        const required = group.totalDuration * 1000
        if (elapsed < required) {
          await new Promise(r => setTimeout(r, required - elapsed))
        }
        // Bidirectional check: warn if |final_elapsed - required| > 1s
        const finalElapsed = performance.now() - startRef
        const diff = (finalElapsed - required) / 1000
        if (Math.abs(diff) > 1.0) {
          const which = diff > 0 ? 'video longer' : 'audio longer'
          console.log(
            `  [syncpoint group ${groupIdx}] ${which} by ${Math.abs(diff).toFixed(2)}s ` +
            `(video=${(finalElapsed / 1000).toFixed(2)}s, tts=${(required / 1000).toFixed(2)}s)`
          )
        }
      }
      window.__ttsGroupIndex++
    }
    window.__movieSyncPoints.push(performance.now())
  })
}

/** Dispatch a CustomEvent on window */
export function dispatchEvent(page, name) {
  return page.evaluate((n) => window.dispatchEvent(new CustomEvent(n)), name)
}

/**
 * Intercept external protocol navigations (e.g. bambustudio://) and show a
 * custom in-app dialog instead of the native Chrome protocol-handler dialog.
 *
 * Chrome's native dialog cannot be automated by Playwright, but the custom
 * dialog looks realistic and is fully clickable — ideal for movie recording.
 *
 * Call once before clicking any button that triggers a protocol URL.
 * After the dialog appears, click "#movie-protocol-accept" to dismiss it.
 *
 * @param {object} page      Playwright page
 * @param {object} opts       { protocol, appName, appIcon }
 *   protocol  — scheme prefix (default 'bambustudio://')
 *   appName   — display name (default 'Bambu Studio')
 *   appIcon   — img src for the app icon (default none)
 */
export async function interceptProtocolWithDialog(page, opts = {}) {
  const { protocol = 'bambustudio://', appName = 'Bambu Studio', appIcon = '' } = opts
  await page.evaluate(({ protocol, appName, appIcon }) => {
    // Inject dialog CSS once
    if (!document.getElementById('movie-protocol-dialog-style')) {
      const style = document.createElement('style')
      style.id = 'movie-protocol-dialog-style'
      style.textContent = `
        #movie-protocol-backdrop {
          position: fixed; inset: 0; z-index: 99999;
          background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center;
          font-family: system-ui, 'Segoe UI', sans-serif;
        }
        #movie-protocol-dialog {
          background: #fff; border-radius: 8px; padding: 24px 24px 16px;
          min-width: 380px; max-width: 440px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          pointer-events: auto;
        }
        #movie-protocol-dialog .header {
          display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
        }
        #movie-protocol-dialog .header img {
          width: 20px; height: 20px;
        }
        #movie-protocol-dialog .header span {
          font-size: 14px; color: #202124; font-weight: 500;
        }
        #movie-protocol-dialog .origin {
          font-size: 12px; color: #5f6368; margin-bottom: 16px; padding-left: 30px;
        }
        #movie-protocol-dialog .checkbox-row {
          display: flex; align-items: center; gap: 8px;
          font-size: 12px; color: #5f6368; margin-bottom: 16px;
        }
        #movie-protocol-dialog .checkbox-row input { width: 14px; height: 14px; }
        #movie-protocol-dialog .buttons {
          display: flex; justify-content: flex-end; gap: 8px;
        }
        #movie-protocol-dialog .buttons button {
          padding: 6px 16px; border-radius: 4px; font-size: 13px;
          cursor: pointer; border: 1px solid #dadce0; background: #fff; color: #1a73e8;
        }
        #movie-protocol-dialog .buttons button#movie-protocol-accept {
          background: #1a73e8; color: #fff; border-color: #1a73e8;
        }
        #movie-protocol-dialog .buttons button:hover { opacity: 0.85; }
      `
      document.head.appendChild(style)
    }

    // Intercept protocol navigations
    const desc = Object.getOwnPropertyDescriptor(window.Location.prototype, 'href')
      || Object.getOwnPropertyDescriptor(Location.prototype, 'href')
    if (!desc || !desc.set) return
    const origSet = desc.set
    Object.defineProperty(window.Location.prototype, 'href', {
      set(url) {
        const s = String(url)
        if (s.startsWith(protocol)) {
          // Remove any existing dialog
          const old = document.getElementById('movie-protocol-backdrop')
          if (old) old.remove()
          // Build the custom dialog
          const backdrop = document.createElement('div')
          backdrop.id = 'movie-protocol-backdrop'
          const iconHtml = appIcon ? `<img src="${appIcon}" alt="">` : ''
          backdrop.innerHTML = `
            <div id="movie-protocol-dialog">
              <div class="header">${iconHtml}<span>Open ${appName}?</span></div>
              <div class="origin">${location.origin} wants to open this application.</div>
              <div class="checkbox-row">
                <input type="checkbox" id="movie-protocol-remember">
                <label for="movie-protocol-remember">Always allow ${protocol} links</label>
              </div>
              <div class="buttons">
                <button id="movie-protocol-cancel">Cancel</button>
                <button id="movie-protocol-accept">Open ${appName}</button>
              </div>
            </div>
          `
          // Cancel button: just close
          backdrop.querySelector('#movie-protocol-cancel').addEventListener('click', () => {
            backdrop.remove()
          })
          // Accept button: close dialog (the app would open in real usage)
          backdrop.querySelector('#movie-protocol-accept').addEventListener('click', () => {
            backdrop.remove()
            console.log('[movie] accepted protocol:', s)
          })
          // Click backdrop to cancel
          backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) backdrop.remove()
          })
          document.body.appendChild(backdrop)
          return
        }
        origSet.call(this, url)
      },
      get: desc.get,
      configurable: true,
    })
  }, { protocol, appName, appIcon })
}

/** Animate camera — proxy to window.__animateCamera(opts).
 *  All opts values support '1.5;2' orientation syntax. */
export function animateCamera(page, opts) {
  opts = resolveOrientParams(opts, _currentIsLandscape)
  return page.evaluate((o) => {
    if (o.duration != null) o.duration /= 1000
    return window.__animateCamera(o)
  }, opts)
}

/** Call a browser-side demo function by name (e.g. 'GSAPExplode' -> window.__demoGSAPExplode?.()) */
export function callDemo(page, name, params) {
  if (params) {
    const resolved = resolveOrientParams(params, _currentIsLandscape)
    // resolveOrientParams returns strings; restore numeric types for the browser
    if (typeof resolved.spread === 'string') resolved.spread = Number(resolved.spread)
    if (typeof resolved.range === 'string') resolved.range = Number(resolved.range)
    return page.evaluate(({ n, p }) => window[`__demo${n}`]?.(p), { n: name, p: resolved })
  }
  return page.evaluate((n) => window[`__demo${n}`]?.(), name)
}


/**
 * Show a magnified copy of the toolbar below the original header.
 * Useful for movie recordings where the toolbar icons are too small to see.
 *
 * The magnifier is a static DOM clone of the header, scaled up via CSS zoom
 * and placed in a fixed-position container below the original toolbar.
 * When `targetSelector` is provided, the magnifier scrolls so that button
 * is horizontally centered in the viewport — otherwise the whole toolbar is
 * centered (may clip on small screens).
 *
 * Call `removeMagnifyToolbar` to dismiss it.
 *
 * @param {object} page     Playwright page
 * @param {object} [opts]   { scale = 2.5, gap = 8, targetSelector? }
 *   scale          — zoom factor (default 2.5)
 *   gap            — pixels between original toolbar bottom and magnifier top
 *   targetSelector — CSS selector for the button to center on
 */
export async function magnifyToolbar(page, opts = {}) {
  const { scale = 2.5, gap = 8, targetSelector = '' } = opts
  await page.evaluate(({ scale, gap, targetSelector }) => {
    // Remove existing magnifier
    const old = document.getElementById('movie-toolbar-magnifier')
    if (old) old.remove()

    const header = document.querySelector('header')
    if (!header) return

    const rect = header.getBoundingClientRect()
    const cs = getComputedStyle(header)

    // Match the header's actual background and border colors
    const bgColor = cs.backgroundColor
    const borderColor = cs.borderBottomColor || cs.borderColor || 'rgba(128,128,128,0.3)'

    // Wrapper: full-width viewport, clips overflow so zoomed toolbar doesn't bleed
    const wrapper = document.createElement('div')
    wrapper.id = 'movie-toolbar-magnifier'
    Object.assign(wrapper.style, {
      position: 'fixed',
      zIndex: '10000',
      pointerEvents: 'none',
      top: `${rect.bottom + gap}px`,
      left: '0',
      width: '100%',
      overflow: 'hidden',
    })

    // Clone the header DOM, strip IDs and classes to avoid inherited-layout interference
    const clone = header.cloneNode(true)
    clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'))
    clone.removeAttribute('style')
    clone.removeAttribute('class')
    Object.assign(clone.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      height: 'auto',
      flexShrink: '0',
      padding: '8px 16px',
      background: bgColor,
      borderRadius: '12px',
      border: `2px solid ${borderColor}`,
      boxShadow: `0 8px 32px ${bgColor === 'rgb(255, 255, 255)' ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.7)'}`,
      zoom: String(scale),
    })

    // Append to DOM first so measurements reflect zoomed layout
    wrapper.appendChild(clone)
    document.body.appendChild(wrapper)

    // Use absolute positioning — most predictable, no flow-layout interference.
    // position:fixed on wrapper is a containing block for position:absolute children.
    clone.style.position = 'absolute'
    clone.style.left = '0px'
    clone.style.top = '0px'

    // Set wrapper height to match clone, so overflow-x clipping works without clipping y
    const cloneH = clone.getBoundingClientRect().height
    wrapper.style.height = `${cloneH}px`

    // Store zoom on wrapper so clickWithHighlight can read it
    wrapper.dataset.zoom = String(scale)

    const viewportW = window.innerWidth

    if (targetSelector) {
      const targetBtn = clone.querySelector(targetSelector)
      if (targetBtn) {
        const btnRect = targetBtn.getBoundingClientRect()
        // btnRect is in screen space. left is in CSS space and gets multiplied by zoom.
        const btnCenter = btnRect.left + btnRect.width / 2
        clone.style.left = `${Math.round((viewportW / 2 - btnCenter) / scale)}px`
      }
    } else {
      // Center the whole clone in the viewport
      const cloneW = clone.getBoundingClientRect().width
      if (cloneW > 0) {
        clone.style.left = `${Math.round((viewportW - cloneW) / 2 / scale)}px`
      }
    }

    // Inject fade-in styles once
    if (!document.getElementById('movie-magnifier-style')) {
      const style = document.createElement('style')
      style.id = 'movie-magnifier-style'
      style.textContent = `
        @keyframes movieMagnifierIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `
      document.head.appendChild(style)
    }
    wrapper.style.animation = 'movieMagnifierIn 0.25s ease-out forwards'
  }, { scale, gap, targetSelector })
}

/**
 * Remove the magnified toolbar overlay created by magnifyToolbar.
 * @param {object} page  Playwright page
 */
export async function removeMagnifyToolbar(page) {
  await page.evaluate(() => {
    const el = document.getElementById('movie-toolbar-magnifier')
    if (el) {
      el.style.opacity = '0'
      el.style.transition = 'opacity 0.15s ease-in'
      setTimeout(() => el.remove(), 150)
    }
  })
}

/**
 * Animate a large mouse cursor moving up to a toolbar button and clicking.
 * Call after `clickWithHighlight` — the red circle disappears, then a cursor
 * rises from below the target button, clicks it, and fades away.
 *
 * If `magnifyToolbar` is active, the cursor targets the magnified button.
 *
 * @param {object} page      Playwright page
 * @param {string} selector  CSS selector for the target button
 * @param {object} [opts]    { duration = 2000, distanceY = 120, click = true }
 *   duration  — total animation time in ms (default 2000)
 *   distanceY — how far below the target the cursor starts (px, default 120)
 *   click     — whether to trigger a real DOM click on arrival (default true)
 */
export async function animateCursorClick(page, selector, opts = {}) {
  const { duration = 2000, distanceY = 120, click: doClick = true } = opts
  await page.evaluate(({ selector, duration, distanceY, doClick }) => {
    // Target the magnified button if magnifier is active
    const magnifier = document.getElementById('movie-toolbar-magnifier')
    const el = magnifier
      ? magnifier.querySelector(selector)
      : document.querySelector(selector)
    if (!el) return

    // Also remember the original DOM button for the real click
    const clickTarget = doClick ? document.querySelector(selector) : null

    const gsap = window.__gsap
    const rect = el.getBoundingClientRect()
    const tx = rect.left + rect.width / 2
    const ty = rect.top + rect.height / 2

    // Start below the target (same X, lower Y)
    const sx = tx
    const sy = ty + distanceY

    // Build cursor element — inline SVG arrow, ~48px
    const cursor = document.createElement('div')
    cursor.id = '__movie_cursor'
    cursor.innerHTML =
      `<svg width="48" height="48" viewBox="0 0 26 30">` +
      `<polygon points="3,2 3,26 10,20 17,29 21,25 13,18 22,11" ` +
      `fill="#fff" stroke="#222" stroke-width="1.8" stroke-linejoin="round"/></svg>`
    Object.assign(cursor.style, {
      position: 'fixed',
      zIndex: '10002',
      pointerEvents: 'none',
      left: '0px',
      top: '0px',
      filter: 'drop-shadow(2px 3px 4px rgba(0,0,0,0.45))',
    })
    // Position by transform (hotspot at ~top-left of SVG)
    cursor.style.transform = `translate(${sx - 6}px, ${sy - 4}px)`
    document.body.appendChild(cursor)

    const proxy = { x: sx, y: sy, scale: 1 }

    return new Promise(resolve => {
      // Phase 1: move up to target
      gsap.to(proxy, {
        x: tx, y: ty,
        duration: duration * 0.75 / 1000,
        ease: 'power2.inOut',
        onUpdate: () => {
          cursor.style.transform =
            `translate(${proxy.x - 6}px, ${proxy.y - 4}px) scale(${proxy.scale})`
        },
        onComplete: () => {
          // Phase 2: click — shrink + trigger real DOM click
          if (clickTarget) clickTarget.click()
          gsap.to(proxy, {
            scale: 0.65,
            duration: 0.1,
            yoyo: true,
            repeat: 1,
            ease: 'power2.out',
            onUpdate: () => {
              cursor.style.transform =
                `translate(${proxy.x - 6}px, ${proxy.y - 4}px) scale(${proxy.scale})`
            },
            onComplete: () => {
              // Phase 3: fade out
              gsap.to(cursor, {
                opacity: 0,
                duration: 0.25,
                onComplete: () => {
                  cursor.remove()
                  resolve()
                },
              })
            },
          })
        },
      })
    })
  }, { selector, duration, distanceY, doClick })

  // Wait for animation plus a small buffer
  await page.waitForTimeout(duration + 300)
}

/** Click an element by its id */
export function clickById(page, id) {
  return page.evaluate((id) => document.getElementById(id)?.click(), id)
}

/**
 * Show a pulsing red circle on an element, then animate a large mouse cursor
 * moving up from below to click the button.
 *
 * If magnifyToolbar is active, both the circle and cursor target the magnified button.
 *
 * @param {object} page      Playwright page
 * @param {string} selector  CSS selector (e.g. '[data-testid="toolbar-export"]')
 * @param {string} [label='']  Optional label text below the circle
 * @param {number} [duration=3000]  Total animation duration in ms (min 2000).
 *   Internally allocated: ~25% circle pulse, ~75% cursor animation.
 * @param {object} [opts={}]   { cursorDuration, cursorDistanceY = 120, cursorSize = 48 }
 *   cursorDuration overrides the computed cursor movement speed.
 */
export async function clickWithHighlight(page, selector, label = '', duration = 3000, opts = {}) {
  const { magnifyToolbar: doMagnify = true, cursorDistanceY = 120, cursorSize = 48 } = opts

  if (doMagnify) {
    await magnifyToolbar(page, { targetSelector: selector })
    await page.waitForTimeout(500)
  }

  // Enforce minimum 2 seconds
  duration = Math.max(2000, duration)

  // ── Proportional time allocation ──
  // Total budget = pulseMs + transitionWait(250) + cursorWait(cursorDuration + 600)
  //              = pulseMs + cursorDuration + 850
  const pulseMs = Math.min(Math.round(duration * 0.4), 1500)
  const computedCursorDuration = Math.max(400, duration - pulseMs - 850)

  const { cursorDuration = computedCursorDuration } = opts

  await page.evaluate(({ selector, label }) => {
    // If magnifier is active, highlight the button in the magnified clone
    const magnifier = document.getElementById('movie-toolbar-magnifier')
    const el = magnifier
      ? magnifier.querySelector(selector)
      : document.querySelector(selector)
    if (!el) return
    const rect = el.getBoundingClientRect()

    // Scale circle size with the magnifier's zoom so it fits the enlarged button
    const zoom = magnifier ? parseFloat(magnifier.dataset.zoom || '1') : 1
    const r = Math.round(22 * zoom)  // base radius 22px, scaled

    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2

    let container = document.getElementById('movie-overlay-container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'movie-overlay-container'
      container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999'
      document.body.appendChild(container)
    }

    const circle = document.createElement('div')
    circle.id = '__click_highlight'
    Object.assign(circle.style, {
      position: 'absolute',
      left: `${cx - r}px`,
      top: `${cy - r}px`,
      width: `${r * 2}px`, height: `${r * 2}px`,
      borderRadius: '50%',
      border: `${Math.max(2, Math.round(3 * zoom))}px solid #ff3333`,
      background: 'rgba(255,50,50,0.2)',
      boxShadow: '0 0 12px rgba(255,0,0,0.6), inset 0 0 8px rgba(255,0,0,0.3)',
      animation: '__clickPulse 0.8s ease-in-out infinite',
      pointerEvents: 'none',
    })
    container.appendChild(circle)

    if (label) {
      const lbl = document.createElement('div')
      lbl.id = '__click_label'
      const labelSize = Math.round(Math.max(14, 15 * zoom))
      Object.assign(lbl.style, {
        position: 'absolute',
        left: `${cx}px`,
        top: `${cy + r + Math.round(8 * zoom)}px`,
        color: '#ff3333',
        fontSize: `${labelSize}px`,
        fontWeight: '700',
        fontFamily: 'sans-serif',
        textShadow: '0 0 6px rgba(0,0,0,0.7)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        transform: 'translateX(-50%)',
      })
      lbl.textContent = label
      container.appendChild(lbl)
    }

    if (!document.getElementById('__click_style')) {
      const style = document.createElement('style')
      style.id = '__click_style'
      style.textContent = `
        @keyframes __clickPulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.35); opacity: 0.4; }
        }
      `
      document.head.appendChild(style)
    }
  }, { selector, label })

  await page.waitForTimeout(pulseMs)

  // Impact animation — circle shrinks + fades, then removed
  await page.evaluate((sel) => {
    const circle = document.getElementById('__click_highlight')
    if (circle) {
      Object.assign(circle.style, {
        transition: 'transform 0.15s, opacity 0.2s',
        transform: 'scale(0.6)',
        opacity: '0',
        borderColor: '#ffffff',
        background: 'rgba(255,0,0,0.5)',
        boxShadow: '0 0 20px rgba(255,0,0,0.8)',
        animation: 'none',
      })
    }
    const lbl = document.getElementById('__click_label')
    if (lbl) { lbl.style.transition = 'opacity 0.2s'; lbl.style.opacity = '0' }
  }, selector)

  await page.waitForTimeout(250)
  await page.evaluate(() => {
    document.getElementById('__click_highlight')?.remove()
    document.getElementById('__click_label')?.remove()
  })

  // ── Cursor animation: appears below, moves up, clicks ──
  await page.evaluate(({ selector, cursorDuration, cursorDistanceY, cursorSize }) => {
    const magnifier = document.getElementById('movie-toolbar-magnifier')
    const el = magnifier
      ? magnifier.querySelector(selector)
      : document.querySelector(selector)
    if (!el) return

    const clickTarget = document.querySelector(selector)  // original for real click
    const gsap = window.__gsap
    const rect = el.getBoundingClientRect()
    const tx = rect.left + rect.width / 2
    const ty = rect.top + rect.height / 2

    const sx = tx
    const sy = ty + cursorDistanceY

    const s = cursorSize
    const cursor = document.createElement('div')
    cursor.id = '__movie_cursor'
    cursor.innerHTML =
      `<svg width="${s}" height="${s}" viewBox="0 0 26 30">` +
      `<polygon points="3,2 3,26 10,20 17,29 21,25 13,18 22,11" ` +
      `fill="#fff" stroke="#222" stroke-width="1.8" stroke-linejoin="round"/></svg>`
    Object.assign(cursor.style, {
      position: 'fixed', zIndex: '10002', pointerEvents: 'none',
      left: '0px', top: '0px',
      filter: 'drop-shadow(2px 3px 4px rgba(0,0,0,0.45))',
      opacity: '0',
    })
    cursor.style.transform = `translate(${sx - s * 0.12}px, ${sy - s * 0.08}px)`
    document.body.appendChild(cursor)

    const proxy = { x: sx, y: sy, scale: 1 }

    // Fade in cursor
    gsap.to(cursor, { opacity: 1, duration: 0.2 })

    // Phase 1: move up to target
    gsap.to(proxy, {
      x: tx, y: ty,
      duration: cursorDuration * 0.75 / 1000,
      ease: 'power2.inOut',
      delay: 0.2,
      onUpdate: () => {
        cursor.style.transform =
          `translate(${proxy.x - s * 0.12}px, ${proxy.y - s * 0.08}px) scale(${proxy.scale})`
      },
      onComplete: () => {
        // Phase 2: click — shrink + trigger real click + fade out
        if (clickTarget) clickTarget.click()
        gsap.to(proxy, {
          scale: 0.65, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.out',
          onUpdate: () => {
            cursor.style.transform =
              `translate(${proxy.x - s * 0.12}px, ${proxy.y - s * 0.08}px) scale(${proxy.scale})`
          },
          onComplete: () => {
            gsap.to(cursor, {
              opacity: 0, duration: 0.25,
              onComplete: () => cursor.remove(),
            })
          },
        })
      },
    })
  }, { selector, cursorDuration, cursorDistanceY, cursorSize })

  // Wait for cursor animation + click effect
  await page.waitForTimeout(cursorDuration + 600)

  if (doMagnify) {
    await removeMagnifyToolbar(page)
  }
}

/** Export current scene to GLB or STL.
 *  Returns { base64, byteLength, format } — base64 string of the binary file content. */
export function exportModel(page, format = 'glb') {
  return page.evaluate((format) => window.__exportModel(format), format)
}

/** Export current scene and write to disk. `outPath` is relative to the movie directory. */
export async function saveExportedModel(page, format, outPath) {
  const absPath = join(moviesDir, outPath)
  mkdirSync(dirname(absPath), { recursive: true })
  const result = await exportModel(page, format)
  const buf = Buffer.from(result.base64, 'base64')
  writeFileSync(absPath, buf)
  console.log(`[saveExportedModel] ${(buf.length / 1024).toFixed(1)} KB → ${outPath}`)
  return result
}

/** Set a <select> element's value and fire its change event.
 *  value supports '1.5;2' orientation syntax. */
export function setSelectValue(page, id, value) {
  value = resolveOrientParam(value, _currentIsLandscape)
  return page.evaluate(({ id, val }) => {
    const el = document.getElementById(id)
    if (el) { el.value = val; el.dispatchEvent(new Event('change')) }
  }, { id, val: value })
}

/** Post a 3d-viewer command (fire-and-forget).
 *  params values support '1.5;2' orientation syntax. */
export function postMessage(page, { id, command, params }) {
  params = resolveOrientParams(params, _currentIsLandscape)
  return page.evaluate((m) => window.postMessage(m, '*'), { type: '3d-viewer', ...{ id, command, params } })
}

/** Post a 3d-viewer command and wait for a matching response.
 *  params and timeout support '1.5;2' orientation syntax. */
export function postMessageAndWait(page, { id, command, params, expectedCommand = command, timeout = 5000 }) {
  params = resolveOrientParams(params, _currentIsLandscape)
  timeout = resolveOrientParam(timeout, _currentIsLandscape)
  return page.evaluate(async ({ id, command, params, expectedCommand, timeout }) => {
    return new Promise((resolve, reject) => {
      const handler = (e) => {
        if (e.data?.type === '3d-viewer' && e.data.command === expectedCommand && e.data.status) {
          window.removeEventListener('message', handler)
          resolve(e.data)
        }
      }
      window.addEventListener('message', handler)
      window.postMessage({ type: '3d-viewer', id, command, params }, '*')
      setTimeout(() => {
        window.removeEventListener('message', handler)
        reject(new Error(`${command} timeout`))
      }, timeout)
    })
  }, { id, command, params, expectedCommand, timeout })
}

/** Clear scene and load a model by path relative to project root.
 *  @param {object} [opts={}] - Additional params passed to loadModel (e.g. { AutoRotate: true }).
 *     String params support 'left:top' orientation syntax (':' separates landscape/portrait).
 *     Set `resetCanvas: false` to keep the current model in the scene.
 *  @param {number} [timeout=10000]
 */
export async function loadModel(page, modelPath, opts = {}, timeout = 60000) {
  // Resolve ':' as orientation separator for string entry params
  const resolved = {}
  let resetCanvas = true
  for (const [k, v] of Object.entries(opts)) {
    if (k === 'resetCanvas') {
      resetCanvas = !!v
      continue
    }
    if (typeof v === 'string') {
      const idx = v.indexOf(':')
      if (idx !== -1) {
        resolved[k] = _currentIsLandscape ? v.slice(0, idx).trim() : v.slice(idx + 1).trim()
      } else {
        resolved[k] = v
      }
    } else {
      resolved[k] = v
    }
  }
  // Fade 动画不改变相机视角，剥离摄像机相关参数
  if (resolved.entryAnim === 'fade') {
    delete resolved.entryDir
    delete resolved.entryZoomDist
    delete resolved.entryZoomEndDist
    delete resolved.entrySlideDist
    delete resolved.entryTargetShiftY
  }
  await page.evaluate((doReset) => {
    const s = document.createElement('style')
    s.id = '__movie_hide_drop'
    s.textContent = '.pointer-events-none { display: none !important; }'
    document.head.appendChild(s)
    if (doReset) window.__modelStore.getState().reset()
  }, resetCanvas)
  // Electron: use absolute path for loadFile command
  const absPath = resolve(modelPath)
  const loadFileParams = { filePath: absPath }
  const entryKeys = ['entryAnim', 'entryDir', 'entryDuration', 'entryZoomDist', 'entryZoomEndDist', 'entrySlideDist', 'entryTargetShiftY', 'entryEase']
  for (const key of entryKeys) {
    if (resolved[key] != null) loadFileParams[key] = resolved[key]
  }
  const result = await page.evaluate(async (p) => {
    return window.__executeCommand('loadFile', p)
  }, loadFileParams)
  if (result?.status === 'error') {
    throw new Error(`Failed to load model: ${result.error}`)
  }
  // Wait for loading to complete
  await waitForModel(page)
}

/** Clear the scene, optionally for a specific model file.
 *  All paths play animation first, then cleanup.
 *  @param {string} [target] - File path to unload (e.g. 'movies/p2/1.stl'). Omit to clear all.
 *  @param {object} [opts={}] - Animation options. See ViewportContainer.tsx entryAnim overrides:
 *     { type, duration, ease, direction, zoomDist, ... }.
 *     Default: { type: 'fade', duration: 2000, ease: 'power2.out' }.
 */
export async function unloadModel(page, target, opts = {}) {
  if (typeof target !== 'string') {
    opts = target ?? {}
    target = undefined
  }

  const { type = 'fade', duration = 2000, ease = 'power2.out', ...animOpts } = opts

  if (target) {
    // Per-file: only fade the target file's materials, then removeLoadedFile
    await page.evaluate(async ({ path, duration, ease }) => {
      const gsap = window.__gsap
      const store = window.__modelStore
      const state = store?.getState()
      const fileName = path.split('/').pop() || path
      const file = state?.loadedFiles.find(f => f.filePath === path || f.filePath === fileName)
      if (!file) return

      // Collect materials from the file's model group via __modelGroupMap
      const group = window.__modelGroupMap?.get(file.id)
      const mats = new Set()
      if (group) {
        group.traverse(obj => {
          if (obj.isMesh && obj.material) {
            const m = obj.material
            ;(Array.isArray(m) ? m : [m]).forEach(mm => mats.add(mm))
          }
        })
      }
      if (mats.size === 0) return

      const arr = [...mats]
      const proxy = { opacity: 1 }
      return new Promise(resolve => {
        gsap.to(proxy, {
          opacity: 0,
          duration: duration / 1000,
          ease,
          onUpdate: () => arr.forEach(m => { m.transparent = true; m.opacity = proxy.opacity }),
          onComplete: resolve,
        })
      })
    }, { path: target, duration, ease })

    await page.waitForTimeout(100)
    await page.evaluate((path) => {
      const fileName = path.split('/').pop() || path
      const store = window.__modelStore
      const state = store?.getState()
      if (!state) return
      const file = state.loadedFiles.find(f => f.filePath === path || f.filePath === fileName)
      if (file) state.removeLoadedFile(file.id)
    }, target)
    return
  }

  // All clear: scene-level fade, then reset
  await page.evaluate(async ({ duration, ease, ...rest }) => {
    const fn = window.__triggerEntryAnimation
    if (fn) await fn({ ...rest, type: 'fade', duration, ease, reverse: true })
  }, { duration, ease, ...animOpts })

  await page.waitForTimeout(100)
  await page.evaluate(() => {
    const s = document.createElement('style')
    s.id = '__movie_hide_drop'
    s.textContent = '.pointer-events-none { display: none !important; }'
    document.head.appendChild(s)
    window.__modelStore?.getState()?.reset()
  })
}

/**
 * Move model by NDC screen coordinates, animated via GSAP.
 * @param {number|string} ndcX - NDC X (-1..1). String with ':' splits as landscape:portrait.
 * @param {number|string} ndcY - NDC Y (-1..1). String with ':' splits as landscape:portrait.
 * @param {number} duration - Animation duration in ms
 * @param {string} [target] - File path to move. Omit to move all/__model__.
 */
export async function moveModelToScreenNdc(page, ndcX, ndcY, duration, target) {
  if (typeof ndcX === 'string') {
    const idx = ndcX.indexOf(':')
    if (idx !== -1) {
      ndcX = _currentIsLandscape ? ndcX.slice(0, idx).trim() : ndcX.slice(idx + 1).trim()
    }
    ndcX = Number(ndcX)
  }
  if (typeof ndcY === 'string') {
    const idx = ndcY.indexOf(':')
    if (idx !== -1) {
      ndcY = _currentIsLandscape ? ndcY.slice(0, idx).trim() : ndcY.slice(idx + 1).trim()
    }
    ndcY = Number(ndcY)
  }
  await page.evaluate(async ({ ndcX, ndcY, duration, target }) => {
    const THREE = window.__THREE
    const gsap = window.__gsap
    const api = window.__viewerAPI
    const camera = window.__r3f_dev?.camera
    const controls = window.__r3f_dev?.controls
    if (!camera || !controls) return

    const center = controls.target.clone()
    const viewDir = new THREE.Vector3()
    camera.getWorldDirection(viewDir)
    const right = new THREE.Vector3().crossVectors(viewDir, camera.up).normalize()
    const up = new THREE.Vector3().crossVectors(right, viewDir).normalize()

    const dist = camera.position.distanceTo(center)
    let halfW, halfH
    if (camera instanceof THREE.PerspectiveCamera) {
      const hf = camera.fov * Math.PI / 360
      halfH = dist * Math.tan(hf)
      halfW = halfH * camera.aspect
    }

    const offset = right.clone().multiplyScalar(ndcX * halfW)
      .add(up.clone().multiplyScalar(ndcY * halfH))

    // Resolve part IDs to move
    let partIds
    if (typeof target === 'string') {
      const store = window.__modelStore
      const file = store?.getState().loadedFiles.find(f => f.filePath === target)
      if (file) partIds = file.glbPartInfos.map(p => p.partId)
    }
    if (!partIds || partIds.length === 0) partIds = ['__model__']

    const proxy = {}
    partIds.forEach(id => {
      const part = api.getPartProxy(id)
      if (part) proxy[id] = { x: part.position.x, y: part.position.y, z: part.position.z }
    })
    if (Object.keys(proxy).length === 0) return

    return new Promise(resolve => {
      const dummy = { t: 0 }
      gsap.to(dummy, {
        t: 1,
        duration: duration / 1000,
        ease: 'power2.inOut',
        onUpdate: () => {
          for (const [id, p] of Object.entries(proxy)) {
            api.setPartTransform(id, {
              position: [p.x + offset.x * dummy.t, p.y + offset.y * dummy.t, p.z + offset.z * dummy.t],
            })
          }
        },
        onComplete: resolve,
      })
    })
  }, { ndcX, ndcY, duration, target })
}

/**
 * Fit camera to heatbed (OrcaSlicer algorithm). Uses window.__fitCameraToHeatbed.
 * @param {number|string} duration  - Animation duration in ms. Supports ';' orientation syntax.
 * @param {number|string} [margin]  - Margin factor override (default MARGIN_BED=2.0; smaller = bed fills more).
 *                                     Supports ';' orientation syntax, e.g. '2;1.5' for landscape/portrait.
 */
export async function fitCameraToHeatbed(page, duration, margin) {
  duration = resolveOrientParam(duration, _currentIsLandscape)
  duration = Number(duration)
  if (margin !== undefined) {
    margin = resolveOrientParam(String(margin), _currentIsLandscape)
    margin = Number(margin)
  }
  return page.evaluate(({ duration, margin }) => {
    return window.__fitCameraToHeatbed(duration, margin)
  }, { duration, margin })
}

/** Overlay helper: the container element persists between calls (created once per page). */
function overlayPosStyle(position, isLandscape) {
  const map = isLandscape
    ? {
        'top-left': 'top:50px;left:20px',
        'top-right': 'top:50px;right:20px',
        'bottom-center': 'bottom:50px;left:50%;transform:translateX(-50%)',
        'center': 'top:50%;left:50%;transform:translate(-50%,-50%)',
      }
    : {
        'top-left': 'top:80px;left:12px',
        'top-right': 'top:80px;right:12px',
        'bottom-center': 'bottom:50px;left:50%;transform:translateX(-50%)',
        'center': 'top:50%;left:50%;transform:translate(-50%,-50%)',
      }
  return map[position] || map['top-right']
}

/** Overlay helper: ensure the persistent container exists. */
function ensureOverlayContainer(page) {
  return page.evaluate(() => {
    if (document.getElementById('movie-overlay-container')) return
    const c = document.createElement('div')
    c.id = 'movie-overlay-container'
    c.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999'
    document.body.appendChild(c)
  })
}

/**
 * Capture screenshots for both landscape and portrait orientations.
 * Generates {prefix}_h.png and {prefix}_v.png using the current size preset.
 * Temporarily resizes viewport for the second orientation, then restores.
 * @param {object} page    Playwright page
 * @param {string} prefix  File path prefix (e.g. 'screenshots/foo' → foo_h.png, foo_v.png)
 */
export async function screenshot(page, prefix) {
  const suffix = _currentIsLandscape ? '_h' : '_v'
  const path = `${prefix}${suffix}.png`
  await page.screenshot({ path, type: 'png' })
  console.log(`[screenshot] captured → ${path}`)
}

/**
 * Capture a screenshot during recording to use as video cover.
 * 约定大于配置：自动保存为 {genDir}/{scriptName}_cover.png。
 * genDir 和 scriptName 由 makeMovie 自动设置（见 `_genDir`, `_scriptName`）。
 * 每个代码文件只准调用一次。
 * @param {object} page  Playwright page
 */
export async function captureCover(page) {
  if (!_genDir) {
    console.error('[cover] makeMovie must be called before captureCover')
    return null
  }
  const projectDir = dirname(_genDir)
  const projectName = basename(projectDir)
  const orient = _currentIsLandscape ? 'h' : 'v'
  const outputPath = join(_genDir, `${projectName}_cover_${orient}.png`)
  await page.screenshot({ path: outputPath, type: 'png' })
  const kb = existsSync(outputPath) ? Math.round(statSync(outputPath).size / 1024) : 0
  console.log(`[cover] captured → ${outputPath} (${kb} KB)`)
  return outputPath
}

/**
 * Show an overlay label at a fixed screen position.
 * The overlay persists until hideOverlay / clearOverlays is called.
 * @param {string}  id        Unique overlay identifier (replaces existing with same id)
 * @param {string}  content   Text content to display
 * @param {string}  [position='top-right']  Slot: top-left, top-right, bottom-center, center
 * @param {string}  [extraStyle='']         Additional CSS (e.g. 'color:#fff;font-size:18px')
 */
export function showOverlay(page, id, content, position = 'top-right', extraStyle = '') {
  return page.evaluate(({ id, content, posStyle, extraStyle }) => {
    let container = document.getElementById('movie-overlay-container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'movie-overlay-container'
      container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999'
      document.body.appendChild(container)
    }
    const existing = container.querySelector(`[data-overlay-id="${id}"]`)
    if (existing) existing.remove()
    const el = document.createElement('div')
    el.dataset.overlayId = id
    el.style.cssText = `position:absolute;${posStyle};padding:8px 14px;border-radius:8px;background:rgba(0,0,0,0.3);backdrop-filter:blur(8px);color:#ffd700;font-size:14px;font-weight:600;font-family:sans-serif;white-space:nowrap;transition:opacity .2s;${extraStyle}`
    el.textContent = content
    container.appendChild(el)
  }, { id, content, posStyle: overlayPosStyle(position, _currentIsLandscape), extraStyle })
}

/** Remove a specific overlay by id. */
export function hideOverlay(page, id) {
  return page.evaluate((id) => {
    document.querySelector(`[data-overlay-id="${id}"]`)?.remove()
  }, id)
}

/** Remove all overlays (including the container). */
export function clearOverlays(page) {
  return page.evaluate(() => {
    document.getElementById('movie-overlay-container')?.remove()
  })
}

export async function recordOne(electronApp, page, viewport, suffix, pageFn, recordDir, entryDuration, modelPath, ttsTiming, viewerParams) {
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[browser:error]', msg.text())
  })

  // Resize the actual Electron BrowserWindow (not just CDP viewport emulation)
  const bwHandle = await electronApp.browserWindow(page)
  await bwHandle.evaluate((bw, { width, height }) => {
    bw.setContentSize(width, height)
  }, { width: viewport.width, height: viewport.height })
  await page.setViewportSize(viewport)

  // Wait for app to be ready (canvas + executeCommand + modelStore)
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.waitForFunction(() => typeof (window).__executeCommand === 'function', { timeout: 15000 })
  await page.waitForFunction(() => typeof (window).__modelStore?.getState === 'function', { timeout: 15000 })

  // Diagnostic: check actual OS-level window size
  const bwCheck = await bwHandle.evaluate((bw) => ({
    bounds: bw.getBounds(),
    contentSize: bw.getContentSize(),
  }))
  console.log(`[${suffix}] BrowserWindow: bounds=${JSON.stringify(bwCheck.bounds)} contentSize=${JSON.stringify(bwCheck.contentSize)}`)

  // Set orientation context so all lib functions auto-resolve '1.5;2' syntax
  _currentIsLandscape = viewport.width > viewport.height
  majorAxis = _currentIsLandscape ? 'x' : 'y'
  minorAxis = _currentIsLandscape ? 'y' : 'x'

  // Apply viewerParams to stores (mirrors what web version does via URL params)
  if (viewerParams) {
    await page.evaluate((vp) => {
      const store = window.__engineStore?.getState?.()
      if (!store) return
      if (vp.movie_mode === '1' || vp.movie_mode === true) {
        store.setMovieMode(true)
        store.setControlsEnabled(false)
      }
      if (vp.AutoRotate != null) {
        store.setAutoRotate(vp.AutoRotate === '1' || vp.AutoRotate === 'true' || vp.AutoRotate === true)
      }
      if (vp.shadowFloorEnabled != null) {
        const val = vp.shadowFloorEnabled === '1' || vp.shadowFloorEnabled === 'true' || vp.shadowFloorEnabled === true
        store.setShadowFloorEnabled(val)
      }
    }, viewerParams)
    // Optional panel control: closeLeftPanel / closeRightPanel / enablePreview (script-controllable, supports ';' syntax)
    const closeLeft = viewerParams.closeLeftPanel != null &&
      (viewerParams.closeLeftPanel === '1' || viewerParams.closeLeftPanel === 'true' || viewerParams.closeLeftPanel === true)
    const closeRight = viewerParams.closeRightPanel != null &&
      (viewerParams.closeRightPanel === '1' || viewerParams.closeRightPanel === 'true' || viewerParams.closeRightPanel === true)
    const noPreview = viewerParams.enablePreview === '0' || viewerParams.enablePreview === 'false' || viewerParams.enablePreview === false
    const uiPatch = {}
    if (closeLeft) uiPatch.leftPanelOpen = false
    if (closeRight) uiPatch.rightPanelOpen = false
    if (noPreview) uiPatch.enablePreview = false
    if (Object.keys(uiPatch).length > 0) {
      await page.evaluate((patch) => {
        window.__uiStore?.setState?.(patch)
      }, uiPatch)
      await page.waitForTimeout(300)
    }
  }

  const tPageOpen = Date.now()
  console.log(`[${suffix}] Loading model: ${modelPath}`)

  // Build loadFile params including entry animation config
  const loadFileParams = { filePath: modelPath }
  if (viewerParams) {
    const entryKeys = ['entryAnim', 'entryDir', 'entryDuration', 'entryZoomDist', 'entryZoomEndDist', 'entrySlideDist', 'entryTargetShiftY', 'entryEase']
    for (const key of entryKeys) {
      if (viewerParams[key] != null) loadFileParams[key] = viewerParams[key]
    }
    // Fade 动画不改变相机视角，剥离摄像机相关参数
    if (viewerParams.entryAnim === 'fade') {
      delete loadFileParams.entryDir
      delete loadFileParams.entryZoomDist
      delete loadFileParams.entryZoomEndDist
      delete loadFileParams.entrySlideDist
      delete loadFileParams.entryTargetShiftY
    }
  }
  // Load model via executeCommand（复用 Phase 1 的 loadFile IPC）
  const loadResult = await page.evaluate(async (fp) => {
    return window.__executeCommand('loadFile', fp)
  }, loadFileParams)
  if (loadResult?.status === 'error') {
    throw new Error(`Failed to load model: ${loadResult.error}`)
  }
  console.log(`[${suffix}] Model loaded: ${loadResult?.data?.fileName}`)

  const tPageFn = Date.now()
  const { trimStart, tModelBrowser } = await startRecording(page, tPageOpen, entryDuration)

  // Inject TTS timing before pageFn runs (consumed by syncpoint())
  if (ttsTiming) {
    await page.evaluate((timing) => {
      window.__ttsTiming = timing
      window.__ttsGroupIndex = 0
    }, ttsTiming)
  }

  await pageFn(page, suffix, tPageOpen)

  // 收集 syncpoint 时间戳
  const rawSPs = await page.evaluate(() => {
    const sps = window.__movieSyncPoints
    window.__movieSyncPoints = []  // cleanup
    window.__ttsTiming = undefined  // cleanup
    return sps || []
  })
  const syncpoints = rawSPs.map(t => (t - tModelBrowser) / 1000)

  let pageFnDuration = Date.now() - tPageFn

  // ── Implicit syncpoint: extend video to match total TTS duration ──
  if (ttsTiming) {
    const requiredEnd = ttsTiming.ttsTotal * 1000
    if (pageFnDuration < requiredEnd) {
      const waitMs = Math.round(requiredEnd - pageFnDuration)
      console.log(`  [syncpoint implicit] Extending video by ${(waitMs / 1000).toFixed(2)}s for TTS total alignment...`)
      await page.waitForTimeout(waitMs)
      pageFnDuration = Date.now() - tPageFn
    }

    const diff = (pageFnDuration - ttsTiming.ttsTotal * 1000) / 1000
    if (Math.abs(diff) > 1.0) {
      const which = diff > 0 ? 'video longer' : 'audio longer'
      console.log(`  [syncpoint total] ${which} by ${Math.abs(diff).toFixed(2)}s (video=${(pageFnDuration / 1000).toFixed(2)}s, tts=${ttsTiming.ttsTotal.toFixed(2)}s)`)
    }
  }

  const rawPath = await page.video()?.path()
  return { rawPath, trimStart, pageFnDuration, syncpoints }
}

// Electron 可执行文件路径（可覆盖：ELECTRON_EXE env var）
function getElectronExePath() {
  if (process.env.ELECTRON_EXE) return process.env.ELECTRON_EXE
  return join(rootDir, 'dist', 'win-unpacked', '3D_Viewer.exe')
}

export async function makeMovie(scriptUrl, modelPath, viewerParams, pageFn, outputDir) {
  const scriptPath = fileURLToPath(scriptUrl)
  const scriptName = basename(scriptPath, extname(scriptPath))
  const outDir = outputDir || join(dirname(scriptPath), 'gen')
  _genDir = outDir
  _scriptName = scriptName
  mkdirSync(outDir, { recursive: true })

  // Resolve model path (absolute path needed for Electron IPC)
  const absModelPath = resolve(modelPath)

  // ── Pre-generate TTS timing before recording ──
  const ttsTimingPath = join(outDir, `${scriptName}.tts-timing.json`)
  const forceTts = process.argv.slice(2).includes('-f') || process.argv.slice(2).includes('--force')
  const ttsProvider = resolveTtsProvider()
  const ttsArgs = ['movies/pregen-tts.mjs', scriptPath]
  if (forceTts) ttsArgs.push('--force')
  if (ttsProvider) ttsArgs.push('--tts', ttsProvider)
  const r = spawnSync('node', ttsArgs, { stdio: 'inherit', timeout: 600000 })
  if (r.status !== 0) process.exit(r.status ?? 1)

  let ttsTiming = null
  if (existsSync(ttsTimingPath)) {
    ttsTiming = JSON.parse(readFileSync(ttsTimingPath, 'utf-8'))
    console.log(`TTS timing: ${ttsTiming.groups.length} groups, total ${ttsTiming.ttsTotal.toFixed(2)}s`)
  }

  // ── Check if all orientations' webm are up-to-date vs source + timing ──
  if (!(process.argv.slice(2).includes('-f') || process.argv.slice(2).includes('--force'))) {
    const checkPreset = resolveSizePreset()
    const checkOrientationFilter = resolveOrientationFilter()
    const checkOrientations = checkOrientationFilter !== 'both'
      ? checkPreset.orientations.filter(o => o.suffix === `_${checkOrientationFilter}`)
      : checkPreset.orientations
    const srcMtime = statSync(scriptPath).mtimeMs
    const timingMtime = existsSync(ttsTimingPath) ? statSync(ttsTimingPath).mtimeMs : 0
    const allCached = checkOrientations.every(({ suffix }) => {
      const webmPath = join(outDir, `${scriptName}${suffix}.webm`)
      if (!existsSync(webmPath)) return false
      return statSync(webmPath).mtimeMs >= srcMtime && statSync(webmPath).mtimeMs >= timingMtime
    })
    if (allCached) {
      console.log(`\n✓ Video up-to-date for ${scriptName} — skipping recording`)
      return
    }
  }

  const preset = resolveSizePreset()
  console.log(`Size preset: ${preset.label} (${preset.orientations.map(o => `${o.width}×${o.height}`).join(', ')})`)

  const orientationFilter = resolveOrientationFilter()
  const orientations = orientationFilter !== 'both'
    ? preset.orientations.filter(o => o.suffix === `_${orientationFilter}`)
    : preset.orientations

  const results = []

  // ── 每个方向独立启动 Electron（recordVideo 绑定在 launch 参数上）──
  for (const { width, height, suffix } of orientations) {
    const isLandscape = width > height
    const viewport = { width, height }

    // Resolve orientation-sensitive params
    const resolvedParams = {}
    for (const [key, value] of Object.entries(viewerParams)) {
      resolvedParams[key] = resolveOrientParam(value, isLandscape)
    }
    const resolvedEntryDuration = resolvedParams.entryDuration ? parseInt(resolvedParams.entryDuration, 10) : 2000

    console.log(`[${suffix}] Launching Electron (${width}×${height})...`)
    const electronApp = await electron.launch({
      executablePath: getElectronExePath(),
      args: ['--no-sandbox', '--disable-gpu-shader-disk-cache', '--force-device-scale-factor=1'],
      env: { ...process.env, E2E: '1', MOVIE_MODE: '1', MOVIE_VIEWPORT_WIDTH: String(width), MOVIE_VIEWPORT_HEIGHT: String(height) },
      recordVideo: { dir: outDir, size: viewport },
    })
    const page = await electronApp.firstWindow()

    try {
      const result = await recordOne(electronApp, page, viewport, suffix, pageFn, outDir, resolvedEntryDuration, absModelPath, ttsTiming, resolvedParams)
      result.suffix = suffix
      results.push(result)
    } catch (err) {
      console.error(`\n[${suffix}] Recording FAILED: ${err.message}`)
      if (err.stack) console.error(`[${suffix}] Stack:\n${err.stack}`)
      try { await electronApp.close() } catch {}
      process.exit(1)
    }

    await electronApp.close()
  }

  // Write syncpoints from first orientation
  const allSyncpoints = results[0]?.syncpoints || []
  if (allSyncpoints.length > 0) {
    const spPath = join(outDir, `${scriptName}.syncpoints.json`)
    writeFileSync(spPath, JSON.stringify(allSyncpoints) + '\n')
    console.log(`Syncpoints: ${spPath} (${allSyncpoints.length} points)`)
  }

  // ── FFmpeg trim（与 Web 端完全一致）──
  for (const { suffix, rawPath, trimStart, pageFnDuration } of results) {
    if (!rawPath || !existsSync(rawPath)) {
      console.error(`\n[${suffix}] No recorded video found — recording produced no output file`)
      process.exit(1)
    }

    const outputVideo = join(outDir, `${scriptName}${suffix}.webm`)
    const tempVideo = outputVideo.replace(/\.\w+$/, '.tmp$&')

    console.log(`[${suffix}] Trimming (start=${(trimStart / 1000).toFixed(2)}s, duration=${(pageFnDuration / 1000).toFixed(2)}s)...`)
    const r2 = spawnSync('ffmpeg', [
      '-y',
      '-ss', (trimStart / 1000).toFixed(2),
      '-i', rawPath,
      '-t', (pageFnDuration / 1000).toFixed(2),
      '-c:v', 'libvpx-vp9',
      '-b:v', '8M',
      '-pix_fmt', 'yuv420p',
      tempVideo,
    ], { stdio: 'pipe' })
    if (r2.status === 0) {
      if (existsSync(outputVideo)) rmSync(outputVideo, { force: true })
      renameSync(tempVideo, outputVideo)
      const mb = (readFileSync(outputVideo).length / 1024 / 1024).toFixed(2)
      console.log(`  ${basename(outputVideo)} (${mb} MB)`)
    } else {
      const stderr = r2.stderr ? r2.stderr.toString() : '(no stderr output)'
      console.error(`\n  FFmpeg trim FAILED (exit code ${r2.status}):`)
      console.error(stderr.slice(-2000))
      process.exit(1)
    }

    if (existsSync(rawPath)) rmSync(rawPath)
  }

  console.log('Done!')
}

// ──────────────────────────────────────────────
// renderVideo — 核心渲染：scale+pad + ASS 字幕 + 混音
// ──────────────────────────────────────────────

function probe(path) {
  const r = spawnSync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json',
    '-show_streams', '-show_format', path,
  ], { stdio: 'pipe', timeout: 15000 })
  if (r.status !== 0) return null
  return JSON.parse(r.stdout.toString())
}

function hasAudio(path) {
  const info = probe(path)
  return !!info?.streams?.some(s => s.codec_type === 'audio')
}

function clipExists(path) {
  try {
    return existsSync(path) && readFileSync(path).length > 0
  } catch { return false }
}

// ── ASS 基准样式（1920×1080 横屏为 reference）──
const BASE_STYLE = {
  fontName:       'Microsoft YaHei',
  fontSize:       52,
  primaryColour:  '&H00FFFFFF',
  secondaryColour:'&H000000FF',
  outlineColour:  '&H00000000',
  backColour:     '&H80000000',
  outline:        2.5,
  shadow:         0.5,
  marginL:        60,
  marginR:        60,
  marginV:        80,
}

/** 秒数 → ASS 时间格式 H:MM:SS.cc */
function toAssTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const c = Math.round((seconds % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

/**
 * Build ASS karaoke text from word boundary data.
 *
 * Word boundaries from edge-tts have offset/duration in 100-ns ticks.
 * Each word maps to a {\k<cs>} segment where cs = centiseconds the karaoke
 * fill pauses on that segment before advancing.
 *
 * Text between matched words (e.g. ((...)) display-only prefix) is wrapped in
 * color overrides to remain white regardless of karaoke fill state. Falls back
 * to character-level proportional distribution if word text cannot be located.
 */
function buildKaraokeAssText(displayText, words, lineDurationSeconds) {
  const totalTicks = words.reduce((max, w) => Math.max(max, w.offset + w.duration), 0)
  if (totalTicks <= 0) return displayText
  const lineCs = Math.round(lineDurationSeconds * 100)

  // Non-karaoke text (e.g. ((...)) display-only prefix) — switch to Default
  // style (white, no karaoke fill), then back to Karaoke style for \k-tagged words.
  const wrapStatic = (s) => `{\\rDefault}${s}{\\rKaraoke}`

  // Strategy 1: match word texts sequentially in display text
  let result = ''
  let searchPos = 0
  let allMatched = true

  for (const w of words) {
    const durCs = Math.round((w.duration / totalTicks) * lineCs)
    const idx = displayText.indexOf(w.text, searchPos)
    if (idx >= 0) {
      if (idx > searchPos) {
        result += wrapStatic(displayText.slice(searchPos, idx))
      }
      result += `{\\k${durCs}}${w.text}`
      searchPos = idx + w.text.length
    } else {
      allMatched = false
      break
    }
  }

  if (allMatched) {
    if (searchPos < displayText.length) {
      result += wrapStatic(displayText.slice(searchPos))
    }
    return result
  }

  // Strategy 2: character-level proportional fallback
  const chars = [...displayText]
  const totalChars = chars.length
  result = ''
  let charIdx = 0
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const prop = w.duration / totalTicks
    const durCs = Math.round(prop * lineCs)
    const nChars = Math.round(prop * totalChars)
    const actualChars = Math.min(nChars, totalChars - charIdx)
    if (actualChars > 0) {
      result += `{\\k${durCs}}${chars.slice(charIdx, charIdx + actualChars).join('')}`
      charIdx += actualChars
    }
  }
  // Trailing characters are still spoken text — keep as plain (no \k tag)
  // so they render in the Karaoke style's default colors. Do NOT wrapStatic here.
  if (charIdx < totalChars) {
    result += chars.slice(charIdx).join('')
  }
  return result
}

/**
 * 从 .subtitle JSON 生成临时 ASS 文件。
 * PlayRes 匹配目标分辨率，样式参数按几何平均 sqrt(scaleX * scaleY) 等比缩放。
 * @param {string} subtitlePath - .subtitle 文件的绝对路径
 * @param {number} targetW
 * @param {number} targetH
 * @returns {string} 临时 ASS 文件路径
 */
function buildAss(subtitlePath, targetW, targetH) {
  const data = JSON.parse(readFileSync(subtitlePath, 'utf-8'))
  const seg = data.segments[0]
  if (!seg || !seg.entries || seg.entries.length === 0) return null

  const REF_W = 1920
  const REF_H = 1080
  const scaleX = targetW / REF_W
  const scaleY = targetH / REF_H
  // 几何平均：同 preset 下横竖屏字号一致，等比缩放时等价于 scaleX(=scaleY)
  const scale = Math.sqrt(scaleX * scaleY)

  const s = (v) => Math.max(1, Math.round(v * scale))
  // ASS karaoke: Primary=已读（黄色高亮填充）, Secondary=未读（白色）
  // 非 karaoke 行使用 Default 样式，不受影响
  const karaokeStyle = `Style: Karaoke,${BASE_STYLE.fontName},${s(BASE_STYLE.fontSize)},&H0000FFFF,${BASE_STYLE.primaryColour},${BASE_STYLE.outlineColour},${BASE_STYLE.backColour},0,0,0,0,100,100,0,0,1,${s(BASE_STYLE.outline)},${s(BASE_STYLE.shadow)},2,${s(BASE_STYLE.marginL)},${s(BASE_STYLE.marginR)},${s(BASE_STYLE.marginV)},1`
  const normalStyle = `Style: Default,${BASE_STYLE.fontName},${s(BASE_STYLE.fontSize)},${BASE_STYLE.primaryColour},${BASE_STYLE.secondaryColour},${BASE_STYLE.outlineColour},${BASE_STYLE.backColour},0,0,0,0,100,100,0,0,1,${s(BASE_STYLE.outline)},${s(BASE_STYLE.shadow)},2,${s(BASE_STYLE.marginL)},${s(BASE_STYLE.marginR)},${s(BASE_STYLE.marginV)},1`

  // KARAOKE_TTS_PROVIDERS env var: empty → force-disable all karaoke
  // (safety net for old subtitle files that may have words data)
  const karaokeDisabled = process.env.KARAOKE_TTS_PROVIDERS === ''

  const dialogueLines = seg.entries.map(e => {
    const text = e.t.replace(/\\n/g, '\\N')
    if (!karaokeDisabled && e.words && e.words.length > 0) {
      const karaokeText = buildKaraokeAssText(text, e.words, e.e - e.s)
      return `Dialogue: 0,${toAssTime(e.s)},${toAssTime(e.e)},Karaoke,,0,0,0,,${karaokeText}`
    }
    return `Dialogue: 0,${toAssTime(e.s)},${toAssTime(e.e)},Default,,0,0,0,,${text}`
  }).join('\n')

  const assContent = `[Script Info]
Title: auto-generated subtitles
ScriptType: v4.00+
Collisions: Normal
PlayResX: ${targetW}
PlayResY: ${targetH}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${normalStyle}
${karaokeStyle}
 
 [Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogueLines}
`

  const tempPath = join(dirname(subtitlePath), `.ass_${basename(subtitlePath, '.subtitle')}_${targetW}x${targetH}.ass`)
  writeFileSync(tempPath, assContent)
  return tempPath
}

/**
 * Render video: scale+pad clips, burn ASS subtitles, mix audio.
 *
 * audioVoice — TTS 配音（音量 1.0）
 * audioBg    — 背景音乐（音量 0.5）
 * 二者至少提供一个即有音轨。同时提供时自动混音。
 */
export function renderVideo({ clips, subtitlePath, audioVoice, audioBg, output, targetW, targetH, fps, coverPng }) {
  const rel = (p) => relative(process.cwd(), p).replace(/\\/g, '/')
  let existing = clips.filter(clipExists)
  if (existing.length === 0) {
    console.error('  No input files found, skipping')
    return false
  }

  // ── Cover: generate a temp 1-frame clip and prepend ──
  let coverCleanup = null
  if (coverPng && existsSync(coverPng)) {
    const coverClip = join(dirname(output), `.cover_tmp_${basename(output)}`)
    const r = spawnSync('ffmpeg', [
      '-y', '-loop', '1', '-i', coverPng,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-vf', `scale=${targetW}:${targetH},fps=${fps}`,
      '-frames:v', '1',
      coverClip,
    ], { stdio: 'pipe', timeout: 30000 })
    if (r.status === 0 && existsSync(coverClip) && statSync(coverClip).size > 0) {
      existing = [coverClip, ...existing]
      coverCleanup = coverClip
      console.log(`  Cover: ${coverPng} → 1-frame clip prepended`)
    } else {
      console.error(`  Cover: ffmpeg failed to create 1-frame clip`)
    }
  }

  const hasVoice = audioVoice && clipExists(audioVoice)
  const hasBg = audioBg && clipExists(audioBg)

  // ── 25→30fps speed-up: setpts video + atempo audio ──
  const SOURCE_FPS = 25
  const needSpeedChange = Math.abs(fps - SOURCE_FPS) > 0.1
  const speedPTS = needSpeedChange ? `setpts=${(SOURCE_FPS / fps).toFixed(4)}*PTS,` : ''
  const speedAudio = needSpeedChange ? `atempo=${(fps / SOURCE_FPS).toFixed(4)},` : ''
  if (needSpeedChange) {
    console.log(`  Speed-up: ${SOURCE_FPS}→${fps}fps (${(fps / SOURCE_FPS).toFixed(2)}×)`)
  }

  const extraInputs = []
  if (hasVoice) extraInputs.push(audioVoice)
  if (hasBg) extraInputs.push(audioBg)
  const allInputs = [...existing, ...extraInputs]

  const filterParts = []

  const videoLabels = existing.map((_, i) => `v${i}`)
  const hasCoverPrepended = !!coverCleanup
  for (let i = 0; i < existing.length; i++) {
    // Cover clip is already target resolution + fps — skip fps filter (drops 1-frame inputs)
    const isCover = hasCoverPrepended && i === 0
    const chain = isCover
      ? `[0:v]setpts=PTS-STARTPTS[${videoLabels[i]}]`
      : `[${i}:v]${speedPTS}scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,`
        + `pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[${videoLabels[i]}]`
    filterParts.push(chain)
  }
  const concatV = `[${videoLabels.join('][')}]concat=n=${existing.length}:v=1:a=0[rawv]`
  filterParts.push(concatV)

  // 字幕：.subtitle → buildAss → temp ASS
  let assCleanup = null
  if (subtitlePath && existsSync(subtitlePath)) {
    const tempAss = buildAss(subtitlePath, targetW, targetH)
    if (tempAss) {
      filterParts.push(`[rawv]ass='${rel(tempAss)}'[finalv]`)
      assCleanup = tempAss
    }
  }

  const audioSources = []
  for (let i = 0; i < existing.length; i++) {
    if (hasAudio(existing[i])) {
      const lbl = `ca${audioSources.length}`
      filterParts.push(`[${i}:a]${speedAudio}aresample=48000[${lbl}]`)
      audioSources.push(lbl)
    }
  }
  if (hasVoice) {
    const voiceIdx = existing.length
    const lbl = 'voice'
    filterParts.push(`[${voiceIdx}:a]${speedAudio}volume=1.0,aresample=48000[${lbl}]`)
    audioSources.push(lbl)
  }
  if (hasBg) {
    const bgIdx = existing.length + (hasVoice ? 1 : 0)
    const lbl = 'bg'
    filterParts.push(`[${bgIdx}:a]${speedAudio}volume=0.1,aresample=48000[${lbl}]`)
    audioSources.push(lbl)
  }

  let audioFilterEnd = null
  if (audioSources.length > 0) {
    const mixInput = audioSources.map(l => `[${l}]`).join('')
    const method = audioSources.length === 1 ? 'anull' : `amix=inputs=${audioSources.length}:duration=first`
    filterParts.push(`${mixInput}${method},aformat=channel_layouts=stereo[outa]`)
    audioFilterEnd = 'outa'
  }

  const filterComplex = filterParts.join(';')

  const hasSubtitle = subtitlePath && existsSync(subtitlePath)
  const videoLabel = hasSubtitle ? 'finalv' : 'rawv'
  const args = ['-y', ...allInputs.flatMap(f => ['-i', f]),
    '-filter_complex', filterComplex,
    '-map', `[${videoLabel}]`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p',
  ]
  if (audioFilterEnd) {
    args.push('-map', `[${audioFilterEnd}]`, '-c:a', 'aac', '-b:a', '192k')
  }
  if (hasBg) args.push('-shortest')
  const tempOutput = output.replace(/\.\w+$/, '.tmp$&')
  args.push('-movflags', '+faststart', tempOutput)

  console.log(`  Inputs: ${existing.join(', ')}`)
  if (hasVoice) console.log(`  AudioVoice: ${audioVoice}`)
  if (hasBg) console.log(`  AudioBg: ${audioBg}`)
  if (audioFilterEnd) console.log(`  Audio: ${audioSources.length} source(s)`)
  console.log(`  Output: ${output}`)

  const r = spawnSync('ffmpeg', args, { stdio: 'pipe', timeout: 300000 })
  const errStr = r.stderr ? r.stderr.toString() : (r.error ? r.error.message : 'unknown error')

  // Clean up temp files
  if (coverCleanup) {
    try { rmSync(coverCleanup, { force: true }) } catch {}
  }
  if (assCleanup) {
    try { rmSync(assCleanup, { force: true }) } catch {}
  }

  if (r.status === 0) {
    // Atomically replace output — old file survives until this point
    try {
      if (existsSync(output)) rmSync(output, { force: true })
      renameSync(tempOutput, output)
      console.log(`  Saved: ${output} (${(readFileSync(output).length / 1024 / 1024).toFixed(2)} MB)`)
      return true
    } catch (e) {
      console.error(`  Failed to rename temp output:`, e.message)
      return false
    }
  } else {
    try { rmSync(tempOutput, { force: true }) } catch {}
    const errLines = errStr.split('\n')
    console.error(`  FFmpeg exit code ${r.status}, last stderr lines:`)
    console.error(errLines.slice(-10).join('\n'))
    return false
  }
}

export const DEFAULT_BGM = join(moviesDir, 'alex-productions-acoustic-folk-friends.wav')

/**
 * burnVideo — 烧录视频（字幕+音频），按约定推导路径。
 *
 * 字幕来自 {scriptDir}/gen/{scriptName}.subtitle，由 generate-subtitle.mjs 生成。
 *   subtitle:  {scriptDir}/gen/{scriptName}.subtitle
 *   video:     {genDir}/{scriptName}_{h|v}.webm
 *   audioVoice:{genDir}/{scriptName}.mp3
 *   output:    {genDir}/{scriptName}_burn_{h|v}.mp4
 *
 * audioBg: 共享 {moviesDir}/alex-productions-acoustic-folk-friends.wav
 */
export function burnVideo(scriptUrl, genDir) {
  const scriptName = basename(fileURLToPath(scriptUrl), '.mjs')
  const scriptDir = dirname(fileURLToPath(scriptUrl))
  const cwd = process.cwd()
  const rel = (p) => relative(cwd, p).replace(/\\/g, '/')
  const useDefaultBg = process.argv.slice(2).includes('--default-bg')
  const audioBg = useDefaultBg ? rel(DEFAULT_BGM) : null
  const targetFps = resolve30fps() ? 30 : 25

  const preset = resolveSizePreset()
  const orientationFilter = resolveOrientationFilter()
  const orientations = orientationFilter !== 'both'
    ? preset.orientations.filter(o => o.suffix === `_${orientationFilter}`)
    : preset.orientations

  const force = process.argv.slice(2).includes('-f') || process.argv.slice(2).includes('--force')

  for (const { width, height, suffix } of orientations) {
    const clip = rel(join(genDir, `${scriptName}${suffix}.webm`))
    const subtitlePath = join(genDir, `${scriptName}.subtitle`)
    const audioVoice = rel(join(genDir, `${scriptName}.mp3`))
    const output = rel(join(genDir, `${scriptName}_burn${suffix}.mp4`))

    // ── Check if burned mp4 is up-to-date vs webm + subtitle + mp3 ──
    if (!force && existsSync(output)) {
      const outputMtime = statSync(output).mtimeMs
      const upstreamMtimes = [
        [clip, join(genDir, `${scriptName}${suffix}.webm`)],
        [subtitlePath, subtitlePath],
        [audioVoice, join(genDir, `${scriptName}.mp3`)],
      ].filter(([, p]) => existsSync(p)).map(([, p]) => statSync(p).mtimeMs)
      if (upstreamMtimes.length > 0 && outputMtime >= Math.max(...upstreamMtimes)) {
        console.log(`\n=== ${width}×${height} ===`)
        console.log(`✓ Burn up-to-date for ${scriptName}${suffix} — skipping`)
        continue
      }
    }

    console.log(`\n=== ${width}×${height} ===`)
    const ok = renderVideo({
      clips: [clip], audioVoice, audioBg, output,
      subtitlePath: existsSync(subtitlePath) ? subtitlePath : null,
      targetW: width, targetH: height, fps: targetFps,
    })
    if (!ok) {
      console.error(`\n  Burn FAILED for ${suffix}`)
      process.exit(1)
    }
  }
  console.log('\nDone!')
}
