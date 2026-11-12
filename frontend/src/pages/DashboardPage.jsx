import GettingStarted from '../components/dashboard/GettingStarted'
import RecentActivity from '../components/dashboard/RecentActivity'
import RecentArtwork from '../components/dashboard/RecentArtwork'
import StatTile from '../components/dashboard/StatTile'
import ProceedsCard from '../components/marketplace/ProceedsCard'
import Alert from '../components/ui/Alert'
import Avatar from '../components/ui/Avatar'
import Button from '../components/ui/Button'
import WalletPanel from '../components/wallet/WalletPanel'
import { useAuth } from '../hooks/useAuth'
import { useQuery } from '../hooks/useQuery'
import { getDashboard } from '../services/user.service'
import { greeting } from '../utils/time'

const icon = (d) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ICONS = {
  artwork: icon('M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5'),
  ipfs: icon('M12 2 3 7v10l9 5 9-5V7l-9-5Zm-9 5 9 5 9-5M12 12v10'),
  minted: icon('M12 3v18M3 12h18'),
  owned: icon('M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4Z'),
}

export default function DashboardPage() {
  const { user } = useAuth()
  // Re-fetch when the linked wallet changes (owned NFTs depend on it).
  const { data, error, loading, reload } = useQuery(`dashboard-${user.walletAddress ?? 'none'}`, getDashboard)
  const stats = data?.stats
  const firstName = user.name.split(' ')[0]
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* --- Header */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} size="md" />
          <div className="min-w-0">
            <p className="text-sm text-slate-400">{today}</p>
            <h1 className="truncate text-2xl font-bold sm:text-3xl">
              {greeting()}, {firstName}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button to="/studio">+ Create artwork</Button>
          <Button variant="secondary" to="/nfts">
            My NFTs
          </Button>
        </div>
      </header>

      {error && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Alert className="flex-1">{error}</Alert>
          <Button variant="secondary" size="sm" onClick={reload}>
            Retry
          </Button>
        </div>
      )}

      {/* --- KPI row */}
      <section aria-label="Your numbers" className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Artworks"
          value={stats?.artworks}
          caption={stats ? `${stats.drafts} draft${stats.drafts === 1 ? '' : 's'}` : ''}
          icon={ICONS.artwork}
          loading={loading && !data}
        />
        <StatTile
          label="On IPFS"
          value={stats?.onIpfs}
          caption="Stored permanently"
          icon={ICONS.ipfs}
          loading={loading && !data}
        />
        <StatTile
          label="NFTs minted"
          value={stats?.nftsCreated}
          caption="Created by you"
          icon={ICONS.minted}
          loading={loading && !data}
        />
        <StatTile
          label="NFTs owned"
          value={stats?.nftsOwned}
          caption={user.walletAddress ? 'In your verified wallet' : 'Verify a wallet to see this'}
          icon={ICONS.owned}
          loading={loading && !data}
        />
      </section>

      {/* --- Main grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <GettingStarted progress={data?.progress} />
          <RecentArtwork items={data?.recentArtwork} loading={loading && !data} />
          <RecentActivity items={data?.recentActivity} loading={loading && !data} />
        </div>

        <aside className="space-y-6">
          <WalletPanel />

          <ProceedsCard stats={stats} />
        </aside>
      </div>
    </div>
  )
}
