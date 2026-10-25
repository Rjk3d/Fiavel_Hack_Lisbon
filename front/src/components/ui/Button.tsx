import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/cx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'white' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none ' +
  'transition-[background-color,color,box-shadow,transform,border-color] duration-150 active:scale-[0.98] ' +
  'disabled:opacity-45 disabled:pointer-events-none'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-brand hover:bg-brand-dark',
  secondary: 'bg-white text-brand border border-line hover:border-brand/30 hover:bg-brand-tint',
  ghost: 'text-ink-muted hover:text-ink hover:bg-brand-tint/70',
  dark: 'bg-ink text-white hover:bg-[#2a2442]',
  white: 'bg-white text-brand hover:bg-brand-tint shadow-card',
  danger: 'bg-danger text-white hover:brightness-95',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-[52px] px-7 text-[16px]',
}

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', extra?: string) =>
  cx(base, variants[variant], sizes[size], extra)

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconRight?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant, size, icon, iconRight, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </button>
  )
})

export function ButtonLink({
  to,
  variant,
  size,
  icon,
  iconRight,
  className,
  children,
}: { to: string; variant?: Variant; size?: Size; icon?: ReactNode; iconRight?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
      {iconRight}
    </Link>
  )
}
