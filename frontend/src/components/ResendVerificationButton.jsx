import { useState } from 'react'
import { parseApiError } from '../services/api'
import { resendVerification } from '../services/auth.service'
import Alert from './ui/Alert'
import Button from './ui/Button'

/** "Send the link again" for an account whose email isn't verified yet. */
export default function ResendVerificationButton({ email }) {
  const [state, setState] = useState({ sending: false, message: '', error: '' })

  const onClick = async () => {
    setState({ sending: true, message: '', error: '' })
    try {
      const message = await resendVerification(email)
      setState({ sending: false, message, error: '' })
    } catch (err) {
      setState({ sending: false, message: '', error: parseApiError(err).message })
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" className="w-full" loading={state.sending} onClick={onClick}>
        Resend verification email
      </Button>
      <Alert type="success">{state.message}</Alert>
      <Alert>{state.error}</Alert>
    </div>
  )
}
