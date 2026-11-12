import { useEffect, useState } from 'react'
import { gatewayCandidates } from '../../utils/ipfs'

const SLOW_MS = 8000

/**
 * Shows an image stored on IPFS. Tries the configured gateway, then other public
 * gateways, then `fallbackSrc` (the app's own copy). It moves on when a source
 * errors or hasn't loaded within 8 seconds, so the image doesn't stay blank.
 */
export default function IpfsImage({ cid, gatewayUrl, fallbackSrc, alt, className = '' }) {
  const sources = [...gatewayCandidates(cid, gatewayUrl), fallbackSrc].filter(Boolean)
  const [index, setIndex] = useState(0)
  const [loadedIndex, setLoadedIndex] = useState(-1)

  const src = sources[index]
  const loaded = loadedIndex === index
  const exhausted = index >= sources.length

  // Give each source a fair chance, then try the next one.
  useEffect(() => {
    if (loaded || exhausted) return
    const timer = setTimeout(() => setIndex((i) => (i < sources.length - 1 ? i + 1 : i)), SLOW_MS)
    return () => clearTimeout(timer)
  }, [index, loaded, exhausted, sources.length])

  if (exhausted || !src) {
    return (
      <div className={`grid place-items-center bg-ink-800 text-center text-xs text-slate-500 ${className}`}>
        Image unavailable
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden bg-ink-800 ${className}`}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-white/5" aria-hidden="true" />}
      <img
        key={src}
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoadedIndex(index)}
        onError={() => setIndex((i) => i + 1)}
        className={`h-full w-full object-cover transition duration-300 group-hover:scale-105 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}
