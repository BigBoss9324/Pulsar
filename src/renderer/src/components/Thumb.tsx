import styles from './Thumb.module.css'

interface Props {
  src?: string
  className?: string
}

export default function Thumb({ src, className }: Props) {
  return (
    <div className={`${styles.wrap} ${className ?? ''}`}>
      {src && (
        <img
          className={styles.img}
          src={src}
          alt=""
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}
      <svg className={styles.icon} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2" y="4" width="20" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8.5" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 16l5-5 4 4 3-3 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
