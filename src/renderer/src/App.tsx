import { useState, useEffect, useRef, useCallback } from 'react'
import type { AppStatus, HistoryItem, AppSettings, AppUpdateInfo } from './types'
import DownloadTab from './components/DownloadTab'
import DevTab from './components/DevTab'
import HistoryTab from './components/HistoryTab'
import SettingsModal from './components/SettingsModal'
import styles from './App.module.css'
import './index.css'

type Tab = 'download' | 'history' | 'dev'
type RedownloadRequest = { nonce: number; item: HistoryItem } | null

export default function App() {
  const [status, setStatus] = useState<AppStatus>({ type: 'info', message: 'Initializing...' })
  const [version, setVersion] = useState('')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const isDev = import.meta.env.DEV || Boolean(settings?.enableDevMode)
  const [tab, setTab] = useState<Tab>('download')
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [redownloadRequest, setRedownloadRequest] = useState<RedownloadRequest>(null)
  const [updatePrompt, setUpdatePrompt] = useState<AppUpdateInfo | null>(null)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const showToast = useCallback((msg: string, type: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    window.api.getCurrentStatus().then(setStatus).catch(() => {})
    return window.api.onStatus((d) => setStatus(d))
  }, [])

  useEffect(() => {
    window.api.getAppVersion().then(setVersion).catch(() => {})
    window.api.getAppSettings().then(setSettings).catch(() => {})
  }, [])

  useEffect(() => {
    return window.api.onToast(({ message, type }) => showToast(message, type))
  }, [showToast])

  useEffect(() => {
    return window.api.onUpdateAvailable((info) => {
      setDownloadingUpdate(false)
      setUpdatePrompt(info)
    })
  }, [])

  const onDownloadComplete = useCallback(() => {
    setHistoryKey((k) => k + 1)
  }, [])

  const handleRedownload = useCallback((item: HistoryItem) => {
    setTab('download')
    setRedownloadRequest({ nonce: Date.now(), item })
    showToast('Added to queue from history', 'success')
  }, [showToast])

  const saveSettings = useCallback(async (next: AppSettings) => {
    const saved = await window.api.saveAppSettings(next)
    setSettings(saved)
    showToast('Settings saved', 'success')
  }, [showToast])

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!isDev && tab === 'dev') setTab('download')
  }, [isDev, tab])

  const startAppUpdate = useCallback(async () => {
    setDownloadingUpdate(true)
    try {
      await window.api.downloadAppUpdate()
      setUpdatePrompt(null)
    } catch {
      setDownloadingUpdate(false)
      showToast('Unable to start the update download', 'error')
    }
  }, [showToast])

  const updateVersionLabel = updatePrompt
    ? updatePrompt.prerelease
      ? `v${updatePrompt.version} Beta`
      : `v${updatePrompt.version}`
    : ''

  return (
    <div className={styles.root}>
      <div className={styles.titlebarDrag} />

      <header className={styles.header}>
        <div className={styles.logoRow}>
          <PulsarLogo />
          <span className={styles.appName}>Pulsar</span>
        </div>
        <nav className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'download' ? styles.tabActive : ''}`}
            onClick={() => setTab('download')}
          >
            Download
          </button>
          <button
            className={`${styles.tab} ${tab === 'history' ? styles.tabActive : ''}`}
            onClick={() => setTab('history')}
          >
            History
          </button>
          {isDev && (
            <button
              className={`${styles.tab} ${tab === 'dev' ? styles.tabActive : ''}`}
              onClick={() => setTab('dev')}
            >
              Dev
            </button>
          )}
        </nav>
        <div className={styles.statusGroup}>
          <div className={styles.menuWrap} ref={menuRef}>
            <button
              className={`btn btn-ghost btn-sm ${styles.menuButton}`}
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              title="More options"
            >
              More
            </button>
            {menuOpen && (
              <div className={styles.menuPanel} role="menu">
                <button
                  className={styles.menuItem}
                  onClick={() => {
                    setSettingsOpen(true)
                    setMenuOpen(false)
                  }}
                >
                  Settings
                </button>
                <button
                  className={styles.menuItem}
                  onClick={() => {
                    navigator.clipboard.writeText(version ? `Pulsar v${version}` : 'Pulsar').catch(() => {})
                    showToast('Version copied', 'success')
                    setMenuOpen(false)
                  }}
                >
                  Copy version
                </button>
                <button
                  className={styles.menuItem}
                  onClick={async () => {
                    await window.api.checkForUpdates().catch(() => {})
                    showToast('Checking for updates', '')
                    setMenuOpen(false)
                  }}
                >
                  Check for updates
                </button>
                <button
                  className={styles.menuItem}
                  onClick={async () => {
                    await window.api.openExternalUrl('https://github.com/BigBoss9324/Pulsar/releases').catch(() => {})
                    setMenuOpen(false)
                  }}
                >
                  View releases
                </button>
                <button
                  className={styles.menuItem}
                  onClick={async () => {
                    await window.api.openAppDataFolder().catch(() => {})
                    setMenuOpen(false)
                  }}
                >
                  Open app data
                </button>
              </div>
            )}
          </div>
          {version && <span className={styles.version}>v{version}</span>}
          <StatusBadge status={status} />
        </div>
      </header>

      <main className={styles.main}>
        <section className={tab === 'download' ? styles.panelActive : styles.panelHidden}>
          {settings && (
            <DownloadTab
              appReady={status.type === 'ready'}
              redownloadRequest={redownloadRequest}
              settings={settings}
              showToast={showToast}
              onDownloadComplete={onDownloadComplete}
            />
          )}
        </section>
        {tab === 'history' && settings && (
          <HistoryTab
            key={historyKey}
            showToast={showToast}
            onRedownload={handleRedownload}
            defaultOutputDir={settings.defaultOutputDir}
          />
        )}
        {tab === 'dev' && <DevTab version={version} status={status} showToast={showToast} />}
      </main>

      <footer className={styles.footer}>
        <span className={styles.footerText}>Pulsar{version ? ` v${version}` : ''}</span>
        <span className={styles.footerDivider} aria-hidden="true">&bull;</span>
        <span className={styles.footerText}>Multi-service video and music downloader</span>
        <span className={styles.footerDivider} aria-hidden="true">&bull;</span>
        <button
          className={styles.footerLink}
          onClick={() => window.api.openExternalUrl('https://github.com/BigBoss9324/Pulsar/releases').catch(() => {})}
        >
          Releases
        </button>
      </footer>

      {toast && (
        <div
          className={`${styles.toast} ${
            toast.type === 'success' ? styles.toastSuccess : toast.type === 'error' ? styles.toastError : ''
          }`}
        >
          {toast.msg}
        </div>
      )}

      {settingsOpen && settings && (
        <SettingsModal settings={settings} onClose={() => setSettingsOpen(false)} onSave={saveSettings} />
      )}

      {updatePrompt && (
        <div className={styles.updateOverlay}>
          <div className={styles.updateDialog}>
            <div className={styles.updateEyebrow}>Update available</div>
            <div className={styles.updateTitleRow}>
              <div className={styles.updateTitle}>
                {updatePrompt.releaseName || `Pulsar ${updateVersionLabel}`}
              </div>
              <span className={updatePrompt.prerelease ? styles.updateBadgeBeta : styles.updateBadgeStable}>
                {updatePrompt.prerelease ? 'Pre-release / Beta' : 'Stable'}
              </span>
            </div>
            <div className={styles.updateMeta}>
              Version {updateVersionLabel}
              {updatePrompt.releaseDate ? ` · ${new Date(updatePrompt.releaseDate).toLocaleDateString()}` : ''}
            </div>
            {updatePrompt.releaseNotes && (
              <div className={styles.updateNotes}>
                {updatePrompt.releaseNotes}
              </div>
            )}
            <div className={styles.updateActions}>
              <button className="btn btn-secondary" onClick={() => setUpdatePrompt(null)} disabled={downloadingUpdate}>
                Stay on current version
              </button>
              <button className="btn btn-primary" onClick={() => void startAppUpdate()} disabled={downloadingUpdate}>
                {downloadingUpdate ? 'Starting download...' : 'Update now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: AppStatus }) {
  const isLoading = status.type === 'info'
  const cls =
    status.type === 'ready' ? styles.badgeReady
    : status.type === 'error' ? styles.badgeError
    : styles.badgeInfo
  return (
    <span className={`${styles.badge} ${cls}`}>
      {isLoading && <span className={styles.badgeSpinner} aria-hidden="true" />}
      {status.message}
    </span>
  )
}

function PulsarLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="1" y="11" width="3.5" height="6" rx="1.75" fill="#8b5cf6" opacity="0.5" />
      <rect x="6" y="7" width="3.5" height="14" rx="1.75" fill="#8b5cf6" opacity="0.7" />
      <rect x="11" y="2" width="3.5" height="24" rx="1.75" fill="#8b5cf6" />
      <rect x="16" y="7" width="3.5" height="14" rx="1.75" fill="#8b5cf6" opacity="0.7" />
      <rect x="21" y="11" width="3.5" height="6" rx="1.75" fill="#8b5cf6" opacity="0.5" />
    </svg>
  )
}
