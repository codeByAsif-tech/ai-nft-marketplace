import { useCallback, useEffect, useMemo, useState } from 'react'
import { THEME_KEY, THEME_OPTIONS, ThemeContext } from './theme-context'

// Anything else stored (including the old "system" option) falls back to light.
const readPreference = () => {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return THEME_OPTIONS.includes(saved) ? saved : 'light'
  } catch {
    return 'light'
  }
}

/**
 * Light / Dark theme. The preference is stored per browser and written to
 * <html data-theme="light|dark">, which index.css uses to switch colors.
 * (index.html applies the same logic before React loads, to avoid a flash.)
 */
export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readPreference)

  // Keep tabs in sync when the preference changes elsewhere.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === THEME_KEY) setPreferenceState(readPreference())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', preference)
  }, [preference])

  const setPreference = useCallback((value) => {
    if (!THEME_OPTIONS.includes(value)) return
    setPreferenceState(value)
    try {
      localStorage.setItem(THEME_KEY, value)
    } catch {
      /* storage unavailable: still applies for this visit */
    }
  }, [])

  const value = useMemo(() => ({ preference, theme: preference, setPreference }), [preference, setPreference])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
