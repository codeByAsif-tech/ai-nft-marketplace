import { useWallet } from '../../hooks/useWallet'

/** Small pill showing the wallet's current network, or a warning for unsupported networks. */
export default function NetworkBadge({ className = '' }) {
  const { network, chainId } = useWallet()

  if (!chainId) return null

  if (!network) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300 ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Unsupported network
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200 ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${network.dotClass}`} />
      {network.name}
    </span>
  )
}
