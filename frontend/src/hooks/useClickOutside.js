import { useEffect } from 'react'

/** Calls `onOutside` on a pointer-down outside `ref`, or on Escape. */
export function useClickOutside(ref, onOutside, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onPointer = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside()
    }
    const onKey = (e) => e.key === 'Escape' && onOutside()
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, onOutside, enabled])
}
