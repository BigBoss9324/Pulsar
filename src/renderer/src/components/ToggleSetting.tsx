import type { ReactNode } from 'react'
import styles from './ToggleSetting.module.css'

interface Props {
  title: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  children?: ReactNode
  compact?: boolean
}

export default function ToggleSetting({ title, description, checked, onChange, children, compact = false }: Props) {
  return (
    <div className={`${styles.row} ${compact ? styles.compactRow : ''}`}>
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.copy}>
            <div className={styles.title}>{title}</div>
            {description && <div className={styles.description}>{description}</div>}
          </div>
          <label className={styles.switch} aria-label={title}>
            <input
              className={styles.input}
              type="checkbox"
              checked={checked}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span className={styles.track}>
              <span className={styles.thumb} />
            </span>
          </label>
        </div>
        {children && <div className={styles.children}>{children}</div>}
      </div>
    </div>
  )
}
