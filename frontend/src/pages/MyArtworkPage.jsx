import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import ArtworkCard from '../components/artwork/ArtworkCard'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import PageLoader from '../components/ui/PageLoader'
import { useQuery } from '../hooks/useQuery'
import { listGenerations } from '../services/ai.service'

const PAGE_SIZE = 12

export default function MyArtworkPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  // One-time message passed from the studio ("Artwork saved", "Artwork deleted").
  // Kept in state, then removed from history so it doesn't reappear on reload/back.
  const [flash] = useState(() => location.state?.flash ?? '')
  useEffect(() => {
    if (location.state?.flash) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    }
  }, [location, navigate])

  const { data, error, loading, reload } = useQuery(`page-${page}`, () =>
    listGenerations({ page, limit: PAGE_SIZE }),
  )

  const goTo = (p) => setParams(p > 1 ? { page: String(p) } : {})
  const items = data?.items ?? []
  const pagination = data?.pagination

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-400">Library</p>
          <h1 className="mt-1 text-3xl font-bold">My artwork</h1>
          <p className="mt-1 text-sm text-slate-400">Drafts you can turn into NFTs.</p>
        </div>
        <Button to="/studio">+ Create artwork</Button>
      </div>

      {flash && (
        <Alert type="success" className="mt-6">
          {flash}
        </Alert>
      )}

      <div className="mt-8">
        {loading && !data ? (
          <PageLoader label="Loading your artwork…" />
        ) : error ? (
          <div className="space-y-4">
            <Alert>{error}</Alert>
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 && page === 1 ? (
          <EmptyState
            title="No artwork yet"
            description="Upload your first piece of artwork to start building your NFT collection."
            action={<Button to="/studio">Create artwork</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing on this page"
            action={
              <Button variant="secondary" onClick={() => goTo(1)}>
                Back to first page
              </Button>
            }
          />
        ) : (
          <>
            <div
              className={`grid grid-cols-1 gap-5 transition sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
                loading ? 'opacity-60' : ''
              }`}
              aria-busy={loading}
            >
              {items.map((artwork) => (
                <ArtworkCard key={artwork.id} artwork={artwork} />
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
