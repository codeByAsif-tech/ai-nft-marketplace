import { useCallback, useRef, useState } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useWallet } from '../../hooks/useWallet'
import { METAMASK_DOWNLOAD_URL } from '../../utils/constants'
import { shortenAddress } from '../../utils/format'
import Button from '../ui/Button'
import CopyButton from '../ui/CopyButton'
import BalanceDisplay from './BalanceDisplay'
import NetworkSelector from './NetworkSelector'

/** Navbar wallet control: install / connect / connected dropdown. */
export default function WalletButton({ fullWidth = false }) {
  const { isMetaMaskInstalled, isConnected, isConnecting, account, network, error, connect, disconnect, clearError } =
    useWallet()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(ref, close, open)

  const width = fullWidth ? 'w-full' : ''

  if (!isMetaMaskInstalled) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className={width}
        onClick={() => window.open(METAMASK_DOWNLOAD_URL, '_blank', 'noopener,noreferrer')}
      >
        Install MetaMask
      </Button>
    )
  }

  if (!isConnected) {
    return (
      <div className={`relative ${width}`}>
        <Button size="sm" className={width} loading={isConnecting} onClick={connect}>
          {isConnecting ? 'Check MetaMask…' : 'Connect wallet'}
        </Button>
        {error && (
          <div
            role="alert"
            className="absolute right-0 top-full z-50 mt-2 flex w-72 items-start gap-2 rounded-xl border border-red-500/30 bg-ink-900 p-3 text-xs text-red-200 shadow-xl"
          >
            <span className="flex-1">{error}</span>
            <button type="button" onClick={clearError} className="text-slate-400 hover:text-white" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className={`relative ${width}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition ${width} ${
          network
            ? 'border-white/15 bg-white/5 text-white hover:bg-white/10'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${network ? network.dotClass : 'bg-amber-400'}`} />
        <span className="font-mono">{shortenAddress(account)}</span>
        <svg viewBox="0 0 24 24" className="ml-auto h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Wallet"
          className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-ink-900 p-4 shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Connected account</p>
              <p className="truncate font-mono text-sm text-white" title={account}>
                {shortenAddress(account, 6)}
              </p>
            </div>
            <div className="flex items-center">
              <CopyButton value={account} label="Copy address" />
              {network?.explorerUrl && (
                <a
                  href={`${network.explorerUrl}/address/${account}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white"
                  aria-label="View on block explorer"
                  title="View on block explorer"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                  </svg>
                </a>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-ink-800 p-3">
            <BalanceDisplay />
          </div>

          <p className="mb-1.5 mt-4 text-xs font-medium text-slate-400">Network</p>
          {!network && (
            <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Your wallet is on a network we don't support. Pick one below.
            </p>
          )}
          <NetworkSelector />
          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

          <Button
            variant="secondary"
            size="sm"
            className="mt-4 w-full"
            onClick={() => {
              setOpen(false)
              disconnect()
            }}
          >
            Disconnect
          </Button>
        </div>
      )}
    </div>
  )
}
