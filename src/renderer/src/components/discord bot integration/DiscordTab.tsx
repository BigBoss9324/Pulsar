import { useState, useEffect, useRef, useCallback } from 'react'
import type { QueueItem } from '../../types'
import Button from '../Button'
import DownloadQueuePicker from './DownloadQueuePicker'
import PlaylistsPanel from './PlaylistsPanel'
import styles from './DiscordTab.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiscordUser {
  id: string
  username: string
  discriminator: string
  avatar: string | null
  global_name: string | null
}

interface Guild {
  id: string
  name: string
  icon: string | null  // full CDN URL from bot's g.iconURL()
}

interface TrackInfo {
  title: string
  artist?: string
  duration: number
  filePath?: string
  url?: string
  startedAt?: number
}

interface PlayerState {
  guildId: string
  status: string  // 'idle' | 'playing' | 'paused' | 'buffering' | 'autopaused'
  currentTrack: TrackInfo | null
  queue: TrackInfo[]
  volume: number
  loopMode: 'none' | 'track' | 'queue'
  connected: boolean
  channelId: string | null
  channelName: string | null
  historyCount: number
  positionMs: number
}

interface UserVoiceState {
  channelId?: string | null
  channel_id?: string | null
  voiceChannelId?: string | null
  voice_channel_id?: string | null
  channelName?: string | null
  channel_name?: string | null
  channel?: {
    id?: string | null
    name?: string | null
  } | null
  voiceChannel?: {
    id?: string | null
    name?: string | null
  } | null
  voice?: UserVoiceState | null
  voiceState?: UserVoiceState | null
  data?: UserVoiceState | null
  id?: string | null
  name?: string | null
}

interface DetectedVoice {
  guildId: string
  guildName: string
  channelId: string
  channelName: string | null
}

interface VoiceDebugState {
  status: 'idle' | 'scanning' | 'found' | 'not-found' | 'error'
  checkedGuilds: number
  lastGuildId: string | null
  lastGuildName: string | null
  lastResult: string
  scannedAt: string | null
}


// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'discord_bot_tab_token'
const POLL_MS = 2500
const VOICE_DETECT_MS = 5000

// ─── API helpers ─────────────────────────────────────────────────────────────

async function botFetch<T>(endpoint: string, options: { method?: string; body?: string } = {}): Promise<T> {
  const result = await window.api.botFetch({ endpoint: `/api/v1${endpoint}`, method: options.method, body: options.body })
  if (!result.ok) {
    const data = result.data as Record<string, unknown> | null
    const msg = (data && typeof data.error === 'string') ? data.error : JSON.stringify(data)
    throw new Error(`${result.status}: ${msg}`)
  }
  return result.data as T
}

async function discordFetch<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`https://discord.com/api/v10${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Discord ${res.status}`)
  return res.json() as Promise<T>
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function fmtDur(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function parseDurationLabel(label: string): number {
  const parts = label.split(':').map((part) => Number(part))
  if (parts.some((part) => !Number.isFinite(part))) return 0
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2]
  if (parts.length === 2) return (parts[0] * 60) + parts[1]
  return parts[0] || 0
}


function seekGradient(pct: number, active: boolean): string {
  const fill = active ? 'var(--accent)' : 'var(--text-muted)'
  return `linear-gradient(to right, ${fill} ${pct}%, var(--surface3) ${pct}%)`
}

function avatarUrl(u: DiscordUser): string {
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
  const idx = parseInt(u.discriminator || '0') % 5
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`
}

function parseVoiceState(data: UserVoiceState | null): { id: string; name: string | null } | null {
  if (!data) return null
  const nested = data.data ?? data.voice ?? data.voiceState ?? null
  if (nested) return parseVoiceState(nested)

  const id = data.channelId
    ?? data.channel_id
    ?? data.voiceChannelId
    ?? data.voice_channel_id
    ?? data.channel?.id
    ?? data.voiceChannel?.id
    ?? data.id
    ?? null
  if (!id) return null
  return {
    id,
    name: data.channelName
      ?? data.channel_name
      ?? data.channel?.name
      ?? data.voiceChannel?.name
      ?? data.name
      ?? null,
  }
}

function summarizeDebugValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text) return 'empty'
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  showToast: (msg: string, type: string) => void
  defaultOutputDir?: string
  isDev?: boolean
}

// ─── DiscordTab ───────────────────────────────────────────────────────────────

export default function DiscordTab({ showToast, defaultOutputDir, isDev = false }: Props) {
  const [authStatus, setAuthStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<DiscordUser | null>(null)
  const [mutualGuilds, setMutualGuilds] = useState<Guild[]>([])
  const [botGuilds, setBotGuilds] = useState<Guild[]>([])
  const [guildsStatus, setGuildsStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [player, setPlayer] = useState<PlayerState | null>(null)
  const [seekDraft, setSeekDraft] = useState<number | null>(null)
  const [volDraft, setVolDraft] = useState<number | null>(null)
  const [addingFiles, setAddingFiles] = useState(false)
  const [addingDownloads, setAddingDownloads] = useState(false)
  const [downloadPickerOpen, setDownloadPickerOpen] = useState(false)
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<TrackInfo | null>(null)
  const [downloadQueueItems, setDownloadQueueItems] = useState<QueueItem[]>([])
  const [locatingVoice, setLocatingVoice] = useState(false)
  const [joiningVoice, setJoiningVoice] = useState(false)
  const [detectingVoice, setDetectingVoice] = useState(false)
  const [detectedVoice, setDetectedVoice] = useState<DetectedVoice | null>(null)
  const [voiceDebug, setVoiceDebug] = useState<VoiceDebugState>({
    status: 'idle',
    checkedGuilds: 0,
    lastGuildId: null,
    lastGuildName: null,
    lastResult: 'not scanned yet',
    scannedAt: null,
  })

  const [botOnline, setBotOnline] = useState<boolean | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const botPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const alive = useRef(true)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  // Poll bot health endpoint independently of everything else
  useEffect(() => {
    const check = () => {
      botFetch<{ ok: boolean }>('/health')
        .then(() => { if (alive.current) setBotOnline(true) })
        .catch(() => { if (alive.current) setBotOnline(false) })
    }
    check()
    botPollRef.current = setInterval(check, 5000)
    return () => { if (botPollRef.current) clearInterval(botPollRef.current) }
  }, [])

  // Restore persisted token
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY)
    if (saved) void validateToken(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadGuilds = useCallback(async (tok: string, userId: string) => {
    setGuildsStatus('loading')
    try {
      const botGuilds = await botFetch<Guild[]>('/guilds')
      if (!alive.current) return
      setBotGuilds(botGuilds)

      try {
        const userGuilds = await discordFetch<Guild[]>('/users/@me/guilds', tok)
        if (!alive.current) return
        const botIds = new Set(botGuilds.map((g) => g.id))
        setMutualGuilds(userGuilds.filter((g) => botIds.has(g.id)).map((g) => {
          // Prefer bot's guild icon (full URL) if available
          const botGuild = botGuilds.find((bg) => bg.id === g.id)
          return { id: g.id, name: g.name, icon: botGuild?.icon ?? null }
        }))
      } catch {
        if (!alive.current) return
        setMutualGuilds([])
      }
      setGuildsStatus('ok')
    } catch {
      if (!alive.current) return
      setGuildsStatus('error')
    }
  }, [])

  const validateToken = useCallback(async (tok: string) => {
    setAuthStatus('loading')
    let u: DiscordUser
    try {
      u = await discordFetch<DiscordUser>('/users/@me', tok)
      if (!alive.current) return
      setUser(u)
      setToken(tok)
      tokenRef.current = tok
      localStorage.setItem(TOKEN_KEY, tok)
      setAuthStatus('done')
    } catch {
      if (!alive.current) return
      localStorage.removeItem(TOKEN_KEY)
      setToken(null)
      tokenRef.current = null
      setUser(null)
      setAuthStatus('error')
      return
    }
    void loadGuilds(tok, u.id)
  }, [loadGuilds])

  const handleLogin = useCallback(async () => {
    setAuthStatus('loading')
    try {
      const result = await window.api.discordOAuthLogin()
      await validateToken(result.access_token)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed'
      if (msg !== 'Authentication timed out') showToast(`Login failed: ${msg}`, 'error')
      setAuthStatus('idle')
    }
  }, [validateToken, showToast])

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setToken(null)
    tokenRef.current = null
    setUser(null)
    setMutualGuilds([])
    setBotGuilds([])
    setGuildsStatus('idle')
    setSelectedGuildId(null)
    setSelectedChannelId(null)
    setDetectedVoice(null)
    setJoiningVoice(false)
    setPlayer(null)
    setAuthStatus('idle')
  }, [])

  useEffect(() => {
    if (!selectedGuildId) setSelectedChannelId(null)
  }, [selectedGuildId])

  // Poll player state whenever a guild is selected
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setPlayer(null)
    if (!selectedGuildId) return

    const poll = () => {
      botFetch<PlayerState>(`/music/player/${selectedGuildId}`)
        .then((s) => { if (alive.current) setPlayer(s) })
        .catch(() => {})
    }
    poll()
    pollRef.current = setInterval(poll, POLL_MS)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [selectedGuildId])

  const playerCmd = useCallback(async (
    action: 'resume' | 'pause' | 'skip' | 'stop' | 'previous',
  ) => {
    if (!selectedGuildId) return
    try {
      await botFetch(`/music/${action}/${selectedGuildId}`, { method: 'POST' })
    } catch {
      showToast('Command failed', 'error')
    }
  }, [selectedGuildId, showToast])

  const handleLoopCycle = useCallback(() => {
    if (!selectedGuildId) return
    const next = { none: 'track', track: 'queue', queue: 'none' } as const
    const mode = next[player?.loopMode ?? 'none']
    botFetch(`/music/loop/${selectedGuildId}`, {
      method: 'PATCH',
      body: JSON.stringify({ mode }),
    }).catch(() => showToast('Loop change failed', 'error'))
  }, [selectedGuildId, player?.loopMode, showToast])

  const handleSeekCommit = useCallback((v: number) => {
    if (!selectedGuildId) return
    setSeekDraft(null)
    botFetch(`/music/seek/${selectedGuildId}`, {
      method: 'POST',
      body: JSON.stringify({ position: v }),
    }).catch(() => showToast('Seek failed', 'error'))
  }, [selectedGuildId, showToast])

  const handleVolCommit = useCallback((v: number) => {
    if (!selectedGuildId) return
    setVolDraft(null)
    botFetch(`/music/volume/${selectedGuildId}`, {
      method: 'PATCH',
      body: JSON.stringify({ volume: v }),
    }).catch(() => showToast('Volume change failed', 'error'))
  }, [selectedGuildId, showToast])

  const refreshPlayer = useCallback(async () => {
    if (!selectedGuildId) return
    try {
      const state = await botFetch<PlayerState>(`/music/player/${selectedGuildId}`)
      if (alive.current) setPlayer(state)
    } catch {
      // Polling will recover if the bot is temporarily unavailable.
    }
  }, [selectedGuildId])

  const joinChannel = useCallback(async (guildId: string, channelId: string) => {
    await botFetch(`/music/join/${guildId}`, {
      method: 'POST',
      body: JSON.stringify({ channelId }),
    })
  }, [])

  const findCurrentVoice = useCallback(async (): Promise<DetectedVoice | null> => {
    const guildMap = new Map<string, Guild>()
    for (const guild of mutualGuilds) guildMap.set(guild.id, guild)
    for (const guild of botGuilds) guildMap.set(guild.id, guild)
    const guildsToScan = [...guildMap.values()]

    const scannedAt = new Date().toLocaleTimeString()
    if (!user || guildsToScan.length === 0) {
      setVoiceDebug({
        status: 'not-found',
        checkedGuilds: 0,
        lastGuildId: null,
        lastGuildName: null,
        lastResult: user ? 'no bot guilds loaded' : 'no user loaded',
        scannedAt,
      })
      return null
    }

    setVoiceDebug((prev) => ({
      ...prev,
      status: 'scanning',
      checkedGuilds: 0,
      lastResult: `scanning ${guildsToScan.length} guilds`,
      scannedAt,
    }))

    let checkedGuilds = 0
    let lastGuildId: string | null = null
    let lastGuildName: string | null = null
    let lastResult = 'no response'

    for (const guild of guildsToScan) {
      checkedGuilds += 1
      lastGuildId = guild.id
      lastGuildName = guild.name
      try {
        const result = await botFetch<unknown>(`/guilds/${guild.id}/voice/${user.id}`)
        lastResult = summarizeDebugValue(result)
        const voiceState = parseVoiceState(result as UserVoiceState | null)
        if (!voiceState) continue
        setVoiceDebug({
          status: 'found',
          checkedGuilds,
          lastGuildId,
          lastGuildName,
          lastResult,
          scannedAt,
        })
        return {
          guildId: guild.id,
          guildName: guild.name,
          channelId: voiceState.id,
          channelName: voiceState.name,
        }
      } catch (err) {
        lastResult = err instanceof Error ? err.message : String(err)
        // The user is usually absent from most shared servers; keep scanning.
      }
    }

    setVoiceDebug({
      status: 'not-found',
      checkedGuilds,
      lastGuildId,
      lastGuildName,
      lastResult,
      scannedAt,
    })
    return null
  }, [botGuilds, mutualGuilds, user])

  useEffect(() => {
    if (!user || (mutualGuilds.length === 0 && botGuilds.length === 0)) return

    let cancelled = false
    const detect = (showBusy: boolean) => {
      if (showBusy) setDetectingVoice(true)
      void findCurrentVoice()
        .then((voice) => {
          if (cancelled || !alive.current) return
          setDetectedVoice(voice)
          if (!voice) return
          setSelectedGuildId(voice.guildId)
          setSelectedChannelId(voice.channelId)
        })
        .finally(() => {
          if (!cancelled && alive.current && showBusy) setDetectingVoice(false)
        })
    }

    detect(true)
    const interval = setInterval(() => detect(false), VOICE_DETECT_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [botGuilds.length, findCurrentVoice, mutualGuilds.length, user])

  const handleJoinMyChannel = useCallback(async () => {
    if (!user || locatingVoice || joiningVoice) return
    setLocatingVoice(true)
    try {
      if (guildsStatus === 'loading') {
        showToast('Still loading your shared servers', 'error')
        return
      }
      if (mutualGuilds.length === 0 && botGuilds.length === 0) {
        showToast('No bot servers found to scan', 'error')
        return
      }

      const voice = await findCurrentVoice()
      if (voice) {
        setDetectedVoice(voice)
        setSelectedGuildId(voice.guildId)
        setSelectedChannelId(voice.channelId)
        setLocatingVoice(false)
        setJoiningVoice(true)
        await joinChannel(voice.guildId, voice.channelId)
        return
      }

      setDetectedVoice(null)
      showToast('Join a voice channel in a server where the bot is present', 'error')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Join failed: ${msg}`, 'error')
    } finally {
      if (alive.current) setLocatingVoice(false)
      if (alive.current) setJoiningVoice(false)
    }
  }, [botGuilds.length, findCurrentVoice, guildsStatus, joinChannel, joiningVoice, locatingVoice, mutualGuilds.length, showToast, user])

  const handleDisconnect = useCallback(async () => {
    if (!selectedGuildId) return
    try {
      await botFetch(`/music/disconnect/${selectedGuildId}`, { method: 'POST' })
    } catch {
      showToast('Failed to disconnect', 'error')
    }
  }, [selectedGuildId, showToast])

  const handlePickFiles = useCallback(async (mode: 'add' | 'next' = 'add') => {
    if (!selectedGuildId || addingFiles) return
    const channelId = player?.channelId ?? selectedChannelId
    const paths = await window.api.chooseAudioFiles()
    if (!paths.length || !alive.current) return
    setAddingFiles(true)
    const endpoint = mode === 'next' ? '/music/queue/add-next' : '/music/queue/add'
    const results = await Promise.allSettled(paths.map((p) => {
      const name = p.split(/[\\/]/).pop() ?? p
      return botFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          guildId: selectedGuildId,
          channelId,
          track: { filePath: p, title: name.replace(/\.[^.]+$/, ''), artist: 'Local File', duration: 0 },
        }),
      })
    }))
    setAddingFiles(false)
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    const added = results.length - failures.length
    if (added > 0) showToast(
      added === 1
        ? (mode === 'next' ? 'Playing next' : 'Added 1 file to queue')
        : (mode === 'next' ? `Added ${added} files as next` : `Added ${added} files to queue`),
      'success'
    )
    if (added > 0) void refreshPlayer()
    if (failures.length > 0) {
      const reason = failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason)
      showToast(failures.length === 1 ? `Failed: ${reason}` : `${failures.length} files failed: ${reason}`, 'error')
    }
  }, [selectedGuildId, selectedChannelId, player?.channelId, addingFiles, refreshPlayer, showToast])

  const handleOpenDownloadPicker = useCallback(async () => {
    if (addingDownloads) return
    setAddingDownloads(true)
    try {
      const items = await window.api.getQueueState() as QueueItem[]
      if (!alive.current) return
      const playableItems = items.filter((item) => item.status === 'done' && Boolean(item.outputPath) && !item.skippedByArchive)
      setDownloadQueueItems(playableItems)
      setDownloadPickerOpen(true)
      if (playableItems.length === 0) showToast('No completed download queue files found', 'error')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Could not load download queue: ${msg}`, 'error')
    } finally {
      if (alive.current) setAddingDownloads(false)
    }
  }, [addingDownloads, showToast])

  const handleAddDownloadQueue = useCallback(async (playableItems: QueueItem[], mode: 'add' | 'next' = 'add') => {
    if (!selectedGuildId || addingDownloads) return
    const channelId = player?.channelId ?? selectedChannelId
    if (playableItems.length === 0) {
      showToast('Select at least one downloaded file', 'error')
      return
    }

    setAddingDownloads(true)
    try {
      if (!alive.current) return

      const endpoint = mode === 'next' ? '/music/queue/add-next' : '/music/queue/add'
      const results = await Promise.allSettled(playableItems.map((item) => (
        botFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify({
            guildId: selectedGuildId,
            channelId,
            track: {
              filePath: item.outputPath,
              title: item.title || item.filename || 'Downloaded File',
              artist: item.formatLabel || 'Download Queue',
              duration: parseDurationLabel(item.duration),
            },
          }),
        })
      )))

      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      const added = results.length - failures.length
      if (added > 0) {
        setDownloadPickerOpen(false)
        void refreshPlayer()
        showToast(
          added === 1
            ? (mode === 'next' ? 'Playing downloaded file next' : 'Added 1 downloaded file')
            : (mode === 'next' ? `Added ${added} downloaded files as next` : `Added ${added} downloaded files`),
          'success',
        )
      }
      if (failures.length > 0) {
        const reason = failures[0].reason instanceof Error ? failures[0].reason.message : String(failures[0].reason)
        showToast(`${failures.length} download queue file${failures.length === 1 ? '' : 's'} could not be added: ${reason}`, 'error')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Could not load download queue: ${msg}`, 'error')
    } finally {
      if (alive.current) setAddingDownloads(false)
    }
  }, [selectedGuildId, selectedChannelId, player?.channelId, addingDownloads, refreshPlayer, showToast])

  const handleRemoveQueue = useCallback(async (index: number) => {
    if (!selectedGuildId) return
    try {
      const result = await botFetch<{ ok: boolean; state?: PlayerState }>(`/music/queue/${selectedGuildId}/${index}`, { method: 'DELETE' })
      if (result.state && alive.current) setPlayer(result.state)
    } catch {
      showToast('Failed to remove', 'error')
    }
  }, [selectedGuildId, showToast])

  const rebuildQueueOrder = useCallback(async (fromIndex: number, targetIndex: number) => {
    if (!selectedGuildId || !player) return false
    const currentQueue = player.queue ?? []
    if (fromIndex < 0 || fromIndex >= currentQueue.length || targetIndex < 0 || targetIndex >= currentQueue.length) return false

    const reordered = [...currentQueue]
    const [trackToMove] = reordered.splice(fromIndex, 1)
    reordered.splice(targetIndex, 0, trackToMove)

    setPlayer({ ...player, queue: reordered })

    await botFetch(`/music/queue/${selectedGuildId}`, { method: 'DELETE' })
    const channelId = player.channelId ?? selectedChannelId
    for (const track of reordered) {
      await botFetch('/music/queue/add', {
        method: 'POST',
        body: JSON.stringify({ guildId: selectedGuildId, channelId: channelId ?? undefined, track }),
      })
    }
    void refreshPlayer()
    return true
  }, [player, refreshPlayer, selectedChannelId, selectedGuildId])

  const handleMoveQueue = useCallback(async (index: number, offset: -1 | 1) => {
    if (!selectedGuildId) return
    const queueLength = player?.queue?.length ?? 0
    const targetIndex = index + offset
    if (targetIndex < 0 || targetIndex >= queueLength) return

    try {
      const result = await botFetch<{ ok: boolean; state?: PlayerState }>(`/music/queue/${selectedGuildId}/${index}`, {
        method: 'PATCH',
        body: JSON.stringify({ targetIndex }),
      })
      if (result.state && alive.current) setPlayer(result.state)
      else void refreshPlayer()
    } catch {
      try {
        const moved = await rebuildQueueOrder(index, targetIndex)
        if (!moved) showToast('Failed to move queue item', 'error')
      } catch {
        void refreshPlayer()
        showToast('Failed to move queue item', 'error')
      }
    }
  }, [player?.queue?.length, rebuildQueueOrder, refreshPlayer, selectedGuildId, showToast])

  const handleMoveQueueNext = useCallback(async (index: number) => {
    if (!selectedGuildId || index <= 0) return
    try {
      const result = await botFetch<{ ok: boolean; state?: PlayerState }>(`/music/queue/${selectedGuildId}/${index}`, {
        method: 'PATCH',
        body: JSON.stringify({ targetIndex: 0 }),
      })
      if (result.state && alive.current) setPlayer(result.state)
      else void refreshPlayer()
    } catch {
      try {
        const moved = await rebuildQueueOrder(index, 0)
        if (!moved) showToast('Failed to move queue item next', 'error')
      } catch {
        void refreshPlayer()
        showToast('Failed to move queue item next', 'error')
      }
    }
  }, [rebuildQueueOrder, refreshPlayer, selectedGuildId, showToast])

  const handleClearQueue = useCallback(async () => {
    if (!selectedGuildId) return
    try {
      const result = await botFetch<{ ok: boolean; state?: PlayerState }>(`/music/queue/${selectedGuildId}`, { method: 'DELETE' })
      if (result.state && alive.current) setPlayer(result.state)
    } catch {
      showToast('Failed to clear queue', 'error')
    }
  }, [selectedGuildId, showToast])

  // ─── Derived state ───────────────────────────────────────────────────────

  const track = player?.currentTrack ?? null
  const seekPos = seekDraft ?? (player?.positionMs ?? 0) / 1000
  const duration = track?.duration ?? 0
  const isPlaying = player?.status === 'playing'
  const seekDuration = duration > 0 && isPlaying && seekPos >= duration
    ? seekPos + 1
    : duration
  const seekPct = seekDuration > 0 ? Math.min(100, (seekPos / seekDuration) * 100) : 0
  const volume = volDraft ?? player?.volume ?? 100
  const volPct = Math.min(100, volume)
  const hasTrack = track != null
  const canSeek = hasTrack && Boolean(track?.url)
  const loopMode = player?.loopMode ?? 'none'
  const hasPrev = (player?.historyCount ?? 0) > 0
  const activeChannelId = player?.channelId ?? selectedChannelId
  const detectedChannelLabel = detectedVoice?.channelName ? `# ${detectedVoice.channelName}` : 'your current voice channel'
  const connectedGuildName = selectedGuildId
    ? botGuilds.find((guild) => guild.id === selectedGuildId)?.name
      ?? mutualGuilds.find((guild) => guild.id === selectedGuildId)?.name
      ?? detectedVoice?.guildName
      ?? null
    : detectedVoice?.guildName ?? null
  const connectedChannelLabel = player?.channelName
    ? `# ${player.channelName}`
    : detectedVoice?.channelName
      ? `# ${detectedVoice.channelName}`
      : 'voice channel'
  const connectedLabel = connectedGuildName
    ? `Connected: ${connectedGuildName} / ${connectedChannelLabel}`
    : `Connected: ${connectedChannelLabel}`
  const userMovedVoice = Boolean(
    player?.connected
      && detectedVoice
      && (detectedVoice.guildId !== player.guildId || detectedVoice.channelId !== player.channelId)
  )
  const joinLabel = locatingVoice
    ? 'Finding...'
    : joiningVoice
      ? `Joining ${detectedChannelLabel}...`
    : detectedVoice
      ? `Join ${detectedChannelLabel}`
      : detectingVoice
        ? 'Detecting VC...'
        : 'Join my channel'

  // ─── Render ──────────────────────────────────────────────────────────────

  if (authStatus !== 'done' || !user) {
    return (
      <div className={styles.root}>
        {botOnline === false && <BotOfflineBanner />}
        <LoginScreen status={authStatus} onLogin={handleLogin} />
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {botOnline === false && <BotOfflineBanner />}
      {/* User bar */}
      <div className={styles.userBar}>
        <img className={styles.avatar} src={avatarUrl(user)} alt="" />
        <span className={styles.username}>{user.global_name || user.username}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout}>Disconnect</Button>
      </div>

      <div className={styles.layout}>
        {/* Content pane */}
        <div className={`${styles.content} appScroll`}>
          {false && (
            <div className={styles.placeholder}>
              <div className={styles.placeholderIcon}><DiscordIcon size={52} /></div>
              <div className={styles.placeholderText}>Select a server to get started</div>
            </div>
          )}

          {true && (
            <>
              {/* ── Player ── */}
              <div className={styles.playerCard}>
                {/* Connection bar */}
                <div className={styles.connectionBar}>
                  <span className={`${styles.connDot} ${player?.connected ? styles.connDotOn : styles.connDotOff}`} />
                  <span className={styles.connLabel}>
                    {player?.connected
                      ? userMovedVoice
                        ? `${connectedLabel} · You are in ${detectedChannelLabel}`
                        : connectedLabel
                      : joiningVoice
                        ? `Joining ${detectedChannelLabel}...`
                      : detectedVoice
                        ? `Ready to join ${detectedChannelLabel}`
                        : detectingVoice
                          ? 'Detecting your voice channel...'
                          : 'Not connected'}
                  </span>
                  <div className={styles.connActions}>
                    {!player?.connected && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={locatingVoice || joiningVoice}
                        onClick={() => void handleJoinMyChannel()}
                      >
                        {joinLabel}
                      </Button>
                    )}
                    {player?.connected && (
                      <>
                        {userMovedVoice && (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={locatingVoice || joiningVoice}
                            onClick={() => void handleJoinMyChannel()}
                          >
                            {joiningVoice ? 'Moving...' : `Move to ${detectedChannelLabel}`}
                          </Button>
                        )}
                        <Button variant="danger" size="sm" className={styles.kickBtn} onClick={() => void handleDisconnect()}>
                          Disconnect
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {isDev && (
                  <div className={styles.debugRow}>
                    <span>voice: {voiceDebug.status}</span>
                    <span>checked: {voiceDebug.checkedGuilds}</span>
                    <span>user: {user.id}</span>
                    <span>selectedGuild: {selectedGuildId ?? 'none'}</span>
                    <span>selectedChannel: {selectedChannelId ?? 'none'}</span>
                    <span>detected: {detectedVoice ? `${detectedVoice.guildId}/${detectedVoice.channelId}` : 'none'}</span>
                    <span>lastGuild: {voiceDebug.lastGuildName ?? voiceDebug.lastGuildId ?? 'none'}</span>
                    <span>last: {voiceDebug.lastResult}</span>
                    {voiceDebug.scannedAt && <span>at: {voiceDebug.scannedAt}</span>}
                  </div>
                )}

                <div className={styles.nowPlaying}>
                  <div className={styles.trackThumbEmpty}>
                    {(track?.filePath || (track && !track.url)) ? <LocalFileIcon size={28} ext={track.filePath?.split('.').pop()} /> : <MusicNoteIcon size={28} />}
                  </div>
                  <div className={styles.trackInfo}>
                    <div className={styles.trackLabel}>Now Playing</div>
                    {track
                      ? <>
                          <div className={styles.trackTitle} title={track.title}>{track.title}</div>
                          {track.artist && <div className={styles.trackArtist}>{track.artist}</div>}
                        </>
                      : <div className={styles.trackEmpty}>Nothing playing</div>
                    }
                  </div>
                </div>

                {/* Seek bar */}
                <div className={styles.progressRow}>
                  <input
                    type="range"
                    className={styles.seekBar}
                    min={0}
                    max={seekDuration || 100}
                    value={seekPos}
                    disabled={!canSeek}
                    style={{ background: seekGradient(seekPct, canSeek) }}
                    onChange={(e) => setSeekDraft(Number(e.target.value))}
                    onMouseUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
                    onKeyUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
                  />
                  <div className={styles.timestamps}>
                    <span>{fmtDur(seekPos)}</span>
                    <span>{fmtDur(duration)}</span>
                  </div>
                </div>

                {/* Controls + volume */}
                <div className={styles.controls}>
                  {/* Previous */}
                  <Button
                    variant="unstyled"
                    className={styles.ctrlBtn}
                    disabled={!hasPrev}
                    title="Previous"
                    aria-label="Previous"
                    onClick={() => void playerCmd('previous')}
                  >
                    <PrevIcon size={20} />
                  </Button>

                  {/* Stop */}
                  <Button
                    variant="unstyled"
                    className={`${styles.ctrlBtn} ${styles.stopBtn}`}
                    disabled={!hasTrack}
                    title="Stop"
                    aria-label="Stop"
                    onClick={() => void playerCmd('stop')}
                  >
                    <StopIcon size={18} />
                  </Button>

                  {/* Play / Pause */}
                  <Button
                    variant="unstyled"
                    className={`${styles.ctrlBtn} ${styles.playBtn}`}
                    disabled={!hasTrack && !player?.connected}
                    title={isPlaying ? 'Pause' : 'Resume'}
                    aria-label={isPlaying ? 'Pause' : 'Resume'}
                    onClick={() => void playerCmd(isPlaying ? 'pause' : 'resume')}
                  >
                    {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
                  </Button>

                  {/* Skip */}
                  <Button
                    variant="unstyled"
                    className={styles.ctrlBtn}
                    disabled={!hasTrack}
                    title="Skip"
                    aria-label="Skip"
                    onClick={() => void playerCmd('skip')}
                  >
                    <SkipIcon size={20} />
                  </Button>

                  {/* Loop */}
                  <Button
                    variant="unstyled"
                    className={`${styles.ctrlBtn} ${loopMode !== 'none' ? styles.ctrlBtnActive : ''}`}
                    title={loopMode === 'none' ? 'Loop off' : loopMode === 'track' ? 'Loop track' : 'Loop queue'}
                    aria-label={loopMode === 'none' ? 'Loop off' : loopMode === 'track' ? 'Loop track' : 'Loop queue'}
                    onClick={handleLoopCycle}
                  >
                    <LoopIcon size={18} mode={loopMode} />
                  </Button>

                  {/* Volume */}
                  <div className={styles.volRow}>
                    <Button
                      variant="unstyled"
                      className={styles.ctrlBtn}
                      title={volume === 0 ? 'Unmute' : 'Mute'}
                      aria-label={volume === 0 ? 'Unmute' : 'Mute'}
                      onClick={() => handleVolCommit(volume === 0 ? 50 : 0)}
                    >
                      <VolumeIcon size={16} muted={volume === 0} />
                    </Button>
                    <input
                      type="range"
                      className={styles.volSlider}
                      min={0}
                      max={100}
                      value={volPct}
                      style={{ background: seekGradient(volPct, true) }}
                      onChange={(e) => setVolDraft(Number(e.target.value))}
                      onMouseUp={(e) => handleVolCommit(Number((e.target as HTMLInputElement).value))}
                      onKeyUp={(e) => handleVolCommit(Number((e.target as HTMLInputElement).value))}
                      title={`Volume: ${Math.round(volPct)}%`}
                    />
                    <span className="faint" style={{ fontSize: 11, minWidth: 26, textAlign: 'right' }}>
                      {Math.round(volPct)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Queue ── */}
              <div className={`card ${styles.queuePanel}`}>
                <div className={styles.queueHeader}>
                  <span className={styles.queueTitle}>Queue</span>
                  {(player?.queue?.length ?? 0) > 0 && (
                    <span className={styles.queueCount}>{player!.queue.length}</span>
                  )}
                  <Button variant="ghost" size="sm" disabled={!selectedGuildId || addingDownloads} onClick={() => void handleOpenDownloadPicker()}>
                    {addingDownloads ? 'Loading downloads...' : 'Add downloads'}
                  </Button>
                  <Button variant="primary" size="sm" disabled={!selectedGuildId || addingFiles} onClick={() => void handlePickFiles()}>
                    {addingFiles ? 'Adding files...' : 'Add files'}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={!selectedGuildId} onClick={() => void handleClearQueue()}>Clear</Button>
                </div>

                <div className={`${styles.queueList} appScroll`}>
                  {track && (
                    <BotQueueRow
                      item={track}
                      isCurrent
                      isPlaying={isPlaying}
                      isPaused={player?.status === 'paused'}
                      seekPos={seekPos}
                      onAddToPlaylist={isLocalFile(track) ? () => setAddToPlaylistTrack(track) : undefined}
                    />
                  )}

                  {(player?.queue?.length ?? 0) === 0
                    ? (
                      <div className={styles.queueEmpty}>
                        <MusicNoteIcon size={28} />
                        <span>
                          {track
                            ? 'Nothing else queued'
                            : activeChannelId
                            ? 'Queue is empty — add some audio files'
                            : 'Join your voice channel, then add audio files'
                          }
                        </span>
                      </div>
                    )
                    : player!.queue.map((item, idx) => (
                      <BotQueueRow
                        key={`${item.title}-${idx}`}
                        item={item}
                        index={idx}
                        onRemove={() => void handleRemoveQueue(idx)}
                        onMoveNext={() => void handleMoveQueueNext(idx)}
                        onMoveUp={() => void handleMoveQueue(idx, -1)}
                        onMoveDown={() => void handleMoveQueue(idx, 1)}
                        onAddToPlaylist={isLocalFile(item) ? () => setAddToPlaylistTrack(item) : undefined}
                      />
                    ))
                  }
                </div>

              </div>

              <PlaylistsPanel
                userId={user.id}
                guildId={selectedGuildId}
                channelId={activeChannelId}
                currentTrack={track}
                currentQueue={player?.queue ?? []}
                showToast={showToast}
                onQueueChanged={refreshPlayer}
              />
            </>
          )}
        </div>
      </div>
      {downloadPickerOpen && (
        <DownloadQueuePicker
          items={downloadQueueItems}
          adding={addingDownloads}
          onAdd={(items) => void handleAddDownloadQueue(items)}
          onClose={() => setDownloadPickerOpen(false)}
        />
      )}
      {addToPlaylistTrack && user && (
        <AddToPlaylistModal
          track={addToPlaylistTrack}
          userId={user.id}
          showToast={showToast}
          onClose={() => setAddToPlaylistTrack(null)}
        />
      )}
    </div>
  )
}

// ─── AddToPlaylistModal ───────────────────────────────────────────────────────

interface BotPlaylist {
  _id: string
  name: string
  tracks: { filePath?: string; title: string; artist?: string; duration?: number }[]
}

function AddToPlaylistModal({
  track,
  userId,
  showToast,
  onClose,
}: {
  track: TrackInfo
  userId: string
  showToast: (msg: string, type: string) => void
  onClose: () => void
}) {
  const [playlists, setPlaylists] = useState<BotPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creatingNew, setCreatingNew] = useState(false)
  const [submittingNew, setSubmittingNew] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    botFetch<BotPlaylist[]>(`/playlists/${userId}`)
      .then((data) => { if (alive.current) { setPlaylists(data); setLoading(false) } })
      .catch(() => { if (alive.current) setLoading(false) })
  }, [userId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const botTrack = {
    filePath: track.filePath,
    title: track.title,
    artist: track.artist,
    duration: track.duration,
  }

  async function addToPlaylist(id: string) {
    setAddingTo(id)
    try {
      await botFetch(`/playlists/${id}/tracks`, {
        method: 'POST',
        body: JSON.stringify({ userId, tracks: [botTrack] }),
      })
      showToast(`Added to playlist`, 'success')
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Failed: ${msg}`, 'error')
    } finally {
      if (alive.current) setAddingTo(null)
    }
  }

  async function createAndAdd() {
    const name = newName.trim()
    if (!name) return
    setSubmittingNew(true)
    try {
      const created = await botFetch<BotPlaylist>('/playlists', {
        method: 'POST',
        body: JSON.stringify({ userId, name, tracks: [botTrack] }),
      })
      showToast(`Created "${created.name}" and added track`, 'success')
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Failed: ${msg}`, 'error')
    } finally {
      if (alive.current) setSubmittingNew(false)
    }
  }

  return (
    <div className={styles.playlistModalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.playlistModal}>
        <div className={styles.playlistModalHeader}>
          <span className={styles.playlistModalTitle}>Add to playlist</span>
          <span className={styles.playlistModalTrack} title={track.title}>{track.title}</span>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button>
        </div>

        <div className={styles.playlistModalBody}>
          {loading ? (
            <span className="muted" style={{ fontSize: 13 }}>Loading…</span>
          ) : playlists.length === 0 && !creatingNew ? (
            <span className="muted" style={{ fontSize: 13 }}>No playlists yet</span>
          ) : (
            <div className={styles.playlistModalList}>
              {playlists.map((pl) => (
                <button
                  key={pl._id}
                  className={styles.playlistModalItem}
                  disabled={addingTo === pl._id}
                  onClick={() => void addToPlaylist(pl._id)}
                >
                  <span className={styles.playlistModalItemName}>{pl.name}</span>
                  <span className={styles.playlistModalItemCount}>{pl.tracks.length} track{pl.tracks.length !== 1 ? 's' : ''}</span>
                  {addingTo === pl._id && <span className="muted" style={{ fontSize: 11 }}>Adding…</span>}
                </button>
              ))}
            </div>
          )}

          {creatingNew ? (
            <div className={styles.playlistModalNewForm}>
              <input
                className="input"
                type="text"
                placeholder="Playlist name…"
                value={newName}
                maxLength={64}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createAndAdd()
                  if (e.key === 'Escape') { setCreatingNew(false); setNewName('') }
                }}
              />
              <Button variant="primary" size="sm" disabled={!newName.trim() || submittingNew} onClick={() => void createAndAdd()}>
                {submittingNew ? '…' : 'Create & add'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setCreatingNew(false); setNewName('') }}>Cancel</Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" style={{ marginTop: 4 }} onClick={() => setCreatingNew(true)}>
              + New playlist
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── LoginScreen ──────────────────────────────────────────────────────────────

function BotOfflineBanner() {
  return (
    <div className={styles.botOfflineBanner}>
      <span className={styles.botOfflineDot} />
      Bot is offline — start the bot server to use Discord controls
    </div>
  )
}

function LoginScreen({
  status,
  onLogin,
}: {
  status: 'idle' | 'loading' | 'done' | 'error'
  onLogin: () => void
}) {
  const loading = status === 'loading'
  return (
    <div className={styles.loginWrap}>
      <div className={styles.loginCard}>
        <DiscordIcon size={52} />
        <div className={styles.loginTitle}>Discord Music Player</div>
        <div className={styles.loginDesc}>
          Connect your Discord account to control the music bot in your voice channels.
          Other members in the same VC can also control playback via slash commands.
        </div>

        {status === 'error' && (
          <div className={styles.loginError}>
            Session expired — please log in again.
          </div>
        )}

        <Button variant="discord" size="lg" disabled={loading} onClick={onLogin}>
          <DiscordIcon size={20} color="#fff" />
          {loading ? 'Opening browser…' : 'Connect with Discord'}
        </Button>

        {loading && (
          <div className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
            Complete the login in your browser, then return here.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── BotQueueRow ─────────────────────────────────────────────────────────────

function isLocalFile(item: TrackInfo) {
  return Boolean(item.filePath) || !item.url
}

function BotQueueRow({
  item,
  index,
  isCurrent = false,
  isPlaying = false,
  isPaused = false,
  seekPos,
  onRemove,
  onMoveNext,
  onMoveUp,
  onMoveDown,
  onAddToPlaylist,
}: {
  item: TrackInfo
  index?: number
  isCurrent?: boolean
  isPlaying?: boolean
  isPaused?: boolean
  seekPos?: number
  onRemove?: () => void
  onMoveNext?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onAddToPlaylist?: () => void
}) {
  const ext = item.filePath?.split('.').pop()
  const local = isLocalFile(item)
  const statusLabel = isCurrent
    ? isPlaying ? 'Now playing' : isPaused ? 'Paused' : 'Current track'
    : `Queued #${(index ?? 0) + 1}`
  const currentSeek = seekPos ?? 0
  const currentDuration = item.duration ?? 0
  const timeLabel = isCurrent
    ? currentDuration > 0 && !(isPlaying && currentSeek >= currentDuration)
      ? `${fmtDur(currentSeek)} / ${fmtDur(currentDuration)}`
      : `${fmtDur(currentSeek)} elapsed`
    : fmtDur(item.duration)

  const hasActions = onRemove || onMoveNext || onMoveUp || onMoveDown || onAddToPlaylist

  return (
    <div className={`${styles.queueItem} ${isCurrent ? styles.queueItemCurrent : ''}`}>
      <div className={styles.queueThumb}>
        {local ? <LocalFileIcon size={18} ext={ext} /> : <MusicNoteIcon size={18} />}
      </div>
      <div className={styles.queueMeta}>
        <div className={styles.queueItemTitle} title={item.title}>{item.title}</div>
        <div className={styles.queueSubline}>
          <span className={`${styles.statusDot} ${isCurrent ? styles.statusActive : styles.statusPending}`} />
          <span>{statusLabel}</span>
          {item.artist && item.artist !== 'Unknown' && <span>{item.artist}</span>}
          <span>{timeLabel}</span>
        </div>
      </div>
      {hasActions && (
        <div className={styles.queueItemBtns}>
          {onMoveNext && (
            <Button variant="ghost" size="sm" title="Move next" onClick={onMoveNext}>
              <ArrowNextIcon />Next
            </Button>
          )}
          {onMoveUp && (
            <Button variant="ghost" size="sm" title="Move up" onClick={onMoveUp}>
              <ArrowUpIcon />Up
            </Button>
          )}
          {onMoveDown && (
            <Button variant="ghost" size="sm" title="Move down" onClick={onMoveDown}>
              <ArrowDownIcon />Down
            </Button>
          )}
          {onRemove && (
            <Button variant="ghost" size="sm" title="Remove" onClick={onRemove}>
              <BotTrashIcon />Remove
            </Button>
          )}
          {onAddToPlaylist && (
            <Button variant="ghost" size="sm" title="Add to playlist" onClick={onAddToPlaylist}>
              <PlaylistAddIcon />Playlist
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function DiscordIcon({ size = 24, color = '#5865F2' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.884 19.884 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

function LocalFileIcon({ size = 24, ext }: { size?: number; ext?: string }) {
  const label = ext ? ext.toUpperCase().slice(0, 4) : 'FILE'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
      <text x="12" y="17" textAnchor="middle" fontSize={label.length > 3 ? '4' : '4.5'} fontWeight="600" fill="currentColor" stroke="none" fontFamily="ui-monospace,monospace">{label}</text>
    </svg>
  )
}

function MusicNoteIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function PlayIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function PauseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  )
}

function SkipIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function StopIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  )
}

function PrevIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <polygon points="19 4 9 12 19 20 19 4" />
    </svg>
  )
}

function LoopIcon({ size = 18, mode }: { size?: number; mode: 'none' | 'track' | 'queue' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={mode === 'none' ? 0.45 : 1}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      {mode === 'track' && (
        <text x="12" y="13.5" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor" stroke="none">1</text>
      )}
    </svg>
  )
}

function PlaylistAddIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M1.5 3.5h6M1.5 6h4M1.5 8.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M8.5 6v3.5M10.25 7.75H6.75" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
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

function BotTrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 3h7M4.5 3V2.3c0-.44.36-.8.8-.8h1.4c.44 0 .8.36.8.8V3M4 4.5v3M6 4.5v3M8 4.5v3M3.5 3l.34 5.1c.03.5.45.9.95.9h2.42c.5 0 .92-.4.95-.9L8.5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function VolumeIcon({ size = 16, muted = false }: { size?: number; muted?: boolean }) {
  return muted
    ? (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    )
    : (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    )
}
