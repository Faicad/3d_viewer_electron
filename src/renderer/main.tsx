import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useModelStore } from '@/stores/model-store'
import { useAnimationStore } from '@/stores/animation-store'
import { useMaterialStore } from '@/stores/material-store'
import { useToolStore } from '@/stores/tool-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useSvgWorkspaceStore, parseSvgViewBox, parseSvgLayers } from '@/stores/svg-workspace-store'
import { generateSvgThumbnail } from '@/lib/thumbnail-cache/thumbnailGenerator'
import { putThumbnail } from '@/lib/thumbnail-cache/thumbnailCache'
import { clearStepCache } from '@/lib/step-converter'
import { initLogger } from '@/lib/logger'
import App from './App'
import './i18n'
import './index.css'

// Suppress console.log/warn/debug/info in production
initLogger()

// Expose state for E2E test access
window.__modelStore = useModelStore
window.__animationStore = useAnimationStore
window.__materialStore = useMaterialStore
window.__toolStore = useToolStore
window.__selectionStore = useSelectionStore
window.__svgWorkspaceStore = useSvgWorkspaceStore
window.__svgFixtures = {}
window.__svgHelpers = { parseSvgViewBox, parseSvgLayers, generateSvgThumbnail, putThumbnail }
window.__errors = []
window.__clearStepCache = clearStepCache

// Global error handlers — surface errors to both console and window.__errors
window.addEventListener('error', (event) => {
  // Ignore benign ResizeObserver loop notifications
  if (event.message?.includes('ResizeObserver loop')) return
  const err = event.error
  if (err instanceof Error) {
    const detail = { message: err.message, stack: err.stack ?? '', timestamp: Date.now() }
    window.__errors.push(detail)
    console.error('[Global Error]', err.message, '\n', err.stack)
  } else {
    const detail = { message: event.message, stack: `${event.filename}:${event.lineno}:${event.colno}`, timestamp: Date.now() }
    window.__errors.push(detail)
    console.error('[Global Error]', event.message, '\n', event.filename, ':', event.lineno, ':', event.colno)
  }
})

window.addEventListener('unhandledrejection', (event) => {
  window.__errors.push({ message: String(event.reason), stack: '', timestamp: Date.now() })
  console.error('[Unhandled Promise Rejection]', event.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <TooltipProvider delayDuration={300}>
          <App />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>
)
