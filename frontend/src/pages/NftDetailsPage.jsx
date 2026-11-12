import { useParams } from 'react-router-dom'
import ActivityList from '../components/marketplace/ActivityList'
import TradePanel from '../components/marketplace/TradePanel'
import IpfsImage from '../components/nft/IpfsImage'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import CopyButton from '../components/ui/CopyButton'
import PageLoader from '../components/ui/PageLoader'
import { addressExplorerUrl, getNetworkByChainId } from '../config/networks'
import { useAuth } from '../hooks/useAuth'
import { useQuery } from '../hooks/useQuery'
import { getNftActivity, getNftDetails } from '../services/marketplace.service'
import { getNetworks } from '../services/nft.service'
import { assetUrl } from '../utils/assets'
import { sameAddress, shortenAddress, toChecksumAddress } from '../utils/format'

function Detail({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-sm text-white">{children}</dd>
    </div>
  )
}

/** Public NFT page: artwork, details, buy/list/cancel/transfer, and on-chain activity. */
export default function NftDetailsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const details = useQuery(`nft-${id}`, () => getNftDetails(id))
  const activity = useQuery(`nft-activity-${id}`, () => getNftActivity(id))
  const networks = useQuery('networks', getNetworks)

  const refresh = () => {
    details.reload()
    activity.reload()
  }

  if (details.loading && !details.data) return <PageLoader label="Loading NFT…" />
  if (details.error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <Alert>{details.error}</Alert>
        <Button className="mt-6" variant="secondary" to="/explore">
          Back to Explore
        </Button>
      </div>
    )
  }

  const nft = details.data
  const chain = getNetworkByChainId(nft.chainId)
  const marketNetwork = networks.data?.find((n) => n.chainId === nft.chainId)
  const ownerIsMarket = marketNetwork?.marketplaceContract && sameAddress(nft.ownerAddress, marketNetwork.marketplaceContract)
  const youOwn = sameAddress(nft.ownerAddress, user?.walletAddress)
  const contractUrl = addressExplorerUrl(nft.chainId, nft.contractAddress)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-2">
        {/* --- Artwork */}
        <div>
          <div className="card overflow-hidden">
            <IpfsImage
              cid={nft.imageCID}
              gatewayUrl={nft.imageGatewayUrl}
              fallbackSrc={nft.localImage ? assetUrl(nft.localImage) : null}
              alt={nft.name}
              className="aspect-square w-full"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            {nft.imageGatewayUrl && (
              <a href={nft.imageGatewayUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-300 hover:text-brand-200">
                View image on IPFS ↗
              </a>
            )}
            {nft.metadataGatewayUrl && (
              <a href={nft.metadataGatewayUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white">
                Metadata ↗
              </a>
            )}
          </div>
        </div>

        {/* --- Info + actions */}
        <div className="space-y-6">
          <div>
            <p className="text-sm text-brand-300">{nft.collectionName || 'No collection'}</p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{nft.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
              <span>
                Created by <span className="text-white">{nft.creator?.name ?? shortenAddress(nft.creatorAddress)}</span>
              </span>
              <span>
                Owned by{' '}
                <span className="text-white">
                  {ownerIsMarket ? 'marketplace escrow' : youOwn ? 'you' : nft.ownerName ?? shortenAddress(nft.ownerAddress)}
                </span>
              </span>
            </div>
          </div>

          <TradePanel nft={nft} marketNetwork={marketNetwork} onChanged={refresh} />

          {nft.description && (
            <section className="card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Description</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{nft.description}</p>
            </section>
          )}

          {nft.attributes?.length > 0 && (
            <section className="card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Traits</h2>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {nft.attributes.map((a) => (
                  <li key={a.trait_type} className="rounded-xl border border-white/10 bg-ink-800 px-3 py-2">
                    <p className="truncate text-xs text-slate-400">{a.trait_type}</p>
                    <p className="truncate text-sm font-medium text-white">{a.value}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Details</h2>
            <dl className="mt-2">
              <Detail label="Network">{chain?.name ?? `Chain ${nft.chainId}`}</Detail>
              <Detail label="Token ID">#{nft.tokenId}</Detail>
              <Detail label="Contract">
                <span className="font-mono text-xs">{shortenAddress(toChecksumAddress(nft.contractAddress))}</span>
                <CopyButton value={toChecksumAddress(nft.contractAddress)} label="Copy contract address" />
                {contractUrl && (
                  <a href={contractUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-300">
                    View
                  </a>
                )}
              </Detail>
              <Detail label="Token standard">ERC-721</Detail>
              <Detail label="Token URI">
                <span className="truncate font-mono text-xs" title={nft.metadataURI}>
                  {nft.metadataURI}
                </span>
              </Detail>
            </dl>
          </section>
        </div>
      </div>

      {/* --- Activity */}
      <section className="card mt-8 p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Activity</h2>
          <span className="text-xs text-slate-500">Verified on-chain</span>
        </div>
        <div className="mt-3">
          {activity.loading && !activity.data ? (
            <div className="h-24 animate-pulse rounded-xl bg-white/5" />
          ) : (
            <ActivityList items={activity.data?.items} emptyText="No activity recorded for this NFT yet." />
          )}
        </div>
      </section>
    </div>
  )
}
