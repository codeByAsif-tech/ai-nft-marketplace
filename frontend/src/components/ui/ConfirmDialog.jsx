import { useEffect, useRef } from 'react'
import Button from './Button'

const TONES = {
  brand: 'bg-brand-500/15 text-brand-300 ring-brand-500/30',
  danger: 'bg-red-500/15 text-red-300 ring-red-500/30',
  warning: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
}

/**
 * Accessible confirmation modal built on the native <dialog> element
 * (focus trapping, Escape to close and the backdrop come for free).
 * Optional `icon` (an SVG element) is shown in a tinted circle; `tone` sets its color.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  icon = null,
  tone = variant === 'danger' ? 'danger' : 'brand',
  loading = false,
  onConfirm,
  onCancel,
}) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        if (!loading) onCancel()
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself, outside the panel) closes it.
        if (e.target === ref.current && !loading) onCancel()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/10 bg-ink-900 p-0 text-slate-200 shadow-2xl shadow-black/60 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex gap-4">
          {icon && (
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 ${TONES[tone]}`}>
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            <div className="mt-1.5 text-sm leading-relaxed text-slate-400">{children}</div>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {/* Destructive dialogs focus Cancel by default, so Enter never confirms by accident. */}
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading} autoFocus={variant === 'danger'}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={variant} onClick={onConfirm} loading={loading} autoFocus={variant !== 'danger'}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
