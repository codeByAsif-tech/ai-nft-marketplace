import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import { useAuth } from '../hooks/useAuth'
import { parseApiError } from '../services/api'
import { resetPassword } from '../services/auth.service'
import { PASSWORD_HINT, passwordError } from '../utils/passwordRules'

/** Opened from the reset email: /reset-password?token=... */
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const { isAuthenticated, logout } = useAuth()
  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [doneMessage, setDoneMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setFieldErrors((fe) => ({ ...fe, [e.target.name]: undefined }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const errors = {}
    const pwError = passwordError(form.password)
    if (pwError) errors.password = pwError
    if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    try {
      const message = await resetPassword({ token, password: form.password })
      // The server ended every session; clear this tab (and the others) too.
      if (isAuthenticated) await logout()
      setDoneMessage(message)
    } catch (err) {
      const { message, fieldErrors: fe } = parseApiError(err)
      // A password problem (e.g. same as the current one) is shown under the field;
      // the link stays valid, so the user can just pick another password.
      setError(fe.token || (fe.password ? '' : message))
      setFieldErrors({ password: fe.password })
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <AuthCard title="Reset password">
        <div className="space-y-4">
          <Alert>This reset link is incomplete. Please use the full link from your email.</Alert>
          <Button to="/forgot-password" variant="secondary" className="w-full">
            Request a new link
          </Button>
        </div>
      </AuthCard>
    )
  }

  if (doneMessage) {
    return (
      <AuthCard title="Password changed">
        <div className="space-y-4">
          <Alert type="success">{doneMessage}</Alert>
          <p className="text-sm text-slate-400">For your security, you have been logged out of all devices.</p>
          <Button to="/login" className="w-full">
            Log in
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Reset password"
      subtitle="Choose a password different from your current one. After saving, you'll be logged out of every device."
      footer={
        <>
          Link expired?{' '}
          <Link to="/forgot-password" className="font-medium text-brand-300 hover:text-brand-200">
            Request a new one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Alert>{error}</Alert>
        <FormField
          label="New password"
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
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={onChange}
          error={fieldErrors.confirmPassword}
          required
        />
        <Button type="submit" className="w-full" loading={submitting}>
          Save new password
        </Button>
      </form>
    </AuthCard>
  )
}
