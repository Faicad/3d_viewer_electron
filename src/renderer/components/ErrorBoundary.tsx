import { Component } from 'react'
import { trackEvent, redactTelemetryString } from '@/telemetry'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    trackEvent('error_caught', { error_message: redactTelemetryString(error.message) })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: 'red', fontFamily: 'monospace' }}>
          <h1>Render Error</h1>
          <pre>{this.state.error.message}</pre>
          <pre>{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}
