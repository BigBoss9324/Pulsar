import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'download'
  | 'tab'
  | 'link'
  | 'mutedLink'
  | 'icon'
  | 'discord'
  | 'unstyled'

export type ButtonSize = 'md' | 'sm' | 'lg'

const variantClass: Record<Exclude<ButtonVariant, 'unstyled'>, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  download: 'btn-download',
  tab: 'btn-tab',
  link: 'btn-link',
  mutedLink: 'btn-muted-link',
  icon: 'btn-icon',
  discord: 'btn-discord',
}

const sizeClass: Record<ButtonSize, string> = {
  md: '',
  sm: 'btn-sm',
  lg: 'btn-lg',
}

export interface ButtonConfig {
  label: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  trailingIcon?: ReactNode
  title?: string
  disabled?: boolean
  loading?: boolean
  loadingLabel?: ReactNode
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick']
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  active?: boolean
  fullWidth?: boolean
  icon?: ReactNode
  trailingIcon?: ReactNode
  iconOnly?: boolean
  label?: ReactNode
  loading?: boolean
  loadingLabel?: ReactNode
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    active = false,
    children,
    className,
    disabled = false,
    fullWidth = false,
    icon,
    iconOnly = false,
    label,
    loading = false,
    loadingLabel,
    size = 'md',
    trailingIcon,
    type = 'button',
    variant = 'secondary',
    ...props
  },
  ref,
) {
  const isUnstyled = variant === 'unstyled'
  const isDisabled = disabled || loading
  const content = loading && loadingLabel !== undefined ? loadingLabel : label ?? children
  const resolvedVariantClass = isUnstyled ? '' : variantClass[variant]

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={isDisabled}
      data-active={active || undefined}
      data-loading={loading || undefined}
      className={cx(
        !isUnstyled && 'btn',
        isUnstyled && 'btn-unstyled',
        resolvedVariantClass,
        !isUnstyled && sizeClass[size],
        !isUnstyled && iconOnly && 'btn-icon-only',
        !isUnstyled && active && 'btn-active',
        !isUnstyled && fullWidth && 'btn-full',
        className,
      )}
    >
      {icon}
      {content}
      {trailingIcon}
    </button>
  )
})

export function ConfiguredButton({ config, ...props }: { config: ButtonConfig } & Omit<ButtonProps, keyof ButtonConfig>) {
  return (
    <Button
      {...props}
      disabled={config.disabled}
      icon={config.icon}
      loading={config.loading}
      loadingLabel={config.loadingLabel}
      onClick={config.onClick}
      size={config.size}
      title={config.title}
      trailingIcon={config.trailingIcon}
      variant={config.variant}
    >
      {config.label}
    </Button>
  )
}

export default Button
