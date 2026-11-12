import Button from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { SUPPORTED_CHAINS } from '../utils/constants'

const STEPS = [
  {
    title: 'Generate',
    text: 'Describe an idea and let a local AI model turn it into artwork, or upload your own image.',
    icon: 'M12 3v3m0 12v3m9-9h-3M6 12H3m15.364-6.364-2.121 2.121M7.757 16.243l-2.121 2.121m12.728 0-2.121-2.121M7.757 7.757 5.636 5.636',
  },
  {
    title: 'Mint',
    text: 'Pin the artwork and metadata to IPFS, then mint an ERC-721 token signed by your own wallet.',
    icon: 'M12 2 3 7v10l9 5 9-5V7l-9-5Zm-9 5 9 5 9-5M12 12v10',
  },
  {
    title: 'Trade',
    text: 'List at a fixed price and sell through a marketplace contract that enforces ownership and payment.',
    icon: 'M7 7h10l-3-3m3 13H7l3 3',
  },
]

export default function LandingPage() {
  const { isAuthenticated } = useAuth()

  return (
    <>
      <section className="mx-auto max-w-7xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Live on testnets only
        </span>
        <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          Turn prompts into <span className="text-gradient">on-chain art</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-400 sm:text-lg">
          Generate artwork with AI, store it on IPFS, and mint and trade NFTs across Ethereum Sepolia and
          Base Sepolia, all from one marketplace.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {isAuthenticated ? (
            <>
              <Button size="lg" to="/dashboard">
                Go to dashboard
              </Button>
              <Button size="lg" variant="secondary" to="/explore">
                Explore NFTs
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" to="/register">
                Create free account
              </Button>
              <Button size="lg" variant="secondary" to="/explore">
                Explore NFTs
              </Button>
            </>
          )}
        </div>

        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Supported testnets</p>
          <ul className="mt-3 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {SUPPORTED_CHAINS.map((c) => (
              <li
                key={c.key}
                className="flex w-full max-w-xs items-center justify-between gap-6 rounded-xl border border-white/10 bg-ink-900 px-4 py-3 sm:w-auto"
              >
                <span className="text-sm font-medium text-white">{c.name}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Supported
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d={s.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
