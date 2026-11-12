import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import ResendVerificationButton from '../components/ResendVerificationButton'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import { useAuth } from '../hooks/useAuth'
import { parseApiError } from '../services/api'

export default function LoginPage() {
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Set when the password was right but the email isn't verified yet.
  const [unverifiedEmail, setUnverifiedEmail] = useState('')

  const onChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setFieldErrors((fe) => ({ ...fe, [e.target.name]: undefined }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setUnverifiedEmail('')
    setSubmitting(true)
    try {
      // On success, GuestRoute redirects to the originally requested page.
      await login(form)
    } catch (err) {
      // After 5 failed attempts the backend answers 429 (code LOGIN_BLOCKED) with a
      // "currently blocked, try again in N minutes" message, shown as-is.
      const { message, fieldErrors: fe, code } = parseApiError(err)
      setError(message)
      setFieldErrors(fe)
      if (code === 'EMAIL_NOT_VERIFIED') setUnverifiedEmail(form.email.trim())
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to create, mint and trade your NFTs."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-brand-300 hover:text-brand-200">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Alert>{error}</Alert>
        {unverifiedEmail && <ResendVerificationButton email={unverifiedEmail} />}
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={onChange}
          error={fieldErrors.email}
          required
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={form.password}
          onChange={onChange}
          error={fieldErrors.password}
          required
        />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-300 hover:text-brand-200">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={submitting}>
          Log in
        </Button>
      </form>
    </AuthCard>
  )
}
