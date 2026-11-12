/** Centered card used by the login and register pages. */
export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="flex justify-center px-4 py-12 sm:py-20">
      <div className="card w-full max-w-md p-6 shadow-2xl shadow-black/40 sm:p-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-slate-400">{footer}</p>}
      </div>
    </div>
  )
}
