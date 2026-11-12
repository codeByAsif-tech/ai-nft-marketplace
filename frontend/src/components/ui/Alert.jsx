const STYLES = {
  error: 'border-red-500/30 bg-red-500/10 text-red-200',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  info: 'border-accent-500/30 bg-accent-500/10 text-cyan-100',
}

export default function Alert({ type = 'error', children, className = '' }) {
  if (!children) return null
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm ${STYLES[type]} ${className}`}
    >
      {children}
    </div>
  )
}
