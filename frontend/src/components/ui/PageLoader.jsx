import Spinner from './Spinner'

export default function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-brand-400">
      <Spinner size="lg" />
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  )
}
