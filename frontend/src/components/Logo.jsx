import { Link } from 'react-router-dom'
import { APP_NAME } from '../utils/constants'

export default function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 shadow-lg shadow-brand-600/30">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-on-accent" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" strokeLinejoin="round" />
          <path d="m3 7 9 5 9-5M12 12v10" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="font-display text-lg font-bold tracking-tight text-white">{APP_NAME}</span>
    </Link>
  )
}
