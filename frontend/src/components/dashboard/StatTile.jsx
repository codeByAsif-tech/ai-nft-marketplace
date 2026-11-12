const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

/**
 * KPI stat tile: sentence-case label, large semibold value in primary ink,
 * optional one-line caption. The icon is decorative; the number is the data.
 */
export default function StatTile({ label, value, caption, icon, loading = false }) {
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-400">{label}</p>
        {icon && (
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-slate-300" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-3 h-9 w-16 animate-pulse rounded-lg bg-white/10" />
      ) : (
        <p className="mt-2 font-display text-4xl font-semibold tabular-nums text-white">
          {value == null ? '–' : compact.format(value)}
        </p>
      )}
      {caption && <p className="mt-1 text-xs text-slate-500">{loading ? ' ' : caption}</p>}
    </div>
  )
}
