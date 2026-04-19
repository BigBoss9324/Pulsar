import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export interface Format {
  id: string; label: string; type: 'video' | 'audio'; quality?: string; audioFormat?: string; selector?: string
}
export interface FormatOpts {
  type: 'video' | 'audio'; quality?: string; audioFormat?: string; selector?: string
}
export interface DownloadPreferences {
  filenameTemplate: string
  subtitleMode: 'off' | 'separate' | 'embed'
  subtitleLanguages: string
  duplicateStrategy: 'skip' | 'allow' | 'overwrite'
  embedMetadata: boolean
  embedThumbnail: boolean
}
export interface VideoInfo {
  title: string; thumbnail: string; duration: string; uploader: string; formats: Format[]
}
export interface PlaylistItem {
  id: string; title: string; url: string; thumbnail: string; duration: string; index: number
}
export interface PlaylistInfo { title: string; items: PlaylistItem[] }
export interface DownloadOpts {
  id: string; url: string; format: FormatOpts; outputDir: string; filename: string; downloadPrefs: DownloadPreferences; downloader?: 'ytdlp'
}
export interface HistoryItem {
  id: string; url: string; title: string; thumbnail: string; duration: string
  format: FormatOpts; formatLabel: string; outputDir: string; outputPath?: string; fileSize?: number; completedAt: string
}
export interface StatusEvent { type: 'info' | 'ready' | 'error'; message: string }
export interface ProgressEvent {
  id: string
  percent: number
  speed: string
  eta: string
  total: string
  transferred: string
  raw: string
}
export interface GithubRelease {
  tag_name: string
  name: string
  body?: string
  prerelease: boolean
  published_at: string
  assets: Array<{ name: string; browser_download_url: string; size: number }>
}
export interface AppUpdateInfo {
  version: string
  releaseName?: string
  releaseNotes?: string
  releaseDate?: string
  prerelease?: boolean
}
export interface AppBuildInfo {
  version: string
  channel: string
  isDevBuild: boolean
  displayVersion: string
}
export interface AppSettings {
  defaultOutputDir: string
  defaultFormatId: string
  filenameTemplate: string
  subtitleMode: 'off' | 'separate' | 'embed'
  subtitleLanguages: string
  duplicateStrategy: 'skip' | 'allow' | 'overwrite'
  onError: 'continue' | 'pause' | 'wait-3' | 'wait-5' | 'wait-15'
  discordWebhookUrl: string
  discordAttachFile: boolean
  discordStripMetadata: boolean
  discordIncludeEmbed: boolean
  discordDeleteAfterSend: boolean
  embedMetadata: boolean
  embedThumbnail: boolean
  autoCheckUpdates: boolean
  autoOpenFolder: boolean
  allowPrerelease: boolean
  maxHistoryItems: number
  enableDevMode: boolean
}
export interface PersistedQueueItem {
  id: string
  url: string
  title: string
  thumbnail: string
  duration: string
  format: FormatOpts
  formatLabel: string
  outputDir: string
  filename: string
  status: 'pending' | 'downloading' | 'done' | 'error'
  progress: number
  speed: string
  eta?: string
  total?: string
  transferred?: string
  error?: string
  errorDetails?: string
  attempts?: number
  maxAttempts?: number
  lastStartedAt?: string
  lastFinishedAt?: string
  resumable?: boolean
  downloader?: 'ytdlp'
  downloadPrefs?: DownloadPreferences
  outputPath?: string
  fileSize?: number
}

export interface DownloadResult {
  success: boolean
  outputDir: string
  outputPath?: string
  fileSize?: number
  error?: string
  details?: string
  retryable?: boolean
  cancelled?: boolean
  resumable?: boolean
}

function on<T>(channel: string, cb: (data: T) => void): () => void {
  const fn = (_e: IpcRendererEvent, data: T) => cb(data)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

const api = {
  getAppVersion: () => ipcRenderer.invoke('get-app-version') as Promise<string>,
  getAppBuildInfo: () => ipcRenderer.invoke('get-app-build-info') as Promise<AppBuildInfo>,
  getCurrentStatus: () => ipcRenderer.invoke('get-current-status') as Promise<StatusEvent>,
  getAppSettings: () => ipcRenderer.invoke('get-app-settings') as Promise<AppSettings>,
  saveAppSettings: (settings: AppSettings) => ipcRenderer.invoke('save-app-settings', settings) as Promise<AppSettings>,
  getQueueState: () => ipcRenderer.invoke('get-queue-state') as Promise<PersistedQueueItem[]>,
  saveQueueState: (queue: PersistedQueueItem[]) => ipcRenderer.invoke('save-queue-state', queue) as Promise<void>,
  getInfo: (url: string) => ipcRenderer.invoke('get-info', url) as Promise<VideoInfo>,
  getPlaylistInfo: (url: string) => ipcRenderer.invoke('get-playlist-info', url) as Promise<PlaylistInfo>,
  chooseDirectory: () => ipcRenderer.invoke('choose-directory') as Promise<string | null>,
  openExternalUrl: (url: string) => ipcRenderer.invoke('open-external-url', url) as Promise<void>,
  openAppDataFolder: () => ipcRenderer.invoke('open-app-data-folder') as Promise<void>,
  revealItem: (p: string) => ipcRenderer.invoke('reveal-item', p) as Promise<void>,
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates') as Promise<void>,
  downloadAppUpdate: () => ipcRenderer.invoke('download-app-update') as Promise<void>,
  download: (opts: DownloadOpts) => ipcRenderer.invoke('download', opts) as Promise<DownloadResult>,
  cancelDownload: (id?: string) => ipcRenderer.invoke('cancel-download', id) as Promise<void>,
  openFolder: (p: string) => ipcRenderer.invoke('open-folder', p) as Promise<void>,
  getHistory: () => ipcRenderer.invoke('get-history') as Promise<HistoryItem[]>,
  saveHistoryItem: (item: HistoryItem) => ipcRenderer.invoke('save-history-item', item) as Promise<void>,
  deleteHistoryItem: (id: string) => ipcRenderer.invoke('delete-history-item', id) as Promise<void>,
  clearHistory: () => ipcRenderer.invoke('clear-history') as Promise<void>,
  getYtdlpVersion: () => ipcRenderer.invoke('get-ytdlp-version') as Promise<string>,
  wipeAndUninstall: () => ipcRenderer.invoke('wipe-and-uninstall') as Promise<void>,
  getReleases: () => ipcRenderer.invoke('get-releases') as Promise<GithubRelease[]>,
  installVersion: (downloadUrl: string) => ipcRenderer.invoke('install-version', downloadUrl) as Promise<void>,
  readLog: (maxLines?: number) => ipcRenderer.invoke('read-log', maxLines) as Promise<string>,
  sendDiscordWebhook: (payload: { webhookUrl: string; embed: { title: string; url: string; thumbnail: string; duration: string; formatLabel: string; outputPath: string; fileSize?: number }; attachFile: boolean; stripMetadata: boolean; includeEmbed: boolean; deleteAfterSend: boolean }) => ipcRenderer.invoke('send-discord-webhook', payload) as Promise<{ deleted: boolean }>,
  onStatus: (cb: (d: StatusEvent) => void) => on<StatusEvent>('status', cb),
  onToast: (cb: (d: { message: string; type: 'success' | 'error' | 'info' }) => void) => on('toast', cb),
  onUpdateAvailable: (cb: (d: AppUpdateInfo) => void) => on<AppUpdateInfo>('update-available', cb),
  onProgress: (cb: (d: ProgressEvent) => void) => on<ProgressEvent>('download-progress', cb),
  onPlaylistProgress: (cb: (d: { count: number }) => void) => on<{ count: number }>('playlist-progress', cb),
}

contextBridge.exposeInMainWorld('api', api)

declare global { interface Window { api: typeof api } }
