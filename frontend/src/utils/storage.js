// Where auth state lives in the browser:
// - The refresh token is an HttpOnly cookie set by the backend. Page JavaScript
//   can't read it, so an XSS bug can't steal it.
// - The short-lived access token is kept ONLY in memory (this module). It is
//   gone after a reload and is silently re-created from the refresh cookie.
// - A non-secret "has session" hint in localStorage tells the app whether it is
//   worth asking the server to restore a session on load.

export const SESSION_HINT_KEY = 'mintverse.session'
const LEGACY_TOKEN_KEY = 'mintverse.token' // long-lived JWT stored by older versions

function safeLocalStorage(fn, fallback) {
  try {
    return fn(window.localStorage)
  } catch {
    return fallback // private mode or blocked storage
  }
}

// Drop the long-lived token older versions kept in localStorage.
safeLocalStorage((ls) => ls.removeItem(LEGACY_TOKEN_KEY))

/** Reads `exp` and `iat` from a JWT without verifying it (the server verifies). */
function decodeLifetimeMs(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const { exp, iat } = JSON.parse(atob(part))
    return typeof exp === 'number' && typeof iat === 'number' ? (exp - iat) * 1000 : null
  } catch {
    return null
  }
}

let access = null // { token, expiresAt } with expiresAt measured on THIS device's clock

export const tokenStorage = {
  get() {
    return access?.token ?? null
  },
  set(token) {
    // Using the token's lifetime from the moment we received it avoids problems
    // when the computer's clock differs from the server's.
    const lifetime = decodeLifetimeMs(token)
    access = { token, expiresAt: lifetime ? Date.now() + lifetime : null }
  },
  clear() {
    access = null
  },
  /** True when the token expires within `marginMs` (refresh it before using it). */
  expiresSoon(marginMs = 30_000) {
    return Boolean(access?.expiresAt) && access.expiresAt - Date.now() < marginMs
  },
}

export const sessionHint = {
  get: () => safeLocalStorage((ls) => ls.getItem(SESSION_HINT_KEY) === '1', false),
  set: () => safeLocalStorage((ls) => ls.setItem(SESSION_HINT_KEY, '1')),
  clear: () => safeLocalStorage((ls) => ls.removeItem(SESSION_HINT_KEY)),
}
