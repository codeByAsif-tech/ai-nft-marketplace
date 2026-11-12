import { Link } from 'react-router-dom'
import Spinner from './Spinner'

const VARIANTS = {
  primary:
    'bg-gradient-to-r from-brand-600 to-brand-500 text-on-accent shadow-lg shadow-brand-600/25 hover:from-brand-500 hover:to-brand-400',
  secondary: 'border border-white/15 bg-white/5 text-white hover:bg-white/10',
  ghost: 'text-slate-300 hover:bg-white/5 hover:text-white',
  danger: 'bg-red-500/90 text-on-accent hover:bg-red-500',
}

const SIZES = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
}

/** Renders a <Link> when `to` is given, otherwise a <button>. */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  to,
  className = '',
  children,
  ...props
}) {
  const classes = `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition
    disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    )
  }

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}
