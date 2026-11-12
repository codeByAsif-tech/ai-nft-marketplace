// Uploaded files are served by the backend (e.g. /uploads/<uuid>.png).
// The API base is http://localhost:5000/api, so files live on its origin.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const API_ORIGIN = new URL(API_URL, window.location.href).origin

export function assetUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`
}
