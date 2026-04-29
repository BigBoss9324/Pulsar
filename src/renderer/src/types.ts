export interface Format {
  id: string
  label: string
  type: 'video' | 'audio'
  quality?: string
  audioFormat?: string
  selector?: string
}

export interface FormatOpts {
  type: 'video' | 'audio'
  quality?: string
  audioFormat?: string
  selector?: string
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
  title: string
  thumbnail: string
  duration: string
  uploader: string
  formats: Format[]
}

export interface PlaylistItem {
  id: string
  title: string
  url: string
  thumbnail: string
  duration: string
  index: number
}

export interface QueueItem {
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
  skippedByArchive?: boolean
}

export interface HistoryItem {
  id: string
  url: string
  title: string
  thumbnail: string
  duration: string
  format: FormatOpts
  formatLabel: string
  outputDir: string
  outputPath?: string
  fileSize?: number
  completedAt: string
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

export type AppStatus = { type: 'info' | 'ready' | 'error'; message: string }
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
  useDownloadArchive: boolean
  ytdlpRequestDelaySeconds: number
  ytdlpSleepIntervalMin: number
  ytdlpSleepIntervalMax: number
  maxConcurrentDownloads: number
  youtubeCookiesFrom: 'none' | 'chrome' | 'firefox' | 'edge' | 'brave' | 'opera' | 'vivaldi' | 'chromium'
  autoCheckUpdates: boolean
  autoOpenFolder: boolean
  allowPrerelease: boolean
  notifications: boolean
  maxHistoryItems: number
  enableDevMode: boolean
}
