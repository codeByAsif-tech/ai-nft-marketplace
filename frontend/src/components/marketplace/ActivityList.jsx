import { formatEther } from 'ethers'
import { Link } from 'react-router-dom'
import { getNetworkByChainId, txExplorerUrl } from '../../config/networks'
import { formatEth, shortenAddress } from '../../utils/format'
import { timeAgo } from '../../utils/time'

const TYPES = {
  MINT: { label: 'Mint', className: 'bg-brand-500/15 text-brand-200' },
  LIST: { label: 'List', className: 'bg-cyan-500/15 text-cyan-200' },
  BUY: { label: 'Sale', className: 'bg-emerald-500/15 text-emerald-200' },
  CANCEL: { label: 'Cancel', className: 'bg-white/10 text-slate-200' },
  TRANSFER: { label: 'Transfer', className: 'bg-amber-500/15 text-amber-200' },
}

const ZERO = '0x0000000000000000000000000000000000000000'

function Party({ name, address }) {
  if (!address) return <span className="text-slate-500">–</span>
  if (address === ZERO) return <span className="text-slate-400">Minted</span>
  return (
    <span className="text-slate-300" title={address}>
      {name ?? <span className="font-mono">{shortenAddress(address)}</span>}
    </span>
  )
}

/**
 * Verified on-chain activity rows (mint, list, sale, cancel, transfer).
 * `showNft` adds the NFT name (for the user's overall history).
 */
export default function ActivityList({ items, showNft = false, emptyText = 'No activity yet.' }) {
  if (!items?.length) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
        {emptyText}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-white/5">
      {items.map((t) => {
        const type = TYPES[t.transactionType] ?? { label: t.transactionType, className: 'bg-white/10 text-slate-200' }
        const network = getNetworkByChainId(t.chainId)
        const explorer = txExplorerUrl(t.chainId, t.transactionHash)
        // Sales: seller -> buyer. Listing: seller -> marketplace. Cancel: marketplace -> seller.
        const fromName = t.transactionType === 'BUY' || t.transactionType === 'LIST' || t.transactionType === 'TRANSFER' ? t.seller?.name : null
        const toName = t.transactionType === 'BUY' || t.transactionType === 'MINT' || t.transactionType === 'TRANSFER' ? t.buyer?.name : null
        return (
          <li key={t.id} className="grid gap-2 py-3 sm:grid-cols-[6rem_1fr_auto] sm:items-center sm:gap-4">
            <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${type.className}`}>{type.label}</span>

            <div className="min-w-0 text-sm">
              {showNft && t.nft && (
                <p className="truncate font-medium text-white">
                  <Link to={`/nft/${t.nft.id}`} className="hover:text-brand-300">
                    {t.nft.name}
                  </Link>
                  <span className="text-slate-400"> #{t.nft.tokenId}</span>
                </p>
              )}
              <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
                <Party name={fromName} address={t.fromAddress} />
                <span aria-hidden="true">→</span>
                <Party name={toName} address={t.toAddress} />
                {t.price && (
                  <span className="ml-1 font-medium text-white">{formatEth(formatEther(t.price))} ETH</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 sm:justify-end">
              <span className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${network?.dotClass ?? 'bg-slate-500'}`} aria-hidden="true" />
                {network?.name ?? `Chain ${t.chainId}`}
              </span>
              <span>{timeAgo(t.createdAt)}</span>
              {explorer && (
                <a href={explorer} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-300 hover:text-brand-200">
                  Tx ↗
                </a>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
