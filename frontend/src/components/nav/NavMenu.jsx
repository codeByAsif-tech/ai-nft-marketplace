import { useCallback, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useClickOutside } from '../../hooks/useClickOutside'

const Chevron = ({ open }) => (
  <svg
    viewBox="0 0 24 24"
    className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

/**
 * Dropdown menu for the navbar. `trigger` is the button content; `items` are
 * { to, label, description?, icon? } links, or { divider: true }, or
 * { onClick, label, tone? } actions. Closes on outside click, Escape, or selection.
 */
export default function NavMenu({ trigger, items, header, active = false, align = 'left', buttonClassName, label }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const menuId = useId()
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(ref, close, open)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        aria-label={label}
        className={
          buttonClassName ??
          `flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            active || open ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
          }`
        }
      >
        {trigger}
        {!buttonClassName && <Chevron open={open} />}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className={`absolute top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-white/10 bg-ink-900 p-2 shadow-2xl shadow-black/30 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {header && <div className="border-b border-white/5 px-3 pb-3 pt-2">{header}</div>}
          <ul className={header ? 'pt-2' : ''}>
            {items.map((item, i) =>
              item.divider ? (
                <li key={`d-${i}`} role="separator" className="my-2 border-t border-white/5" />
              ) : (
                <li key={item.to ?? item.label} role="none">
                  {item.to ? (
                    <Link
                      to={item.to}
                      role="menuitem"
                      onClick={close}
                      className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/5"
                    >
                      {item.icon && (
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-300">
                          {item.icon}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-white">{item.label}</span>
                        {item.description && <span className="block text-xs text-slate-400">{item.description}</span>}
                      </span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close()
                        item.onClick()
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-white/5 ${
                        item.tone === 'danger' ? 'text-red-300' : 'text-white'
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  )}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
