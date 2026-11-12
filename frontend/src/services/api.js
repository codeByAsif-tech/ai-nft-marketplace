import axios from 'axios'
import { sessionHint, tokenStorage } from '../utils/storage'

export const UNAUTHORIZED_EVENT = 'auth:unauthorized'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 15000,
  // No fixed Content-Type: axios sets JSON for objects and lets the browser set
  // multipart/form-data (with boundary) for FormData uploads.
})

/**
 * Options for calls that use the HttpOnly refresh cookie (login, register,
 * refresh, logout). `withCredentials` lets the browser send/accept the cookie
 * cross-origin; the custom header is required by the backend's CSRF check.
 * `skipAuthRefresh` stops the interceptors below from treating their 401s
 * (e.g. a wrong password) as an expired session.
 */
export const sessionRequest = {
  withCredentials: true,
  headers: { 'X-CSRF-Protection': '1' },
  skipAuthRefresh: true,
}

/** Forget the session locally and tell AuthContext (and so the UI). */
function endSession() {
  tokenStorage.clear()
  sessionHint.clear()
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
}

let refreshing = null

/**
 * Exchanges the refresh cookie for a new access token (the backend rotates the
 * cookie each time). Calls are de-duplicated inside this tab, and a Web Lock
 * makes tabs take turns: two tabs sending the same refresh token at once would
 * look like token theft to the backend and end the session.
 * Resolves to { user, token }.
 */
export function refreshAccessToken() {
  if (!refreshing) {
    const post = () => api.post('/auth/refresh', null, sessionRequest).then(({ data }) => data.data)
    // If the response was lost on the network, retry once: within a few seconds the
    // backend re-sends the same new token instead of treating the retry as theft.
    const run = () =>
      post().catch(async (error) => {
        if (error.response) throw error
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return post()
      })
    const locked = navigator.locks?.request ? navigator.locks.request('mintverse-auth-refresh', run) : run()

    refreshing = locked
      .then((session) => {
        tokenStorage.set(session.token)
        sessionHint.set()
        return session
      })
      .catch((error) => {
        // 401 = the session is over. Network errors keep the current state.
        if (error.response?.status === 401) endSession()
        throw error
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

// Attach the access token, refreshing it first if it is about to expire.
api.interceptors.request.use(async (config) => {
  if (config.skipAuthRefresh) return config
  if (tokenStorage.get() && tokenStorage.expiresSoon()) {
    await refreshAccessToken().catch(() => {})
  }
  const token = tokenStorage.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On a 401 from an authenticated request: refresh once and retry; if that
// fails too, end the session.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error
    const hadToken = Boolean(config?.headers?.Authorization)
    if (response?.status !== 401 || !hadToken || config.skipAuthRefresh) {
      return Promise.reject(error)
    }
    if (config._retried) {
      endSession()
      return Promise.reject(error)
    }
    try {
      const { token } = await refreshAccessToken()
      config._retried = true
      config.headers.Authorization = `Bearer ${token}`
      return api(config)
    } catch {
      return Promise.reject(error)
    }
  },
)

/** Turns any axios error into a readable message + optional field errors (+ a code, if any). */
export function parseApiError(error) {
  if (error.response) {
    const { message, errors, code } = error.response.data || {}
    const fieldErrors = {}
    for (const e of errors || []) {
      if (e.field && !fieldErrors[e.field]) fieldErrors[e.field] = e.message
    }
    return { message: message || `Request failed (${error.response.status})`, fieldErrors, code }
  }
  if (error.request) {
    return { message: 'Cannot reach the server. Is the backend running?', fieldErrors: {} }
  }
  return { message: error.message || 'Something went wrong', fieldErrors: {} }
}

export default api
