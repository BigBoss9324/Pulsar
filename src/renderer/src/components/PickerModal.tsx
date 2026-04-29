import { useEffect, type ReactNode } from 'react'
import Button from './Button'
import PickerCheckbox from './PickerCheckbox'
import styles from './PickerModal.module.css'

interface Props {
  title: string
  subtitle: string
  searchPlaceholder: string
  search: string
  onSearchChange: (value: string) => void
  allSelected: boolean
  filteredCount: number
  selectedCount: number
  totalCount: number
  selectAllLabel?: string
  controlsRight?: ReactNode
  children: ReactNode
  addLabel: string
  addDisabled?: boolean
  onAdd: () => void
  onToggleAll: () => void
  onClose: () => void
}

export default function PickerModal({
  title,
  subtitle,
  searchPlaceholder,
  search,
  onSearchChange,
  allSelected,
  filteredCount,
  selectedCount,
  totalCount,
  selectAllLabel,
  controlsRight,
  children,
  addLabel,
  addDisabled = false,
  onAdd,
  onToggleAll,
  onClose,
}: Props) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${styles.modal} appScroll`}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span style={{ fontWeight: 600 }}>{title}</span>
            <span className="muted" style={{ fontSize: 12 }}>{subtitle}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close picker">X</Button>
        </div>

        <div className={styles.controls}>
          <input
            className="input"
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <div className={styles.controlRow}>
            <label className={styles.checkRow} style={{ flex: 1 }}>
              <PickerCheckbox checked={allSelected} onChange={onToggleAll} ariaLabel={allSelected ? 'Deselect all' : 'Select all'} />
              <span className="muted" style={{ fontSize: 12 }}>
                {selectAllLabel ?? (allSelected ? 'Deselect all' : 'Select all')} ({filteredCount})
              </span>
            </label>
            {controlsRight}
          </div>
        </div>

        <div className={`${styles.list} appScroll`}>
          {children}
        </div>

        <div className={styles.footer}>
          <span className="muted" style={{ fontSize: 12 }}>
            {selectedCount} of {totalCount} selected
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="download" onClick={onAdd} disabled={addDisabled}>
              {addLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
