import { NETWORK_LIST } from '../../config/networks'
import { useWallet } from '../../hooks/useWallet'
import Button from '../ui/Button'

/** Site-wide warning shown while the connected wallet is on an unsupported network. */
export default function NetworkBanner() {
  const { isConnected, chainId, isSupportedNetwork, switchingTo, switchNetwork } = useWallet()

  if (!isConnected || !chainId || isSupportedNetwork) return null

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-amber-100">
          Your wallet is connected to an unsupported network. This marketplace runs on testnets only.
        </p>
        <div className="flex gap-2">
          {NETWORK_LIST.map((n) => (
            <Button
              key={n.key}
              size="sm"
              variant="secondary"
              loading={switchingTo === n.chainId}
              disabled={Boolean(switchingTo)}
              onClick={() => switchNetwork(n.chainId)}
            >
              Switch to {n.name}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
