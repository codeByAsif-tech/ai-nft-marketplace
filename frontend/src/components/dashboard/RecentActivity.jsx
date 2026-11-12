import { Link } from 'react-router-dom'
import { getNetworkByChainId, txExplorerUrl } from '../../config/networks'
import { timeAgo } from '../../utils/time'

const TYPE = {
  MINT: { label: 'Minted', icon: 'M12 3v18M3 12h18' },
  LIST: { label: 'Listed', icon: 'M4 7h16M4 12h10M4 17h7' },
  BUY: { label: 'Sold', icon: 'M5 12l5 5L20 7' },
  TRANSFER: { label: 'Transferred', icon: 'M7 7h10l-3-3m3 13H7l3 3' },
  CANCEL: { label: 'Cancelled listing', icon: 'M6 6l12 12M18 6 6 18' },
}

/** Latest verified on-chain activity for the user (newest first). */
export default function RecentActivity({ items, loading }) {
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <span className="text-xs text-slate-500">Verified on-chain</span>
      </div>

      {loading ? (
        <ul className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
          ))}
        </ul>
      ) : !items?.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
          No activity yet. Mints, listings and sales will show up here.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-white/5">
          {items.map((item) => {
            const type = TYPE[item.type] ?? { label: item.type, icon: 'M12 8v4l3 3' }
            const network = getNetworkByChainId(item.chainId)
            const explorer = txExplorerUrl(item.chainId, item.transactionHash)
            const title = item.nft?.name ?? 'NFT'
            return (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-300" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d={type.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">
                    {type.label}{' '}
                    {item.nft?.id ? (
                      <Link to={`/nft/${item.nft.id}`} className="font-medium hover:text-brand-300">
                        {title}
                      </Link>
                    ) : (
                      <span className="font-medium">{title}</span>
                    )}
                    {item.nft?.tokenId && <span className="text-slate-400"> #{item.nft.tokenId}</span>}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${network?.dotClass ?? 'bg-slate-500'}`} aria-hidden="true" />
                    {network?.name ?? `Chain ${item.chainId}`} · {timeAgo(item.createdAt)}
                  </p>
                </div>
                {explorer && (
                  <a
                    href={explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-300 hover:bg-white/5 hover:text-brand-200"
                  >
                    View tx
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
