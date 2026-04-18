import { useState, useEffect, useRef, useCallback } from 'react'
import type { VideoInfo, QueueItem, FormatOpts, PlaylistItem, HistoryItem, AppSettings } from '../types'
import { detectUrl } from '../utils/urlDetect'
import PlaylistPicker from './PlaylistPicker'
import PathField from './PathField'
import Thumb from './Thumb'
import styles from './DownloadTab.module.css'

interface Props {
  appReady: boolean
  redownloadRequest: { nonce: number; item: HistoryItem } | null
  settings: AppSettings
  showToast: (msg: string, type: string) => void
  onDownloadComplete: () => void
}

function nanoid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function cleanError(msg: string) {
  return msg
    .replace(/^Error invoking remote method '[^']+': /, '')
    .replace(/^Error: /, '')
    .replace(/^ERROR: /, '')
}

function isValidUrl(s: string) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

function fileNameFromPath(filePath?: string) {
  if (!filePath) return ''
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || ''
}

export default function DownloadTab({ appReady, redownloadRequest, settings, showToast, onDownloadComplete }: Props) {
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [selectedFormatId, setSelectedFormatId] = useState(settings.defaultFormatId)
  const [outputDir, setOutputDir] = useState(settings.defaultOutputDir || '')
  const [filename, setFilename] = useState('')

  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [playlistTitle, setPlaylistTitle] = useState('')
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([])
  const [fetchingPlaylist, setFetchingPlaylist] = useState(false)
  const [playlistCount, setPlaylistCount] = useState(0)

  const [queue, setQueue] = useState<QueueItem[]>([])
  const [queuePaused, setQueuePaused] = useState(false)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const queueRef = useRef<QueueItem[]>([])
  const processingRef = useRef(false)
  const lastRedownloadNonceRef = useRef<number | null>(null)
  const queueLoadedRef = useRef(false)

  const urlInfo = isValidUrl(url) ? detectUrl(url) : null
  const showPlaylistBanner = urlInfo?.canBePlaylist && url.includes('list=') && !videoInfo

  useEffect(() => {
    return window.api.onProgress(({ percent, speed }) => {
      setQueue((q) => {
        const next = q.map((item) =>
          item.status === 'downloading' ? { ...item, progress: Math.max(0, percent), speed } : item,
        )
        queueRef.current = next
        return next
      })
    })
  }, [])

  useEffect(() => {
    return window.api.onPlaylistProgress(({ count }) => setPlaylistCount(count))
  }, [])

  useEffect(() => {
    window.api.getQueueState().then((items) => {
      const restored = items.map((item) => ({
        ...item,
        status: item.status === 'downloading' ? 'pending' as const : item.status,
        progress: item.status === 'done' ? item.progress : 0,
        speed: '',
      }))
      queueRef.current = restored
      setQueue(restored)
      queueLoadedRef.current = true
    }).catch(() => {
      queueLoadedRef.current = true
    })
  }, [])

  useEffect(() => {
    window.api.getHistory().then(setHistoryItems).catch(() => {})
  }, [])

  useEffect(() => {
    if (!queueLoadedRef.current) return
    window.api.saveQueueState(queue).catch(() => {})
  }, [queue])

  useEffect(() => {
    if (!outputDir && settings.defaultOutputDir) setOutputDir(settings.defaultOutputDir)
  }, [outputDir, settings.defaultOutputDir])

  const updateQueue = useCallback((fn: (q: QueueItem[]) => QueueItem[]) => {
    const next = fn(queueRef.current)
    queueRef.current = next
    setQueue([...next])
  }, [])

  const processQueue = useCallback(async () => {
    if (processingRef.current || queuePaused) return
    const next = queueRef.current.find((i) => i.status === 'pending')
    if (!next) return

    processingRef.current = true
    updateQueue((q) => q.map((i) => i.id === next.id ? { ...i, status: 'downloading', progress: 0, speed: '' } : i))

    try {
      const result = await window.api.download({
        url: next.url,
        format: next.format,
        outputDir: next.outputDir,
        filename: next.filename,
        downloader: next.downloader,
      })
      updateQueue((q) => q.map((i) => i.id === next.id ? {
        ...i,
        status: 'done',
        progress: 100,
        outputPath: result.outputPath,
        fileSize: result.fileSize,
      } : i))
      await window.api.saveHistoryItem({
        id: next.id, url: next.url, title: next.title,
        thumbnail: next.thumbnail, duration: next.duration,
        format: next.format, formatLabel: next.formatLabel,
        outputDir: next.outputDir, outputPath: result.outputPath, fileSize: result.fileSize, completedAt: new Date().toISOString(),
      })
      setHistoryItems((items) => [{
        id: next.id,
        url: next.url,
        title: next.title,
        thumbnail: next.thumbnail,
        duration: next.duration,
        format: next.format,
        formatLabel: next.formatLabel,
        outputDir: next.outputDir,
        outputPath: result.outputPath,
        fileSize: result.fileSize,
        completedAt: new Date().toISOString(),
      }, ...items])
      if (settings.autoOpenFolder) window.api.openFolder(next.outputDir).catch(() => {})
      onDownloadComplete()
    } catch (err) {
      const msg = cleanError((err as Error).message)
      const cancelled = msg.toLowerCase().includes('killed') || msg.toLowerCase().includes('cancel')
      updateQueue((q) => q.map((i) => i.id === next.id ? { ...i, status: 'error', error: cancelled ? 'Cancelled' : msg } : i))
    } finally {
      processingRef.current = false
      processQueue()
    }
  }, [onDownloadComplete, queuePaused, settings.autoOpenFolder, updateQueue])

  useEffect(() => {
    if (!queuePaused) processQueue()
  }, [processQueue, queuePaused])

  const addToQueue = useCallback((items: Omit<QueueItem, 'id' | 'status' | 'progress' | 'speed'>[]) => {
    const alreadyDownloaded = items.filter((item) =>
      historyItems.some((historyItem) =>
        historyItem.url === item.url &&
        historyItem.outputDir === item.outputDir &&
        historyItem.formatLabel === item.formatLabel,
      ),
    )

    const uniqueItems = items.filter((item) =>
      !queueRef.current.some((queued) =>
        queued.url === item.url &&
        queued.outputDir === item.outputDir &&
        queued.formatLabel === item.formatLabel &&
        queued.status !== 'error',
      ),
    )

    if (uniqueItems.length === 0) {
      showToast('That item is already in the queue', 'error')
      return
    }

    if (alreadyDownloaded.length > 0) {
      const count = alreadyDownloaded.length
      showToast(`Already downloaded before: ${count} item${count !== 1 ? 's' : ''}`, 'success')
    }

    const newItems: QueueItem[] = uniqueItems.map((item) => ({ ...item, id: nanoid(), status: 'pending', progress: 0, speed: '' }))
    queueRef.current = [...queueRef.current, ...newItems]
    setQueue([...queueRef.current])
    if (uniqueItems.length < items.length) {
      const skipped = items.length - uniqueItems.length
      showToast(`Skipped ${skipped} duplicate item${skipped !== 1 ? 's' : ''}`, 'error')
    }
    processQueue()
  }, [processQueue, showToast])

  useEffect(() => {
    if (!redownloadRequest || redownloadRequest.nonce === lastRedownloadNonceRef.current) return

    lastRedownloadNonceRef.current = redownloadRequest.nonce
    const { item } = redownloadRequest
    setOutputDir(item.outputDir)
    addToQueue([{
      url: item.url,
      title: item.title,
      thumbnail: item.thumbnail,
      duration: item.duration,
      format: item.format,
      formatLabel: item.formatLabel,
      outputDir: item.outputDir,
      filename: '',
      downloader: 'ytdlp',
    }])
  }, [addToQueue, redownloadRequest])

  async function handleFetch() {
    setFetching(true)
    setVideoInfo(null)
    try {
      const info = await window.api.getInfo(url.trim())
      setVideoInfo(info)
      const defaultId = info.formats.find((f) => f.id === settings.defaultFormatId)?.id ?? (urlInfo?.isMusic
        ? (info.formats.find((f) => f.type === 'audio')?.id ?? info.formats[0]?.id)
        : info.formats[0]?.id)
      setSelectedFormatId(defaultId ?? '')
    } catch (err) {
      showToast(cleanError((err as Error).message), 'error')
    } finally {
      setFetching(false)
    }
  }

  async function handleLoadPlaylist() {
    setFetchingPlaylist(true)
    setPlaylistCount(0)
    setPlaylistItems([])
    try {
      const result = await window.api.getPlaylistInfo(url.trim())
      setPlaylistTitle(result.title)
      setPlaylistItems(result.items)
      setShowPlaylistPicker(true)
    } catch (err) {
      showToast(cleanError((err as Error).message), 'error')
    } finally {
      setFetchingPlaylist(false)
    }
  }

  async function handleBrowse() {
    const dir = await window.api.chooseDirectory()
    if (dir) setOutputDir(dir)
  }

  function handleAddVideoToQueue() {
    if (!videoInfo || !outputDir) { if (!outputDir) showToast('Choose a save folder first', 'error'); return }
    const fmt = videoInfo.formats.find((f) => f.id === selectedFormatId) ?? videoInfo.formats[0]
    const fmtOpts: FormatOpts = fmt.type === 'audio'
      ? { type: 'audio', audioFormat: fmt.audioFormat }
      : { type: 'video', quality: fmt.quality, selector: fmt.selector }

    addToQueue([{
      url: url.trim(), title: videoInfo.title, thumbnail: videoInfo.thumbnail,
      duration: videoInfo.duration, format: fmtOpts, formatLabel: fmt.label,
      outputDir, filename, downloader: 'ytdlp',
    }])
    setVideoInfo(null); setUrl(''); setFilename('')
    showToast('Added to queue', 'success')
  }

  function handlePlaylistAdd(items: Array<{ item: PlaylistItem; outputDir: string }>, formatId: string) {
    if (items.some(({ outputDir: itemOutputDir }) => !itemOutputDir)) {
      showToast('Choose a save folder for each selected playlist item', 'error')
      return
    }
    const allFormats = [...(videoInfo?.formats ?? []), ...defaultVideoFormats()]
    const fmt = allFormats.find((f) => f.id === formatId)
    if (!fmt) return
    const fmtOpts: FormatOpts = fmt.type === 'audio'
      ? { type: 'audio', audioFormat: 'audioFormat' in fmt ? fmt.audioFormat : undefined }
      : { type: 'video', quality: 'quality' in fmt ? fmt.quality : undefined, selector: 'selector' in fmt ? fmt.selector : undefined }

    addToQueue(items.map(({ item, outputDir: itemOutputDir }) => ({
      url: item.url, title: item.title, thumbnail: item.thumbnail, duration: item.duration,
      format: fmtOpts, formatLabel: fmt.label, outputDir: itemOutputDir, filename: '', downloader: 'ytdlp' as const,
    })))
    setShowPlaylistPicker(false)
    showToast(`Added ${items.length} video${items.length !== 1 ? 's' : ''} to queue`, 'success')
  }

  function removeQueueItem(id: string) { updateQueue((q) => q.filter((i) => i.id !== id)) }
  function clearDone() { updateQueue((q) => q.filter((i) => i.status === 'pending' || i.status === 'downloading')) }

  const canFetch = appReady && isValidUrl(url) && !fetching
  const hasDoneOrError = queue.some((i) => i.status === 'done' || i.status === 'error')
  const hasActiveContent = !!videoInfo || queue.length > 0 || showPlaylistPicker

  return (
    <div className={styles.root}>
      <div className="card flex gap-2">
        <input
          className="input"
          type="url"
          placeholder="Paste a video or audio URL from YouTube, TikTok, Instagram, and more"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setVideoInfo(null) }}
          onKeyDown={(e) => e.key === 'Enter' && canFetch && handleFetch()}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="btn btn-secondary"
          type="button"
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText()
              if (text.trim()) setUrl(text.trim())
            } catch {
              showToast('Clipboard paste is blocked here', 'error')
            }
          }}
        >
          Paste
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => { setUrl(''); setVideoInfo(null) }}
          disabled={!url && !videoInfo}
        >
          Clear
        </button>
        <button className="btn btn-primary" onClick={handleFetch} disabled={!canFetch}>
          {fetching ? 'Fetching...' : 'Fetch'}
        </button>
      </div>

      {showPlaylistBanner && (
        <div className={styles.playlistBanner}>
          <span>Playlist URL detected</span>
          <button className="btn btn-secondary btn-sm" onClick={handleLoadPlaylist} disabled={fetchingPlaylist || !appReady}>
            {fetchingPlaylist ? (playlistCount > 0 ? `Loading... (${playlistCount})` : 'Loading...') : 'Load playlist'}
          </button>
        </div>
      )}

      <div className={`card ${styles.folderBar}`}>
        <PathField
          label="Save to"
          value={outputDir}
          placeholder="Choose your default download folder before fetching a link."
          title={outputDir || 'Choose a download folder'}
          actions={
            <>
              {outputDir && (
                <button className="btn btn-ghost" type="button" onClick={() => window.api.openFolder(outputDir)}>
                  Open folder
                </button>
              )}
              <button className="btn btn-secondary" type="button" onClick={handleBrowse}>
                {outputDir ? 'Change folder' : 'Choose folder'}
              </button>
            </>
          }
        />
      </div>

      {!hasActiveContent && (
        <div className={`card ${styles.heroCard}`}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroContent}>
            <div className={styles.heroCopy}>
              <span className={styles.heroEyebrow}>Start here</span>
              <h2 className={styles.heroTitle}>Drop in a link and build a queue in seconds.</h2>
              <p className={styles.heroText}>
                Paste links from YouTube, TikTok, Instagram, and many other supported video or audio sites to preview
                formats, choose a folder, and download without leaving the app.
              </p>
              <div className={styles.heroActions}>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText()
                      if (text.trim()) setUrl(text.trim())
                      else showToast('Clipboard is empty', 'error')
                    } catch {
                      showToast('Clipboard paste is blocked here', 'error')
                    }
                  }}
                >
                  Paste from clipboard
                </button>
                <button className="btn btn-secondary" type="button" onClick={handleBrowse}>
                  {outputDir ? 'Change save folder' : 'Choose save folder'}
                </button>
              </div>
            </div>

            <div className={styles.heroPanel}>
              <div className={styles.heroPanelHeader}>
                <span className={styles.heroPanelTitle}>Works great with</span>
                <span className={styles.heroPanelHint}>Paste one link to begin</span>
              </div>
              <div className={styles.heroChipGrid}>
                {['YouTube', 'TikTok', 'Instagram', 'Many more sites'].map((label) => (
                  <span key={label} className={styles.heroChip}>{label}</span>
                ))}
              </div>
              <div className={styles.heroSteps}>
                <div className={styles.heroStep}>
                  <span className={styles.heroStepNum}>1</span>
                  <span>Paste a supported video or audio URL, or use the clipboard button.</span>
                </div>
                <div className={styles.heroStep}>
                  <span className={styles.heroStepNum}>2</span>
                  <span>Pick your save folder once so the app remembers it.</span>
                </div>
                <div className={styles.heroStep}>
                  <span className={styles.heroStepNum}>3</span>
                  <span>Fetch formats, then add a single post, track, video, or whole playlist to the queue.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {videoInfo && (
        <div className={`card ${styles.infoCard}`}>
          <div className="flex gap-3 items-center">
            <Thumb src={videoInfo.thumbnail} className={styles.thumb} />
            <div className="flex-1">
              <div className={styles.videoTitle}>{videoInfo.title}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                {[videoInfo.uploader, videoInfo.duration].filter(Boolean).join(' · ')}
                {urlInfo?.isMusic && <span className={styles.musicBadge}>{urlInfo.label}</span>}
              </div>
            </div>
          </div>

          <div className={styles.optionsGrid}>
            <div className="flex-col gap-1">
              <label className="label">Format</label>
              <select className="select" value={selectedFormatId} onChange={(e) => setSelectedFormatId(e.target.value)}>
                {videoInfo.formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>

            <PathField
              label="Save to"
              value={outputDir}
              placeholder="Choose folder..."
              actions={
                <button className="btn btn-secondary" type="button" onClick={handleBrowse}>Browse</button>
              }
            />

            <div className={`${styles.fullWidthField} flex-col gap-1`}>
              <label className="label">Filename (optional)</label>
              <input className="input" type="text" placeholder="Leave blank to use title" value={filename} onChange={(e) => setFilename(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn btn-download" onClick={handleAddVideoToQueue}>Add to Queue</button>
            <button className="btn btn-ghost" onClick={() => setVideoInfo(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <div className={`card ${styles.queueSection}`}>
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Queue</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {queue.filter((i) => i.status === 'done').length}/{queue.length} done
            </span>
            {queue.some((i) => i.status === 'pending') && (
              <button className="btn btn-ghost btn-sm" onClick={() => setQueuePaused((value) => !value)}>
                {queuePaused ? 'Resume queue' : 'Pause queue'}
              </button>
            )}
            {queue.some((i) => i.status === 'pending') && (
              <button className="btn btn-ghost btn-sm" onClick={() => updateQueue((q) => q.filter((i) => i.status !== 'pending'))}>
                Remove pending
              </button>
            )}
            {hasDoneOrError && (
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={clearDone}>
                Clear done
              </button>
            )}
          </div>
          <div className={styles.queueList}>
            {queue.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                onRemove={() => removeQueueItem(item.id)}
                onCancel={() => window.api.cancelDownload()}
                onOpenFolder={() => window.api.openFolder(item.outputDir)}
                onReveal={() => item.outputPath ? window.api.revealItem(item.outputPath) : Promise.resolve()}
                onRetry={() => {
                  updateQueue((q) => q.map((i) => i.id === item.id ? { ...i, status: 'pending', error: undefined, progress: 0 } : i))
                  processQueue()
                }}
                onMoveUp={() => updateQueue((q) => moveQueueItem(q, item.id, -1))}
                onMoveDown={() => updateQueue((q) => moveQueueItem(q, item.id, 1))}
              />
            ))}
          </div>
        </div>
      )}

      {showPlaylistPicker && (
        <PlaylistPicker
          title={playlistTitle}
          items={playlistItems}
          defaultOutputDir={outputDir}
          onAdd={handlePlaylistAdd}
          onClose={() => setShowPlaylistPicker(false)}
        />
      )}
    </div>
  )
}

function QueueRow({ item, onRemove, onCancel, onOpenFolder, onReveal, onRetry, onMoveUp, onMoveDown }: {
  item: QueueItem
  onRemove: () => void
  onCancel: () => void
  onOpenFolder: () => void
  onReveal: () => void | Promise<void>
  onRetry: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const dotClass =
    item.status === 'done' ? styles.statusDone
    : item.status === 'error' ? styles.statusError
    : item.status === 'downloading' ? styles.statusActive
    : styles.statusPending

  const indeterminate = item.status === 'downloading' && item.progress <= 0

  return (
    <div className={styles.queueRow}>
      <Thumb src={item.thumbnail} className={styles.queueThumb} />
      <div className={styles.queueMeta}>
        <div className={styles.queueTitle} title={item.title}>{item.title}</div>
        <div className="flex gap-2 items-center" style={{ marginTop: 3 }}>
          <span className={`${styles.statusDot} ${dotClass}`} />
          <span className="muted" style={{ fontSize: 11 }}>
            {item.status === 'downloading'
              ? indeterminate ? item.speed || 'Downloading...' : `${Math.round(item.progress)}% · ${item.speed}`
              : item.status === 'error' ? item.error
              : item.status === 'done' ? [fileNameFromPath(item.outputPath), formatBytes(item.fileSize)].filter(Boolean).join(' · ') || 'Done'
              : item.formatLabel}
          </span>
        </div>
        {item.status === 'downloading' && !indeterminate && (
          <div className={styles.miniProgressTrack}>
            <div className={styles.miniProgressFill} style={{ width: `${item.progress}%` }} />
          </div>
        )}
        {item.status === 'downloading' && indeterminate && (
          <div className={styles.miniProgressTrack}>
            <div className={styles.miniProgressIndeterminate} />
          </div>
        )}
      </div>
      <div className={styles.queueActions}>
        {item.status === 'downloading' && <button className="btn btn-ghost btn-sm" onClick={onCancel} title="Cancel"><CloseIcon />Cancel</button>}
        {item.status !== 'downloading' && <button className="btn btn-ghost btn-sm" onClick={onMoveUp} title="Move up"><ArrowUpIcon />Up</button>}
        {item.status !== 'downloading' && <button className="btn btn-ghost btn-sm" onClick={onMoveDown} title="Move down"><ArrowDownIcon />Down</button>}
        {item.status === 'done' && <button className="btn btn-ghost btn-sm" onClick={onOpenFolder} title="Open folder"><FolderIcon />Open</button>}
        {item.status === 'done' && item.outputPath && <button className="btn btn-ghost btn-sm" onClick={onReveal} title="Reveal file"><FileIcon />Reveal</button>}
        {item.status === 'error' && <button className="btn btn-ghost btn-sm" onClick={onRetry} title="Retry"><RetryIcon />Retry</button>}
        {(item.status === 'pending' || item.status === 'done' || item.status === 'error') && (
          <button className="btn btn-ghost btn-sm" onClick={onRemove} title="Remove"><TrashIcon />Remove</button>
        )}
      </div>
    </div>
  )
}

function moveQueueItem(queue: QueueItem[], id: string, offset: -1 | 1) {
  const index = queue.findIndex((item) => item.id === id)
  const targetIndex = index + offset
  if (index < 0 || targetIndex < 0 || targetIndex >= queue.length) return queue
  if (queue[index].status === 'downloading' || queue[targetIndex].status === 'downloading') return queue

  const next = [...queue]
  const [item] = next.splice(index, 1)
  next.splice(targetIndex, 0, item)
  return next
}

function defaultVideoFormats() {
  return [
    { id: 'preset-best', label: 'Best quality (MP4)', type: 'video' as const, quality: 'best' },
    { id: 'audio-mp3', label: 'MP3 (Audio only)', type: 'audio' as const, audioFormat: 'mp3' },
    { id: 'audio-m4a', label: 'M4A (Audio only)', type: 'audio' as const, audioFormat: 'm4a' },
  ]
}

function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h1.2c.4 0 .78.16 1.06.44l.3.31c.28.28.66.44 1.06.44H9A1.5 1.5 0 0 1 10.5 4.7v3.8A1.5 1.5 0 0 1 9 10H3A1.5 1.5 0 0 1 1.5 8.5v-5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4 1.5h2.8L9.5 4.2V9.5A1 1 0 0 1 8.5 10.5h-4A1 1 0 0 1 3.5 9.5v-7A1 1 0 0 1 4.5 1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M6.5 1.8V4h2.2" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 3h7M4.5 3V2.3c0-.44.36-.8.8-.8h1.4c.44 0 .8.36.8.8V3M4 4.5v3M6 4.5v3M8 4.5v3M3.5 3l.34 5.1c.03.5.45.9.95.9h2.42c.5 0 .92-.4.95-.9L8.5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RetryIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M9.5 5A3.5 3.5 0 1 0 8.4 7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M8.4 3.5H10v1.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 9.5V2.8M6 2.8L3.8 5M6 2.8L8.2 5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 2.5v6.7M6 9.2L3.8 7M6 9.2L8.2 7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3.5 3.5 8.5 8.5M8.5 3.5 3.5 8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
