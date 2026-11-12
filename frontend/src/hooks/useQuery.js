import { useCallback, useEffect, useRef, useState } from 'react'
import { parseApiError } from '../services/api'

/**
 * Minimal data-fetching hook.
 *  - `key` identifies the request (e.g. "page-2"); a new key triggers a fetch, null skips it.
 *  - Results are tagged with the key they belong to, so a slow old response
 *    can never overwrite newer data.
 *  - reload() re-fetches the same key; setData() updates the cache locally.
 */
export function useQuery(key, fetcher) {
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const [tick, setTick] = useState(0)
  const [state, setState] = useState({ key: null, tick: -1, data: null, error: null })

  useEffect(() => {
    if (key == null) return
    let cancelled = false
    Promise.resolve()
      .then(() => fetcherRef.current())
      .then((data) => !cancelled && setState({ key, tick, data, error: null }))
      .catch((err) => !cancelled && setState({ key, tick, data: null, error: parseApiError(err).message }))
    return () => {
      cancelled = true
    }
  }, [key, tick])

  const current = state.key === key
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback(
    (updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })),
    [],
  )

  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: key != null && (!current || state.tick !== tick),
    reload,
    setData,
  }
}
