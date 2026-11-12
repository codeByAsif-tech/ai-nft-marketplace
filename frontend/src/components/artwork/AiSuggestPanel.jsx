import { useEffect, useId, useState } from 'react'
import { useQuery } from '../../hooks/useQuery'
import { getAiStatus, suggestMetadata } from '../../services/ai.service'
import { parseApiError } from '../../services/api'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'

const PROVIDER_NAMES = { groq: 'Groq' }

/**
 * Describe the artwork in a few words; the AI suggests a name, description,
 * collection name and traits. Nothing is applied until the user clicks
 * "Use these details", and everything stays editable afterwards.
 */
export default function AiSuggestPanel({ prompt, onPromptChange, style, onApply, disabled = false }) {
  const promptId = useId()
  const status = useQuery('ai-status', getAiStatus)
  const [suggestion, setSuggestion] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [seconds, setSeconds] = useState(0)

  // Elapsed-time counter while waiting, so a slow answer doesn't look frozen.
  useEffect(() => {
    if (!loading) return
    const started = Date.now()
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500)
    return () => clearInterval(t)
  }, [loading])

  const text = status.data?.text
  const available = Boolean(text?.available)
  const trimmed = prompt.trim()

  const run = async () => {
    setError('')
    if (trimmed.length < 3) {
      setError('Describe your artwork in at least a few words.')
      return
    }
    setSeconds(0)
    setLoading(true)
    try {
      setSuggestion(await suggestMetadata({ prompt: trimmed, style }))
    } catch (err) {
      setError(parseApiError(err).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-300" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" strokeLinejoin="round" />
          </svg>
          Suggest details with AI
        </h3>
        {status.loading ? (
          <Spinner size="sm" className="text-slate-400" />
        ) : available ? (
          <span className="text-xs text-emerald-300">AI ready</span>
        ) : null}
      </div>

      {!status.loading && !available && (
        <p className="mt-2 text-xs text-slate-400">
          AI suggestions are unavailable{text?.reason ? `: ${text.reason}` : status.error ? `: ${status.error}` : '.'} You
          can still fill in the details yourself.
        </p>
      )}

      {available && (
        <>
          <label htmlFor={promptId} className="mt-3 block text-xs text-slate-400">
            Describe your artwork in a few words
          </label>
          <textarea
            id={promptId}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            maxLength={500}
            rows={2}
            disabled={disabled || loading}
            placeholder="e.g. a futuristic city with neon lights at night"
            className="mt-1.5 w-full resize-y rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-60"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" onClick={run} loading={loading} disabled={disabled}>
              {loading ? `Thinking… ${seconds}s` : suggestion ? 'Regenerate' : 'Suggest details'}
            </Button>
            <span className="text-xs text-slate-500">
              Uses your selected style. Your text is sent to an external AI service ({PROVIDER_NAMES[text?.provider] ?? 'AI'}).
            </span>
          </div>
        </>
      )}

      <Alert className="mt-3">{error}</Alert>

      {suggestion && !loading && (
        <div className="mt-4 rounded-xl border border-white/10 bg-ink-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Suggestion</p>
          <p className="mt-2 font-semibold text-white">{suggestion.name}</p>
          <p className="mt-1 text-sm text-slate-300">{suggestion.description}</p>
          {suggestion.collectionName && (
            <p className="mt-2 text-xs text-slate-400">
              Collection: <span className="text-slate-200">{suggestion.collectionName}</span>
            </p>
          )}
          {suggestion.attributes.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {suggestion.attributes.map((a) => (
                <li key={a.trait_type} className="rounded-lg bg-white/5 px-2.5 py-1 text-xs">
                  <span className="text-slate-400">{a.trait_type}:</span> <span className="text-white">{a.value}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApply(suggestion)
                setSuggestion(null)
              }}
              disabled={disabled}
            >
              Use these details
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
