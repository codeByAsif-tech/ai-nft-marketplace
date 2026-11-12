import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Alert from '../../components/ui/Alert'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useAuth } from '../../hooks/useAuth'
import { useQuery } from '../../hooks/useQuery'
import { parseApiError } from '../../services/api'
import { listAdminUsers, updateAdminUser } from '../../services/admin.service'
import { shortenAddress, toChecksumAddress } from '../../utils/format'

const PAGE_SIZE = 20
const selectClass =
  'rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30'

const ICONS = {
  ban: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

/** What each action does, for the confirmation dialog. */
function describe(action, user) {
  switch (action) {
    case 'deactivate':
      return {
        title: `Deactivate ${user.name}?`,
        body: 'They are logged out immediately and can’t log in until reactivated. Their NFTs stay theirs on the blockchain.',
        confirm: 'Deactivate',
        variant: 'danger',
        icon: ICONS.ban,
        changes: { isActive: false },
      }
    case 'activate':
      return {
        title: `Reactivate ${user.name}?`,
        body: 'They can log in and use the marketplace again.',
        confirm: 'Reactivate',
        variant: 'primary',
        icon: ICONS.check,
        changes: { isActive: true },
      }
    default:
      return null
  }
}

function Badge({ children, tone }) {
  const tones = {
    green: 'bg-emerald-500/15 text-emerald-300',
    red: 'bg-red-500/15 text-red-300',
    brand: 'bg-brand-500/15 text-brand-300',
    gray: 'bg-white/10 text-slate-300',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

/** Admin user management: search, filter, deactivate/reactivate. Roles can't be changed here. */
export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const role = params.get('role') ?? ''
  const status = params.get('status') ?? ''
  const search = params.get('q') ?? ''

  const [searchText, setSearchText] = useState(search)
  const [pending, setPending] = useState(null) // { action, user }
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  function update(changes) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next)
  }

  useEffect(() => {
    if (searchText.trim() === search) return
    const t = setTimeout(() => update({ q: searchText.trim(), page: '' }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText])

  const users = useQuery(`admin-users-${page}-${role}-${status}-${search}`, () =>
    listAdminUsers({ page, limit: PAGE_SIZE, role: role || undefined, status: status || undefined, search: search || undefined }),
  )
  const items = users.data?.items ?? []
  const pagination = users.data?.pagination
  const dialog = pending ? describe(pending.action, pending.user) : null

  const confirm = async () => {
    setSaving(true)
    setMessage({ type: '', text: '' })
    try {
      const updated = await updateAdminUser(pending.user.id, dialog.changes)
      users.setData((d) => (d ? { ...d, items: d.items.map((u) => (u.id === updated.id ? updated : u)) } : d))
      setMessage({ type: 'success', text: `${updated.name} updated.` })
    } catch (err) {
      setMessage({ type: 'error', text: parseApiError(err).message })
    } finally {
      setSaving(false)
      setPending(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link to="/admin" className="text-sm text-slate-400 hover:text-white">
        ← Admin dashboard
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Users</h1>
      <p className="mt-1 text-sm text-slate-400">
        {pagination ? `${pagination.total} user${pagination.total === 1 ? '' : 's'}` : 'All registered accounts'}
      </p>

      {/* --- Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          maxLength={100}
          placeholder="Search name, email or wallet"
          aria-label="Search users"
          className="flex-1 rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        <select aria-label="Role" value={role} onChange={(e) => update({ role: e.target.value, page: '' })} className={selectClass}>
          <option value="">All roles</option>
          <option value="USER">Users</option>
          <option value="ADMIN">Admins</option>
        </select>
        <select aria-label="Status" value={status} onChange={(e) => update({ status: e.target.value, page: '' })} className={selectClass}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </select>
      </div>

      <Alert type={message.type || 'info'} className="mt-4">
        {message.text}
      </Alert>

      {/* --- List */}
      <section className="card mt-4 overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-white/5 px-5 py-3 text-xs font-medium uppercase tracking-wider text-slate-500 lg:grid">
          <span>User</span>
          <span>Wallet</span>
          <span>Activity</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {users.loading && !users.data ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : users.error ? (
          <div className="space-y-3 p-5">
            <Alert>{users.error}</Alert>
            <Button variant="secondary" size="sm" onClick={users.reload}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">No users match these filters.</p>
        ) : (
          <ul className={`divide-y divide-white/5 ${users.loading ? 'opacity-60' : ''}`}>
            {items.map((u) => {
              const isMe = u.id === me.id
              return (
                <li
                  key={u.id}
                  className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={u.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {u.name} {isMe && <span className="text-xs text-slate-500">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-slate-400">{u.email}</p>
                    </div>
                  </div>

                  <div className="min-w-0 text-xs">
                    {u.walletAddress ? (
                      <span className="font-mono text-slate-300" title={toChecksumAddress(u.walletAddress)}>
                        {shortenAddress(toChecksumAddress(u.walletAddress))}
                      </span>
                    ) : (
                      <span className="text-slate-500">No wallet</span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400">
                    {u.stats.nftsCreated} minted · {u.stats.nftsOwned} owned · {u.stats.sales} sold
                    <p className="text-slate-500">Joined {new Date(u.createdAt).toLocaleDateString()}</p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {u.role === 'ADMIN' && <Badge tone="brand">Admin</Badge>}
                    {u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {isMe ? (
                      <span className="text-xs text-slate-500">Can’t change your own account</span>
                    ) : (
                      <>
                        {u.isActive ? (
                          <Button size="sm" variant="ghost" onClick={() => setPending({ action: 'deactivate', user: u })}>
                            Deactivate
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => setPending({ action: 'activate', user: u })}>
                            Reactivate
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {pagination && pagination.totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
          <Button variant="secondary" size="sm" disabled={page <= 1 || users.loading} onClick={() => update({ page: String(page - 1) })}>
            ← Previous
          </Button>
          <span className="text-sm text-slate-400">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pagination.totalPages || users.loading}
            onClick={() => update({ page: String(page + 1) })}
          >
            Next →
          </Button>
        </nav>
      )}

      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialog?.title}
        confirmLabel={dialog?.confirm}
        variant={dialog?.variant}
        icon={dialog?.icon}
        loading={saving}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      >
        {dialog?.body}
      </ConfirmDialog>
    </div>
  )
}
