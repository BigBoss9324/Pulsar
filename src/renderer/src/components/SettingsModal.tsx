import { useEffect, useState } from 'react'
import type { AppSettings, GithubRelease } from '../types'
import PathField from './PathField'
import ToggleSetting from './ToggleSetting'
import styles from './SettingsModal.module.css'

const FORMAT_OPTIONS = [
  { id: 'preset-best', label: 'Best quality (MP4)' },
  { id: 'video-1080', label: '1080p (MP4)' },
  { id: 'video-720', label: '720p (MP4)' },
  { id: 'audio-mp3', label: 'MP3 (Audio only)' },
  { id: 'audio-m4a', label: 'M4A (Audio only)' },
]

interface Props {
  settings: AppSettings
  onClose: () => void
  onSave: (settings: AppSettings) => Promise<void>
}

function normalizeTag(tag: string | null) {
  return (tag ?? '').replace(/^v/i, '').trim()
}

function renderReleaseNotes(body: string) {
  const lines = body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())

  const blocks: JSX.Element[] = []
  let bulletItems: string[] = []
  let paragraphLines: string[] = []

  const flushBullets = () => {
    if (!bulletItems.length) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className={styles.releaseNotesList}>
        {bulletItems.map((item, index) => (
          <li key={`li-${index}`}>{item}</li>
        ))}
      </ul>,
    )
    bulletItems = []
  }

  const flushParagraph = () => {
    if (!paragraphLines.length) return
    blocks.push(
      <p key={`p-${blocks.length}`} className={styles.releaseNotesParagraph}>
        {paragraphLines.join(' ')}
      </p>,
    )
    paragraphLines = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushBullets()
      flushParagraph()
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushBullets()
      flushParagraph()
      const level = headingMatch[1].length
      const content = headingMatch[2].trim()
      if (level === 1) {
        blocks.push(<h3 key={`h-${blocks.length}`} className={styles.releaseNotesTitle}>{content}</h3>)
      } else {
        blocks.push(<h4 key={`h-${blocks.length}`} className={styles.releaseNotesHeading}>{content}</h4>)
      }
      continue
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/)
    if (bulletMatch) {
      flushParagraph()
      bulletItems.push(bulletMatch[1].trim())
      continue
    }

    paragraphLines.push(trimmed)
  }

  flushBullets()
  flushParagraph()

  return blocks.length ? blocks : <p className={styles.releaseNotesParagraph}>{body}</p>
}

export default function SettingsModal({ settings, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const [releases, setReleases] = useState<GithubRelease[] | null>(null)
  const [releasesLoading, setReleasesLoading] = useState(false)
  const [releasesError, setReleasesError] = useState<string | null>(null)
  const [installingTag, setInstallingTag] = useState<string | null>(null)
  const [expandedReleaseTag, setExpandedReleaseTag] = useState<string | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    window.api.getAppVersion().then(setVersion).catch(() => {})
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
        maxHistoryItems: Math.max(10, Number(draft.maxHistoryItems) || 125),
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
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Settings</div>
            <div className="muted" style={{ fontSize: 12 }}>Defaults and app behavior</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
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
            <label className="label">Default format</label>
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
            <label className="label">Max history items</label>
            <input
              className="input"
              type="number"
              min={10}
              max={5000}
              value={draft.maxHistoryItems}
              onChange={(e) => setDraft((prev) => ({ ...prev, maxHistoryItems: Number(e.target.value) }))}
            />
          </div>

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
                <div className={styles.versionValue}>{version ?? '…'}</div>
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
                {renderReleaseNotes(currentRelease.body)}
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
                          {renderReleaseNotes(release.body ?? '')}
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
