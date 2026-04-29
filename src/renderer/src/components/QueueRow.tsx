import { useState, useEffect } from 'react'
import type { QueueItem } from '../types'
import Button from './Button'
import Thumb from './Thumb'
import styles from './DownloadTab.module.css'

export const DISCORD_MAX_BYTES = 25 * 1024 * 1024

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

function fileNameFromPath(filePath?: string) {
  if (!filePath) return ''
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || ''
}

interface QueueRowProps {
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
}

export default function QueueRow({
  item,
  selected,
  onToggleSelect,
  onRemove,
  onCancel,
  onOpenFolder,
  onReveal,
  onRetry,
  onMoveNext,
  onMoveUp,
  onMoveDown,
  discordWebhookUrl,
  discordStripMetadata,
  discordIncludeEmbed,
  discordDeleteAfterSend,
  onDiscordFileDeleted,
}: QueueRowProps) {
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setCancelling(true); onCancel() }}
            disabled={cancelling}
            title="Cancel"
          >
            <CloseIcon />{cancelling ? 'Cancelling...' : 'Cancel'}
          </Button>
        )}
        {(item.status === 'pending' || item.status === 'error') && <Button variant="ghost" size="sm" onClick={onMoveNext} title="Move next"><ArrowNextIcon />Next</Button>}
        {item.status !== 'downloading' && <Button variant="ghost" size="sm" onClick={onMoveUp} title="Move up"><ArrowUpIcon />Up</Button>}
        {item.status !== 'downloading' && <Button variant="ghost" size="sm" onClick={onMoveDown} title="Move down"><ArrowDownIcon />Down</Button>}
        {item.status === 'done' && <Button variant="ghost" size="sm" onClick={onOpenFolder} title="Open folder"><FolderIcon />Open</Button>}
        {item.status === 'done' && <Button variant="ghost" size="sm" onClick={onReveal} title={item.outputPath ? 'Reveal file' : 'Open folder'}><FileIcon />Reveal</Button>}
        {item.status === 'done' && item.outputPath && discordWebhookUrl && (item.fileSize ?? 0) <= DISCORD_MAX_BYTES && (
          <Button
            variant="ghost"
            size="sm"
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
          </Button>
        )}
        {item.status === 'error' && <Button variant="ghost" size="sm" onClick={onRetry} title="Retry"><RetryIcon />Retry</Button>}
        {(item.status === 'pending' || item.status === 'done' || item.status === 'error') && (
          <Button variant="ghost" size="sm" onClick={onRemove} title="Remove"><TrashIcon />Remove</Button>
        )}
      </div>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

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
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}
