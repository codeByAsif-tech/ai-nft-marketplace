import { Link } from 'react-router-dom'

const STEPS = [
  { key: 'walletVerified', label: 'Verify your wallet', hint: 'Link MetaMask by signature (below).', to: null },
  { key: 'createdArtwork', label: 'Create an artwork', hint: 'Upload an image and describe it.', to: '/studio' },
  { key: 'uploadedToIpfs', label: 'Upload it to IPFS', hint: 'Open an artwork → Upload to IPFS.', to: '/artwork' },
  { key: 'mintedNft', label: 'Mint your first NFT', hint: 'Open an artwork on IPFS → Mint NFT.', to: '/artwork' },
]

/** Onboarding checklist with a single-hue progress track. Hidden once everything is done. */
export default function GettingStarted({ progress }) {
  const done = STEPS.filter((s) => progress?.[s.key]).length
  if (!progress || done === STEPS.length) return null
  const percent = Math.round((done / STEPS.length) * 100)

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Getting started</h2>
          <p className="mt-1 text-sm text-slate-400">From artwork to NFT in four steps.</p>
        </div>
        <p className="text-sm text-slate-300">
          <span className="font-semibold text-white">{done}</span> of {STEPS.length} done
        </p>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-brand-500/15"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Getting started progress"
      >
        <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>

      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {STEPS.map((step, i) => {
          const complete = Boolean(progress[step.key])
          const content = (
            <div
              className={`flex h-full items-start gap-3 rounded-xl border p-3 transition ${
                complete ? 'border-white/5 bg-white/[0.02]' : 'border-white/10 bg-ink-800 hover:border-white/20'
              }`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  complete ? 'bg-emerald-500/20 text-emerald-300' : 'bg-brand-500/15 text-brand-300'
                }`}
                aria-hidden="true"
              >
                {complete ? '✓' : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${complete ? 'text-slate-400 line-through' : 'text-white'}`}>
                  {step.label}
                </span>
                {!complete && <span className="mt-0.5 block text-xs text-slate-500">{step.hint}</span>}
              </span>
              <span className="sr-only">{complete ? '(done)' : '(to do)'}</span>
            </div>
          )
          return (
            <li key={step.key}>
              {!complete && step.to ? (
                <Link to={step.to} className="block h-full">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
