import type { ReactNode } from 'react'
import styles from './PathField.module.css'

interface Props {
  label: string
  value: string
  placeholder: string
  title?: string
  actions?: ReactNode
  className?: string
}

export default function PathField({ label, value, placeholder, title, actions, className = '' }: Props) {
  const rootClassName = className ? `${styles.root} ${className}` : styles.root
  const inputTitle = (title ?? value) || placeholder

  return (
    <div className={rootClassName}>
      <label className="label">{label}</label>
      <div className={styles.inlineField}>
        <input className="input" type="text" readOnly value={value} placeholder={placeholder} title={inputTitle} />
        {actions}
      </div>
    </div>
  )
}
