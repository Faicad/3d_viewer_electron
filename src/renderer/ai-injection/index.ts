/**
 * AI Code Injection module.
 *
 * Provides:
 * - window.__viewerAPI  — bridge for AI code to query/control the 3D scene
 * - window.__aiInjection — DOM injection executor (executeCode command handler)
 * - window.__gsap        — GSAP library (set by main.tsx)
 * - window.__THREE       — THREE.js module (set by main.tsx)
 *
 * Usage from main.tsx:
 *   import { registerAIInjection } from '@/ai-injection'
 *   registerAIInjection()
 */

import { createViewerAPI } from './viewer-api'
import { createAIInjection } from './inject'
import type { ViewerAPI, AIInjection } from './types'

// Re-export for use by main.tsx command handler
export { emitViewerEvents, startEventLoop } from './viewer-api'
export type { ViewerAPI, AIInjection, PartProxy, PartTransform } from './types'

declare global {
  interface Window {
    __viewerAPI?: ViewerAPI
    __aiInjection?: AIInjection
    __gsap?: unknown
    __THREE?: unknown
  }
}

export function registerAIInjection(): void {
  // Skip if already registered (HMR safety)
  if (window.__viewerAPI && window.__aiInjection) return

  const api = createViewerAPI()
  const injection = createAIInjection()

  window.__viewerAPI = api
  window.__aiInjection = injection

  // Also alias as bare 'viewerAPI' for AI code convenience (js param in executeCode)
  ;(window as unknown as Record<string, unknown>).viewerAPI = api
}
