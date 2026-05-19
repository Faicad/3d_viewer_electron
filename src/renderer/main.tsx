import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useModelStore } from '@/stores/model-store'
import App from './App'
import './i18n'
import './index.css'

// Expose store for E2E test access
window.__modelStore = useModelStore

// Global error handlers — ensure all errors are visible in console
window.addEventListener('error', (event) => {
  const err = event.error
  if (err instanceof Error) {
    console.error('[Global Error]', err.message, '\n', err.stack)
  } else {
    console.error('[Global Error]', event.message, '\n', event.filename, ':', event.lineno, ':', event.colno)
  }
})

window.addEventListener('unhandledrejection', (event) => {
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
