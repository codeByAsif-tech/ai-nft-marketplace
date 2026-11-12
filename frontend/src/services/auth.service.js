import api, { sessionRequest } from './api'

// Login/register also set the HttpOnly refresh cookie, so they use sessionRequest.

export async function register({ name, email, password }) {
  const { data } = await api.post('/auth/register', { name, email, password }, sessionRequest)
  // { user, token } or, when email verification is required, { user, verificationRequired: true }
  return data.data
}

// Email links (verification, password reset). The responses carry only a message.
const publicRequest = { skipAuthRefresh: true }

export async function verifyEmail(token) {
  const { data } = await api.post('/auth/verify-email', { token }, publicRequest)
  return data.message
}

export async function resendVerification(email) {
  const { data } = await api.post('/auth/resend-verification', { email }, publicRequest)
  return data.message
}

export async function forgotPassword(email) {
  const { data } = await api.post('/auth/forgot-password', { email }, publicRequest)
  return data.message
}

/** Uses sessionRequest so the browser accepts the cleared refresh cookie in the response. */
export async function resetPassword({ token, password }) {
  const { data } = await api.post('/auth/reset-password', { token, password }, sessionRequest)
  return data.message
}

export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password }, sessionRequest)
  return data.data // { user, token }
}

export async function fetchCurrentUser() {
  const { data } = await api.get('/auth/me')
  return data.data.user
}

/** Logged-in password change. Other devices are logged out; this one stays. */
export async function changePassword({ currentPassword, newPassword }) {
  const { data } = await api.post('/auth/change-password', { currentPassword, newPassword })
  return data.message
}

/** Ends this device's session on the server and clears the refresh cookie. */
export async function logout() {
  await api.post('/auth/logout', null, sessionRequest)
}

/** Ends every session of this account (uses the access token, plus the cookie so it is cleared). */
export async function logoutAll() {
  await api.post('/auth/logout-all', null, { withCredentials: true })
}
