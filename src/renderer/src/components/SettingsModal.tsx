import { useEffect, useState } from 'react'
import type { AppSettings, GithubRelease } from '../types'
import Button from './Button'
import PathField from './PathField'
import ToggleSetting from './ToggleSetting'
import styles from './SettingsModal.module.css'
import { renderReleaseNotes } from '../utils/renderReleaseNotes'

const FORMAT_OPTIONS = [
  { id: 'preset-best', label: 'Best quality (MP4)' },
  { id: 'video-1080', label: '1080p (MP4)' },
  { id: 'video-720', label: '720p (MP4)' },
  { id: 'audio-mp3', label: 'MP3 (Audio only)' },
  { id: 'audio-m4a', label: 'M4A (Audio only)' },
]

const SUBTITLE_MODE_OPTIONS = [
  { id: 'off', label: 'Off' },
  { id: 'separate', label: 'Download subtitle files' },
  { id: 'embed', label: 'Embed subtitles when possible' },
]

const DUPLICATE_OPTIONS = [
  { id: 'skip', label: 'Skip previously downloaded items' },
  { id: 'allow', label: 'Allow re-adding duplicates' },
  { id: 'overwrite', label: 'Overwrite existing files when redownloading' },
]

const YOUTUBE_COOKIES_OPTIONS = [
  { id: 'none', label: 'Disabled' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'edge', label: 'Microsoft Edge' },
  { id: 'brave', label: 'Brave' },
  { id: 'opera', label: 'Opera' },
  { id: 'vivaldi', label: 'Vivaldi' },
  { id: 'chromium', label: 'Chromium' },
]

const ON_ERROR_OPTIONS = [
  { id: 'continue', label: 'Continue to next item immediately' },
  { id: 'wait-3', label: 'Wait 3 seconds before continuing' },
  { id: 'wait-5', label: 'Wait 5 seconds before continuing' },
  { id: 'wait-15', label: 'Wait 15 seconds before continuing' },
  { id: 'pause', label: 'Pause the queue' },
]

interface Props {
  settings: AppSettings
  version: string
  displayVersion: string
  onCheckForUpdates: () => Promise<void>
  onCopyVersion: () => Promise<void> | void
  onClose: () => void
  onSave: (settings: AppSettings) => Promise<void>
}

function normalizeTag(tag: string | null) {
  return (tag ?? '').replace(/^v/i, '').trim()
}

function SettingLabel({ text, help }: { text: string; help?: string }) {
  return (
    <div className={styles.labelRow}>
      <label className="label">{text}</label>
      {help && <InfoHint text={help} />}
    </div>
  )
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className={styles.infoHint}>
      <Button
        variant="unstyled"
        className={styles.infoButton}
        type="button"
        aria-label={text}
      >
        i
      </Button>
      <span className={styles.infoTooltip} role="tooltip">{text}</span>
    </span>
  )
}

export default function SettingsModal({ settings, version, displayVersion, onCheckForUpdates, onCopyVersion, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [releases, setReleases] = useState<GithubRelease[] | null>(null)
  const [releasesLoading, setReleasesLoading] = useState(false)
  const [releasesError, setReleasesError] = useState<string | null>(null)
  const [installingTag, setInstallingTag] = useState<string | null>(null)
  const [expandedReleaseTag, setExpandedReleaseTag] = useState<string | null>(null)
  const [archiveCount, setArchiveCount] = useState<number | null>(null)
  const [clearingArchive, setClearingArchive] = useState(false)
  const [ytdlpCurrent, setYtdlpCurrent] = useState<string | null>(null)
  const [ytdlpLatest, setYtdlpLatest] = useState<string | null>(null)
  const [ytdlpChecking, setYtdlpChecking] = useState(false)
  const [ytdlpUpdating, setYtdlpUpdating] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    loadReleases()
    window.api.getYtdlpVersion().then(setYtdlpCurrent).catch(() => {})
    window.api.getArchiveStats().then((s) => setArchiveCount(s.count)).catch(() => {})
    return () => { document.body.style.overflow = '' }
  }, [])

  function loadReleases() {
    setReleasesLoading(true)
    setReleasesError(null)
    window.api.getReleases()
      .then((r) => {
        if (!Array.isArray(r)) throw new Error('Release data is unavailable right now.')
        setReleases(r)
        setReleasesLoading(false)
      })
      .catch((err) => { setReleasesError(String(err)); setReleasesLoading(false) })
  }

  function getInstallerAsset(release: GithubRelease) {
    return release.assets.find((a) => a.name.endsWith('.exe') && !a.name.toLowerCase().includes('uninstall'))
  }

  function toggleReleaseNotes(tagName: string) {
    setExpandedReleaseTag((current) => current === tagName ? null : tagName)
  }

  async function handleInstall(release: GithubRelease) {
    const asset = getInstallerAsset(release)
    if (!asset) return
    setInstallingTag(release.tag_name)
    try {
      await window.api.installVersion(asset.browser_download_url)
    } catch {
      setInstallingTag(null)
    }
  }

  async function handleClearArchive() {
    setClearingArchive(true)
    try {
      await window.api.clearArchive()
      setArchiveCount(0)
    } finally {
      setClearingArchive(false)
    }
  }

  async function handleCheckYtdlpUpdate() {
    setYtdlpChecking(true)
    try {
      const result = await window.api.checkYtdlpUpdate()
      setYtdlpCurrent(result.current)
      setYtdlpLatest(result.latest)
    } catch {
      setYtdlpLatest(null)
    } finally {
      setYtdlpChecking(false)
    }
  }

  async function handleUpdateYtdlp() {
    setYtdlpUpdating(true)
    try {
      const newVersion = await window.api.updateYtdlp()
      setYtdlpCurrent(newVersion)
      setYtdlpLatest(null)
    } catch (err) {
      alert(`yt-dlp update failed: ${(err as Error).message}`)
    } finally {
      setYtdlpUpdating(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        ...draft,
        filenameTemplate: draft.filenameTemplate.trim() || '%(title)s',
        subtitleLanguages: draft.subtitleLanguages.trim() || 'en.*',
        maxHistoryItems: Math.max(10, Number(draft.maxHistoryItems) || 500),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const currentRelease = releases?.find((release) => normalizeTag(release.tag_name) === normalizeTag(version)) ?? null
  const latestStableRelease = releases?.find((release) => !release.prerelease) ?? null

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${styles.modal} appScroll`}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Settings</div>
            <div className="muted" style={{ fontSize: 12 }}>Defaults and app behavior</div>
          </div>
        </div>

        <div className={styles.section}>
          <PathField
            label="Default save folder"
            value={draft.defaultOutputDir}
            placeholder="Choose a default folder..."
            actions={
              <>
                {draft.defaultOutputDir && (
                  <Button variant="ghost" type="button" onClick={() => window.api.openFolder(draft.defaultOutputDir)}>
                    Open
                  </Button>
                )}
                <Button
                  variant="secondary"
                  type="button"
                  onClick={async () => {
                    const dir = await window.api.chooseDirectory()
                    if (dir) setDraft((prev) => ({ ...prev, defaultOutputDir: dir }))
                  }}
                >
                  Browse
                </Button>
              </>
            }
          />

          <div className="flex-col gap-1">
            <SettingLabel text="Default format" help="Choose the format Pulsar selects first when you fetch a link." />
            <select
              className="select"
              value={draft.defaultFormatId}
              onChange={(e) => setDraft((prev) => ({ ...prev, defaultFormatId: e.target.value }))}
            >
              {FORMAT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="flex-col gap-1">
            <SettingLabel text="Max history items" help="Limits how many completed downloads Pulsar keeps in the History tab before older entries are trimmed." />
            <input
              className="input"
              type="number"
              min={10}
              max={5000}
              value={draft.maxHistoryItems}
              onChange={(e) => setDraft((prev) => ({ ...prev, maxHistoryItems: Number(e.target.value) }))}
            />
          </div>

          <div className="flex-col gap-1">
            <SettingLabel text="Filename template" help="Controls how finished downloads are named. For example, %(title)s uses the video title as the filename." />
            <input
              className="input"
              type="text"
              placeholder="%(title)s"
              value={draft.filenameTemplate}
              onChange={(e) => setDraft((prev) => ({ ...prev, filenameTemplate: e.target.value }))}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Supports yt-dlp placeholders like <code>%(title)s</code>, <code>%(uploader)s</code>, and <code>%(upload_date)s</code>.
            </span>
          </div>

          <div className="flex-col gap-1">
            <SettingLabel text="Subtitle handling" help="Choose whether subtitles stay off, download as separate files, or get embedded into supported downloads." />
            <select
              className="select"
              value={draft.subtitleMode}
              onChange={(e) => setDraft((prev) => ({ ...prev, subtitleMode: e.target.value as AppSettings['subtitleMode'] }))}
            >
              {SUBTITLE_MODE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>

          {draft.subtitleMode !== 'off' && (
            <div className="flex-col gap-1">
              <SettingLabel text="Subtitle languages" help="Sets which subtitle languages yt-dlp should download, such as en.*, en,es, or all." />
              <input
                className="input"
                type="text"
                placeholder="en.*,en"
                value={draft.subtitleLanguages}
                onChange={(e) => setDraft((prev) => ({ ...prev, subtitleLanguages: e.target.value }))}
              />
              <span className="muted" style={{ fontSize: 12 }}>
                Use yt-dlp language patterns like <code>en.*</code>, <code>en,es</code>, or <code>all</code>.
              </span>
            </div>
          )}

          <div className="flex-col gap-1">
            <SettingLabel text="Duplicate rule" help="Decides whether items already seen in your queue or history should be skipped, allowed again, or overwritten." />
            <select
              className="select"
              value={draft.duplicateStrategy}
              onChange={(e) => setDraft((prev) => ({ ...prev, duplicateStrategy: e.target.value as AppSettings['duplicateStrategy'] }))}
            >
              {DUPLICATE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>

          <ToggleSetting
            title="Use download archive"
            description="Tracks downloaded video IDs in a file so yt-dlp skips them on re-add, even if you rename files or change folders"
            checked={draft.useDownloadArchive}
            onChange={(checked) => setDraft((prev) => ({ ...prev, useDownloadArchive: checked }))}
          >
            {draft.useDownloadArchive && (
              <div className={styles.archiveStats}>
                <span className="muted" style={{ fontSize: 12 }}>
                  {archiveCount === null ? 'Loading…' : `${archiveCount} ${archiveCount === 1 ? 'entry' : 'entries'} in archive`}
                </span>
                {(archiveCount ?? 0) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={clearingArchive}
                    onClick={() => void handleClearArchive()}
                  >
                    {clearingArchive ? 'Clearing…' : 'Clear archive'}
                  </Button>
                )}
              </div>
            )}
          </ToggleSetting>

          <div className="flex-col gap-1">
            <SettingLabel text="On download error" help="Controls what happens when a download fails permanently. Pause stops the queue so you can review the error before continuing." />
            <select
              className="select"
              value={draft.onError}
              onChange={(e) => setDraft((prev) => ({ ...prev, onError: e.target.value as AppSettings['onError'] }))}
            >
              {ON_ERROR_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>

          <ToggleSetting
            title="Embed metadata in downloaded files"
            description="Write title, uploader, and related metadata into finished downloads when supported"
            checked={draft.embedMetadata}
            onChange={(checked) => setDraft((prev) => ({ ...prev, embedMetadata: checked }))}
          />

          <ToggleSetting
            title="Embed thumbnails in downloaded files"
            description="Attach artwork or thumbnails to supported audio and video formats"
            checked={draft.embedThumbnail}
            onChange={(checked) => setDraft((prev) => ({ ...prev, embedThumbnail: checked }))}
          />

          <ToggleSetting
            title="Automatically check for app updates"
            description="Keep Pulsar up to date by checking for new app releases automatically"
            checked={draft.autoCheckUpdates}
            onChange={(checked) => setDraft((prev) => ({ ...prev, autoCheckUpdates: checked }))}
          >
            {draft.autoCheckUpdates && (
              <ToggleSetting
                compact
                title="Include pre-release updates"
                description="Receive beta versions before they are fully released"
                checked={draft.allowPrerelease}
                onChange={(checked) => setDraft((prev) => ({ ...prev, allowPrerelease: checked }))}
              />
            )}
          </ToggleSetting>

          <ToggleSetting
            title="Open the download folder when a download finishes"
            description="Jump straight to completed files as soon as each download finishes"
            checked={draft.autoOpenFolder}
            onChange={(checked) => setDraft((prev) => ({ ...prev, autoOpenFolder: checked }))}
          />
          <ToggleSetting
            title="System notifications"
            description="Show a Windows notification when each download finishes"
            checked={draft.notifications}
            onChange={(checked) => setDraft((prev) => ({ ...prev, notifications: checked }))}
          />
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Discord</div>
              <div className={styles.sectionSubtitle}>Send downloads to a Discord channel via webhook</div>
            </div>
          </div>

          <div className="flex-col gap-1">
            <SettingLabel text="Discord webhook URL" help="Paste a Discord webhook URL to receive a message with the video title, format, and file size each time a download completes. Leave blank to disable." />
            <input
              className="input"
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              value={draft.discordWebhookUrl}
              onChange={(e) => setDraft((prev) => ({ ...prev, discordWebhookUrl: e.target.value }))}
            />
          </div>

          {draft.discordWebhookUrl && (
            <ToggleSetting
              title="Show send button for files under 25 MB"
              description="Adds a Discord button to completed queue items so you can manually upload the file to Discord. Only appears when the file is small enough for Discord to accept."
              checked={draft.discordAttachFile}
              onChange={(checked) => setDraft((prev) => ({ ...prev, discordAttachFile: checked }))}
            >
              {draft.discordAttachFile && (
                <>
                  <ToggleSetting
                    compact
                    title="Include details card"
                    description="Attach a rich embed showing the video title, format, duration, and file size alongside the upload."
                    checked={draft.discordIncludeEmbed}
                    onChange={(checked) => setDraft((prev) => ({ ...prev, discordIncludeEmbed: checked }))}
                  />
                  <ToggleSetting
                    compact
                    title="Delete file after sending"
                    description="Permanently removes the file from your computer once it has been successfully uploaded to Discord."
                    checked={draft.discordDeleteAfterSend}
                    onChange={(checked) => setDraft((prev) => ({ ...prev, discordDeleteAfterSend: checked }))}
                  />
                  <ToggleSetting
                    compact
                    title="Strip metadata before uploading"
                    description="Removes embedded title, uploader, and other tags from the file before it is sent to Discord. The copy saved to your disk is not affected."
                    checked={draft.discordStripMetadata}
                    onChange={(checked) => setDraft((prev) => ({ ...prev, discordStripMetadata: checked }))}
                  />
                </>
              )}
            </ToggleSetting>
          )}
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>App</div>
              <div className={styles.sectionSubtitle}>Version, updates, and local app data</div>
            </div>
          </div>

          <div className={styles.actionGrid}>
            <Button variant="secondary" type="button" onClick={() => onCopyVersion()}>
              Copy version
            </Button>
            <Button variant="secondary" type="button" onClick={() => void onCheckForUpdates()}>
              Check for updates
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => window.api.openExternalUrl('https://github.com/BigBoss9324/Pulsar/releases').catch(() => {})}
            >
              View releases
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => window.api.openAppDataFolder().catch(() => {})}
            >
              Open app data
            </Button>
          </div>

          <span className="muted" style={{ fontSize: 12 }}>
            {displayVersion ? `Installed version: v${displayVersion}` : 'Installed version unavailable'}
          </span>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Downloader</div>
              <div className={styles.sectionSubtitle}>yt-dlp authentication, pacing, and updates</div>
            </div>
          </div>

          <div className="flex-col gap-1">
            <SettingLabel text="YouTube login" help="Read cookies from a browser you are signed into YouTube with. This bypasses bot detection and allows downloading age-restricted or member-only content. The browser does not need to be open." />
            <select
              className="select"
              value={draft.youtubeCookiesFrom}
              onChange={(e) => setDraft((prev) => ({ ...prev, youtubeCookiesFrom: e.target.value as AppSettings['youtubeCookiesFrom'] }))}
            >
              {YOUTUBE_COOKIES_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            {draft.youtubeCookiesFrom !== 'none' && (
              <span className="muted" style={{ fontSize: 12 }}>
                Pulsar will pass your {YOUTUBE_COOKIES_OPTIONS.find((o) => o.id === draft.youtubeCookiesFrom)?.label} cookies to yt-dlp. Make sure you are signed into YouTube in that browser.
              </span>
            )}
          </div>

          <div className="flex-col gap-1">
            <SettingLabel text="Concurrent downloads" help="How many downloads run at the same time. Higher values are faster but increase the chance of hitting rate limits." />
            <select
              className="select"
              value={draft.maxConcurrentDownloads ?? 1}
              onChange={(e) => setDraft((prev) => ({ ...prev, maxConcurrentDownloads: Number(e.target.value) }))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n === 1 ? '1 (default)' : n}</option>
              ))}
            </select>
          </div>

          <div className="flex-col gap-1">
            <SettingLabel text="Download interval" help="Waits a random amount of time before starting each download. Helps avoid YouTube bot detection when downloading many videos back to back. Recommended: 8–15 seconds." />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                type="number"
                min={0}
                max={120}
                step={1}
                placeholder="Min"
                value={draft.ytdlpSleepIntervalMin}
                onChange={(e) => setDraft((prev) => {
                  const min = Math.max(0, Number(e.target.value) || 0)
                  return { ...prev, ytdlpSleepIntervalMin: min, ytdlpSleepIntervalMax: Math.max(min, prev.ytdlpSleepIntervalMax) }
                })}
              />
              <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>to</span>
              <input
                className="input"
                type="number"
                min={0}
                max={120}
                step={1}
                placeholder="Max"
                value={draft.ytdlpSleepIntervalMax}
                onChange={(e) => setDraft((prev) => {
                  const max = Math.max(0, Number(e.target.value) || 0)
                  return { ...prev, ytdlpSleepIntervalMax: max, ytdlpSleepIntervalMin: Math.min(prev.ytdlpSleepIntervalMin, max) }
                })}
              />
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              Seconds. Set min to 0 to disable. yt-dlp picks a random delay in the range for each download.
            </span>
          </div>

          <div className="flex-col gap-1">
            <SettingLabel text="Request pacing" help="Adds a short delay between yt-dlp metadata requests. This can reduce false positives from rapid repeated requests." />
            <input
              className="input"
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={draft.ytdlpRequestDelaySeconds}
              onChange={(e) => setDraft((prev) => ({
                ...prev,
                ytdlpRequestDelaySeconds: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
              }))}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Seconds between requests. Use 0 to disable pacing.
            </span>
          </div>

          <div className={styles.ytdlpRow}>
            <div className={styles.ytdlpInfo}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>yt-dlp</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {ytdlpCurrent ? `Installed: ${ytdlpCurrent}` : 'Version unavailable'}
              </span>
              {ytdlpLatest && ytdlpLatest > (ytdlpCurrent ?? '') && (
                <span style={{ fontSize: 12, color: 'var(--accent)' }}>Update available: {ytdlpLatest}</span>
              )}
              {ytdlpLatest && ytdlpLatest <= (ytdlpCurrent ?? '') && (
                <span style={{ fontSize: 12, color: 'var(--success)' }}>Up to date</span>
              )}
            </div>
            <div className="flex gap-2">
              {ytdlpLatest && ytdlpLatest > (ytdlpCurrent ?? '') && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={ytdlpUpdating}
                  onClick={() => void handleUpdateYtdlp()}
                >
                  {ytdlpUpdating ? 'Updating…' : `Update to ${ytdlpLatest}`}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={ytdlpChecking || ytdlpUpdating}
                onClick={() => void handleCheckYtdlpUpdate()}
              >
                {ytdlpChecking ? 'Checking…' : 'Check for update'}
              </Button>
            </div>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.versionHeaderCopy}>
              <div className={styles.sectionTitle}>Version</div>
              <div className={styles.sectionSubtitle}>Manage installed versions and review release notes</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadReleases}
              disabled={releasesLoading}
            >
              {releases == null ? 'Browse versions' : releasesLoading ? 'Loading…' : 'Refresh'}
            </Button>
          </div>

          <div className={styles.versionSummary}>
            <div className={styles.versionSummaryMain}>
              <div className={styles.versionKicker}>Current version</div>
              <div className={styles.versionSummaryRow}>
                <div className={styles.versionValue}>{displayVersion || '…'}</div>
              </div>
              <div className={styles.versionMeta}>
                {currentRelease?.published_at
                  ? `Published ${new Date(currentRelease.published_at).toLocaleDateString()}`
                  : 'Release details load automatically when settings opens'}
              </div>
            </div>
          </div>

          {releasesError && <span className="muted" style={{ fontSize: 12 }}>{releasesError}</span>}

          {releases != null && releases.length === 0 && (
            <span className="muted" style={{ fontSize: 12 }}>No releases found.</span>
          )}

          {currentRelease?.body?.trim() && (
            <div className={styles.currentReleaseCard}>
              <div className={styles.currentReleaseHeader}>
                <div>
                  <div className={styles.sectionTitle}>Current Release Notes</div>
                  <div className={styles.currentReleaseMeta}>
                    {currentRelease.tag_name}
                    {currentRelease.name && currentRelease.name !== currentRelease.tag_name ? ` · ${currentRelease.name}` : ''}
                  </div>
                </div>
                <span className={styles.currentBadge}>Installed</span>
              </div>
              <div className={styles.releaseNotes}>
                {renderReleaseNotes(currentRelease.body, {
                  title: styles.releaseNotesTitle,
                  heading: styles.releaseNotesHeading,
                  paragraph: styles.releaseNotesParagraph,
                  list: styles.releaseNotesList,
                })}
              </div>
            </div>
          )}

          {releases != null && releases.length > 0 && (
            <div className={styles.releaseList}>
              {releases.map((release) => {
                const asset = getInstallerAsset(release)
                const isInstalling = installingTag === release.tag_name
                const isCurrent = release.tag_name === `v${version}` || release.tag_name === version
                const isLatestStable = release.tag_name === latestStableRelease?.tag_name
                const hasNotes = Boolean(release.body?.trim())
                const isExpanded = expandedReleaseTag === release.tag_name

                return (
                  <div key={release.tag_name} className={styles.releaseRow}>
                    <div className={styles.releaseMain}>
                      <div className={styles.releaseTopline}>
                        <div className={styles.releaseIdentity}>
                          <div className={styles.releaseInfo}>
                            <code className={styles.releaseTag}>{release.tag_name}</code>
                            {isLatestStable && <span className={styles.latestBadge}>Latest</span>}
                            {release.prerelease && <span className={styles.preReleaseBadge}>Pre-release</span>}
                            {isCurrent && <span className={styles.currentBadge}>Installed</span>}
                          </div>
                          <span className={styles.releaseDate}>
                            {new Date(release.published_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className={styles.releaseCta}>
                          <Button
                            variant={isCurrent ? 'ghost' : 'secondary'}
                            size="sm"
                            disabled={!asset || isInstalling || isCurrent}
                            onClick={() => handleInstall(release)}
                          >
                            {isInstalling ? 'Downloading…' : isCurrent ? 'Installed' : asset ? 'Install' : 'No installer'}
                          </Button>
                        </div>
                      </div>

                      <div className={styles.releaseBody}>
                        <div className={styles.releaseName}>
                          {release.name && release.name !== release.tag_name ? release.name : normalizeTag(release.tag_name)}
                        </div>
                        {hasNotes && (
                          <Button
                            variant="mutedLink"
                            type="button"
                            onClick={() => toggleReleaseNotes(release.tag_name)}
                          >
                            {isExpanded ? 'Hide notes' : 'Show notes'}
                          </Button>
                        )}
                      </div>

                      {isExpanded && hasNotes && (
                        <div className={styles.releaseNotes}>
                          {renderReleaseNotes(release.body ?? '', {
                            title: styles.releaseNotesTitle,
                            heading: styles.releaseNotesHeading,
                            paragraph: styles.releaseNotesParagraph,
                            list: styles.releaseNotesList,
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <ToggleSetting
            title="Enable developer mode"
            description="Show the Dev tab and unlock developer tools in production builds"
            checked={draft.enableDevMode}
            onChange={(checked) => setDraft((prev) => ({ ...prev, enableDevMode: checked }))}
          />
        </div>

        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
