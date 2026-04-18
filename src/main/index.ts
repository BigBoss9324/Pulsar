import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import https from 'https'

const IS_WIN = process.platform === 'win32'
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const APP_ID = 'com.pulsar.downloader'

if (IS_WIN) app.setAppUserModelId(APP_ID)
let YTDLP_PATH: string
let FFMPEG_PATH: string
let HISTORY_PATH: string
let SETTINGS_PATH: string
let QUEUE_PATH: string
let LOG_PATH: string

let mainWindow: BrowserWindow
let activeProc: ChildProcess | null = null
let setupReady = false
let updateInstallScheduled = false
let updateDownloadRequested = false
let currentStatus: { type: 'info' | 'ready' | 'error'; message: string } = { type: 'info', message: 'Initializing...' }
let currentSettings: AppSettings = defaultAppSettings()

configureAppStoragePaths()

function createWindow(): void {
  const icon = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '../../build/Pulsar.ico')

  mainWindow = new BrowserWindow({
    width: 920,
    height: 700,
    minWidth: 700,
    minHeight: 520,
    icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f0f0f', symbolColor: '#ffffff', height: 32 },
    backgroundColor: '#0f0f0f',
    show: false,
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  const showWindow = () => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  }

  // Fallback: show after 4 s in case ready-to-show never fires
  const showFallback = setTimeout(showWindow, 4000)

  mainWindow.once('ready-to-show', () => {
    clearTimeout(showFallback)
    mainWindow.show()
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    logError('Renderer failed to load', { code, desc })
    showWindow()
  })

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logError('Renderer process gone', details)
  })
}

function configureAppStoragePaths(): void {
  const userDataRoot = path.join(app.getPath('appData'), 'Pulsar')
  const sessionDataRoot = path.join(userDataRoot, 'session')

  app.setPath('userData', userDataRoot)
  app.setPath('sessionData', sessionDataRoot)
}

function serializeError(err: unknown): string {
  if (err instanceof Error) return err.stack || `${err.name}: ${err.message}`
  if (typeof err === 'string') return err

  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function appendLog(level: 'INFO' | 'ERROR', message: string, details?: unknown): void {
  if (!LOG_PATH) return

  const entry = [`[${new Date().toISOString()}] [${level}] ${message}`]
  if (details !== undefined) entry.push(serializeError(details))

  try {
    fs.appendFileSync(LOG_PATH, `${entry.join('\n')}\n`)
  } catch (err) {
    console.error('Failed to write log file:', err)
  }
}

function logInfo(message: string, details?: unknown): void {
  appendLog('INFO', message, details)
}

function logError(message: string, details?: unknown): void {
  appendLog('ERROR', message, details)
}

async function ensureYtDlp(): Promise<void> {
  if (fs.existsSync(YTDLP_PATH)) return
  const filename = IS_WIN
    ? 'yt-dlp.exe'
    : process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux'
  await downloadFile(
    `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${filename}`,
    YTDLP_PATH,
  )
  if (!IS_WIN) fs.chmodSync(YTDLP_PATH, 0o755)
}

async function ensureFfmpeg(): Promise<void> {
  if (fs.existsSync(FFMPEG_PATH)) return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffbinaries = require('ffbinaries') as {
    downloadBinaries(c: string[], opts: { destination: string }, cb: (e: Error | null) => void): void
  }
  await new Promise<void>((resolve, reject) => {
    ffbinaries.downloadBinaries(['ffmpeg'], { destination: path.dirname(FFMPEG_PATH) }, (e) =>
      e ? reject(e) : resolve(),
    )
  })
  if (!IS_WIN && fs.existsSync(FFMPEG_PATH)) fs.chmodSync(FFMPEG_PATH, 0o755)
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const get = (u: string) =>
      https
        .get(u, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) { get(res.headers.location!); return }
          if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
          res.pipe(file)
          file.on('finish', () => file.close(() => resolve()))
        })
        .on('error', (e) => { fs.unlink(dest, () => {}); reject(e) })
    get(url)
    file.on('error', (e) => { fs.unlink(dest, () => {}); reject(e) })
  })
}

function ffmpegArgs(): string[] {
  return fs.existsSync(FFMPEG_PATH) ? ['--ffmpeg-location', path.dirname(FFMPEG_PATH)] : []
}

function baseYtdlpArgs(): string[] {
  return ['--ignore-config', ...ffmpegArgs()]
}

function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, [...baseYtdlpArgs(), ...args])
    let out = ''
    let err = ''
    proc.stdout.on('data', (d: Buffer) => (out += d))
    proc.stderr.on('data', (d: Buffer) => (err += d))
    proc.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(normalizeYtdlpError(err, code))))
    proc.on('error', reject)
  })
}

function sendStatus(type: string, message: string): void {
  currentStatus = { type: type as 'info' | 'ready' | 'error', message }
  if (type === 'error') logError(`Status update: ${message}`)
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('status', { type, message })
}

function sendNonBlockingStatus(message: string): void {
  sendStatus(setupReady ? 'ready' : 'info', message)
}

function sendToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('toast', { message, type })
}

function normalizeReleaseNotes(notes: unknown): string | undefined {
  if (typeof notes === 'string') return notes.trim() || undefined
  if (Array.isArray(notes)) {
    const joined = notes
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (entry && typeof entry === 'object' && 'note' in entry && typeof (entry as { note?: unknown }).note === 'string') {
          return (entry as { note: string }).note
        }
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
    return joined.trim() || undefined
  }
  return undefined
}

function inferPrerelease(version: string, releaseName?: string): boolean {
  const combined = `${version} ${releaseName ?? ''}`.toLowerCase()
  return /-|beta|alpha|rc\b|pre-release|prerelease/.test(combined)
}

function normalizeReleaseTag(tag: string): string {
  return tag.replace(/^v/i, '').trim().toLowerCase()
}

interface GithubReleaseSummary {
  tag_name: string
  name?: string
  prerelease?: boolean
  published_at?: string
  body?: string
  assets?: Array<{ name: string; browser_download_url: string; size: number }>
}

function fetchGithubReleases(): Promise<GithubReleaseSummary[]> {
  return new Promise((resolve, reject) => {
    https
      .get(
        'https://api.github.com/repos/BigBoss9324/Pulsar/releases',
        { headers: { 'User-Agent': 'Pulsar-App' } },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            try {
              const payload = JSON.parse(Buffer.concat(chunks).toString()) as unknown

              if (!Array.isArray(payload)) {
                const message = payload && typeof payload === 'object' && 'message' in payload
                  ? String((payload as { message?: unknown }).message ?? 'Unknown response from GitHub releases API')
                  : 'Unexpected response from GitHub releases API'
                reject(new Error(message))
                return
              }

              resolve(payload as GithubReleaseSummary[])
            } catch (err) {
              reject(err)
            }
          })
        },
      )
      .on('error', reject)
  })
}

async function resolveUpdatePrerelease(info: { version: string; releaseName?: string; prerelease?: boolean }): Promise<boolean> {
  try {
    const releases = await fetchGithubReleases()
    const normalizedVersion = normalizeReleaseTag(info.version)
    const normalizedReleaseName = normalizeReleaseTag(info.releaseName ?? '')
    const matchedRelease = releases.find((release) => {
      const normalizedTag = normalizeReleaseTag(release.tag_name)
      const normalizedName = normalizeReleaseTag(release.name ?? '')

      return normalizedTag === normalizedVersion
        || normalizedName === normalizedVersion
        || (normalizedReleaseName && normalizedTag === normalizedReleaseName)
        || (normalizedReleaseName && normalizedName === normalizedReleaseName)
        || normalizedTag.startsWith(`${normalizedVersion}-`)
        || normalizedName.startsWith(`${normalizedVersion}-`)
        || normalizedTag.includes(normalizedVersion)
        || normalizedName.includes(normalizedVersion)
    })

    if (matchedRelease && typeof matchedRelease.prerelease === 'boolean') return matchedRelease.prerelease
  } catch (err) {
    logError('Failed to resolve update prerelease state from GitHub releases', err)
  }

  if (typeof info.prerelease === 'boolean') return info.prerelease

  return inferPrerelease(info.version, info.releaseName)
}

function sendUpdateAvailable(data: { version: string; releaseName?: string; releaseNotes?: string; releaseDate?: string; prerelease?: boolean }): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-available', data)
}

function normalizeYtdlpError(stderr: string, code: number | null): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const errorLine = [...lines].reverse().find((line) => /ERROR:/i.test(line))
  return errorLine || `yt-dlp exited with code ${code ?? 'unknown'}`
}

function normalizeUpdateError(err: Error): string {
  const message = (err.message || 'Unknown update error').trim()
  const compactMessage = message.replace(/\s+/g, ' ')

  if (/<\?xml|<feed[\s>]|<entry[\s>]|<\/?[a-z][^>]*>/i.test(message)) {
    return 'Update check received an invalid release feed. Publish the packaged update artifacts to GitHub Releases and try again.'
  }

  if (compactMessage.includes('releases.atom') && compactMessage.includes('404')) {
    return 'No published app update was found on GitHub Releases yet.'
  }

  if (/authentication token is correct/i.test(compactMessage)) {
    return 'Update check could not access the configured GitHub release feed.'
  }

  return compactMessage.split(' Headers:')[0].trim()
}

function getDefaultOutputDir(): string {
  try {
    return app.getPath('downloads')
  } catch {
    return ''
  }
}

function defaultAppSettings(): AppSettings {
  return {
    defaultOutputDir: getDefaultOutputDir(),
    defaultFormatId: 'preset-best',
    autoCheckUpdates: true,
    allowPrerelease: false,
    autoOpenFolder: false,
    maxHistoryItems: 125,
    enableDevMode: false,
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function readSettings(): AppSettings {
  const defaults = defaultAppSettings()
  const loaded = readJsonFile<AppSettings>(SETTINGS_PATH, defaults)
  return {
    ...defaults,
    ...loaded,
    defaultOutputDir: loaded.defaultOutputDir || defaults.defaultOutputDir,
  }
}

function saveSettings(next: AppSettings): AppSettings {
  const defaults = defaultAppSettings()
  currentSettings = {
    ...defaults,
    ...next,
    defaultOutputDir: next.defaultOutputDir || defaults.defaultOutputDir,
    maxHistoryItems: Math.max(10, Math.min(5000, Math.floor(next.maxHistoryItems || defaults.maxHistoryItems))),
  }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(currentSettings, null, 2))
  if (app.isPackaged) autoUpdater.allowPrerelease = currentSettings.allowPrerelease
  return currentSettings
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

function scheduleWindowsWipeAndUninstall(targets: string[], uninstaller: string): void {
  const quotedTargets = targets.map((target) => `'${escapePowerShellSingleQuoted(target)}'`).join(', ')
  const quotedUninstaller = `'${escapePowerShellSingleQuoted(uninstaller)}'`
  const command = [
    `$targets = @(${quotedTargets})`,
    `$uninstaller = ${quotedUninstaller}`,
    `$pidToWaitFor = ${process.pid}`,
    'while (Get-Process -Id $pidToWaitFor -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 300 }',
    'foreach ($target in $targets) {',
    '  if (Test-Path -LiteralPath $target) {',
    '    Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue',
    '  }',
    '}',
    'if (Test-Path -LiteralPath $uninstaller) {',
    '  Start-Process -FilePath $uninstaller',
    '}',
  ].join('; ')

  spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', command], {
    detached: true,
    stdio: 'ignore',
  }).unref()
}

function getWipeFileTargets(): string[] {
  return Array.from(new Set([
    HISTORY_PATH,
    SETTINGS_PATH,
    QUEUE_PATH,
    LOG_PATH,
  ]))
}

function configureAutoUpdates(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = currentSettings.allowPrerelease

  autoUpdater.on('checking-for-update', () => {
    sendNonBlockingStatus('Ready - checking for updates...')
  })

  autoUpdater.on('update-available', async (info) => {
    updateDownloadRequested = false
    const releaseVersion = info.version || 'new version'
    const prerelease = await resolveUpdatePrerelease({
      version: releaseVersion,
      releaseName: info.releaseName || undefined,
      prerelease: info.prerelease,
    })
    sendNonBlockingStatus(`Ready - update available: v${releaseVersion}`)
    sendToast(`Update available: v${releaseVersion}`, 'info')
    sendUpdateAvailable({
      version: releaseVersion,
      releaseName: info.releaseName || undefined,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate ? new Date(info.releaseDate).toISOString() : undefined,
      prerelease,
    })
  })

  autoUpdater.on('update-not-available', () => {
    sendStatus('ready', 'Ready')
    sendToast('You are on the latest version.', 'success')
  })

  autoUpdater.on('update-downloaded', () => {
    if (updateInstallScheduled) return

    updateInstallScheduled = true
    sendStatus('ready', 'Update downloaded. Restarting Pulsar to install it...')
    sendToast('Update downloaded. Restarting Pulsar…', 'success')

    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(false, true)
      } catch (err) {
        updateInstallScheduled = false
        logError('Failed to restart and install update', err)
        sendNonBlockingStatus('Ready - update downloaded, but automatic restart failed.')
        sendToast('Update downloaded, but automatic restart failed. Please restart Pulsar manually.', 'error')
      }
    }, 1500)
  })

  autoUpdater.on('error', (err) => {
    updateDownloadRequested = false
    console.error('Auto-update failed:', err)
    logError('Auto-update failed', err)
    const message = normalizeUpdateError(err)
    sendNonBlockingStatus(`Ready - update check failed: ${message}`)
    sendToast(message, 'error')
  })

  const checkForUpdates = () =>
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Unable to check for updates:', err)
      logError('Unable to check for updates', err)
    })

  if (currentSettings.autoCheckUpdates) checkForUpdates()

  const interval = setInterval(() => {
    if (currentSettings.autoCheckUpdates) checkForUpdates()
  }, UPDATE_CHECK_INTERVAL_MS)
  interval.unref()
}

app.whenReady().then(() => {
  const userData = app.getPath('userData')
  const sessionData = app.getPath('sessionData')
  fs.mkdirSync(userData, { recursive: true })
  fs.mkdirSync(sessionData, { recursive: true })
  YTDLP_PATH = path.join(userData, IS_WIN ? 'yt-dlp.exe' : 'yt-dlp')
  FFMPEG_PATH = path.join(userData, IS_WIN ? 'ffmpeg.exe' : 'ffmpeg')
  HISTORY_PATH = path.join(userData, 'history.json')
  SETTINGS_PATH = path.join(userData, 'settings.json')
  QUEUE_PATH = path.join(userData, 'queue.json')
  LOG_PATH = path.join(userData, 'pulsar.log')
  logInfo('Pulsar starting up')
  currentSettings = readSettings()

  createWindow()

  mainWindow.once('ready-to-show', async () => {
    const missing: string[] = []
    if (!fs.existsSync(YTDLP_PATH)) missing.push('yt-dlp')
    if (!fs.existsSync(FFMPEG_PATH)) missing.push('ffmpeg')
    if (missing.length) sendStatus('info', `Downloading ${missing.join(' & ')}...`)

    try {
      await Promise.all([ensureYtDlp(), ensureFfmpeg()])
      setupReady = true
      sendStatus('ready', 'Ready')
      logInfo('Setup completed successfully')
      configureAutoUpdates()
    } catch (err) {
      logError('Setup failed', err)
      sendStatus('error', 'Setup failed: ' + (err as Error).message)
    }
  })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

ipcMain.handle('get-info', async (_e, url: string) => {
  const raw = await runYtDlp([url, '--dump-single-json', '--skip-download', '--no-playlist', '--no-warnings'])
  const info = JSON.parse(raw)
  return {
    title: info.title as string,
    thumbnail: info.thumbnail as string,
    duration: (info.duration_string as string) || formatDuration(info.duration as number),
    uploader: ((info.uploader || info.channel) as string) || '',
    formats: parseFormats(info.formats ?? []),
  }
})

ipcMain.handle('get-playlist-info', (_e, url: string) => {
  const items: PlaylistItem[] = []
  let playlistTitle = ''

  return new Promise<{ title: string; items: PlaylistItem[] }>((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, [...baseYtdlpArgs(), url, '--flat-playlist', '--dump-json', '--no-warnings'])
    let buf = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const v = JSON.parse(line)
          if (v._type === 'playlist') { playlistTitle = v.title ?? ''; continue }
          items.push({
            id: v.id,
            title: v.title ?? v.id,
            url: v.url ?? `https://www.youtube.com/watch?v=${v.id}`,
            thumbnail: v.thumbnail ?? (Array.isArray(v.thumbnails) ? v.thumbnails[0]?.url : '') ?? '',
            duration: v.duration_string ?? formatDuration(v.duration),
            index: items.length + 1,
          })
          mainWindow.webContents.send('playlist-progress', { count: items.length })
        } catch {
          continue
        }
      }
    })

    proc.on('close', (code) => {
      if (code === 0 || items.length > 0) resolve({ title: playlistTitle, items })
      else reject(new Error('Failed to fetch playlist'))
    })
    proc.on('error', reject)
  })
})

ipcMain.handle('choose-directory', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Choose download folder',
  })
  return r.canceled ? null : r.filePaths[0]
})

ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('get-current-status', () => currentStatus)
ipcMain.handle('get-app-settings', () => currentSettings)
ipcMain.handle('save-app-settings', (_e, next: AppSettings) => saveSettings(next))
ipcMain.handle('get-queue-state', () => readJsonFile<PersistedQueueItem[]>(QUEUE_PATH, []))
ipcMain.handle('save-queue-state', (_e, queue: PersistedQueueItem[]) => {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2))
})
ipcMain.handle('open-external-url', (_e, url: string) => shell.openExternal(url))
ipcMain.handle('open-app-data-folder', () => shell.openPath(app.getPath('userData')))
ipcMain.handle('reveal-item', (_e, filePath: string) => shell.showItemInFolder(filePath))
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    sendNonBlockingStatus('Ready - update checks run only in installed builds.')
    sendToast('Update checks run only in installed builds.', 'info')
    logInfo('Skipped manual update check because app is not packaged')
    return
  }

  sendNonBlockingStatus('Ready - checking for updates...')
  sendToast('Checking for updates...', 'info')
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    logError('Manual update check failed', err)
    throw err
  }
})

ipcMain.handle('download-app-update', async () => {
  if (!app.isPackaged) {
    sendToast('Updates can only be installed from packaged builds.', 'info')
    return
  }

  if (updateDownloadRequested) return

  updateDownloadRequested = true
  sendNonBlockingStatus('Ready - downloading app update...')
  sendToast('Downloading update...', 'info')

  try {
    void autoUpdater.downloadUpdate().catch((err) => {
      updateDownloadRequested = false
      logError('Update download failed', err)
      const message = normalizeUpdateError(err)
      sendNonBlockingStatus(`Ready - update download failed: ${message}`)
      sendToast(message, 'error')
    })
  } catch (err) {
    updateDownloadRequested = false
    logError('Failed to start update download', err)
    throw err
  }
})

ipcMain.handle('download', (_e, req: DownloadRequest) => {
  if (activeProc) return Promise.reject(new Error('A download is already in progress'))
  return downloadWithYtdlp(req)
})

function downloadWithYtdlp({ url, format, outputDir, filename }: DownloadRequest) {
  const safe = (filename || '%(title)s').replace(/[<>:"/\\|?*]/g, '_')
  const template = path.join(outputDir, safe + '.%(ext)s')
  const args = buildYtdlpArgs(url, format, template)

  return new Promise<DownloadResult>((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, [...baseYtdlpArgs(), ...args])
    activeProc = proc
    let stderrBuf = ''
    let outputPath = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const m = line.match(/\[download\]\s+(\d+\.?\d*)%.*?(\d+\.?\d*\s*\w+\/s)/)
        if (m) {
          mainWindow.webContents.send('download-progress', { percent: parseFloat(m[1]), speed: m[2] })
          continue
        }
        if (!trimmed.startsWith('[')) outputPath = trimmed
      }
    })
    proc.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString() })

    proc.on('close', (code) => {
      activeProc = null
      if (code === 0) {
        const fileSize = outputPath && fs.existsSync(outputPath) ? fs.statSync(outputPath).size : undefined
        resolve({ success: true, outputDir, outputPath: outputPath || undefined, fileSize })
        return
      }
      const msg = stderrBuf.trim().split('\n').pop() || `yt-dlp exited with code ${code}`
      logError('Download failed', { code, url, outputDir, stderr: stderrBuf.trim() || msg })
      reject(new Error(msg))
    })
    proc.on('error', (e) => {
      activeProc = null
      logError('Download process error', e)
      reject(e)
    })
  })
}

ipcMain.handle('cancel-download', () => { if (activeProc) { activeProc.kill(); activeProc = null } })
ipcMain.handle('open-folder', (_e, p: string) => shell.openPath(p))

ipcMain.handle('get-ytdlp-version', async () => {
  try {
    const out = await runYtDlp(['--version'])
    return out.trim()
  } catch {
    return 'unavailable'
  }
})

ipcMain.handle('read-log', (_e, maxLines: number = 100) => {
  if (!LOG_PATH) return ''
  try {
    const content = fs.readFileSync(LOG_PATH, 'utf-8')
    const lines = content.split(/\r?\n/).filter(Boolean)
    return lines.slice(-maxLines).join('\n')
  } catch {
    return ''
  }
})

function readHistory(): HistoryItem[] {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8')) } catch { return [] }
}

ipcMain.handle('get-history', () => readHistory())
ipcMain.handle('clear-history', () => fs.writeFileSync(HISTORY_PATH, '[]'))
ipcMain.handle('delete-history-item', (_e, id: string) =>
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(readHistory().filter((h) => h.id !== id), null, 2)),
)
ipcMain.handle('save-history-item', (_e, item: HistoryItem) => {
  const h = readHistory()
  h.unshift(item)
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(h.slice(0, currentSettings.maxHistoryItems), null, 2))
})

function buildYtdlpArgs(url: string, format: FormatOpts, template: string): string[] {
  const args = [
    url,
    '-o',
    template,
    '--newline',
    '--no-warnings',
    '--no-playlist',
    '--print',
    'after_move:filepath',
    '--embed-thumbnail',
    '--add-metadata',
  ]
  if (format.type === 'audio') {
    args.push('-x', '--audio-format', format.audioFormat ?? 'mp3', '--audio-quality', '0')
  } else {
    args.push('-f', buildPreferredVideoSelector(format.quality ?? 'best'))
    args.push('--merge-output-format', 'mp4')
  }
  return args
}

function buildPreferredVideoSelector(quality: string): string {
  const videoBase = quality === 'best' ? 'bv*' : `bv*[height<=${quality}]`
  const muxedBase = quality === 'best' ? 'b' : `b[height<=${quality}]`

  return [
    `${videoBase}[ext=mp4]+bestaudio[ext=m4a]`,
    `${videoBase}[ext=mp4]+bestaudio[acodec*=mp4a]`,
    `${videoBase}[ext=mp4]+bestaudio`,
    `${videoBase}+bestaudio[ext=m4a]`,
    `${videoBase}+bestaudio[acodec*=mp4a]`,
    `${videoBase}+bestaudio`,
    muxedBase,
  ].join('/')
}

interface RawFormat {
  format_id?: string
  vcodec?: string
  acodec?: string
  ext?: string
  height?: number
}

function parseFormats(raw: RawFormat[]): Format[] {
  const videos = raw.filter((f) => f.format_id && f.vcodec && f.vcodec !== 'none' && f.height && f.height >= 144)
  const byHeight = new Map<number, RawFormat[]>()

  for (const fmt of videos) {
    const height = fmt.height as number
    const list = byHeight.get(height) ?? []
    list.push(fmt)
    byHeight.set(height, list)
  }

  const heights = [...byHeight.keys()].sort((a, b) => b - a).slice(0, 7)

  return [
    { id: 'preset-best', label: 'Best quality (MP4)', type: 'video', quality: 'best' },
    ...heights.map((h) => {
      const selector = buildSelectorForHeight(byHeight.get(h) ?? [], h)
      return {
        id: `video-${h}`,
        label: h >= 2160 ? `4K / ${h}p (MP4)` : `${h}p (MP4)`,
        type: 'video' as const,
        quality: String(h),
        selector,
      }
    }),
    { id: 'audio-mp3', label: 'MP3 (Audio only)', type: 'audio', audioFormat: 'mp3' },
    { id: 'audio-m4a', label: 'M4A (Audio only)', type: 'audio', audioFormat: 'm4a' },
    { id: 'audio-opus', label: 'Opus (Audio only)', type: 'audio', audioFormat: 'opus' },
    { id: 'audio-wav', label: 'WAV (Audio only)', type: 'audio', audioFormat: 'wav' },
  ]
}

function buildSelectorForHeight(formats: RawFormat[], height: number): string {
  const ranked = [...formats].sort((a, b) => rankFormat(b) - rankFormat(a))
  const selectors: string[] = []

  for (const fmt of ranked) {
    const formatId = fmt.format_id
    if (!formatId) continue
    const hasAudio = !!fmt.acodec && fmt.acodec !== 'none'
    if (hasAudio) {
      selectors.push(formatId)
    } else {
      selectors.push(`${formatId}+ba`, `${formatId}+bestaudio`, `${formatId}+ba/b`)
    }
  }

  selectors.push(`bv*[height<=${height}]+ba/b[height<=${height}]`, 'bv*+ba/b')
  return [...new Set(selectors)].join('/')
}

function rankFormat(format: RawFormat): number {
  let score = 0
  if (format.ext === 'mp4') score += 20
  if (format.acodec && format.acodec !== 'none') score += 10
  return score
}

function formatDuration(s: number): string {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

interface FormatOpts { type: 'video' | 'audio'; quality?: string; audioFormat?: string; selector?: string }
interface Format { id: string; label: string; type: 'video' | 'audio'; quality?: string; audioFormat?: string; selector?: string }
interface DownloadRequest { url: string; format: FormatOpts; outputDir: string; filename: string; downloader?: 'ytdlp' }
interface DownloadResult { success: boolean; outputDir: string; outputPath?: string; fileSize?: number }
interface PlaylistItem { id: string; title: string; url: string; thumbnail: string; duration: string; index: number }
interface HistoryItem { id: string; url: string; title: string; thumbnail: string; duration: string; format: FormatOpts; formatLabel: string; outputDir: string; outputPath?: string; fileSize?: number; completedAt: string }
interface AppSettings { defaultOutputDir: string; defaultFormatId: string; autoCheckUpdates: boolean; autoOpenFolder: boolean; allowPrerelease: boolean; maxHistoryItems: number; enableDevMode: boolean }
interface PersistedQueueItem { id: string; url: string; title: string; thumbnail: string; duration: string; format: FormatOpts; formatLabel: string; outputDir: string; filename: string; status: 'pending' | 'downloading' | 'done' | 'error'; progress: number; speed: string; error?: string; downloader?: 'ytdlp'; outputPath?: string; fileSize?: number }

ipcMain.handle('get-releases', () => {
  return fetchGithubReleases()
})

ipcMain.handle('install-version', async (_e, downloadUrl: string) => {
  const tmpPath = path.join(app.getPath('temp'), 'PulsarSetup.exe')
  await downloadFile(downloadUrl, tmpPath)
  shell.openPath(tmpPath)
  setTimeout(() => app.quit(), 1500)
})

ipcMain.handle('wipe-and-uninstall', async () => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Wipe all data & uninstall',
    message: 'This will permanently delete all Pulsar data and uninstall the app.',
    detail: 'History, settings, queue, and logs will be gone. This cannot be undone.',
    buttons: ['Cancel', 'Wipe & Uninstall'],
    defaultId: 0,
    cancelId: 0,
  })

  if (response !== 1) return

  const wipeTargets = getWipeFileTargets()

  if (IS_WIN) {
    const uninstaller = path.join(path.dirname(app.getPath('exe')), 'Uninstall Pulsar.exe')
    try {
      scheduleWindowsWipeAndUninstall(wipeTargets, uninstaller)
    } catch (err) {
      logError('Failed to schedule wipe and uninstall', err)
      try {
        for (const target of wipeTargets) {
          fs.rmSync(target, { force: true })
        }
      } catch (wipeErr) {
        logError('Failed to wipe user data', wipeErr)
      }

      if (fs.existsSync(uninstaller)) {
        spawn(uninstaller, [], { detached: true, stdio: 'ignore' }).unref()
      }
    }
  } else {
    try {
      for (const target of wipeTargets) {
        fs.rmSync(target, { force: true })
      }
    } catch (err) {
      logError('Failed to wipe user data', err)
    }
  }

  app.quit()
})

process.on('uncaughtException', (err) => {
  logError('Uncaught exception', err)
})

process.on('unhandledRejection', (reason) => {
  logError('Unhandled promise rejection', reason)
})
