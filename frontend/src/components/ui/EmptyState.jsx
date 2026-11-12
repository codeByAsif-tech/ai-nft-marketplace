/** Friendly placeholder for empty lists, with an optional call to action. */
export default function EmptyState({ title, description, action, icon }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15 text-brand-300">
        {icon ?? (
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="m3 16 5-5 4 4 3-3 6 6" strokeLinejoin="round" />
            <circle cx="15.5" cy="8.5" r="1.5" />
          </svg>
        )}
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
