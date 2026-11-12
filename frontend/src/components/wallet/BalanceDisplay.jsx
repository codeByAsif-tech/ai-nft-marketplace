import { useWallet } from '../../hooks/useWallet'
import { formatEth } from '../../utils/format'
import Spinner from '../ui/Spinner'

/** ETH balance on the wallet's current network, with a refresh button. */
export default function BalanceDisplay({ size = 'md' }) {
  const { balance, balanceLoading, balanceError, refreshBalance, network, isConnected } = useWallet()
  if (!isConnected) return null

  const valueClass = size === 'lg' ? 'text-2xl' : 'text-base'

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-slate-400">Balance{network ? ` on ${network.name}` : ''}</p>
        {balanceError ? (
          <p className="text-sm text-red-300">{balanceError}</p>
        ) : balance == null ? (
          <p className={`${valueClass} font-display font-semibold text-slate-500`}>Loading…</p>
        ) : (
          <p className={`${valueClass} font-display font-semibold text-white`} title={`${balance} ETH`}>
            {formatEth(balance)} <span className="text-sm font-medium text-slate-400">ETH</span>
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={refreshBalance}
        disabled={balanceLoading}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white disabled:cursor-wait"
        aria-label="Refresh balance"
        title="Refresh balance"
      >
        {balanceLoading ? (
          <Spinner size="sm" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  )
}
