import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import ResendVerificationButton from '../components/ResendVerificationButton'
import { useAuth } from '../hooks/useAuth'
import { parseApiError } from '../services/api'
import { PASSWORD_HINT, passwordError } from '../utils/passwordRules'

// Mirrors the backend rules so users get instant feedback.
// The backend still validates everything independently.
function validate({ name, email, password, confirmPassword }) {
  const errors = {}
  if (name.trim().length < 2 || name.trim().length > 60) errors.name = 'Name must be 2–60 characters'
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = 'Enter a valid email address'
  const pwError = passwordError(password)
  if (pwError) errors.password = pwError
  if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match'
  return errors
}

/** Shown after sign-up when the account must be confirmed by email first. */
function CheckYourEmail({ email }) {
  return (
    <AuthCard
      title="Check your email"
      subtitle="One more step before you can log in."
      footer={
        <>
          Already verified?{' '}
          <Link to="/login" className="font-medium text-brand-300 hover:text-brand-200">
            Log in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-300">
          We sent a verification link to <span className="font-semibold text-white">{email}</span>. Open it to
          activate your account. Can't find it? Check your spam folder.
        </p>
        <ResendVerificationButton email={email} />
      </div>
    </AuthCard>
  )
}

export default function RegisterPage() {
  const { register } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')

  const onChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setFieldErrors((fe) => ({ ...fe, [e.target.name]: undefined }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const clientErrors = validate(form)
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    setSubmitting(true)
    try {
      const email = form.email.trim()
      const result = await register({ name: form.name.trim(), email, password: form.password })
      // Logged in straight away: GuestRoute redirects. Otherwise the email must be verified first.
      if (result?.verificationRequired) setPendingEmail(email)
    } catch (err) {
      const { message, fieldErrors: fe } = parseApiError(err)
      setError(message)
      setFieldErrors(fe)
      setSubmitting(false)
    }
  }

  if (pendingEmail) return <CheckYourEmail email={pendingEmail} />

  return (
    <AuthCard
      title="Create your account"
      subtitle="Start generating and minting AI artwork on testnets."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-300 hover:text-brand-200">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Alert>{error}</Alert>
        <FormField
          label="Full name"
          name="name"
          autoComplete="name"
          placeholder="Ada Lovelace"
          value={form.name}
          onChange={onChange}
          error={fieldErrors.name}
          required
        />
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
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint={PASSWORD_HINT}
          value={form.password}
          onChange={onChange}
          error={fieldErrors.password}
          required
        />
        <FormField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={onChange}
          error={fieldErrors.confirmPassword}
          required
        />
        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthCard>
  )
}
