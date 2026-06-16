/**
 * AI Viewer API module.
 *
 * Provides:
 * - window.__viewerAPI — bridge for AI code to query/control the 3D scene
 * - window.__gsap       — GSAP library (set by main.tsx)
 * - window.__THREE      — THREE.js module (set by main.tsx)
 *
 * Usage from main.tsx:
 *   import { registerViewerAPI } from '@/ai-injection'
 *   registerViewerAPI()
 */

import { createViewerAPI } from './viewer-api'
import type { ViewerAPI } from './types'

export type { ViewerAPI, PartProxy, PartTransform } from './types'

declare global {
  interface Window {
    __viewerAPI?: ViewerAPI
    __gsap?: unknown
    __THREE?: unknown
  }
}

export function registerViewerAPI(): void {
  if (window.__viewerAPI) return

  const api = createViewerAPI()
  window.__viewerAPI = api
  ;(window as unknown as Record<string, unknown>).viewerAPI = api
}
