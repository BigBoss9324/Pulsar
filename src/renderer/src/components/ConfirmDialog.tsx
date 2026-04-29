import Button, { type ButtonVariant } from './Button'
import styles from './ConfirmDialog.module.css'

interface Props {
  title: string
  body: string
  confirmLabel?: string
  confirmVariant?: ButtonVariant
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className={styles.dialog}>
        <div className={styles.title}>{title}</div>
        <div className={styles.body}>{body}</div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
