import { useEffect, useId, useRef, useState } from 'react'
import Spinner from './Spinner'

const PencilIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-4-4L4 16v4Z" strokeLinejoin="round" />
    <path d="m13.5 6.5 4 4" />
  </svg>
)
const CheckIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const CloseIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
  </svg>
)
const LockIcon = (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)

const iconButton =
  'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50'

/**
 * A profile row that shows a value with a pencil button; clicking it turns the
 * row into an input with Save (✓) and Cancel (✕). Enter saves, Escape cancels
 * (Ctrl/Cmd+Enter saves in multi-line fields).
 *
 * onSave(value) must return a promise; throw an Error to show its message.
 * Read-only rows show a lock icon and an optional hint instead of the pencil.
 */
export default function EditableField({
  label,
  value,
  onSave,
  multiline = false,
  maxLength,
  placeholder = '',
  emptyText = 'Not set',
  validate,
  readOnly = false,
  readOnlyHint,
  children,
}) {
  const id = useId()
  const inputRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const start = () => {
    setDraft(value ?? '')
    setError('')
    setEditing(true)
  }
  const cancel = () => {
    setEditing(false)
    setError('')
  }
  const save = async () => {
    const next = draft.trim()
    if (next === (value ?? '').trim()) return cancel()
    const problem = validate?.(next)
    if (problem) return setError(problem)
    setSaving(true)
    try {
      await onSave(next)
      setEditing(false)
      setError('')
    } catch (err) {
      setError(err.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    } else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      save()
    }
  }

  const inputClass = `w-full rounded-xl border bg-ink-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
    error ? 'border-red-500/60 focus:ring-red-500/30' : 'border-white/10 focus:border-brand-500 focus:ring-brand-500/30'
  }`

  return (
    <div className="grid gap-1.5 border-b border-white/5 py-4 last:border-0 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <label htmlFor={editing ? id : undefined} className="pt-1.5 text-sm text-slate-400">
        {label}
      </label>

      {editing ? (
        <div>
          <div className="flex items-start gap-2">
            {multiline ? (
              <textarea
                id={id}
                ref={inputRef}
                rows={4}
                value={draft}
                maxLength={maxLength}
                placeholder={placeholder}
                disabled={saving}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                className={`${inputClass} resize-y`}
              />
            ) : (
              <input
                id={id}
                ref={inputRef}
                value={draft}
                maxLength={maxLength}
                placeholder={placeholder}
                disabled={saving}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                className={inputClass}
              />
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={`${iconButton} bg-brand-500 text-on-accent hover:bg-brand-400`}
              aria-label={`Save ${label}`}
              title="Save (Enter)"
            >
              {saving ? <Spinner size="sm" /> : CheckIcon}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className={`${iconButton} text-slate-400 hover:bg-white/5 hover:text-white`}
              aria-label={`Cancel editing ${label}`}
              title="Cancel (Esc)"
            >
              {CloseIcon}
            </button>
          </div>
          <div className="mt-1.5 flex justify-between gap-2 text-xs">
            <span className="text-red-300" role={error ? 'alert' : undefined}>
              {error}
            </span>
            {maxLength && (
              <span className="text-slate-500">
                {draft.length}/{maxLength}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 pt-1.5 text-sm text-white">
            {children ?? (value ? <span className="whitespace-pre-wrap break-words">{value}</span> : <span className="text-slate-500">{emptyText}</span>)}
            {readOnly && readOnlyHint && <p className="mt-1 text-xs text-slate-500">{readOnlyHint}</p>}
          </div>
          {readOnly ? (
            <span className="grid h-8 w-8 shrink-0 place-items-center text-slate-500" title="Can't be changed">
              {LockIcon}
            </span>
          ) : (
            <button
              type="button"
              onClick={start}
              className={`${iconButton} text-slate-400 hover:bg-white/5 hover:text-brand-300`}
              aria-label={`Edit ${label}`}
              title={`Edit ${label.toLowerCase()}`}
            >
              {PencilIcon}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
