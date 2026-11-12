import Button from '../components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-7xl font-bold text-gradient">404</p>
      <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-slate-400">The page you're looking for doesn't exist or has moved.</p>
      <Button className="mt-6" to="/">
        Back to home
      </Button>
    </div>
  )
}
