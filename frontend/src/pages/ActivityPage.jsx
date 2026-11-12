import { useSearchParams } from 'react-router-dom'
import ActivityList from '../components/marketplace/ActivityList'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import { useQuery } from '../hooks/useQuery'
import { getMyTransactions } from '../services/marketplace.service'

const TABS = [
  { value: '', label: 'All' },
  { value: 'MINT', label: 'Mints' },
  { value: 'LIST', label: 'Listings' },
  { value: 'BUY', label: 'Sales' },
  { value: 'CANCEL', label: 'Cancellations' },
  { value: 'TRANSFER', label: 'Transfers' },
]
const PAGE_SIZE = 20

/** The user's verified transaction history (as buyer, seller, sender or recipient). */
export default function ActivityPage() {
  const [params, setParams] = useSearchParams()
  const type = params.get('type') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const { data, error, loading, reload } = useQuery(`my-tx-${type}-${page}`, () =>
    getMyTransactions({ page, limit: PAGE_SIZE, type: type || undefined }),
  )
  const pagination = data?.pagination

  const go = (changes) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-sm text-slate-400">History</p>
      <h1 className="mt-1 text-3xl font-bold">Activity</h1>
      <p className="mt-1 text-sm text-slate-400">Every mint, listing, sale and transfer involving you, verified on-chain.</p>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl bg-ink-900 p-1" role="tablist" aria-label="Filter by type">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={type === t.value}
            onClick={() => go({ type: t.value, page: '' })}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition ${
              type === t.value ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="card mt-4 p-6">
        {loading && !data ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : error ? (
          <div className="space-y-4">
            <Alert>{error}</Alert>
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : (
          <ActivityList items={data?.items} showNft emptyText="Nothing here yet." />
        )}
      </section>

      {pagination && pagination.totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
          <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => go({ page: String(page - 1) })}>
            ← Previous
          </Button>
          <span className="text-sm text-slate-400">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= pagination.totalPages || loading} onClick={() => go({ page: String(page + 1) })}>
            Next →
          </Button>
        </nav>
      )}
    </div>
  )
}
