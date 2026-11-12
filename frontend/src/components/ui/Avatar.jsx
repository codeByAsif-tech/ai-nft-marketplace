const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-base',
  lg: 'h-20 w-20 text-2xl',
}

const initialsOf = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'

/** Initials avatar on the brand gradient (no profile photos yet). */
export default function Avatar({ name, size = 'md', className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 font-display font-bold text-on-accent shadow-lg shadow-brand-600/30 ring-2 ring-white/10 ${SIZES[size]} ${className}`}
    >
      {initialsOf(name)}
    </span>
  )
}
