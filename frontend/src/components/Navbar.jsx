import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Logo from './Logo'
import NavMenu from './nav/NavMenu'
import Avatar from './ui/Avatar'
import Button from './ui/Button'
import ConfirmDialog from './ui/ConfirmDialog'
import ThemeToggle from './ui/ThemeToggle'
import WalletButton from './wallet/WalletButton'

const icon = (d) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ICONS = {
  dashboard: icon('M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z'),
  artwork: icon('M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5'),
  nfts: icon('M12 2 3 7v10l9 5 9-5V7l-9-5Zm-9 5 9 5 9-5M12 12v10'),
  activity: icon('M3 12h4l3-8 4 16 3-8h4'),
  profile: icon('M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z'),
  admin: icon('M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z'),
  logout: icon('M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11'),
}

// "My stuff" dropdown: the signed-in user's own pages.
const MY_LINKS = [
  { to: '/dashboard', label: 'Dashboard', description: 'Overview, wallet and earnings', icon: ICONS.dashboard },
  { to: '/artwork', label: 'My artwork', description: 'Drafts, IPFS and minting', icon: ICONS.artwork },
  { to: '/nfts', label: 'My NFTs', description: 'What your wallet owns', icon: ICONS.nfts },
  { to: '/activity', label: 'Activity', description: 'Mints, sales and transfers', icon: ICONS.activity },
]

const navLinkClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
  }`

const mobileLinkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
    isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
  }`

function MobileSection({ title, children }) {
  return (
    <div className="py-2">
      <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const closeMobile = () => setMobileOpen(false)
  const askLogout = () => {
    setMobileOpen(false)
    setConfirmLogout(true)
  }
  const handleLogout = () => {
    // Ends the app session only; MetaMask stays connected (it belongs to the browser).
    setConfirmLogout(false)
    logout()
    navigate('/login')
  }

  const inMyStuff = MY_LINKS.some((l) => pathname === l.to || pathname.startsWith(`${l.to}/`)) || pathname.startsWith('/studio/')

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6" aria-label="Main">
        <Logo />

        {/* --- Desktop links */}
        <div className="hidden flex-1 items-center gap-1 lg:flex">
          <NavLink to="/explore" className={navLinkClass}>
            Explore
          </NavLink>
          {isAuthenticated && (
            <>
              <NavLink to="/studio" end className={navLinkClass}>
                Create
              </NavLink>
              <NavMenu trigger="My stuff" items={MY_LINKS} active={inMyStuff} />
              {isAdmin && (
                <NavLink to="/admin" className={navLinkClass}>
                  Admin
                </NavLink>
              )}
            </>
          )}
        </div>

        {/* --- Desktop right side */}
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <ThemeToggle />
          {isAuthenticated ? (
            <>
              <WalletButton />
              <NavMenu
                label="Account menu"
                align="right"
                buttonClassName="rounded-full transition hover:opacity-90"
                trigger={<Avatar name={user.name} size="sm" />}
                header={
                  <div className="flex items-center gap-3">
                    <Avatar name={user.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{user.name}</p>
                      <p className="truncate text-xs text-slate-400">{user.email}</p>
                    </div>
                  </div>
                }
                items={[
                  { to: '/profile', label: 'Profile', icon: ICONS.profile },
                  { to: '/dashboard', label: 'Dashboard', icon: ICONS.dashboard },
                  ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: ICONS.admin }] : []),
                  { divider: true },
                  { label: 'Log out', onClick: askLogout, tone: 'danger', icon: ICONS.logout },
                ]}
              />
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" to="/login">
                Log in
              </Button>
              <Button size="sm" to="/register">
                Get started
              </Button>
            </>
          )}
        </div>

        {/* --- Mobile toggle */}
        <button
          type="button"
          className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/5 lg:hidden"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {mobileOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </nav>

      {/* --- Mobile panel */}
      {mobileOpen && (
        <div className="max-h-[calc(100svh-4rem)] overflow-y-auto border-t border-white/5 px-4 pb-5 lg:hidden">
          {isAuthenticated && (
            <Link to="/profile" onClick={closeMobile} className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-white/5">
              <Avatar name={user.name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">{user.name}</span>
                <span className="block truncate text-xs text-slate-400">{user.email}</span>
              </span>
            </Link>
          )}

          <MobileSection title="Marketplace">
            <NavLink to="/explore" onClick={closeMobile} className={mobileLinkClass}>
              Explore
            </NavLink>
            {isAuthenticated && (
              <NavLink to="/studio" end onClick={closeMobile} className={mobileLinkClass}>
                Create artwork
              </NavLink>
            )}
          </MobileSection>

          {isAuthenticated && (
            <MobileSection title="My stuff">
              {MY_LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} onClick={closeMobile} className={mobileLinkClass}>
                  {l.icon}
                  {l.label}
                </NavLink>
              ))}
            </MobileSection>
          )}

          {isAuthenticated && (
            <MobileSection title="Account">
              <NavLink to="/profile" onClick={closeMobile} className={mobileLinkClass}>
                {ICONS.profile}
                Profile
              </NavLink>
              {isAdmin && (
                <NavLink to="/admin" onClick={closeMobile} className={mobileLinkClass}>
                  {ICONS.admin}
                  Admin
                </NavLink>
              )}
            </MobileSection>
          )}

          <div className="mt-2 space-y-3 border-t border-white/5 pt-4">
            <ThemeToggle showLabels className="w-full" />
            {isAuthenticated ? (
              <>
                <WalletButton fullWidth />
                <Button variant="secondary" size="sm" className="w-full" onClick={askLogout}>
                  Log out
                </Button>
              </>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" to="/login" onClick={closeMobile}>
                  Log in
                </Button>
                <Button size="sm" className="flex-1" to="/register" onClick={closeMobile}>
                  Get started
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {isAuthenticated && (
        <ConfirmDialog
          open={confirmLogout}
          title="Log out of your account?"
          confirmLabel="Log out"
          cancelLabel="Stay logged in"
          variant="danger"
          icon={ICONS.logout}
          onCancel={() => setConfirmLogout(false)}
          onConfirm={handleLogout}
        >
          You'll need your email and password to log back in. Your wallet stays connected in MetaMask, and nothing on
          the blockchain is affected.
        </ConfirmDialog>
      )}
    </header>
  )
}
