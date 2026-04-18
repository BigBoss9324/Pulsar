import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      const err = this.state.error as Error
      return (
        <div style={{
          padding: 32,
          fontFamily: 'Consolas, monospace',
          color: '#f87171',
          background: '#0f0f0f',
          height: '100vh',
          boxSizing: 'border-box',
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Pulsar failed to start</div>
          <pre style={{ fontSize: 12, color: '#888', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {err.message}{'\n\n'}{err.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
