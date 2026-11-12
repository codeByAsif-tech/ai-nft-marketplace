import { formatEther } from 'ethers'
import { Link } from 'react-router-dom'
import { getNetworkByChainId } from '../../config/networks'
import { formatEth } from '../../utils/format'
import IpfsImage from '../nft/IpfsImage'

/** Explore grid card for an active listing. */
export default function ListingCard({ listing }) {
  const nft = listing.nft
  const network = getNetworkByChainId(listing.chainId)
  if (!nft) return null

  return (
    <Link
      to={`/nft/${nft.id}`}
      className="card group block overflow-hidden transition hover:-translate-y-0.5 hover:border-white/20"
    >
      <div className="relative aspect-square">
        <IpfsImage cid={nft.imageCID} gatewayUrl={nft.imageGatewayUrl} alt={nft.name} className="h-full w-full" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-ink-950/85 px-2.5 py-1 text-xs font-semibold text-slate-100 shadow-lg shadow-black/40 ring-1 ring-white/15 backdrop-blur-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${network?.dotClass ?? 'bg-slate-400'}`} aria-hidden="true" />
          {network?.name ?? `Chain ${listing.chainId}`}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate font-semibold text-white">{nft.name}</h3>
          <span className="shrink-0 font-mono text-xs text-slate-400">#{nft.tokenId}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">by {listing.seller?.name ?? 'a creator'}</p>
        <div className="mt-3 flex items-end justify-between gap-2 border-t border-white/5 pt-3">
          <div>
            <p className="text-xs text-slate-500">Price</p>
            <p className="font-display text-lg font-semibold text-white">
              {formatEth(formatEther(listing.price))} <span className="text-sm text-slate-400">ETH</span>
            </p>
          </div>
          <span className="rounded-lg bg-brand-500/15 px-3 py-1.5 text-xs font-semibold text-brand-200 transition group-hover:bg-brand-500 group-hover:text-on-accent">
            View
          </span>
        </div>
      </div>
    </Link>
  )
}
