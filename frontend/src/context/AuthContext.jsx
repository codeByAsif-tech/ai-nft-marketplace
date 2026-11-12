import { useCallback, useEffect, useMemo, useState } from 'react'
import { refreshAccessToken, UNAUTHORIZED_EVENT } from '../services/api'
import * as authService from '../services/auth.service'
import { sessionHint, tokenStorage } from '../utils/storage'
import { AuthContext } from './auth-context'

// Tells other open tabs about logins and logouts. Each tab keeps its own
// in-memory access token; they all share the one refresh cookie.
const CHANNEL_NAME = 'mintverse-auth'
const openChannel = () => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME))
// Messages also reach other channel objects in the same tab; this id filters those out.
const TAB_ID = Math.random().toString(36).slice(2)

function broadcast(type) {
  const channel = openChannel()
  if (!channel) return
  channel.postMessage({ type, from: TAB_ID })
  channel.close()
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // True while we try to restore a session on first load, so protected
  // routes don't flash the login page before the session is restored.
  const [initializing, setInitializing] = useState(() => sessionHint.get())

  // Restore the session: the HttpOnly refresh cookie is exchanged for a new access token.
  // refreshAccessToken() de-duplicates, so StrictMode's double effect sends one request.
  useEffect(() => {
    if (!sessionHint.get()) return
    let cancelled = false
    refreshAccessToken()
      .then((session) => !cancelled && setUser(session.user))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setInitializing(false))
    return () => {
      cancelled = true
    }
  }, [])

  // The session ended (refresh failed with 401): show the user as logged out.
  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  // Follow logins/logouts made in other tabs, so this tab never shows one
  // user while the shared cookie belongs to another.
  useEffect(() => {
    const channel = openChannel()
    if (!channel) return undefined
    let requestId = 0
    channel.onmessage = ({ data }) => {
      if (!data || data.from === TAB_ID) return
      const id = ++requestId
      if (data.type === 'logout') {
        tokenStorage.clear()
        setUser(null)
      } else if (data.type === 'login') {
        refreshAccessToken()
          .then((session) => id === requestId && setUser(session.user))
          .catch(() => id === requestId && setUser(null))
      }
    }
    return () => channel.close()
  }, [])

  const startSession = useCallback(({ user: u, token }) => {
    tokenStorage.set(token)
    sessionHint.set()
    setUser(u)
    broadcast('login')
    return u
  }, [])

  const login = useCallback(
    async (credentials) => startSession(await authService.login(credentials)),
    [startSession],
  )

  /**
   * Returns the user when logged in straight away, or { verificationRequired: true }
   * when the account must first be confirmed through the emailed link.
   */
  const register = useCallback(
    async (details) => {
      const result = await authService.register(details)
      if (!result.token) return { verificationRequired: true }
      return startSession(result)
    },
    [startSession],
  )

  const clearLocalSession = useCallback(() => {
    tokenStorage.clear()
    sessionHint.clear()
    setUser(null)
    broadcast('logout')
  }, [])

  /** Logs out this device. The UI updates at once; the server call runs after. */
  const logout = useCallback(async () => {
    clearLocalSession()
    try {
      await authService.logout()
    } catch {
      /* offline: the server session simply expires on its own */
    }
  }, [clearLocalSession])

  /** Logs out every device. Throws if the server call fails, so the caller can show it. */
  const logoutAll = useCallback(async () => {
    await authService.logoutAll()
    clearLocalSession()
  }, [clearLocalSession])

  const value = useMemo(
    () => ({
      user,
      setUser,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'ADMIN',
      initializing,
      login,
      register,
      logout,
      logoutAll,
    }),
    [user, initializing, login, register, logout, logoutAll],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
