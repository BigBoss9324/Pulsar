import { useState, useEffect } from 'react'
import type { PlaylistItem } from '../types'
import styles from './PlaylistPicker.module.css'

const PLAYLIST_FORMATS = [
  { id: 'preset-best', label: 'Best quality (MP4)', type: 'video' as const, quality: 'best' },
  { id: 'video-1080',  label: '1080p (MP4)',         type: 'video' as const, quality: '1080' },
  { id: 'video-720',   label: '720p (MP4)',           type: 'video' as const, quality: '720'  },
  { id: 'video-480',   label: '480p (MP4)',           type: 'video' as const, quality: '480'  },
  { id: 'audio-mp3',   label: 'MP3 (Audio only)',     type: 'audio' as const, audioFormat: 'mp3'  },
  { id: 'audio-m4a',   label: 'M4A (Audio only)',     type: 'audio' as const, audioFormat: 'm4a'  },
  { id: 'audio-opus',  label: 'Opus (Audio only)',    type: 'audio' as const, audioFormat: 'opus' },
]

interface Props {
  title: string
  items: PlaylistItem[]
  defaultOutputDir: string
  onAdd: (selected: Array<{ item: PlaylistItem; outputDir: string }>, formatId: string) => void
  onClose: () => void
}

export default function PlaylistPicker({ title, items, defaultOutputDir, onAdd, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.id)))
  const [formatId, setFormatId] = useState('preset-best')
  const [search, setSearch] = useState('')
  const [itemOutputDirs, setItemOutputDirs] = useState<Record<string, string>>({})

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const filtered = search.trim()
    ? items.filter((i) => i.title.toLowerCase().includes(search.toLowerCase()))
    : items

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id))

  function toggleItem(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected((s) => { const next = new Set(s); filtered.forEach((i) => next.delete(i.id)); return next })
    } else {
      setSelected((s) => { const next = new Set(s); filtered.forEach((i) => next.add(i.id)); return next })
    }
  }

  function handleAdd() {
    const selectedItems = items
      .filter((i) => selected.has(i.id))
      .map((item) => ({ item, outputDir: itemOutputDirs[item.id] || defaultOutputDir }))
    if (selectedItems.length === 0) return
    onAdd(selectedItems, formatId)
  }

  const selectedCount = items.filter((i) => selected.has(i.id)).length

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span style={{ fontWeight: 600 }}>{title || 'Playlist'}</span>
            <span className="muted" style={{ fontSize: 12 }}>{items.length} videos</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className={styles.controls}>
          <input
            className="input"
            type="text"
            placeholder="Search videos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2 items-center" style={{ marginTop: 8 }}>
            <label className={styles.checkRow} style={{ flex: 1 }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span className="muted" style={{ fontSize: 12 }}>
                {allSelected ? 'Deselect all' : 'Select all'} ({filtered.length})
              </span>
            </label>
            <select className="select" style={{ width: 'auto', flex: 1 }} value={formatId} onChange={(e) => setFormatId(e.target.value)}>
              {PLAYLIST_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.list}>
          {filtered.map((item) => (
            <div key={item.id} className={`${styles.item} ${selected.has(item.id) ? styles.itemSelected : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggleItem(item.id)}
                className={styles.checkbox}
              />
              <img className={styles.thumb} src={item.thumbnail} alt="" />
              <div className={styles.itemMeta}>
                <div className={styles.itemTitle} title={item.title}>{item.title}</div>
                <div className={styles.itemDetails}>
                  {item.duration && <span className="faint" style={{ fontSize: 11 }}>{item.duration}</span>}
                  {itemOutputDirs[item.id]
                    ? (
                      <>
                        <span className={styles.itemFolderStatus}>Custom folder selected</span>
                        <span className={styles.itemFolder} title={itemOutputDirs[item.id]}>{itemOutputDirs[item.id]}</span>
                      </>
                    )
                    : (
                      <span className={styles.itemFolderDefault} title={defaultOutputDir || 'Default save folder'}>
                        Using default folder{defaultOutputDir ? `: ${defaultOutputDir}` : ''}
                      </span>
                    )}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={async () => {
                  const dir = await window.api.chooseDirectory()
                  if (!dir) return
                  setItemOutputDirs((current) => ({ ...current, [item.id]: dir }))
                }}
              >
                {itemOutputDirs[item.id] ? 'Change' : 'Set folder'}
              </button>
              {itemOutputDirs[item.id] && (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => {
                    setItemOutputDirs((current) => {
                      const next = { ...current }
                      delete next[item.id]
                      return next
                    })
                  }}
                >
                  Default
                </button>
              )}
              <span className="faint" style={{ fontSize: 11, flexShrink: 0 }}>#{item.index}</span>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <span className="muted" style={{ fontSize: 12 }}>
            {selectedCount} of {items.length} selected
          </span>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-download" onClick={handleAdd} disabled={selectedCount === 0}>
              Add {selectedCount > 0 ? `${selectedCount} ` : ''}to Queue
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
