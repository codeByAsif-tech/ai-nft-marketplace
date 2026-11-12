import { Link } from 'react-router-dom'
import { styleLabel } from '../../config/artStyles'
import { assetUrl } from '../../utils/assets'
import StatusBadge from './StatusBadge'

export default function ArtworkCard({ artwork }) {
  return (
    <Link
      to={`/studio/${artwork.id}`}
      className="card group block overflow-hidden transition hover:-translate-y-0.5 hover:border-white/20"
    >
      <div className="relative aspect-square overflow-hidden bg-ink-800">
        <img
          src={assetUrl(artwork.generatedImage)}
          alt={artwork.name || 'Untitled artwork'}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          <StatusBadge status={artwork.status} overlay />
          {artwork.ipfs?.status === 'FAILED' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-on-accent shadow-lg shadow-black/40 ring-1 ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-on-accent" aria-hidden="true" />
              IPFS: retry needed
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <h3 className="truncate font-semibold text-white">{artwork.name || 'Untitled'}</h3>
        <p className="mt-1 truncate text-xs text-slate-400">
          {artwork.collectionName || 'No collection'}
          {artwork.style && artwork.style !== 'none' ? ` · ${styleLabel(artwork.style)}` : ''}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {new Date(artwork.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </Link>
  )
}
