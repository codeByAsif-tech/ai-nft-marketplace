import StatTile from '../../components/dashboard/StatTile'
import ActivityList from '../../components/marketplace/ActivityList'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import { useQuery } from '../../hooks/useQuery'
import { getAdminActivity, getAdminStats } from '../../services/admin.service'

const icon = (d) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ICONS = {
  users: icon('M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74'),
  nfts: icon('M12 2 3 7v10l9 5 9-5V7l-9-5Zm-9 5 9 5 9-5M12 12v10'),
  collections: icon('M4 6h16M4 12h16M4 18h10'),
  listings: icon('M20 12 12 20l-9-9V3h8l9 9ZM7.5 7.5h.01'),
  sales: icon('M5 12l5 5L20 7'),
  volume: icon('M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'),
}

function Breakdown({ items }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-ink-800 px-3 py-2.5">
          <dt className="text-xs text-slate-400">{label}</dt>
          <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-white">{value ?? '–'}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Platform overview for admins. All numbers come from GET /api/admin/stats. */
export default function AdminDashboardPage() {
  const stats = useQuery('admin-stats', getAdminStats)
  const activity = useQuery('admin-activity', () => getAdminActivity({ limit: 10 }))
  const s = stats.data
  const loading = stats.loading && !s

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-semibold text-brand-300">ADMIN</span>
            Platform overview
          </p>
          <h1 className="mt-1 text-3xl font-bold">Admin dashboard</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              stats.reload()
              activity.reload()
            }}
          >
            Refresh
          </Button>
          <Button to="/admin/users">Manage users</Button>
        </div>
      </header>

      {stats.error && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Alert className="flex-1">{stats.error}</Alert>
          <Button variant="secondary" size="sm" onClick={stats.reload}>
            Retry
          </Button>
        </div>
      )}

      {/* --- KPI row */}
      <section aria-label="Platform numbers" className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Registered users" value={s?.users.total} caption={s ? `${s.users.new7d} new this week` : ''} icon={ICONS.users} loading={loading} />
        <StatTile label="NFTs minted" value={s?.nfts.total} caption={s ? `${s.artworks.total} artworks` : ''} icon={ICONS.nfts} loading={loading} />
        <StatTile label="Collections" value={s?.collections.total} caption="By collection name" icon={ICONS.collections} loading={loading} />
        <StatTile label="Active listings" value={s?.listings.active} caption={s ? `${s.listings.total} listed in total` : ''} icon={ICONS.listings} loading={loading} />
        <StatTile label="Completed sales" value={s?.sales.completed} caption="Verified on-chain" icon={ICONS.sales} loading={loading} />
        <StatTile label="Sales volume (ETH)" value={s?.sales.volumeEth} caption="Test ETH, sum of sale prices" icon={ICONS.volume} loading={loading} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* --- Recent platform activity */}
        <section className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Recent platform activity</h2>
            <span className="text-xs text-slate-500">All users · verified on-chain</span>
          </div>
          <div className="mt-3">
            {activity.loading && !activity.data ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
                ))}
              </div>
            ) : activity.error ? (
              <Alert>{activity.error}</Alert>
            ) : (
              <ActivityList items={activity.data?.items} showNft emptyText="No on-chain activity yet." />
            )}
          </div>
        </section>

        {/* --- Breakdowns */}
        <aside className="space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-semibold">Users</h2>
            <div className="mt-4">
              <Breakdown
                items={[
                  ['Active', s?.users.active],
                  ['Deactivated', s?.users.inactive],
                  ['Admins', s?.users.admins],
                  ['Wallet verified', s?.users.walletsLinked],
                  ['New (7 days)', s?.users.new7d],
                ]}
              />
            </div>
            <Button variant="secondary" size="sm" className="mt-4 w-full" to="/admin/users">
              Manage users
            </Button>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-semibold">Content</h2>
            <div className="mt-4">
              <Breakdown
                items={[
                  ['Artworks', s?.artworks.total],
                  ['On IPFS', s?.artworks.onIpfs],
                  ['NFTs', s?.nfts.total],
                  ['Listings', s?.listings.total],
                  ['Sold', s?.sales.completed],
                ]}
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
