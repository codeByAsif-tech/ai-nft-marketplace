import { useEffect, useId, useRef, useState } from 'react'
import { validateRecipient } from '../../utils/recipient'
import Button from '../ui/Button'

/**
 * Asks for a recipient address and an explicit confirmation before a
 * transfer, because sending an NFT is permanent.
 */
export default function TransferDialog({ open, from, blocked, nftName, onCancel, onConfirm }) {
  const ref = useRef(null)
  const inputId = useId()
  const [to, setTo] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const close = () => {
    setTo('')
    setUnderstood(false)
    setError('')
    onCancel()
  }

  const submit = (e) => {
    e.preventDefault()
    const problem = validateRecipient(to, { from, blocked })
    if (problem) return setError(problem)
    if (!understood) return setError('Please confirm that you understand transfers are permanent.')
    const recipient = to.trim()
    setTo('')
    setUnderstood(false)
    setError('')
    onConfirm(recipient)
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/10 bg-ink-900 p-0 text-slate-200 shadow-2xl shadow-black/60 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} className="p-6" noValidate>
        <h2 className="text-lg font-semibold">Transfer “{nftName}”</h2>
        <p className="mt-1.5 text-sm text-slate-400">
          Sends this NFT from your wallet to another wallet. You pay a small network fee.
        </p>

        <label htmlFor={inputId} className="mt-5 block text-sm font-medium text-slate-300">
          Recipient wallet address
        </label>
        <input
          id={inputId}
          value={to}
          onChange={(e) => {
            setTo(e.target.value)
            setError('')
          }}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />

        <label className="mt-4 flex items-start gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => {
              setUnderstood(e.target.checked)
              setError('')
            }}
            className="mt-0.5 h-4 w-4 accent-brand-500"
          />
          I understand transfers are permanent and can’t be undone.
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit">Transfer</Button>
        </div>
      </form>
    </dialog>
  )
}
