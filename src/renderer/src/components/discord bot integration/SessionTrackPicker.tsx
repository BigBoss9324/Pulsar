import { useState } from 'react'
import PickerCheckbox from '../PickerCheckbox'
import PickerModal from '../PickerModal'
import styles from './DownloadQueuePicker.module.css'

interface BotTrack {
  filePath?: string
  title: string
  artist?: string
  duration?: number
}

interface Props {
  tracks: BotTrack[]
  adding: boolean
  onAdd: (tracks: BotTrack[]) => void
  onClose: () => void
}

function fmtDur(secs: number): string {
  if (!secs || secs <= 0) return ''
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SessionTrackPicker({ tracks, adding, onAdd, onClose }: Props) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(tracks.map((_, i) => i)))
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? tracks
        .map((t, i) => ({ t, i }))
        .filter(({ t }) =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          (t.artist ?? '').toLowerCase().includes(search.toLowerCase()),
        )
    : tracks.map((t, i) => ({ t, i }))

  const allSelected = filtered.length > 0 && filtered.every(({ i }) => selected.has(i))
  const selectedTracks = tracks.filter((_, i) => selected.has(i))

  function toggleItem(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        filtered.forEach(({ i }) => next.delete(i))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        filtered.forEach(({ i }) => next.add(i))
        return next
      })
    }
  }

  return (
    <PickerModal
      title="Add to playlist"
      subtitle={`${tracks.length} track${tracks.length !== 1 ? 's' : ''} in session`}
      searchPlaceholder="Search tracks…"
      search={search}
      onSearchChange={setSearch}
      allSelected={allSelected}
      filteredCount={filtered.length}
      selectedCount={selectedTracks.length}
      totalCount={tracks.length}
      onToggleAll={toggleAll}
      onClose={onClose}
      onAdd={() => onAdd(selectedTracks)}
      addDisabled={adding || selectedTracks.length === 0}
      addLabel={adding ? 'Adding…' : `Add ${selectedTracks.length || ''} selected`}
    >
      {filtered.length === 0 ? (
        <div className="muted" style={{ fontSize: 12, padding: '8px 0' }}>No tracks match your filter.</div>
      ) : (
        filtered.map(({ t, i }, listIdx) => (
          <div
            key={i}
            className={`${styles.item} ${selected.has(i) ? styles.itemSelected : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={selected.has(i)}
            onClick={() => toggleItem(i)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              toggleItem(i)
            }}
          >
            <PickerCheckbox checked={selected.has(i)} onChange={() => toggleItem(i)} ariaLabel={`Select ${t.title}`} />
            <div className={styles.thumb}><span>{listIdx + 1}</span></div>
            <div className={styles.itemMeta}>
              <div className={styles.itemTitle} title={t.title}>{t.title}</div>
              <div className={styles.itemDetails}>
                {[t.artist && t.artist !== 'Unknown' ? t.artist : null, fmtDur(t.duration ?? 0)]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>
        ))
      )}
    </PickerModal>
  )
}
