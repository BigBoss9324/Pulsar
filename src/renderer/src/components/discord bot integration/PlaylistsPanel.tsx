import { useState, useEffect, useCallback, useRef } from 'react'
import Button from '../Button'
import SessionTrackPicker from './SessionTrackPicker'
import styles from './PlaylistsPanel.module.css'

interface BotTrack {
  filePath?: string
  title: string
  artist?: string
  duration?: number
}

interface BotPlaylist {
  _id: string
  name: string
  tracks: BotTrack[]
}

interface Props {
  userId: string
  guildId: string | null
  channelId: string | null
  currentTrack: BotTrack | null
  currentQueue: BotTrack[]
  showToast: (msg: string, type: string) => void
  onQueueChanged: () => void
}

async function botFetch<T>(endpoint: string, options: { method?: string; body?: string } = {}): Promise<T> {
  const result = await window.api.botFetch({ endpoint: `/api/v1${endpoint}`, method: options.method, body: options.body })
  if (!result.ok) {
    const data = result.data as Record<string, unknown> | null
    const msg = (data && typeof data.error === 'string') ? data.error : JSON.stringify(data)
    throw new Error(`${result.status}: ${msg}`)
  }
  return result.data as T
}

function fmtDur(secs: number): string {
  if (!secs || secs <= 0) return ''
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function trackCountLabel(n: number): string {
  if (n === 0) return 'empty'
  return n === 1 ? '1 track' : `${n} tracks`
}

export default function PlaylistsPanel({ userId, guildId, channelId, currentTrack, currentQueue, showToast, onQueueChanged }: Props) {
  const [playlists, setPlaylists] = useState<BotPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const [formMode, setFormMode] = useState<'new' | 'save' | null>(null)
  const [formName, setFormName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingFilesTo, setAddingFilesTo] = useState<string | null>(null)
  const [sessionPickerFor, setSessionPickerFor] = useState<string | null>(null)
  const [addingSessionTo, setAddingSessionTo] = useState<string | null>(null)
  const [queueingTrackKey, setQueueingTrackKey] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    botFetch<BotPlaylist[]>(`/playlists/${userId}`)
      .then((data) => { if (alive.current) { setPlaylists(data); setLoading(false) } })
      .catch(() => { if (alive.current) setLoading(false) })
  }, [userId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (formMode !== null) {
      setFormName('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [formMode])

  // Only file-based tracks can be persisted (schema requires filePath)
  const sessionTracks = [
    ...(currentTrack?.filePath ? [currentTrack] : []),
    ...currentQueue.filter((t) => t.filePath),
  ]

  const handleSubmit = useCallback(async () => {
    const name = formName.trim()
    if (!name) return
    setSubmitting(true)
    try {
      const tracks = formMode === 'save' ? sessionTracks : []
      await botFetch<BotPlaylist>('/playlists', {
        method: 'POST',
        body: JSON.stringify({ userId, name, tracks }),
      })
      if (!alive.current) return
      setFormMode(null)
      setFormName('')
      load()
      showToast(
        formMode === 'save'
          ? `Saved "${name}" (${tracks.length} track${tracks.length !== 1 ? 's' : ''})`
          : `Created "${name}"`,
        'success',
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Failed: ${msg}`, 'error')
    } finally {
      if (alive.current) setSubmitting(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formName, formMode, userId, load, showToast])

  const handlePlay = useCallback(async (id: string) => {
    if (!guildId) { showToast('Select a server first', 'error'); return }
    setPlayingId(id)
    try {
      await botFetch(`/playlists/${id}/play`, {
        method: 'POST',
        body: JSON.stringify({ userId, guildId, channelId: channelId ?? undefined }),
      })
      onQueueChanged()
      showToast('Playlist queued', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Play failed: ${msg}`, 'error')
    } finally {
      if (alive.current) setPlayingId(null)
    }
  }, [guildId, userId, channelId, onQueueChanged, showToast])

  const handleQueueTrack = useCallback(async (playlistId: string, trackIdx: number) => {
    if (!guildId) { showToast('Select a server first', 'error'); return }
    const playlist = playlists.find((p) => p._id === playlistId)
    const track = playlist?.tracks[trackIdx]
    if (!track) return

    const key = `${playlistId}:${trackIdx}`
    setQueueingTrackKey(key)
    try {
      await botFetch('/music/queue/add', {
        method: 'POST',
        body: JSON.stringify({ guildId, channelId: channelId ?? undefined, track }),
      })
      if (!alive.current) return
      onQueueChanged()
      showToast('Added track to queue', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Queue failed: ${msg}`, 'error')
    } finally {
      if (alive.current) setQueueingTrackKey(null)
    }
  }, [channelId, guildId, onQueueChanged, playlists, showToast])

  const handleDelete = useCallback(async (id: string, name: string) => {
    setDeletingId(id)
    try {
      await botFetch(`/playlists/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ userId }),
      })
      if (!alive.current) return
      setPlaylists((prev) => prev.filter((p) => p._id !== id))
      if (expandedId === id) setExpandedId(null)
      showToast(`Deleted "${name}"`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Delete failed: ${msg}`, 'error')
    } finally {
      if (alive.current) setDeletingId(null)
    }
  }, [userId, expandedId, showToast])

  const handleExportFiles = useCallback(async (playlist: BotPlaylist) => {
    const localTracks = playlist.tracks.filter((track) => track.filePath)
    if (localTracks.length === 0) {
      showToast('This playlist has no local files to export', 'error')
      return
    }

    setExportingId(playlist._id)
    try {
      const result = await window.api.exportPlaylistFiles({ name: playlist.name, tracks: localTracks })
      if (!alive.current || result.canceled) return
      const skipped = result.skipped > 0 ? ` (${result.skipped} skipped)` : ''
      showToast(`Copied ${result.copied} file${result.copied !== 1 ? 's' : ''}${skipped}`, result.copied > 0 ? 'success' : 'error')
      if (result.folderPath) window.api.openFolder(result.folderPath).catch(() => {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(
        msg.includes('No handler registered')
          ? 'Restart Pulsar to enable playlist folder export'
          : `Export failed: ${msg}`,
        'error',
      )
    } finally {
      if (alive.current) setExportingId(null)
    }
  }, [showToast])

  const handleAddFiles = useCallback(async (id: string) => {
    const paths = await window.api.chooseAudioFiles()
    if (!paths.length || !alive.current) return
    setAddingFilesTo(id)
    const tracks = paths.map((p) => ({
      filePath: p,
      title: p.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? p,
      artist: 'Local File',
      duration: 0,
    }))
    try {
      await botFetch(`/playlists/${id}/tracks`, {
        method: 'POST',
        body: JSON.stringify({ userId, tracks }),
      })
      if (!alive.current) return
      load()
      showToast(`Added ${tracks.length} file${tracks.length !== 1 ? 's' : ''}`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Add failed: ${msg}`, 'error')
    } finally {
      if (alive.current) setAddingFilesTo(null)
    }
  }, [userId, load, showToast])

  const handleAddSession = useCallback(async (id: string, tracks: BotTrack[]) => {
    setAddingSessionTo(id)
    try {
      await botFetch(`/playlists/${id}/tracks`, {
        method: 'POST',
        body: JSON.stringify({ userId, tracks }),
      })
      if (!alive.current) return
      setSessionPickerFor(null)
      load()
      showToast(`Added ${tracks.length} track${tracks.length !== 1 ? 's' : ''}`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Add failed: ${msg}`, 'error')
    } finally {
      if (alive.current) setAddingSessionTo(null)
    }
  }, [userId, load, showToast])

  const handleRemoveTrack = useCallback(async (id: string, trackIdx: number) => {
    const playlist = playlists.find((p) => p._id === id)
    if (!playlist) return
    const tracks = playlist.tracks.filter((_, i) => i !== trackIdx)
    // Optimistic update
    setPlaylists((prev) => prev.map((p) => p._id === id ? { ...p, tracks } : p))
    try {
      await botFetch(`/playlists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ userId, tracks }),
      })
    } catch (err) {
      load() // revert on failure
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Remove failed: ${msg}`, 'error')
    }
  }, [playlists, userId, load, showToast])

  const handleMoveTrack = useCallback(async (id: string, trackIdx: number, offset: -1 | 1) => {
    const playlist = playlists.find((p) => p._id === id)
    if (!playlist) return

    const targetIdx = trackIdx + offset
    if (targetIdx < 0 || targetIdx >= playlist.tracks.length) return

    const tracks = [...playlist.tracks]
    const [track] = tracks.splice(trackIdx, 1)
    tracks.splice(targetIdx, 0, track)

    setPlaylists((prev) => prev.map((p) => p._id === id ? { ...p, tracks } : p))
    try {
      await botFetch(`/playlists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ userId, tracks }),
      })
    } catch (err) {
      load()
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Move failed: ${msg}`, 'error')
    }
  }, [playlists, userId, load, showToast])

  const handleMoveTrackNext = useCallback(async (id: string, trackIdx: number) => {
    const playlist = playlists.find((p) => p._id === id)
    if (!playlist || trackIdx <= 0) return

    const tracks = [...playlist.tracks]
    const [track] = tracks.splice(trackIdx, 1)
    tracks.splice(0, 0, track)

    setPlaylists((prev) => prev.map((p) => p._id === id ? { ...p, tracks } : p))
    try {
      await botFetch(`/playlists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ userId, tracks }),
      })
    } catch (err) {
      load()
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Move failed: ${msg}`, 'error')
    }
  }, [playlists, userId, load, showToast])

  return (
    <>
      <div className={`card ${styles.panel}`}>
        <div className={styles.header}>
          <span className={styles.title}>Playlists</span>
          {playlists.length > 0 && (
            <span className={styles.count}>{playlists.length}</span>
          )}
          {formMode === null && (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={sessionTracks.length === 0}
                title={sessionTracks.length === 0 ? 'Nothing in the current session to save' : `Save ${sessionTracks.length} track${sessionTracks.length !== 1 ? 's' : ''} as a playlist`}
                onClick={() => setFormMode('save')}
              >
                Save queue
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFormMode('new')}>
                + New
              </Button>
            </>
          )}
        </div>

        {formMode !== null && (
          <>
            <div className={styles.createForm}>
              <input
                ref={inputRef}
                className={`input ${styles.createInput}`}
                type="text"
                placeholder="Playlist name…"
                value={formName}
                maxLength={64}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSubmit()
                  if (e.key === 'Escape') setFormMode(null)
                }}
              />
              <Button
                variant="primary"
                size="sm"
                disabled={!formName.trim() || submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting ? '…' : formMode === 'save' ? 'Save' : 'Create'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFormMode(null)}>Cancel</Button>
            </div>
            {formMode === 'save' && (
              <span className={styles.createHint}>
                {sessionTracks.length} track{sessionTracks.length !== 1 ? 's' : ''} from the current session
              </span>
            )}
          </>
        )}

        {loading ? (
          <span className="muted" style={{ fontSize: 13 }}>Loading…</span>
        ) : playlists.length === 0 && formMode === null ? (
          <div className={styles.empty}>
            No playlists yet — create one or save the current queue
          </div>
        ) : (
          <div className={styles.list}>
            {playlists.map((pl) => {
              const isExpanded = expandedId === pl._id
              return (
                <div key={pl._id} className={`${styles.item} ${isExpanded ? styles.itemExpanded : ''}`}>
                  {/* Main row */}
                  <div className={styles.itemRow}>
                    <Button
                      variant="unstyled"
                      className={styles.expandBtn}
                      title={isExpanded ? 'Collapse' : 'Expand'}
                      aria-label={isExpanded ? 'Collapse playlist' : 'Expand playlist'}
                      onClick={() => setExpandedId(isExpanded ? null : pl._id)}
                    >
                      {isExpanded ? '▾' : '▸'}
                    </Button>
                    <div className={styles.itemMeta}>
                      <span className={styles.itemName} title={pl.name}>{pl.name}</span>
                      <span className={styles.itemCount}>{trackCountLabel(pl.tracks.length)}</span>
                    </div>
                    <div className={styles.itemBtns}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={exportingId === pl._id || pl.tracks.every((track) => !track.filePath)}
                        title={pl.tracks.some((track) => track.filePath) ? 'Copy local playlist files into one folder' : 'No local files in this playlist'}
                        onClick={() => void handleExportFiles(pl)}
                      >
                        <FolderExportIcon />{exportingId === pl._id ? 'Copying...' : 'Folder'}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!guildId || playingId === pl._id}
                        title={!guildId ? 'Select a server first' : 'Play this playlist'}
                        onClick={() => void handlePlay(pl._id)}
                      >
                        {playingId === pl._id ? '…' : '▶ Play'}
                      </Button>
                      <Button
                        variant="unstyled"
                        className={styles.expandBtn}
                        title={isExpanded ? 'Collapse' : 'Expand'}
                        aria-label={isExpanded ? 'Collapse playlist' : 'Expand playlist'}
                        onClick={() => setExpandedId(isExpanded ? null : pl._id)}
                      >
                        {isExpanded ? 'â–¾' : 'â–¸'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletingId === pl._id}
                        title="Delete playlist"
                        onClick={() => void handleDelete(pl._id, pl.name)}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>

                  {/* Expanded section */}
                  {isExpanded && (
                    <div className={styles.expanded}>
                      {pl.tracks.length === 0 ? (
                        <span className={styles.tracksEmpty}>No tracks yet</span>
                      ) : (
                        <div className={styles.trackList}>
                          {pl.tracks.map((track, idx) => (
                            <div key={idx} className={styles.trackItem}>
                              <span className={styles.trackName} title={track.title}>{track.title}</span>
                              {track.duration ? <span className={styles.trackDur}>{fmtDur(track.duration)}</span> : null}
                              <div className={styles.trackBtns}>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Move next"
                                aria-label="Move next"
                                onClick={() => void handleMoveTrackNext(pl._id, idx)}
                              >
                                <ArrowNextIcon />Next
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Move up"
                                aria-label="Move up"
                                onClick={() => void handleMoveTrack(pl._id, idx, -1)}
                              >
                                <ArrowUpIcon />Up
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Move down"
                                aria-label="Move down"
                                onClick={() => void handleMoveTrack(pl._id, idx, 1)}
                              >
                                <ArrowDownIcon />Down
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={styles.trackQueueActionBtn}
                                title={!guildId ? 'Select a server first' : 'Add to queue'}
                                aria-label="Add to queue"
                                disabled={!guildId || queueingTrackKey === `${pl._id}:${idx}`}
                                onClick={() => void handleQueueTrack(pl._id, idx)}
                              >
                                <QueueAddIcon />{queueingTrackKey === `${pl._id}:${idx}` ? 'Adding...' : 'Queue'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={styles.trackRemoveTextBtn}
                                title="Remove from playlist"
                                aria-label="Remove from playlist"
                                onClick={() => void handleRemoveTrack(pl._id, idx)}
                              >
                                <TrackTrashIcon />Remove
                                ✕
                              </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className={styles.addRow}>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={addingFilesTo === pl._id}
                          onClick={() => void handleAddFiles(pl._id)}
                        >
                          {addingFilesTo === pl._id ? 'Adding…' : '+ Add files'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={sessionTracks.length === 0}
                          title={sessionTracks.length === 0 ? 'Nothing playing or queued in the bot' : `Pick from ${sessionTracks.length} session track${sessionTracks.length !== 1 ? 's' : ''}`}
                          onClick={() => setSessionPickerFor(pl._id)}
                        >
                          + From session{sessionTracks.length > 0 ? ` (${sessionTracks.length})` : ''}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {sessionPickerFor !== null && (
        <SessionTrackPicker
          tracks={sessionTracks}
          adding={addingSessionTo === sessionPickerFor}
          onAdd={(tracks) => void handleAddSession(sessionPickerFor, tracks)}
          onClose={() => setSessionPickerFor(null)}
        />
      )}
    </>
  )
}

function ArrowUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 9V3M3.5 5.5 6 3l2.5 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 3v6M3.5 6.5 6 9l2.5-2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowNextIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6h6M6.2 3.8 8.5 6 6.2 8.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 3v6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

function QueueAddIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M1.5 3.5h6M1.5 6h4M1.5 8.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M8.5 6v3.5M10.25 7.75H6.75" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

function FolderExportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h1.2c.4 0 .78.16 1.06.44l.3.31c.28.28.66.44 1.06.44H9A1.5 1.5 0 0 1 10.5 4.7v3.8A1.5 1.5 0 0 1 9 10H3A1.5 1.5 0 0 1 1.5 8.5v-5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M6 5.1v3M4.8 6.9 6 8.1l1.2-1.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrackTrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 3h7M4.5 3V2.3c0-.44.36-.8.8-.8h1.4c.44 0 .8.36.8.8V3M4 4.5v3M6 4.5v3M8 4.5v3M3.5 3l.34 5.1c.03.5.45.9.95.9h2.42c.5 0 .92-.4.95-.9L8.5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
