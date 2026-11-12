import { useSearchParams } from 'react-router-dom'
import NftCard from '../components/nft/NftCard'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import PageLoader from '../components/ui/PageLoader'
import { useQuery } from '../hooks/useQuery'
import { listMyNfts } from '../services/nft.service'

const PAGE_SIZE = 12

/** NFTs currently owned by the user's verified wallet, across all supported networks. */
export default function MyNftsPage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const { data, error, loading, reload } = useQuery(`my-nfts-${page}`, () => listMyNfts({ page, limit: PAGE_SIZE }))

  const items = data?.items ?? []
  const pagination = data?.pagination
  const goTo = (p) => setParams(p > 1 ? { page: String(p) } : {})

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-400">Collection</p>
          <h1 className="mt-1 text-3xl font-bold">My NFTs</h1>
          <p className="mt-1 text-sm text-slate-400">NFTs owned by your verified wallet, on every supported network.</p>
        </div>
        <Button variant="secondary" to="/artwork">
          My artwork
        </Button>
      </div>

      <div className="mt-8">
        {loading && !data ? (
          <PageLoader label="Loading your NFTs…" />
        ) : error ? (
          <div className="space-y-4">
            <Alert>{error}</Alert>
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : data && !data.walletLinked ? (
          <EmptyState
            title="Verify your wallet first"
            description="NFTs belong to wallets. Link your MetaMask wallet to your account to see the NFTs it owns."
            action={<Button to="/dashboard">Go to dashboard</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No NFTs yet"
            description="Upload an artwork to IPFS, then mint it from its page."
            action={<Button to="/artwork">Go to my artwork</Button>}
          />
        ) : (
          <>
            <div
              className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${loading ? 'opacity-60' : ''}`}
            >
              {items.map((nft) => (
                <NftCard key={nft.id} nft={nft} />
              ))}
            </div>

            {pagination && pagination.totalPages > 1 && (
              <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
                <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => goTo(page - 1)}>
                  ← Previous
                </Button>
                <span className="text-sm text-slate-400">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pagination.totalPages || loading}
                  onClick={() => goTo(page + 1)}
                >
                  Next →
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  )
}
