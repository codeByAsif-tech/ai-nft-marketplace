import { Link } from 'react-router-dom'
import { assetUrl } from '../../utils/assets'
import StatusBadge from '../artwork/StatusBadge'
import Button from '../ui/Button'

/** The four most recently updated artworks, as a thumbnail strip. */
export default function RecentArtwork({ items, loading }) {
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Recent artwork</h2>
        <Link to="/artwork" className="text-sm font-medium text-brand-300 hover:text-brand-200">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : !items?.length ? (
        <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <p className="text-sm text-slate-400">You haven't created any artwork yet.</p>
          <Button size="sm" className="mt-3" to="/studio">
            Create your first artwork
          </Button>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((a) => (
            <li key={a.id}>
              <Link
                to={`/studio/${a.id}`}
                className="group block overflow-hidden rounded-xl border border-white/10 bg-ink-800 transition hover:border-white/20"
              >
                <div className="relative aspect-square overflow-hidden">
                  <img
                    src={assetUrl(a.generatedImage)}
                    alt={a.name || 'Untitled artwork'}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <StatusBadge status={a.status} overlay className="absolute left-2 top-2" />
                </div>
                <p className="truncate px-3 py-2 text-xs font-medium text-white">{a.name || 'Untitled'}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
