import type { TelemetryEvent } from './events'
import { getAnonymousId, isOptedOut, setOptedOut, isNoticeShown, markNoticeShown } from './config'
import { getSystemMeta } from './system'
import { sendBatch, hasTransport } from './Transport'
import { useModelStore } from '@/stores/model-store'
import { useEngineStore } from '@/stores/engine-store'
import { useMaterialStore } from '@/stores/material-store'
import { useAnimationStore } from '@/stores/animation-store'
import { useUIStore } from '@/stores/ui-store'

const FLUSH_INTERVAL_MS = 1_000
const NOTICE = '[3D Viewer] 匿名使用统计已开启，帮助我们改进产品。\n不收集个人身份信息、文件内容或模型数据。\n可在「设置」中随时关闭。'

const env = () => (window as any).env || {}

let initialized = false
let dataRegion: string | null = null
const deployMode = 'electron'
let agentRuntime: string | undefined
let anonymousId: string | null = null
const queue: TelemetryEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let systemMeta: Record<string, string> = {}
const fileLoadTimestamps = new Map<string, number>()

function shouldTrack(): boolean {
  if (!dataRegion) return false
  if (env().DEV) return false
  if (navigator.doNotTrack === '1') return false
  if (isOptedOut()) return false
  return true
}

function showNoticeOnce(): void {
  if (isNoticeShown()) return
  console.info(NOTICE)
  markNoticeShown()
}

function flush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (queue.length === 0) return
  if (!dataRegion) return

  const batch = queue.splice(0)
  sendBatch(dataRegion, batch)
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
}

export function initTelemetry(): void {
  if (initialized) return
  initialized = true

  dataRegion = env().DATA_REGION
  if (!dataRegion) return

  agentRuntime = env().AGENT

  if (!shouldTrack()) return

  const transportReady = hasTransport(dataRegion)
  if (transportReady) {
    anonymousId = getAnonymousId()
    systemMeta = getSystemMeta(navigator.language)

    // Async version fetch
    try {
      window.electronAPI.getAppVersion().then((v: string) => {
        systemMeta.readable_version = v
      }).catch(() => {})
    } catch { /* electronAPI unavailable outside Electron */ }

    showNoticeOnce()

    trackEvent('app_start', {})

    subscribeStores()

    window.addEventListener('pagehide', flush, { capture: true })
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }
}

export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  if (!initialized || !dataRegion || !shouldTrack() || !hasTransport(dataRegion)) return
  if (!anonymousId) anonymousId = getAnonymousId()

  const ev: TelemetryEvent = {
    event,
    distinct_id: anonymousId,
    properties: {
      $ip: null,
      ...systemMeta,
      data_region: dataRegion,
      deployment_mode: deployMode,
      agent_runtime: agentRuntime,
      app_version: env().APP_VERSION,
      readable_version: systemMeta.readable_version,
      ...properties,
    },
    timestamp: new Date().toISOString(),
  }

  queue.push(ev)
  scheduleFlush()
}

function subscribeStores(): void {
  let prevFilesLen = useModelStore.getState().loadedFiles.length

  useModelStore.subscribe((state) => {
    const files = state.loadedFiles
    if (files.length > prevFilesLen) {
      const added = files[files.length - 1]
      if (added) {
        const name = added.fileName || added.filePath || ''
        const format = added.filePath?.split('.').pop()?.toLowerCase() || 'unknown'
        const startTs = fileLoadTimestamps.get(name) || 0
        fileLoadTimestamps.delete(name)
        trackEvent('file_load_end', {
          format,
          file_size: added.buffer?.byteLength || 0,
          duration_ms: startTs ? Date.now() - startTs : undefined,
          triangle_count: added.glbPartInfos?.reduce((s, p) => s + (p.triangleCount || 0), 0) || 0,
        })
      }
    } else if (files.length < prevFilesLen) {
      const removed = prevFilesLen - files.length
      trackEvent('file_remove', { count: removed })
    }
    prevFilesLen = files.length
  })

  let prevEnv = useEngineStore.getState().selectedEnv
  useEngineStore.subscribe((state) => {
    if (state.selectedEnv !== prevEnv) {
      trackEvent('env_change', { preset: state.selectedEnv || undefined })
      prevEnv = state.selectedEnv
    }
  })

  let prevPlaying = useAnimationStore.getState().isPlaying
  useAnimationStore.subscribe((state) => {
    if (state.isPlaying && !prevPlaying) {
      trackEvent('animation_play', {
        fps: state.clips?.[state.currentIndex]?.name || undefined,
        duration: state.duration || undefined,
      })
    }
    prevPlaying = state.isPlaying
  })

  let prevMatKeys = Object.keys(useMaterialStore.getState().materialOverrides).length
  useMaterialStore.subscribe((state) => {
    const keys = Object.keys(state.materialOverrides)
    if (keys.length > prevMatKeys) {
      trackEvent('material_edit', { count: keys.length - prevMatKeys })
    }
    prevMatKeys = keys.length
  })

  let prevCamMode = useUIStore.getState().cameraMode
  useUIStore.subscribe((state) => {
    if (state.cameraMode !== prevCamMode) {
      trackEvent('view_mode_change', { mode: state.cameraMode })
      prevCamMode = state.cameraMode
    }
  })
}

export function setTelemetryEnabled(enabled: boolean): void {
  setOptedOut(!enabled)
}
