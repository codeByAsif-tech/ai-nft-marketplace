import { BrowserProvider, Contract, formatEther } from 'ethers'
import { useState } from 'react'
import { NFT_MARKETPLACE_ABI } from '../../contracts/nftMarketplace'
import { useAuth } from '../../hooks/useAuth'
import { useQuery } from '../../hooks/useQuery'
import { useWallet } from '../../hooks/useWallet'
import { getNetworks } from '../../services/nft.service'
import { assertChain, describeActionError } from '../../utils/chainAction'
import { formatEth, sameAddress } from '../../utils/format'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import TxProgress from './TxProgress'

/**
 * Seller earnings waiting in the marketplace contract (pull payments), read
 * live from the chain for the network MetaMask is on, with a Withdraw button.
 * Nothing is stored by the backend: the contract balance is the truth.
 */
export default function ProceedsCard({ stats }) {
  const { user } = useAuth()
  const { isConnected, account, chainId, network, getSigner } = useWallet()
  const networks = useQuery('networks', getNetworks)
  const market = networks.data?.find((n) => n.chainId === chainId)?.marketplaceContract ?? null
  const onVerifiedAccount = isConnected && sameAddress(account, user?.walletAddress)

  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState({ type: '', text: '' })

  // Live read of proceeds(account) from the marketplace contract (re-runs when wallet/network changes).
  const proceedsKey = market && onVerifiedAccount && window.ethereum ? `proceeds-${chainId}-${account}-${market}` : null
  const proceeds = useQuery(proceedsKey, () =>
    new Contract(market, NFT_MARKETPLACE_ABI, new BrowserProvider(window.ethereum)).proceeds(account),
  )
  const amount = proceeds.error ? null : (proceeds.data ?? null) // bigint | null
  const loadingAmount = proceeds.loading

  const withdraw = async () => {
    setMessage({ type: '', text: '' })
    try {
      const signer = await getSigner()
      await assertChain(signer, chainId, network?.name ?? 'this network')
      const contract = new Contract(market, NFT_MARKETPLACE_ABI, signer)
      setStatus({ step: 'signing' })
      const tx = await contract.withdrawProceeds()
      setStatus({ step: 'pending', hash: tx.hash })
      await tx.wait(1)
      setMessage({ type: 'success', text: 'Withdrawn to your wallet.' })
      proceeds.reload()
    } catch (err) {
      setMessage({ type: 'error', text: describeActionError(err) })
    } finally {
      setStatus(null)
    }
  }

  const hasProceeds = typeof amount === 'bigint' && amount > 0n

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">Marketplace</h2>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ['Listed', stats?.listed],
          ['Sold', stats?.sold],
          ['Bought', stats?.purchases],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-ink-800 px-3 py-3">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums text-white">{value ?? '–'}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 p-4">
        <p className="text-xs text-slate-400">Earnings to withdraw{network ? ` on ${network.name}` : ''}</p>
        {!onVerifiedAccount ? (
          <p className="mt-1 text-sm text-slate-500">Connect your verified wallet to see earnings.</p>
        ) : !market ? (
          <p className="mt-1 text-sm text-slate-500">The marketplace isn’t deployed on this network.</p>
        ) : loadingAmount && amount == null ? (
          <Spinner size="sm" className="mt-2 text-brand-300" />
        ) : (
          <p className="mt-1 font-display text-2xl font-semibold text-white">
            {amount == null ? '–' : formatEth(formatEther(amount), 6)} <span className="text-sm text-slate-400">ETH</span>
          </p>
        )}

        {status && (
          <div className="mt-3">
            <TxProgress status={status} chainId={chainId} />
          </div>
        )}
        <Alert type={message.type || 'info'} className="mt-3">
          {message.text}
        </Alert>

        {onVerifiedAccount && market && (
          <Button size="sm" className="mt-3 w-full" onClick={withdraw} disabled={!hasProceeds || Boolean(status)} loading={Boolean(status)}>
            {hasProceeds ? 'Withdraw earnings' : 'Nothing to withdraw'}
          </Button>
        )}
      </div>
    </section>
  )
}
