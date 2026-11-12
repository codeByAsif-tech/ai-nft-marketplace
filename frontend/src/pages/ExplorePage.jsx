import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import ListingCard from '../components/marketplace/ListingCard'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import { NETWORK_LIST } from '../config/networks'
import { useQuery } from '../hooks/useQuery'
import { exploreListings } from '../services/marketplace.service'

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'oldest', label: 'Oldest' },
]
const PAGE_SIZE = 12

const selectClass =
  'rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30'

/** Public marketplace: active listings with search, network filter, sorting and pages. */
export default function ExplorePage() {
  const { isAuthenticated, user } = useAuth()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const chainId = params.get('chain') ?? ''
  const sort = params.get('sort') ?? 'newest'
  const search = params.get('q') ?? ''

  // Debounced search box: the URL (and the request) update 300 ms after typing stops.
  const [searchText, setSearchText] = useState(search)
  useEffect(() => {
    if (searchText.trim() === search) return
    const t = setTimeout(() => update({ q: searchText.trim(), page: '' }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText])

  function update(changes) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next)
  }

  // Includes the viewer, so logging in/out refreshes the list (own listings are hidden).
  const key = `explore-${user?.id ?? 'guest'}-${page}-${chainId}-${sort}-${search}`
  const { data, error, loading, reload } = useQuery(key, () =>
    exploreListings({ page, limit: PAGE_SIZE, chainId: chainId ? Number(chainId) : undefined, search, sort }),
  )
  const items = data?.items ?? []
  const pagination = data?.pagination
  const filtered = Boolean(search || chainId)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div>
        <p className="text-sm text-slate-400">Marketplace</p>
        <h1 className="mt-1 text-3xl font-bold">Explore NFTs</h1>
        <p className="mt-1 text-sm text-slate-400">
          {pagination ? `${pagination.total} listed for sale` : 'Artwork listed for sale by creators'}
          {isAuthenticated && (
            <>
              {' · '}Your own listings are in{' '}
              <Link to="/nfts" className="text-brand-300 hover:text-brand-200">
                My NFTs
              </Link>
            </>
          )}
        </p>
      </div>

      {/* --- Filters (one row) */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            maxLength={60}
            placeholder="Search by name"
            aria-label="Search NFTs by name"
            className="w-full rounded-xl border border-white/10 bg-ink-800 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <select aria-label="Network" value={chainId} onChange={(e) => update({ chain: e.target.value, page: '' })} className={selectClass}>
          <option value="">All networks</option>
          {NETWORK_LIST.map((n) => (
            <option key={n.chainId} value={n.chainId}>
              {n.name}
            </option>
          ))}
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value, page: '' })} className={selectClass}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-8">
        {loading && !data ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="card aspect-[3/4] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="space-y-4">
            <Alert>{error}</Alert>
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={filtered ? 'No matches' : 'Nothing for sale yet'}
            description={filtered ? 'Try a different name or network.' : 'List one of your NFTs to be the first.'}
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchText('')
                    setParams({})
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button to="/nfts">Go to my NFTs</Button>
              )
            }
          />
        ) : (
          <>
            <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
              {items.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
            {pagination && pagination.totalPages > 1 && (
              <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
                <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => update({ page: String(page - 1) })}>
                  ← Previous
                </Button>
                <span className="text-sm text-slate-400">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pagination.totalPages || loading}
                  onClick={() => update({ page: String(page + 1) })}
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
