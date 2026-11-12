import { useId, useState } from 'react'

const inputClasses = (error) =>
  `w-full rounded-xl border bg-ink-800 px-4 py-3 text-sm text-white placeholder:text-slate-500 transition
   focus:outline-none focus:ring-2 ${
     error
       ? 'border-red-500/60 focus:ring-red-500/40'
       : 'border-white/10 focus:border-brand-500 focus:ring-brand-500/30'
   } disabled:opacity-60`

const EyeIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path
      d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.7 3.6M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" strokeLinecap="round" />
  </svg>
)

/**
 * Labelled input or textarea with an inline error message.
 * Password fields get an eye button to show/hide what was typed.
 */
export default function FormField({ label, error, hint, multiline = false, className = '', type, ...props }) {
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  const isPassword = type === 'password' && !multiline
  const Component = multiline ? 'textarea' : 'input'

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300">
        {label}
      </label>
      <div className="relative">
        <Component
          id={id}
          type={isPassword ? (revealed ? 'text' : 'password') : type}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`${inputClasses(error)} ${multiline ? 'min-h-28 resize-y' : ''} ${isPassword ? 'pr-12' : ''}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            disabled={props.disabled}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            aria-controls={id}
            title={revealed ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-slate-400 transition hover:text-white focus-visible:text-white disabled:opacity-50"
          >
            {revealed ? EyeOffIcon : EyeIcon}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
