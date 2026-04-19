import { useEffect, useState } from 'react'
import type { AppSettings, GithubRelease } from '../types'
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
      <button
        className={styles.infoButton}
        type="button"
        aria-label={text}
      >
        i
      </button>
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

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    loadReleases()
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
                  <button className="btn btn-ghost" type="button" onClick={() => window.api.openFolder(draft.defaultOutputDir)}>
                    Open
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={async () => {
                    const dir = await window.api.chooseDirectory()
                    if (dir) setDraft((prev) => ({ ...prev, defaultOutputDir: dir }))
                  }}
                >
                  Browse
                </button>
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
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Notifications</div>
              <div className={styles.sectionSubtitle}>Get notified when downloads finish</div>
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
            <button className="btn btn-secondary" type="button" onClick={() => onCopyVersion()}>
              Copy version
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => void onCheckForUpdates()}>
              Check for updates
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => window.api.openExternalUrl('https://github.com/BigBoss9324/Pulsar/releases').catch(() => {})}
            >
              View releases
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => window.api.openAppDataFolder().catch(() => {})}
            >
              Open app data
            </button>
          </div>

          <span className="muted" style={{ fontSize: 12 }}>
            {displayVersion ? `Installed version: v${displayVersion}` : 'Installed version unavailable'}
          </span>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.versionHeaderCopy}>
              <div className={styles.sectionTitle}>Version</div>
              <div className={styles.sectionSubtitle}>Manage installed versions and review release notes</div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={loadReleases}
              disabled={releasesLoading}
            >
              {releases == null ? 'Browse versions' : releasesLoading ? 'Loading…' : 'Refresh'}
            </button>
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
                          <button
                            className={`btn ${isCurrent ? 'btn-ghost' : 'btn-secondary'} btn-sm`}
                            disabled={!asset || isInstalling || isCurrent}
                            onClick={() => handleInstall(release)}
                          >
                            {isInstalling ? 'Downloading…' : isCurrent ? 'Installed' : asset ? 'Install' : 'No installer'}
                          </button>
                        </div>
                      </div>

                      <div className={styles.releaseBody}>
                        <div className={styles.releaseName}>
                          {release.name && release.name !== release.tag_name ? release.name : normalizeTag(release.tag_name)}
                        </div>
                        {hasNotes && (
                          <button
                            type="button"
                            className={styles.releaseNotesToggle}
                            onClick={() => toggleReleaseNotes(release.tag_name)}
                          >
                            {isExpanded ? 'Hide notes' : 'Show notes'}
                          </button>
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
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
