const STATUS = {
  DRAFT: { label: 'Draft', text: 'text-slate-200', dot: 'bg-slate-400', soft: 'bg-white/10' },
  UPLOADED_TO_IPFS: { label: 'On IPFS', text: 'text-cyan-200', dot: 'bg-cyan-400', soft: 'bg-cyan-500/15' },
  MINTED: { label: 'Minted', text: 'text-emerald-200', dot: 'bg-emerald-400', soft: 'bg-emerald-500/15' },
  FAILED: { label: 'Failed', text: 'text-red-200', dot: 'bg-red-400', soft: 'bg-red-500/15' },
}

/**
 * Status pill with a colored dot.
 * `overlay` = placed on top of an image: uses a dark, nearly solid background
 * so it stays readable on light or busy artwork.
 */
export default function StatusBadge({ status, overlay = false, className = '' }) {
  const s = STATUS[status] ?? { label: status, text: 'text-slate-200', dot: 'bg-slate-400', soft: 'bg-white/10' }
  const background = overlay ? 'bg-ink-950/85 shadow-lg shadow-black/40 ring-1 ring-white/15 backdrop-blur-sm' : s.soft

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${background} ${s.text} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  )
}
