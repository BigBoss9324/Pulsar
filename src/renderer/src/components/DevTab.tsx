import { useState, useEffect, useRef, useCallback } from 'react'
import type { AppStatus, AppSettings, HistoryItem } from '../types'
import styles from './DevTab.module.css'

interface Props {
  version: string
  status: AppStatus
  showToast: (msg: string, type: string) => void
}

function getPlatformInfo() {
  const ua = navigator.userAgent
  const electron = ua.match(/Electron\/([\d.]+)/)?.[1] ?? '—'
  const chrome = ua.match(/Chrome\/(\d+)/)?.[1] ?? '—'
  return { platform: navigator.platform, electron, chrome }
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DevTab({ version, status, showToast }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [historyStats, setHistoryStats] = useState<{ count: number; totalBytes: number; latest: string | null } | null>(null)
  const [ytdlpVersion, setYtdlpVersion] = useState<string | null>(null)
  const [queueState, setQueueState] = useState<unknown[] | null>(null)
  const [logContent, setLogContent] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement>(null)
  const platform = getPlatformInfo()

  const refreshHistory = () => {
    window.api.getHistory().then((items: HistoryItem[]) => {
      const totalBytes = items.reduce((sum, item) => sum + (item.fileSize ?? 0), 0)
      setHistoryStats({ count: items.length, totalBytes, latest: items[0]?.completedAt ?? null })
    }).catch(() => {})
  }

  const refreshQueue = useCallback(() => {
    window.api.getQueueState().then(setQueueState).catch(() => {})
  }, [])

  const refreshLog = useCallback(() => {
    window.api.readLog(120).then(setLogContent).catch(() => {})
  }, [])

  useEffect(() => {
    window.api.getAppSettings().then(setSettings).catch(() => {})
    window.api.getYtdlpVersion().then(setYtdlpVersion).catch(() => {})
    refreshHistory()
    refreshQueue()
    refreshLog()
  }, [refreshQueue, refreshLog])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logContent])

  const runtimeFacts = [
    { label: 'Mode',      value: import.meta.env.MODE },
    { label: 'Renderer',  value: 'electron-vite' },
    { label: 'Status',    value: status.message },
    { label: 'Version',   value: version || 'unknown' },
    { label: 'yt-dlp',   value: ytdlpVersion ?? '…' },
    { label: 'Platform',  value: platform.platform },
    { label: 'Electron',  value: platform.electron },
    { label: 'Chrome',    value: platform.chrome },
  ]

  return (
    <section className={styles.devTab}>
      <div className={`card ${styles.hero}`}>
        <div className={styles.heroBadge}>Development only</div>
        <h2 className={styles.title}>Dev tools surface</h2>
        <p className={styles.copy}>
          This tab is only rendered while running <code>npm run dev</code>, so we can keep quick diagnostics handy
          without shipping them in production.
        </p>
      </div>

      <div className={styles.grid}>
        <div className={`card ${styles.panel}`}>
          <h3 className={styles.panelTitle}>Runtime</h3>
          <div className={styles.kvList}>
            {runtimeFacts.map((fact) => (
              <div className={styles.kvRow} key={fact.label}>
                <span className="muted">{fact.label}</span>
                <code>{fact.value}</code>
              </div>
            ))}
          </div>
        </div>

        <div className={`card ${styles.panel}`}>
          <h3 className={styles.panelTitle}>Notes</h3>
          <ul className={styles.noteList}>
            <li>Use this area for temporary QA helpers and local-only controls.</li>
            <li>Production builds will not show the tab or its contents.</li>
            <li>The gate is controlled by <code>import.meta.env.DEV</code>.</li>
          </ul>
        </div>

        <div className={`card ${styles.panel}`}>
          <h3 className={styles.panelTitle}>Toast tester</h3>
          <div className={styles.buttonRow}>
            <button className="btn btn-secondary btn-sm" onClick={() => showToast('Success toast fired', 'success')}>
              Success
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => showToast('Error toast fired', 'error')}>
              Error
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => showToast('Info toast fired', '')}>
              Info
            </button>
          </div>
        </div>

        <div className={`card ${styles.panel}`}>
          <h3 className={styles.panelTitle}>Quick actions</h3>
          <div className={styles.buttonRow}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => window.api.openAppDataFolder().catch(() => {})}
            >
              App data
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => window.api.cancelDownload().catch(() => {})}
            >
              Cancel DL
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() =>
                window.api.clearHistory().then(() => {
                  setHistoryStats({ count: 0, totalBytes: 0, latest: null })
                  showToast('History cleared', 'success')
                }).catch(() => {})
              }
            >
              Clear history
            </button>
          </div>
          <div className={styles.actionDivider} />
          <div className={styles.buttonRow}>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => window.api.wipeAndUninstall().catch(() => {})}
            >
              Wipe data &amp; uninstall
            </button>
          </div>
        </div>

        <div className={`card ${styles.panel}`}>
          <h3 className={styles.panelTitle}>History</h3>
          <div className={styles.kvList}>
            <div className={styles.kvRow}>
              <span className="muted">Items</span>
              <code>{historyStats?.count ?? '—'}</code>
            </div>
            <div className={styles.kvRow}>
              <span className="muted">Total size</span>
              <code>{historyStats != null ? formatBytes(historyStats.totalBytes) : '—'}</code>
            </div>
            <div className={styles.kvRow}>
              <span className="muted">Latest</span>
              <code>{historyStats?.latest ? new Date(historyStats.latest).toLocaleDateString() : '—'}</code>
            </div>
          </div>
        </div>

        <div className={`card ${styles.panel}`}>
          <h3 className={styles.panelTitle}>Settings</h3>
          {settings ? (
            <pre className={styles.jsonDump}>{JSON.stringify(settings, null, 2)}</pre>
          ) : (
            <span className="muted">Loading…</span>
          )}
        </div>

        <div className={`card ${styles.panel}`}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Queue</h3>
            <button className="btn btn-ghost btn-sm" onClick={refreshQueue}>Refresh</button>
          </div>
          {queueState == null ? (
            <span className="muted">Loading…</span>
          ) : queueState.length === 0 ? (
            <span className="muted">Queue is empty</span>
          ) : (
            <pre className={styles.jsonDump}>{JSON.stringify(queueState, null, 2)}</pre>
          )}
        </div>

        <div className={`card ${styles.panel} ${styles.fullSpan}`}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Log</h3>
            <button className="btn btn-ghost btn-sm" onClick={refreshLog}>Refresh</button>
          </div>
          {logContent == null ? (
            <span className="muted">Loading…</span>
          ) : logContent === '' ? (
            <span className="muted">Log file is empty</span>
          ) : (
            <pre className={styles.logDump} ref={logRef}>{logContent}</pre>
          )}
        </div>
      </div>
    </section>
  )
}
