import { useEffect, useState } from 'react'

export default function CopyButton({ value, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      /* clipboard blocked: nothing to do */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white ${className}`}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  )
}
