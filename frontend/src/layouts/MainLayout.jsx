import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'
import NetworkBanner from '../components/wallet/NetworkBanner'
import { APP_NAME } from '../utils/constants'

export default function MainLayout() {
  return (
    <div className="relative flex min-h-svh flex-col overflow-x-hidden">
      {/* Ambient background glow */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px]">
        <div className="absolute left-1/2 top-[-200px] h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="absolute right-[-100px] top-[100px] h-[300px] w-[400px] rounded-full bg-accent-500/10 blur-[100px]" />
      </div>

      <Navbar />
      <NetworkBanner />

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {APP_NAME} · Testnet-only portfolio project. No real funds.
      </footer>
    </div>
  )
}
