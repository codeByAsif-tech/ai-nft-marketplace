import { useEffect, useId, useRef, useState } from 'react'
import { IMAGE_RULES } from '../../config/artStyles'

function readImageSize(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('This file could not be read as an image.'))
    img.src = url
  })
}

const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/**
 * Drag-and-drop / click-to-browse image picker with instant validation and preview.
 * Calls onChange({ file, url, width, height }) or onChange(null) when cleared.
 * The server validates the real file contents again; these checks are for fast feedback.
 */
export default function ImageDropzone({ value, onChange, disabled = false }) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  // Free the preview's memory when it is replaced or the component unmounts.
  useEffect(() => {
    const url = value?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [value?.url])

  const handleFile = async (file) => {
    setError('')
    if (!file) return
    if (!IMAGE_RULES.types.includes(file.type)) {
      setError('Please choose a PNG, JPEG, WebP or GIF image.')
      return
    }
    if (file.size > IMAGE_RULES.maxBytes) {
      setError(`This image is ${formatMb(file.size)}. The maximum is ${formatMb(IMAGE_RULES.maxBytes)}.`)
      return
    }

    setChecking(true)
    const url = URL.createObjectURL(file)
    try {
      const { width, height } = await readImageSize(url)
      const { minDimension: min, maxDimension: max } = IMAGE_RULES
      if (width < min || height < min) throw new Error(`Image must be at least ${min}×${min} pixels.`)
      if (width > max || height > max) throw new Error(`Image must be at most ${max}×${max} pixels.`)
      onChange({ file, url, width, height })
    } catch (err) {
      URL.revokeObjectURL(url)
      setError(err.message)
    } finally {
      setChecking(false)
      if (inputRef.current) inputRef.current.value = '' // allow re-selecting the same file
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (!disabled) handleFile(e.dataTransfer.files?.[0])
  }

  if (value) {
    return (
      <div className="space-y-3">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-800">
          <img src={value.url} alt="Artwork preview" className="mx-auto max-h-[480px] w-full object-contain" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span className="min-w-0 truncate">
            {value.file.name} · {value.width}×{value.height} · {formatMb(value.file.size)}
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-lg px-2 py-1 font-medium text-brand-300 hover:bg-white/5 hover:text-brand-200"
            >
              Choose another image
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragging ? 'border-brand-400 bg-brand-500/10' : 'border-white/15 bg-ink-800/60 hover:border-white/30'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15 text-brand-300">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path
              d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="text-sm font-medium text-white">
          {checking ? 'Checking image…' : 'Drop your artwork here, or click to browse'}
        </span>
        <span className="text-xs text-slate-500">PNG, JPEG, WebP or GIF · up to 10 MB · at least 64×64 px</span>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={IMAGE_RULES.accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}
