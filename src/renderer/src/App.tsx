import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import type { AppStatus, HistoryItem, AppSettings, AppUpdateInfo, AppBuildInfo } from './types'
import DownloadTab from './components/DownloadTab'
import DevTab from './components/DevTab'
import HistoryTab from './components/HistoryTab'
import SettingsModal from './components/SettingsModal'

// Optional Discord integration — omit the folder to exclude from a build
const _discordMod = import.meta.glob('./components/discord bot integration/index.ts')
const _discordKey = './components/discord bot integration/index.ts'
const hasDiscord = _discordKey in _discordMod
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DiscordTab = hasDiscord ? lazy(_discordMod[_discordKey] as any) : null
import Button from './components/Button'
import styles from './App.module.css'
import './index.css'
import { renderReleaseNotes } from './utils/renderReleaseNotes'

type Tab = 'download' | 'history' | 'discord' | 'dev'
type RedownloadRequest = { nonce: number; items: HistoryItem[] } | null

export default function App() {
  const [status, setStatus] = useState<AppStatus>({ type: 'info', message: 'Initializing...' })
  const [version, setVersion] = useState('')
  const [buildInfo, setBuildInfo] = useState<AppBuildInfo | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const isDev = import.meta.env.DEV || Boolean(settings?.enableDevMode)
  const [tab, setTab] = useState<Tab>('download')
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [redownloadRequest, setRedownloadRequest] = useState<RedownloadRequest>(null)
  const [updatePrompt, setUpdatePrompt] = useState<AppUpdateInfo | null>(null)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    window.api.getAppBuildInfo().then((info) => {
      setBuildInfo(info)
      setVersion(info.version)
    }).catch(() => {
      window.api.getAppVersion().then(setVersion).catch(() => {})
    })
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

  const handleRedownload = useCallback((items: HistoryItem[]) => {
    setTab('download')
    setRedownloadRequest({ nonce: Date.now(), items })
    showToast(items.length === 1 ? 'Added to queue from history' : `Added ${items.length} items to queue`, 'success')
  }, [showToast])

  const saveSettings = useCallback(async (next: AppSettings) => {
    const saved = await window.api.saveAppSettings(next)
    setSettings(saved)
    showToast('Settings saved', 'success')
  }, [showToast])

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
  const isDevMode = import.meta.env.DEV || Boolean(buildInfo?.isDevBuild)
  const showBetaBadge = !isDevMode && /(?:^|[-.])(beta|alpha|rc)(?:[-.\d]|$)/i.test(version)
  const displayVersion = buildInfo?.displayVersion ?? version

  const copyVersion = useCallback(() => {
    navigator.clipboard.writeText(displayVersion ? `Pulsar v${displayVersion}` : 'Pulsar').catch(() => {})
    showToast('Version copied', 'success')
  }, [displayVersion, showToast])

  const checkForUpdates = useCallback(async () => {
    await window.api.checkForUpdates().catch(() => {})
    showToast('Checking for updates', '')
  }, [showToast])

  return (
    <div className={styles.root}>
      <div className={styles.titlebarDrag} />

      <header className={styles.header}>
        <div className={styles.logoRow}>
          <PulsarLogo />
          <span className={styles.appName}>Pulsar</span>
        </div>
        <nav className={styles.tabs}>
          <Button
            variant="tab"
            active={tab === 'download'}
            onClick={() => setTab('download')}
          >
            Download
          </Button>
          <Button
            variant="tab"
            active={tab === 'history'}
            onClick={() => setTab('history')}
          >
            History
          </Button>
          {hasDiscord && (
            <Button
              variant="tab"
              active={tab === 'discord'}
              onClick={() => setTab('discord')}
            >
              Discord
            </Button>
          )}
          {isDev && (
            <Button
              variant="tab"
              active={tab === 'dev'}
              onClick={() => setTab('dev')}
            >
              Dev
            </Button>
          )}
        </nav>
        <div className={styles.statusGroup}>
          <Button
            variant="ghost"
            size="sm"
            className={styles.menuButton}
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            Settings
          </Button>
          {isDevMode && <span className={styles.devBadge}>Development Build</span>}
          {showBetaBadge && <span className={styles.betaBadge}>Beta</span>}
          <StatusBadge status={status} />
        </div>
      </header>

      <main className={`${styles.main} appScroll`}>
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
        {hasDiscord && DiscordTab && (
          <section className={tab === 'discord' ? styles.panelActive : styles.panelHidden}>
            <Suspense fallback={null}>
              <DiscordTab
                showToast={showToast}
                defaultOutputDir={settings?.defaultOutputDir}
                isDev={isDev}
              />
            </Suspense>
          </section>
        )}
        {tab === 'dev' && <DevTab version={displayVersion} status={status} showToast={showToast} />}
      </main>

      <footer className={styles.footer}>
        <span className={styles.footerText}>Pulsar{displayVersion ? ` v${displayVersion}` : ''}</span>
        <span className={styles.footerDivider} aria-hidden="true">&bull;</span>
        <span className={styles.footerText}>Multi-service video and music downloader</span>
        <span className={styles.footerDivider} aria-hidden="true">&bull;</span>
        <Button
          variant="link"
          onClick={() => window.api.openExternalUrl('https://github.com/BigBoss9324/Pulsar/releases').catch(() => {})}
        >
          Releases
        </Button>
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
        <SettingsModal
          settings={settings}
          version={version}
          displayVersion={displayVersion}
          onCheckForUpdates={checkForUpdates}
          onCopyVersion={copyVersion}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}

      {updatePrompt && (
        <div className={styles.updateOverlay}>
          <div className={`${styles.updateDialog} appScroll`}>
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
              <div className={`${styles.updateNotes} appScroll`}>
                {renderReleaseNotes(updatePrompt.releaseNotes, {
                  title: styles.updateNotesTitle,
                  heading: styles.updateNotesHeading,
                  paragraph: styles.updateNotesParagraph,
                  list: styles.updateNotesList,
                })}
              </div>
            )}
            <div className={styles.updateActions}>
              <Button variant="secondary" onClick={() => setUpdatePrompt(null)} disabled={downloadingUpdate}>
                Stay on current version
              </Button>
              <Button variant="primary" onClick={() => void startAppUpdate()} disabled={downloadingUpdate}>
                {downloadingUpdate ? 'Starting download...' : 'Update now'}
              </Button>
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
