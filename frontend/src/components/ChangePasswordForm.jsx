import { useState } from 'react'
import { parseApiError } from '../services/api'
import { changePassword } from '../services/auth.service'
import { PASSWORD_HINT, passwordError } from '../utils/passwordRules'
import Alert from './ui/Alert'
import Button from './ui/Button'
import FormField from './ui/FormField'

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' }

/** Change password while logged in (users and admins). Other devices get logged out. */
export default function ChangePasswordForm() {
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setFieldErrors((fe) => ({ ...fe, [e.target.name]: undefined }))
    setSuccess('')
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Same rules as the backend, for instant feedback (the backend checks again).
    const errors = {}
    if (!form.currentPassword) errors.currentPassword = 'Current password is required'
    const pwError = passwordError(form.newPassword)
    if (pwError) errors.newPassword = pwError
    else if (form.newPassword === form.currentPassword)
      errors.newPassword = 'New password must be different from your current password.'
    if (form.confirmPassword !== form.newPassword) errors.confirmPassword = 'Passwords do not match'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    try {
      const message = await changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm(EMPTY)
      setSuccess(message)
    } catch (err) {
      const { message, fieldErrors: fe } = parseApiError(err)
      setFieldErrors(fe)
      // Field problems are shown under the inputs; anything else (e.g. rate limit) on top.
      setError(fe.currentPassword || fe.newPassword ? '' : message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
      <Alert>{error}</Alert>
      <Alert type="success">{success}</Alert>
      <FormField
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        value={form.currentPassword}
        onChange={onChange}
        error={fieldErrors.currentPassword}
        required
      />
      <FormField
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        value={form.newPassword}
        onChange={onChange}
        error={fieldErrors.newPassword}
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
      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          Change password
        </Button>
      </div>
    </form>
  )
}
