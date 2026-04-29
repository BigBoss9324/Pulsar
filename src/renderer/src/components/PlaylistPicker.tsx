import { useState } from 'react'
import type { PlaylistItem } from '../types'
import Button from './Button'
import PickerCheckbox from './PickerCheckbox'
import PickerModal from './PickerModal'
import styles from './PlaylistPicker.module.css'

const PLAYLIST_FORMATS = [
  { id: 'preset-best', label: 'Best quality (MP4)', type: 'video' as const, quality: 'best' },
  { id: 'video-1080',  label: '1080p (MP4)',         type: 'video' as const, quality: '1080' },
  { id: 'video-720',   label: '720p (MP4)',          type: 'video' as const, quality: '720' },
  { id: 'video-480',   label: '480p (MP4)',          type: 'video' as const, quality: '480' },
  { id: 'audio-mp3',   label: 'MP3 (Audio only)',    type: 'audio' as const, audioFormat: 'mp3' },
  { id: 'audio-m4a',   label: 'M4A (Audio only)',    type: 'audio' as const, audioFormat: 'm4a' },
  { id: 'audio-opus',  label: 'Opus (Audio only)',   type: 'audio' as const, audioFormat: 'opus' },
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

  const filtered = search.trim()
    ? items.filter((i) => i.title.toLowerCase().includes(search.toLowerCase()))
    : items

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id))
  const selectedCount = items.filter((i) => selected.has(i.id)).length

  function toggleItem(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
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

  function handleAdd() {
    const selectedItems = items
      .filter((i) => selected.has(i.id))
      .map((item) => ({ item, outputDir: itemOutputDirs[item.id] || defaultOutputDir }))
    if (selectedItems.length === 0) return
    onAdd(selectedItems, formatId)
  }

  return (
    <PickerModal
      title={title || 'Playlist'}
      subtitle={`${items.length} videos`}
      searchPlaceholder="Search videos..."
      search={search}
      onSearchChange={setSearch}
      allSelected={allSelected}
      filteredCount={filtered.length}
      selectedCount={selectedCount}
      totalCount={items.length}
      onToggleAll={toggleAll}
      onClose={onClose}
      onAdd={handleAdd}
      addDisabled={selectedCount === 0}
      addLabel={`Add ${selectedCount > 0 ? `${selectedCount} ` : ''}to Queue`}
      controlsRight={(
        <select className="select" style={{ width: 'auto', flex: 1 }} value={formatId} onChange={(e) => setFormatId(e.target.value)}>
          {PLAYLIST_FORMATS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      )}
    >
      {filtered.map((item) => (
        <div key={item.id} className={`${styles.item} ${selected.has(item.id) ? styles.itemSelected : ''}`}>
          <PickerCheckbox checked={selected.has(item.id)} onChange={() => toggleItem(item.id)} ariaLabel={`Select ${item.title}`} />
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
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={async () => {
              const dir = await window.api.chooseDirectory()
              if (!dir) return
              setItemOutputDirs((current) => ({ ...current, [item.id]: dir }))
            }}
          >
            {itemOutputDirs[item.id] ? 'Change' : 'Set folder'}
          </Button>
          {itemOutputDirs[item.id] && (
            <Button
              variant="ghost"
              size="sm"
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
            </Button>
          )}
          <span className="faint" style={{ fontSize: 11, flexShrink: 0 }}>#{item.index}</span>
        </div>
      ))}
    </PickerModal>
  )
}
