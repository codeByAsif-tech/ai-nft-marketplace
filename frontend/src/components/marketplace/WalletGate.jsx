import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useWallet } from '../../hooks/useWallet'
import { sameAddress, shortenAddress } from '../../utils/format'
import Button from '../ui/Button'

/**
 * Renders `children` (the action buttons) only when the user can act on `chainId`:
 * logged in, wallet verified, MetaMask on that verified account and network.
 * Otherwise it shows the single next step to get there.
 */
export default function WalletGate({ chainId, networkName, children }) {
  const location = useLocation()
  const { user, isAuthenticated } = useAuth()
  const { isMetaMaskInstalled, isConnected, account, chainId: currentChainId, connect, isConnecting, switchNetwork, switchingTo } =
    useWallet()

  if (!isAuthenticated) {
    return (
      <Button to="/login" state={{ from: location }} className="w-full">
        Log in to continue
      </Button>
    )
  }
  if (!user.walletAddress) {
    return (
      <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        Verify your wallet first on the{' '}
        <Link to="/dashboard" className="font-medium underline">
          Dashboard
        </Link>
        .
      </p>
    )
  }
  if (!isMetaMaskInstalled) {
    return <p className="text-sm text-slate-400">Install MetaMask to continue.</p>
  }
  if (!isConnected) {
    return (
      <Button onClick={connect} loading={isConnecting} className="w-full">
        Connect wallet
      </Button>
    )
  }
  if (!sameAddress(account, user.walletAddress)) {
    return (
      <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        Switch MetaMask to your verified account <span className="font-mono">{shortenAddress(user.walletAddress)}</span>.
      </p>
    )
  }
  if (currentChainId !== chainId) {
    return (
      <Button variant="secondary" className="w-full" loading={switchingTo === chainId} onClick={() => switchNetwork(chainId)}>
        Switch to {networkName}
      </Button>
    )
  }
  return children
}
