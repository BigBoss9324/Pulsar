import { useState, useEffect, useRef, useCallback } from 'react'
import type { VideoInfo, QueueItem, FormatOpts, PlaylistItem, HistoryItem, AppSettings, DownloadPreferences } from '../types'
import { detectUrl } from '../utils/urlDetect'
import PlaylistPicker from './PlaylistPicker'
import PathField from './PathField'
import Thumb from './Thumb'
import ConfirmDialog from './ConfirmDialog'
import styles from './DownloadTab.module.css'

const DEFAULT_MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 2500

interface Props {
  appReady: boolean
  redownloadRequest: { nonce: number; items: HistoryItem[] } | null
  settings: AppSettings
  showToast: (msg: string, type: string) => void
  onDownloadComplete: () => void
}

type QueueDraft = Pick<
  QueueItem,
  'url' | 'title' | 'thumbnail' | 'duration' | 'format' | 'formatLabel' | 'outputDir' | 'filename' | 'downloader' | 'downloadPrefs'
>

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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}


function normalizeDownloadFailure(err: unknown) {
  if (err && typeof err === 'object') {
    const failure = err as {
      error?: string
      message?: string
      details?: string
      retryable?: boolean
      cancelled?: boolean
      resumable?: boolean
    }

    return {
      message: cleanError(failure.error || failure.message || 'Download failed'),
      details: typeof failure.details === 'string' ? failure.details : '',
      retryable: Boolean(failure.retryable),
      cancelled: Boolean(failure.cancelled),
      resumable: failure.resumable !== false,
    }
  }

  if (err instanceof Error) {
    return {
      message: cleanError(err.message),
      details: '',
      retryable: false,
      cancelled: false,
      resumable: true,
    }
  }

  return {
    message: 'Download failed',
    details: '',
    retryable: false,
    cancelled: false,
    resumable: true,
  }
}

function buildQueueItem(item: QueueDraft): QueueItem {
  return {
    ...item,
    id: nanoid(),
    status: 'pending',
    progress: 0,
    speed: '',
    eta: '',
    total: '',
    transferred: '',
    attempts: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    resumable: true,
  }
}

function buildDownloadPrefs(settings: AppSettings): DownloadPreferences {
  return {
    filenameTemplate: settings.filenameTemplate,
    subtitleMode: settings.subtitleMode,
    subtitleLanguages: settings.subtitleLanguages,
    duplicateStrategy: settings.duplicateStrategy,
    embedMetadata: settings.embedMetadata,
    embedThumbnail: settings.embedThumbnail,
  }
}

function restoreQueueItem(item: QueueItem): QueueItem {
  const recovered = item.status === 'downloading'

  return {
    ...item,
    status: recovered ? 'pending' : item.status,
    progress: item.status === 'done' ? item.progress : 0,
    speed: '',
    eta: '',
    total: item.total ?? '',
    transferred: item.status === 'done' ? item.transferred ?? item.total ?? '' : '',
    attempts: item.attempts ?? 0,
    maxAttempts: item.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    resumable: item.resumable !== false,
    downloadPrefs: item.downloadPrefs ?? {
      filenameTemplate: '%(title)s',
      subtitleMode: 'off',
      subtitleLanguages: 'en.*',
      duplicateStrategy: 'skip',
      embedMetadata: true,
      embedThumbnail: true,
    },
    error: recovered ? 'Recovered from previous session. Ready to resume.' : item.error,
  }
}

export default function DownloadTab({ appReady, redownloadRequest, settings, showToast, onDownloadComplete }: Props) {
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [selectedFormatId, setSelectedFormatId] = useState(settings.defaultFormatId)
  const [outputDir, setOutputDir] = useState(settings.defaultOutputDir || '')
  const [filename, setFilename] = useState('')

  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [confirmClearQueue, setConfirmClearQueue] = useState(false)
  const [playlistTitle, setPlaylistTitle] = useState('')
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([])
  const [fetchingPlaylist, setFetchingPlaylist] = useState(false)
  const [playlistCount, setPlaylistCount] = useState(0)

  const [queue, setQueue] = useState<QueueItem[]>([])
  const [queueSearch, setQueueSearch] = useState('')
  const [selectedQueueIds, setSelectedQueueIds] = useState<Set<string>>(new Set())
  const [queuePaused, setQueuePaused] = useState(false)
  const queuePausedRef = useRef(false)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const queueRef = useRef<QueueItem[]>([])
  const processingRef = useRef(false)
  const lastRedownloadNonceRef = useRef<number | null>(null)
  const queueLoadedRef = useRef(false)
  const cancelledByUserRef = useRef<Set<string>>(new Set())
  const cancelledKeepInQueueRef = useRef<Set<string>>(new Set())
  const pausedByUserRef = useRef<Set<string>>(new Set())
  const queueWasActiveRef = useRef(false)

  const urlInfo = isValidUrl(url) ? detectUrl(url) : null
  const showPlaylistBanner = urlInfo?.canBePlaylist && url.includes('list=') && !videoInfo

  useEffect(() => {
    return window.api.onProgress(({ id, percent, speed, eta, total, transferred }) => {
      setQueue((q) => {
        const next = q.map((item) =>
          item.id === id && item.status === 'downloading'
            ? { ...item, progress: Math.max(0, percent), speed, eta, total, transferred }
            : item,
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
      const restored = items.map((item) => restoreQueueItem(item))
      queueRef.current = restored
      setQueue(restored)
      queueLoadedRef.current = true

      const recoveredCount = items.filter((item) => item.status === 'downloading').length
      const pendingCount = restored.filter((item) => item.status === 'pending').length
      if (recoveredCount > 0 || pendingCount > 0) {
        queuePausedRef.current = true
        setQueuePaused(true)
      }
      if (recoveredCount > 0) {
        showToast(`Recovered ${recoveredCount} in-progress download${recoveredCount !== 1 ? 's' : ''} — queue paused`, 'success')
      } else if (pendingCount > 0) {
        showToast(`Restored ${pendingCount} queued item${pendingCount !== 1 ? 's' : ''} — queue paused`, 'success')
      }
    }).catch(() => {
      queueLoadedRef.current = true
    })
  }, [showToast])

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
    if (processingRef.current || queuePausedRef.current) return
    const next = queueRef.current.find((i) => i.status === 'pending')
    if (!next) {
      if (queueWasActiveRef.current && settings.notifications) {
        queueWasActiveRef.current = false
        if (!document.hasFocus()) {
          const total = queueRef.current.filter((i) => i.status === 'done' || i.status === 'error').length
          window.api.showNotification({ title: 'Queue finished', body: `${total} download${total !== 1 ? 's' : ''} completed` }).catch(() => {})
        }
      }
      return
    }
    queueWasActiveRef.current = true

    processingRef.current = true
    updateQueue((q) => q.map((i) => i.id === next.id ? {
      ...i,
      status: 'downloading',
      progress: 0,
      speed: '',
      eta: '',
      transferred: '',
      error: undefined,
      errorDetails: undefined,
      attempts: (i.attempts ?? 0) + 1,
      lastStartedAt: new Date().toISOString(),
    } : i))

    try {
      const result = await window.api.download({
        id: next.id,
        url: next.url,
        format: next.format,
        outputDir: next.outputDir,
        filename: next.filename,
        downloadPrefs: next.downloadPrefs ?? buildDownloadPrefs(settings),
        downloader: next.downloader,
      })
      if (!result.success) throw result

      updateQueue((q) => q.map((i) => i.id === next.id ? {
        ...i,
        status: 'done',
        progress: 100,
        speed: '',
        eta: '',
        transferred: i.total || i.transferred,
        outputPath: result.outputPath,
        fileSize: result.fileSize,
        skippedByArchive: result.skippedByArchive,
        lastFinishedAt: new Date().toISOString(),
      } : i))

      const historyItem: HistoryItem = {
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
      }

      await window.api.saveHistoryItem(historyItem)
      setHistoryItems((items) => [historyItem, ...items])
      if (!result.skippedByArchive && settings.autoOpenFolder) window.api.openFolder(next.outputDir).catch(() => {})
      if (!result.skippedByArchive && settings.discordWebhookUrl && !settings.discordAttachFile && settings.discordIncludeEmbed) {
        window.api.sendDiscordWebhook({
          webhookUrl: settings.discordWebhookUrl,
          embed: {
            title: next.title,
            url: next.url,
            thumbnail: next.thumbnail,
            duration: next.duration,
            formatLabel: next.formatLabel,
            outputPath: result.outputPath ?? next.outputDir,
            fileSize: result.fileSize,
          },
          attachFile: false,
          stripMetadata: false,
          includeEmbed: true,
          deleteAfterSend: false,
        }).catch(() => {})
      }
      onDownloadComplete()
    } catch (err) {
      if (cancelledByUserRef.current.has(next.id)) {
        cancelledByUserRef.current.delete(next.id)
        updateQueue((q) => q.filter((i) => i.id !== next.id))
      } else if (cancelledKeepInQueueRef.current.has(next.id)) {
        cancelledKeepInQueueRef.current.delete(next.id)
        updateQueue((q) => q.map((i) => i.id === next.id ? {
          ...i,
          status: 'error',
          cancelled: true,
          progress: 0,
          speed: '',
          eta: '',
          transferred: '',
          error: 'Cancelled',
          errorDetails: undefined,
          lastFinishedAt: new Date().toISOString(),
        } : i))
      } else if (pausedByUserRef.current.has(next.id)) {
        pausedByUserRef.current.delete(next.id)
        updateQueue((q) => q.map((i) => i.id === next.id ? {
          ...i,
          status: 'pending',
          progress: 0,
          speed: '',
          eta: '',
          transferred: '',
          error: undefined,
          errorDetails: undefined,
          lastFinishedAt: new Date().toISOString(),
        } : i))
      } else {
        const failure = normalizeDownloadFailure(err)
        const currentItem = queueRef.current.find((item) => item.id === next.id)
        const attempts = currentItem?.attempts ?? (next.attempts ?? 0) + 1
        const maxAttempts = currentItem?.maxAttempts ?? next.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
        const shouldRetry = failure.retryable && !failure.cancelled && attempts < maxAttempts

        updateQueue((q) => q.map((i) => i.id === next.id ? {
          ...i,
          status: shouldRetry ? 'pending' : 'error',
          progress: 0,
          speed: '',
          eta: '',
          error: shouldRetry
            ? `${failure.message} Retrying automatically (${attempts}/${maxAttempts})...`
            : failure.message,
          errorDetails: failure.details,
          resumable: failure.resumable,
          lastFinishedAt: new Date().toISOString(),
        } : i))

        if (shouldRetry) {
          showToast(`Retrying "${next.title}"`, 'info')
          await wait(RETRY_DELAY_MS)
        } else {
          if (settings.notifications && !failure.cancelled && !document.hasFocus()) window.api.showNotification({ title: 'Download failed', body: next.title }).catch(() => {})
          const onError = settings.onError ?? 'continue'
          if (onError === 'pause') {
            queuePausedRef.current = true
            setQueuePaused(true)
          } else if (onError === 'wait-3') {
            await wait(3000)
          } else if (onError === 'wait-5') {
            await wait(5000)
          } else if (onError === 'wait-15') {
            await wait(15000)
          }
        }
      }
    } finally {
      processingRef.current = false
      processQueue()
    }
  }, [onDownloadComplete, settings.autoOpenFolder, settings.notifications, settings.discordWebhookUrl, settings.discordAttachFile, settings.discordIncludeEmbed, settings.onError, showToast, updateQueue])

  useEffect(() => {
    if (!queuePaused && appReady) processQueue()
  }, [appReady, processQueue, queuePaused])

  const addToQueue = useCallback((items: QueueDraft[]) => {
    const alreadyDownloaded = items.filter((item) =>
      historyItems.some((historyItem) =>
        historyItem.url === item.url &&
        historyItem.outputDir === item.outputDir &&
        historyItem.formatLabel === item.formatLabel,
      ),
    )

    const queuedDuplicates = items.filter((item) =>
      !queueRef.current.some((queued) =>
        queued.url === item.url &&
        queued.outputDir === item.outputDir &&
        queued.formatLabel === item.formatLabel &&
        queued.status !== 'error',
      ),
    )

    let uniqueItems = queuedDuplicates
    if (settings.duplicateStrategy === 'skip') {
      uniqueItems = queuedDuplicates.filter((item) =>
        !historyItems.some((historyItem) =>
          historyItem.url === item.url &&
          historyItem.outputDir === item.outputDir &&
          historyItem.formatLabel === item.formatLabel,
        ),
      )
    }

    if (uniqueItems.length === 0) {
      showToast(settings.duplicateStrategy === 'skip' ? 'Skipped duplicate items based on your duplicate rule' : 'That item is already in the queue', 'error')
      return
    }

    if (alreadyDownloaded.length > 0 && settings.duplicateStrategy !== 'skip') {
      const count = alreadyDownloaded.length
      showToast(`Already downloaded before: ${count} item${count !== 1 ? 's' : ''}`, 'success')
    }

    const newItems: QueueItem[] = uniqueItems.map((item) => buildQueueItem(item))
    queueRef.current = [...queueRef.current, ...newItems]
    setQueue([...queueRef.current])
    if (queuedDuplicates.length < items.length) {
      const skipped = items.length - queuedDuplicates.length
      showToast(`Skipped ${skipped} duplicate item${skipped !== 1 ? 's' : ''}`, 'error')
    }
    if (settings.duplicateStrategy === 'skip' && uniqueItems.length < queuedDuplicates.length) {
      const skippedByHistory = queuedDuplicates.length - uniqueItems.length
      showToast(`Skipped ${skippedByHistory} previously downloaded item${skippedByHistory !== 1 ? 's' : ''}`, 'info')
    }
    queuePausedRef.current = false
    setQueuePaused(false)
    processQueue()
  }, [historyItems, processQueue, settings.duplicateStrategy, showToast])

  useEffect(() => {
    if (!redownloadRequest || redownloadRequest.nonce === lastRedownloadNonceRef.current) return

    lastRedownloadNonceRef.current = redownloadRequest.nonce
    const { items } = redownloadRequest
    if (items.length === 1) setOutputDir(items[0].outputDir)
    addToQueue(items.map((item) => ({
      url: item.url,
      title: item.title,
      thumbnail: item.thumbnail,
      duration: item.duration,
      format: item.format,
      formatLabel: item.formatLabel,
      outputDir: item.outputDir,
      filename: '',
      downloadPrefs: buildDownloadPrefs(settings),
      downloader: 'ytdlp' as const,
    })))
  }, [addToQueue, redownloadRequest, settings])

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
      url: url.trim(),
      title: videoInfo.title,
      thumbnail: videoInfo.thumbnail,
      duration: videoInfo.duration,
      format: fmtOpts,
      formatLabel: fmt.label,
      outputDir,
      filename,
      downloadPrefs: buildDownloadPrefs(settings),
      downloader: 'ytdlp',
    }])
    setVideoInfo(null)
    setUrl('')
    setFilename('')
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
      url: item.url,
      title: item.title,
      thumbnail: item.thumbnail,
      duration: item.duration,
      format: fmtOpts,
      formatLabel: fmt.label,
      outputDir: itemOutputDir,
      filename: '',
      downloadPrefs: buildDownloadPrefs(settings),
      downloader: 'ytdlp' as const,
    })))
    setShowPlaylistPicker(false)
    showToast(`Added ${items.length} video${items.length !== 1 ? 's' : ''} to queue`, 'success')
  }

  async function handleExportQueue() {
    try {
      const exportable = queueRef.current
        .filter((i) => i.status !== 'done')
        .map(({ url, title, thumbnail, duration, format, formatLabel, outputDir, filename, downloadPrefs, downloader }) => ({
          url, title, thumbnail, duration, format, formatLabel, outputDir, filename: filename ?? '', downloadPrefs, downloader,
        }))
      const ok = await window.api.exportQueue(JSON.stringify(exportable, null, 2))
      if (ok) showToast('Queue exported', 'success')
    } catch {
      showToast('Export failed', 'error')
    }
  }

  async function handleImportQueue() {
    let raw: string | null
    try {
      raw = await window.api.importQueue()
    } catch {
      showToast('Import failed', 'error')
      return
    }
    if (!raw) return
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { showToast('Invalid queue file', 'error'); return }
    if (!Array.isArray(parsed)) { showToast('Invalid queue file', 'error'); return }
    const valid = (parsed as unknown[]).filter((item): item is QueueDraft =>
      item !== null && typeof item === 'object' &&
      typeof (item as Record<string, unknown>).url === 'string' &&
      typeof (item as Record<string, unknown>).title === 'string' &&
      (item as Record<string, unknown>).format !== null && typeof (item as Record<string, unknown>).format === 'object',
    )
    if (valid.length === 0) { showToast('No valid items found in file', 'error'); return }
    addToQueue(valid)
  }

  function removeQueueItem(id: string) { updateQueue((q) => q.filter((i) => i.id !== id)) }
  function clearCompleted() { updateQueue((q) => q.filter((i) => i.status !== 'done')) }
  async function clearQueue() {
    const activeItem = queueRef.current.find((item) => item.status === 'downloading')
    if (activeItem) {
      cancelledByUserRef.current.add(activeItem.id)
      await window.api.cancelDownload(activeItem.id).catch(() => {})
    }

    updateQueue(() => [])
    showToast('Queue cleared', 'success')
  }

  async function toggleQueuePaused() {
    if (queuePaused) {
      queuePausedRef.current = false
      setQueuePaused(false)
      showToast('Queue resumed', 'success')
      return
    }

    queuePausedRef.current = true
    setQueuePaused(true)
    const activeItem = queueRef.current.find((item) => item.status === 'downloading')
    if (activeItem) {
      pausedByUserRef.current.add(activeItem.id)
      await window.api.cancelDownload(activeItem.id).catch(() => {})
    }
    showToast('Queue paused', 'info')
  }

  function retryAllFailed() {
    updateQueue((q) => q.map((item) => item.status === 'error' && !item.cancelled ? {
      ...item,
      status: 'pending',
      progress: 0,
      speed: '',
      eta: '',
      transferred: '',
      error: undefined,
      errorDetails: undefined,
    } : item))
    processQueue()
  }

  async function bulkRemoveSelected() {
    const ids = selectedQueueIds
    const activeItem = queueRef.current.find((i) => i.status === 'downloading' && ids.has(i.id))
    if (activeItem) {
      cancelledByUserRef.current.add(activeItem.id)
      await window.api.cancelDownload(activeItem.id).catch(() => {})
    }
    updateQueue((q) => q.filter((i) => !ids.has(i.id)))
    setSelectedQueueIds(new Set())
  }

  function bulkRetrySelected() {
    const ids = selectedQueueIds
    updateQueue((q) => q.map((i) =>
      ids.has(i.id) && i.status === 'error' && !i.cancelled
        ? { ...i, status: 'pending', cancelled: false, error: undefined, errorDetails: undefined, progress: 0, speed: '', eta: '', transferred: '' }
        : i,
    ))
    setSelectedQueueIds(new Set())
    processQueue()
  }

  const canFetch = appReady && isValidUrl(url) && !fetching
  const hasCompleted = queue.some((i) => i.status === 'done')
  const hasFailed = queue.some((i) => i.status === 'error' && !i.cancelled)
  const hasActiveContent = !!videoInfo || queue.length > 0 || showPlaylistPicker
  const canToggleQueue = queuePaused || queue.some((i) => i.status === 'pending' || i.status === 'downloading')

  const filteredQueue = queueSearch.trim()
    ? queue.filter((i) => i.title.toLowerCase().includes(queueSearch.toLowerCase()) || i.url.toLowerCase().includes(queueSearch.toLowerCase()))
    : queue
  const selectableIds = filteredQueue.filter((i) => i.status !== 'downloading').map((i) => i.id)
  const allFilteredSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedQueueIds.has(id))
  const selectedInView = filteredQueue.filter((i) => selectedQueueIds.has(i.id))
  const selectedFailedCount = selectedInView.filter((i) => i.status === 'error' && !i.cancelled).length

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
                <button className="btn btn-ghost" type="button" onClick={() => void handleImportQueue()}>
                  Import queue
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
                {[videoInfo.uploader, videoInfo.duration].filter(Boolean).join(' • ')}
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
          <div className="flex items-center gap-2" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Queue</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {(() => {
                const done = queue.filter((i) => i.status === 'done')
                const failed = queue.filter((i) => i.status === 'error' && !i.cancelled)
                const durations = done
                  .filter((i) => i.lastStartedAt && i.lastFinishedAt)
                  .map((i) => new Date(i.lastFinishedAt!).getTime() - new Date(i.lastStartedAt!).getTime())
                const avgMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null
                const avgLabel = avgMs != null
                  ? avgMs >= 60000
                    ? `avg ${Math.round(avgMs / 60000)}m`
                    : `avg ${Math.round(avgMs / 1000)}s`
                  : null
                return (
                  <>
                    {done.length}/{queue.length} done
                    {avgLabel && <span style={{ marginLeft: 6 }}>• {avgLabel}</span>}
                    {failed.length > 0 && (
                      <span style={{ color: 'var(--danger)', marginLeft: 6 }}>
                        • {failed.length} failed
                      </span>
                    )}
                  </>
                )
              })()}
            </span>
            {canToggleQueue && (
              <button className="btn btn-ghost btn-sm" onClick={() => void toggleQueuePaused()}>
                {queuePaused ? 'Resume queue' : 'Pause queue'}
              </button>
            )}
            {queue.some((i) => i.status === 'pending') && (
              <button className="btn btn-ghost btn-sm" onClick={() => updateQueue((q) => q.filter((i) => i.status !== 'pending'))}>
                Remove pending
              </button>
            )}
            {hasFailed && (
              <button className="btn btn-ghost btn-sm" onClick={retryAllFailed}>
                Retry failed
              </button>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => void handleImportQueue()}>Import</button>
              <button className="btn btn-ghost btn-sm" onClick={() => void handleExportQueue()}>Export</button>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmClearQueue(true)}>Clear queue</button>
              {hasCompleted && <button className="btn btn-ghost btn-sm" onClick={clearCompleted}>Clear completed</button>}
            </div>
          </div>

          <div className={`${styles.queueToolbar}`}>
            {selectableIds.length > 0 && (
              <label className={styles.queueSelectAll}>
                <input
                  type="checkbox"
                  className={styles.queueCheckbox}
                  checked={allFilteredSelected}
                  onChange={() => {
                    if (allFilteredSelected) {
                      setSelectedQueueIds((s) => { const n = new Set(s); selectableIds.forEach((id) => n.delete(id)); return n })
                    } else {
                      setSelectedQueueIds((s) => { const n = new Set(s); selectableIds.forEach((id) => n.add(id)); return n })
                    }
                  }}
                  aria-label={allFilteredSelected ? 'Deselect all queue items' : 'Select all queue items'}
                  title={allFilteredSelected ? 'Deselect all' : 'Select all'}
                />
              </label>
            )}
            <input
              className={`input ${styles.queueSearch}`}
              type="text"
              placeholder="Filter queue..."
              value={queueSearch}
              onChange={(e) => setQueueSearch(e.target.value)}
            />
          </div>

          {selectedQueueIds.size > 0 && (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>{selectedQueueIds.size} selected</span>
              {selectedFailedCount > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={bulkRetrySelected}>
                  Retry {selectedFailedCount} failed
                </button>
              )}
              <button className="btn btn-danger btn-sm" onClick={() => void bulkRemoveSelected()}>
                Remove {selectedQueueIds.size}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedQueueIds(new Set())}>
                Deselect
              </button>
            </div>
          )}
          {(() => {
            const active = queue.find((i) => i.status === 'downloading')
            const nextPending = queue.find((i) => i.status === 'pending')
            const showPaused = queuePaused && nextPending
            const errorItems = queue.filter((i) => i.status === 'error' && !i.cancelled)
            const lastFailed = errorItems.length > 0
              ? errorItems.reduce((a, b) => (a.lastFinishedAt ?? '') > (b.lastFinishedAt ?? '') ? a : b)
              : null
            const showFailed = !active && !showPaused && lastFailed
            const featured = active || (showPaused ? nextPending : null) || (showFailed ? lastFailed : null)
            if (!featured || queue.length < 4) return null
            const indeterminate = active ? active.progress <= 0 : false
            const stats = active ? [
              indeterminate ? active.speed || 'Downloading...' : `${Math.round(active.progress)}%`,
              active.speed && !indeterminate ? active.speed : '',
              active.eta ? `ETA ${active.eta}` : '',
            ].filter(Boolean).join(' • ') : ''
            const bannerClass = showPaused ? styles.nowDownloadingPaused : showFailed ? styles.nowDownloadingFailed : ''
            return (
              <div className={`${styles.nowDownloading} ${bannerClass}`}>
                <Thumb src={featured.thumbnail} className={styles.nowDownloadingThumb} />
                <div className={styles.nowDownloadingMeta}>
                  <div className={styles.nowDownloadingLabel}>
                    {showPaused
                      ? <><PauseIcon />&nbsp;Queue paused — up next</>
                      : showFailed
                      ? <><FailIcon />&nbsp;Failed</>
                      : <><span className={styles.nowDownloadingPulse} />Now downloading</>}
                  </div>
                  <div className={styles.nowDownloadingTitle} title={featured.title}>{featured.title}</div>
                  {showFailed && lastFailed?.error && (
                    <div className={styles.nowDownloadingStats}>{lastFailed.error}</div>
                  )}
                  {stats && <div className={styles.nowDownloadingStats}>{stats}</div>}
                  {!showPaused && !showFailed && (
                    <div className={styles.nowDownloadingProgress}>
                      {indeterminate
                        ? <div className={styles.nowDownloadingFillIndeterminate} />
                        : <div className={styles.nowDownloadingFill} style={{ width: `${active!.progress}%` }} />}
                    </div>
                  )}
                </div>
                {active && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ flexShrink: 0 }}
                    onClick={() => {
                      cancelledKeepInQueueRef.current.add(active.id)
                      window.api.cancelDownload(active.id).catch(() => {})
                    }}
                  >
                    <CloseIcon />Cancel
                  </button>
                )}
              </div>
            )
          })()}

          <div className={styles.queueList}>
            {filteredQueue.length === 0 && queueSearch.trim() && (
              <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>No items match your filter.</div>
            )}
            {filteredQueue.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  selected={selectedQueueIds.has(item.id)}
                  onToggleSelect={item.status !== 'downloading' ? () => setSelectedQueueIds((s) => { const n = new Set(s); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n }) : undefined}
                  onRemove={() => removeQueueItem(item.id)}
                  onCancel={async () => {
                    cancelledKeepInQueueRef.current.add(item.id)
                    await window.api.cancelDownload(item.id).catch(() => {})
                  }}
                onOpenFolder={() => window.api.openFolder(item.outputDir)}
                onReveal={() => item.outputPath ? window.api.revealItem(item.outputPath) : Promise.resolve()}
                onRetry={() => {
                  updateQueue((q) => q.map((i) => i.id === item.id ? {
                    ...i,
                    status: 'pending',
                    cancelled: false,
                    error: undefined,
                    errorDetails: undefined,
                    progress: 0,
                    speed: '',
                    eta: '',
                    transferred: '',
                  } : i))
                  processQueue()
                }}
                onMoveNext={() => updateQueue((q) => moveQueueItemToNext(q, item.id))}
                onMoveUp={() => updateQueue((q) => moveQueueItem(q, item.id, -1))}
                onMoveDown={() => updateQueue((q) => moveQueueItem(q, item.id, 1))}
                discordWebhookUrl={settings.discordAttachFile ? settings.discordWebhookUrl : ''}
                discordStripMetadata={settings.discordStripMetadata}
                discordIncludeEmbed={settings.discordIncludeEmbed}
                discordDeleteAfterSend={settings.discordDeleteAfterSend}
                onDiscordFileDeleted={() => updateQueue((q) => q.map((i) => i.id === item.id ? { ...i, outputPath: undefined } : i))}
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

      {confirmClearQueue && (
        <ConfirmDialog
          title="Clear queue?"
          body="This will cancel any active download and remove all items from the queue. This cannot be undone."
          confirmLabel="Clear queue"
          onConfirm={() => { setConfirmClearQueue(false); void clearQueue() }}
          onCancel={() => setConfirmClearQueue(false)}
        />
      )}
    </div>
  )
}

const DISCORD_MAX_BYTES = 25 * 1024 * 1024

function QueueRow({ item, selected, onToggleSelect, onRemove, onCancel, onOpenFolder, onReveal, onRetry, onMoveNext, onMoveUp, onMoveDown, discordWebhookUrl, discordStripMetadata, discordIncludeEmbed, discordDeleteAfterSend, onDiscordFileDeleted }: {
  item: QueueItem
  selected?: boolean
  onToggleSelect?: () => void
  onRemove: () => void
  onCancel: () => void
  onOpenFolder: () => void
  onReveal: () => void | Promise<void>
  onRetry: () => void
  onMoveNext: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  discordWebhookUrl: string
  discordStripMetadata: boolean
  discordIncludeEmbed: boolean
  discordDeleteAfterSend: boolean
  onDiscordFileDeleted: () => void
}) {
  const [cancelling, setCancelling] = useState(false)
  const [sendingToDiscord, setSendingToDiscord] = useState(false)

  useEffect(() => {
    if (item.status === 'downloading') setCancelling(false)
  }, [item.status])

  const dotClass =
    item.status === 'done' ? styles.statusDone
    : item.status === 'error' && !item.cancelled ? styles.statusError
    : item.status === 'downloading' ? styles.statusActive
    : styles.statusPending

  const indeterminate = item.status === 'downloading' && item.progress <= 0
  const transferSummary = [item.transferred, item.total ? `of ${item.total}` : '', item.eta ? `ETA ${item.eta}` : '']
    .filter(Boolean)
    .join(' • ')
  const extraSummary = [
    item.status === 'downloading' ? transferSummary : '',
    item.status === 'error' && !item.cancelled && item.resumable !== false ? 'Resume supported' : '',
  ].filter(Boolean).join(' • ')

  return (
    <div className={`${styles.queueRow} ${selected ? styles.queueRowSelected : ''}`}>
      {onToggleSelect && (
        <input
          type="checkbox"
          className={styles.queueCheckbox}
          checked={selected ?? false}
          onChange={onToggleSelect}
          aria-label={`Select ${item.title}`}
        />
      )}
      <Thumb src={item.thumbnail} className={styles.queueThumb} />
      <div className={styles.queueMeta}>
        <div className={styles.queueTitle} title={item.title}>{item.title}</div>
        <div className="flex gap-2 items-center" style={{ marginTop: 3 }}>
          <span className={`${styles.statusDot} ${dotClass}`} />
          <span className="muted" style={{ fontSize: 11 }} title={item.errorDetails || undefined}>
            {item.status === 'downloading'
              ? cancelling ? 'Cancelling...'
                : indeterminate ? item.speed || 'Downloading...' : `${Math.round(item.progress)}% • ${item.speed || 'Working...'}`
              : item.status === 'error' ? item.error
              : item.status === 'done' ? (item.skippedByArchive ? 'Skipped — already in archive' : [fileNameFromPath(item.outputPath), formatBytes(item.fileSize)].filter(Boolean).join(' • ') || 'Done')
              : item.formatLabel}
          </span>
        </div>
        {extraSummary && (
          <div className={styles.queueSubline} title={item.errorDetails || extraSummary}>
            {extraSummary}
          </div>
        )}
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
        {item.status === 'downloading' && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setCancelling(true); onCancel() }}
            disabled={cancelling}
            title="Cancel"
          >
            <CloseIcon />{cancelling ? 'Cancelling...' : 'Cancel'}
          </button>
        )}
        {(item.status === 'pending' || item.status === 'error') && <button className="btn btn-ghost btn-sm" onClick={onMoveNext} title="Move next"><ArrowNextIcon />Next</button>}
        {item.status !== 'downloading' && <button className="btn btn-ghost btn-sm" onClick={onMoveUp} title="Move up"><ArrowUpIcon />Up</button>}
        {item.status !== 'downloading' && <button className="btn btn-ghost btn-sm" onClick={onMoveDown} title="Move down"><ArrowDownIcon />Down</button>}
        {item.status === 'done' && <button className="btn btn-ghost btn-sm" onClick={onOpenFolder} title="Open folder"><FolderIcon />Open</button>}
        {item.status === 'done' && item.outputPath && <button className="btn btn-ghost btn-sm" onClick={onReveal} title="Reveal file"><FileIcon />Reveal</button>}
        {item.status === 'done' && item.outputPath && discordWebhookUrl && (item.fileSize ?? 0) <= DISCORD_MAX_BYTES && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={sendingToDiscord}
            title="Send to Discord"
            onClick={async () => {
              setSendingToDiscord(true)
              try {
                await window.api.sendDiscordWebhook({
                  webhookUrl: discordWebhookUrl,
                  embed: {
                    title: item.title,
                    url: item.url,
                    thumbnail: item.thumbnail,
                    duration: item.duration,
                    formatLabel: item.formatLabel,
                    outputPath: item.outputPath!,
                    fileSize: item.fileSize,
                  },
                  attachFile: true,
                  stripMetadata: discordStripMetadata,
                  includeEmbed: discordIncludeEmbed,
                  deleteAfterSend: discordDeleteAfterSend,
                }).then(({ deleted }) => { if (deleted) onDiscordFileDeleted() })
              } finally {
                setSendingToDiscord(false)
              }
            }}
          >
            <DiscordIcon />{sendingToDiscord ? 'Sending...' : 'Discord'}
          </button>
        )}
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

function moveQueueItemToNext(queue: QueueItem[], id: string) {
  const index = queue.findIndex((item) => item.id === id)
  if (index < 0 || queue[index].status === 'downloading') return queue

  const activeIndex = queue.findIndex((item) => item.status === 'downloading')
  const desiredIndex = activeIndex >= 0 ? activeIndex + 1 : 0
  if (index === desiredIndex) return queue

  const next = [...queue]
  const [item] = next.splice(index, 1)
  const insertIndex = Math.min(desiredIndex, next.length)
  next.splice(insertIndex, 0, item)
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

function ArrowNextIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6h5.5M5.8 3.8 8 6 5.8 8.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.8 2.2v7.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
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

function DiscordIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  )
}

function FailIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }}>
      <path d="M5 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM5 3.5v2M5 6.8v.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }}>
      <rect x="2" y="1.5" width="2.2" height="7" rx="1" fill="currentColor" />
      <rect x="5.8" y="1.5" width="2.2" height="7" rx="1" fill="currentColor" />
    </svg>
  )
}
