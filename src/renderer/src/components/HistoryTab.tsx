import { useState, useEffect } from 'react'
import type { HistoryItem } from '../types'
import Thumb from './Thumb'
import styles from './HistoryTab.module.css'

interface Props {
  showToast: (msg: string, type: string) => void
  onRedownload: (item: HistoryItem) => void
  defaultOutputDir: string
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch { return iso }
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

export default function HistoryTab({ showToast, onRedownload, defaultOutputDir }: Props) {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    window.api.getHistory().then((h) => { setItems(h); setLoading(false) })
  }, [])

  async function handleDelete(id: string) {
    await window.api.deleteHistoryItem(id)
    setItems((h) => h.filter((i) => i.id !== id))
  }

  async function handleClearAll() {
    await window.api.clearHistory()
    setItems([])
    showToast('History cleared', '')
  }

  const filtered = search.trim()
    ? items.filter((item) =>
      [item.title, item.url, item.formatLabel].some((value) => value.toLowerCase().includes(search.toLowerCase())),
    )
    : items

  if (loading) {
    return <div className={styles.empty}>Loading...</div>
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <MailboxIcon />
        <p>No download history yet.</p>
        <p className="muted" style={{ fontSize: 12 }}>Completed downloads will appear here.</p>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{items.length} download{items.length !== 1 ? 's' : ''}</span>
        {defaultOutputDir && (
          <button className="btn btn-ghost btn-sm" onClick={() => window.api.openFolder(defaultOutputDir)}>
            Open default folder
          </button>
        )}
        <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={handleClearAll}>
          Clear all
        </button>
      </div>

      <input
        className="input"
        type="text"
        placeholder="Search history..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className={`${styles.list} appScroll`}>
        {filtered.map((item) => (
          <div key={item.id} className={styles.row}>
            <Thumb src={item.thumbnail} className={styles.thumb} />
            <div className={styles.meta}>
              <div className={styles.title} title={item.title}>{item.title}</div>
              <div className="flex gap-2 items-center" style={{ marginTop: 3, flexWrap: 'wrap' }}>
                <span className={styles.formatBadge}>{item.formatLabel}</span>
                {item.duration && <span className="muted" style={{ fontSize: 11 }}>{item.duration}</span>}
                {item.fileSize && <span className="muted" style={{ fontSize: 11 }}>{formatBytes(item.fileSize)}</span>}
                <span className="faint" style={{ fontSize: 11 }}>{formatDate(item.completedAt)}</span>
              </div>
            </div>
            <div className={styles.actions}>
              <button className="btn btn-secondary btn-sm" title="Add to queue again" onClick={() => onRedownload(item)}>
                <QueueIcon />
                Redownload
              </button>
              <button className="btn btn-ghost btn-sm" title="Open folder" onClick={() => window.api.openFolder(item.outputDir)}>
                <FolderIcon />
                Open
              </button>
              {item.outputPath && (
                <button className="btn btn-ghost btn-sm" title="Show file" onClick={() => window.api.revealItem(item.outputPath!)}>
                  <FileIcon />
                  Reveal
                </button>
              )}
              <button className="btn btn-ghost btn-sm" title="Remove from history" onClick={() => handleDelete(item.id)}>
                <TrashIcon />
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MailboxIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ opacity: 0.35 }}>
      <path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 12A8.5 8.5 0 1 0 5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 5v2.5H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function QueueIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 2.5H10M2 6H10M2 9.5H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8.5 8.5L10.5 10.5L11.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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
