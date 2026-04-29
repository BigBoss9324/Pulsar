import Button from './Button'
import styles from './PickerCheckbox.module.css'

interface Props {
  checked: boolean
  onChange: () => void
  ariaLabel?: string
}

export default function PickerCheckbox({ checked, onChange, ariaLabel }: Props) {
  return (
    <Button
      variant="unstyled"
      className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`}
      aria-checked={checked}
      aria-label={ariaLabel}
      role="checkbox"
      onClick={(event) => {
        event.stopPropagation()
        onChange()
      }}
    >
      <span className={styles.checkmark} />
    </Button>
  )
}
