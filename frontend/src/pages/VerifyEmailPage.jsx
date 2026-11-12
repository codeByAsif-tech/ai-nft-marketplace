import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { useAuth } from '../hooks/useAuth'
import { parseApiError } from '../services/api'
import { verifyEmail } from '../services/auth.service'

/**
 * Opened from the verification email: /verify-email?token=...
 * The token is sent with a POST from this page (not by opening the link itself),
 * so email scanners that pre-open links don't use it up.
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState(() =>
    token ? { status: 'verifying' } : { status: 'error', message: 'This verification link is incomplete.' },
  )
  // Tokens are single-use: StrictMode runs effects twice in development, send only once.
  const sent = useRef(false)

  useEffect(() => {
    if (!token || sent.current) return
    sent.current = true
    verifyEmail(token)
      .then((message) => setState({ status: 'done', message }))
      .catch((err) => setState({ status: 'error', message: parseApiError(err).message }))
  }, [token])

  return (
    <AuthCard title="Email verification">
      {state.status === 'verifying' && (
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Spinner /> Verifying your email…
        </div>
      )}
      {state.status === 'done' && (
        <div className="space-y-4">
          <Alert type="success">{state.message}</Alert>
          <Button to={isAuthenticated ? '/dashboard' : '/login'} className="w-full">
            {isAuthenticated ? 'Go to dashboard' : 'Log in'}
          </Button>
        </div>
      )}
      {state.status === 'error' && (
        <div className="space-y-4">
          <Alert>{state.message}</Alert>
          <p className="text-sm text-slate-400">
            Try logging in: if your email still needs verifying, you can ask for a new link there.
          </p>
          <Button to="/login" variant="secondary" className="w-full">
            Go to login
          </Button>
        </div>
      )}
      <p className="mt-6 text-center text-sm text-slate-400">
        <Link to="/" className="font-medium text-brand-300 hover:text-brand-200">
          Back to home
        </Link>
      </p>
    </AuthCard>
  )
}
