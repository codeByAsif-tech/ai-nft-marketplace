import { NETWORK_LIST } from '../../config/networks'
import { useWallet } from '../../hooks/useWallet'
import Spinner from '../ui/Spinner'

/** List of supported networks; clicking one asks MetaMask to switch. */
export default function NetworkSelector({ onSwitched }) {
  const { chainId, switchingTo, switchNetwork } = useWallet()

  const handleSelect = async (targetChainId) => {
    if (targetChainId === chainId || switchingTo) return
    const ok = await switchNetwork(targetChainId)
    if (ok) onSwitched?.()
  }

  return (
    <ul className="space-y-1" role="listbox" aria-label="Select network">
      {NETWORK_LIST.map((n) => {
        const active = n.chainId === chainId
        const switching = switchingTo === n.chainId
        return (
          <li key={n.key}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              disabled={Boolean(switchingTo)}
              onClick={() => handleSelect(n.chainId)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition disabled:cursor-wait ${
                active ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className={`h-2 w-2 rounded-full ${n.dotClass}`} />
                {n.name}
              </span>
              {switching ? (
                <Spinner size="sm" className="text-brand-300" />
              ) : active ? (
                <span className="text-xs font-medium text-emerald-300">Connected</span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
