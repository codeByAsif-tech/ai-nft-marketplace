import { useTheme } from '../../hooks/useTheme'

const OPTIONS = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinejoin="round" />
      </svg>
    ),
  },
]

/** Two-way segmented control: Light / Dark. */
export default function ThemeToggle({ showLabels = false, className = '' }) {
  const { preference, setPreference } = useTheme()

  return (
    <div role="radiogroup" aria-label="Theme" className={`inline-flex rounded-xl bg-white/5 p-1 ${className}`}>
      {OPTIONS.map((o) => {
        const active = preference === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${o.label} theme`}
            onClick={() => setPreference(o.value)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              active ? 'bg-ink-900 text-white shadow-sm ring-1 ring-white/10' : 'text-slate-400 hover:text-white'
            } ${showLabels ? 'flex-1 justify-center' : ''}`}
          >
            {o.icon}
            <span className={showLabels ? '' : 'sr-only'}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
