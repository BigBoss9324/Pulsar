import { useState, useEffect } from 'react'
import type { HistoryItem } from '../types'
import Button from './Button'
import Thumb from './Thumb'
import ConfirmDialog from './ConfirmDialog'
import { revealDownloadLocation, openDownloadFolder } from '../utils/downloadLocation'
import styles from './HistoryTab.module.css'

interface Props {
  showToast: (msg: string, type: string) => void
  onRedownload: (items: HistoryItem[]) => void
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  useEffect(() => {
    window.api.getHistory().then((h) => { setItems(h); setLoading(false) })
  }, [])

  async function handleDelete(id: string) {
    await window.api.deleteHistoryItem(id)
    setItems((h) => h.filter((i) => i.id !== id))
    setSelected((s) => { const next = new Set(s); next.delete(id); return next })
  }

  async function handleClearAll() {
    await window.api.clearHistory()
    setItems([])
    setSelected(new Set())
    setConfirmClearOpen(false)
    showToast('History cleared', '')
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = search.trim()
    ? items.filter((item) =>
      [item.title, item.url, item.formatLabel].some((value) => value.toLowerCase().includes(search.toLowerCase())),
    )
    : items

  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id))

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected((s) => {
        const next = new Set(s)
        filtered.forEach((i) => next.delete(i.id))
        return next
      })
    } else {
      setSelected((s) => {
        const next = new Set(s)
        filtered.forEach((i) => next.add(i.id))
        return next
      })
    }
  }

  const selectedItems = items.filter((i) => selected.has(i.id))

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
        {selected.size > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { onRedownload(selectedItems); setSelected(new Set()) }}
          >
            <QueueIcon />
            Add {selected.size} to queue
          </Button>
        )}
        {defaultOutputDir && (
          <Button variant="ghost" size="sm" onClick={() => void openDownloadFolder({ outputDir: defaultOutputDir })}>
            Open default folder
          </Button>
        )}
        <Button variant="danger" size="sm" style={{ marginLeft: 'auto' }} onClick={() => setConfirmClearOpen(true)}>
          Clear all
        </Button>
      </div>

      <div className={styles.toolbar}>
        {filtered.length > 0 && (
          <label className={styles.selectAll}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              aria-label={allFilteredSelected ? 'Deselect all history items' : 'Select all history items'}
              title={allFilteredSelected ? 'Deselect all' : 'Select all'}
            />
          </label>
        )}
        <input
          className="input"
          type="text"
          placeholder="Search history..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      <div className={styles.list}>
        {filtered.map((item) => {
          const isSelected = selected.has(item.id)
          return (
            <div
              key={item.id}
              className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isSelected}
                onChange={() => toggleSelect(item.id)}
                aria-label={`Select ${item.title}`}
              />
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
                <Button variant="secondary" size="sm" title="Add to queue again" onClick={() => onRedownload([item])}>
                  <QueueIcon />
                  Redownload
                </Button>
                <Button variant="ghost" size="sm" title="Open folder" onClick={() => void openDownloadFolder(item)}>
                  <FolderIcon />
                  Open
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title={item.outputPath ? 'Show file' : 'Open folder'}
                  onClick={() => void revealDownloadLocation(item, showToast)}
                >
                  <FileIcon />
                  Reveal
                </Button>
                <Button variant="ghost" size="sm" title="Remove from history" onClick={() => handleDelete(item.id)}>
                  <TrashIcon />
                  Remove
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {confirmClearOpen && (
        <ConfirmDialog
          title="Clear all history?"
          body="This will remove every item from your download history. This cannot be undone."
          confirmLabel="Clear history"
          onConfirm={() => void handleClearAll()}
          onCancel={() => setConfirmClearOpen(false)}
        />
      )}
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
