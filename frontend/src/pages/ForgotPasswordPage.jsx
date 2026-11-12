import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import FormField from '../components/ui/FormField'
import { parseApiError } from '../services/api'
import { forgotPassword } from '../services/auth.service'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [sentMessage, setSentMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setFieldError('Enter a valid email address')
      return
    }
    setSubmitting(true)
    try {
      // The answer is the same whether or not the email is registered.
      setSentMessage(await forgotPassword(email.trim()))
    } catch (err) {
      const { message, fieldErrors } = parseApiError(err)
      setError(message)
      setFieldError(fieldErrors.email || '')
    } finally {
      setSubmitting(false)
    }
  }

  const footer = (
    <>
      Remembered it?{' '}
      <Link to="/login" className="font-medium text-brand-300 hover:text-brand-200">
        Log in
      </Link>
    </>
  )

  if (sentMessage) {
    return (
      <AuthCard title="Check your email" footer={footer}>
        <div className="space-y-4">
          <Alert type="success">{sentMessage}</Alert>
          <p className="text-sm text-slate-400">
            The link works once and expires in 30 minutes. Can't find the email? Check your spam folder.
          </p>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your account email and we'll send you a link to choose a new one."
      footer={footer}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Alert>{error}</Alert>
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setFieldError('')
          }}
          error={fieldError}
          required
        />
        <Button type="submit" className="w-full" loading={submitting}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  )
}
