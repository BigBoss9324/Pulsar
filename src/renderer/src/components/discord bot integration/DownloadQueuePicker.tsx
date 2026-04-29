import { useState } from 'react'
import type { QueueItem } from '../../types'
import PickerCheckbox from '../PickerCheckbox'
import PickerModal from '../PickerModal'
import styles from './DownloadQueuePicker.module.css'

interface Props {
  items: QueueItem[]
  adding: boolean
  onAdd: (items: QueueItem[]) => void
  onClose: () => void
}

export default function DownloadQueuePicker({ items, adding, onAdd, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((item) => item.id)))
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? items.filter((item) => {
      const q = search.toLowerCase()
      return item.title.toLowerCase().includes(q)
        || item.filename.toLowerCase().includes(q)
        || (item.outputPath ?? '').toLowerCase().includes(q)
    })
    : items

  const allSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id))
  const selectedItems = items.filter((item) => selected.has(item.id))

  function toggleItem(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected((current) => {
        const next = new Set(current)
        filtered.forEach((item) => next.delete(item.id))
        return next
      })
    } else {
      setSelected((current) => {
        const next = new Set(current)
        filtered.forEach((item) => next.add(item.id))
        return next
      })
    }
  }

  return (
    <PickerModal
      title="Add downloads"
      subtitle={`${items.length} completed file${items.length === 1 ? '' : 's'}`}
      searchPlaceholder="Search downloads..."
      search={search}
      onSearchChange={setSearch}
      allSelected={allSelected}
      filteredCount={filtered.length}
      selectedCount={selectedItems.length}
      totalCount={items.length}
      onToggleAll={toggleAll}
      onClose={onClose}
      onAdd={() => onAdd(selectedItems)}
      addDisabled={adding || selectedItems.length === 0}
      addLabel={adding ? 'Adding...' : `Add ${selectedItems.length || ''} selected`}
    >
      {filtered.length === 0
        ? <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>No downloads match your filter.</div>
        : filtered.map((item, idx) => (
          <div key={item.id} className={`${styles.item} ${selected.has(item.id) ? styles.itemSelected : ''}`}>
            <PickerCheckbox checked={selected.has(item.id)} onChange={() => toggleItem(item.id)} ariaLabel={`Select ${item.title || item.filename}`} />
            <div className={styles.thumb}>
              <span>{idx + 1}</span>
            </div>
            <div className={styles.itemMeta}>
              <div className={styles.itemTitle} title={item.title || item.filename}>{item.title || item.filename || 'Downloaded File'}</div>
              <div className={styles.itemDetails}>
                {[item.formatLabel, item.duration].filter(Boolean).join(' • ')}
                {item.outputPath && (
                  <span className={styles.itemPath} title={item.outputPath}>{item.outputPath}</span>
                )}
              </div>
            </div>
          </div>
        ))
      }
    </PickerModal>
  )
}
