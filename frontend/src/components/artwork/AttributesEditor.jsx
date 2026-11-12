import { MAX_ATTRIBUTES } from '../../config/artStyles'

const inputClass =
  'w-full min-w-0 rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30'

/** Editable list of NFT traits ({ trait_type, value }). */
export default function AttributesEditor({ value, onChange, error, disabled = false }) {
  const update = (index, field, text) => onChange(value.map((a, i) => (i === index ? { ...a, [field]: text } : a)))
  const remove = (index) => onChange(value.filter((_, i) => i !== index))
  const add = () => onChange([...value, { trait_type: '', value: '' }])

  return (
    <fieldset disabled={disabled}>
      <div className="mb-1.5 flex items-center justify-between">
        <legend className="text-sm font-medium text-slate-300">Traits</legend>
        <span className="text-xs text-slate-500">
          {value.length}/{MAX_ATTRIBUTES}
        </span>
      </div>

      {value.length === 0 && (
        <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-xs text-slate-500">
          Traits describe your NFT, e.g. Mood: Mysterious. They're optional.
        </p>
      )}

      <ul className="space-y-2">
        {value.map((attr, i) => (
          <li key={i} className="flex gap-2">
            <input
              className={inputClass}
              placeholder="Trait (e.g. Mood)"
              aria-label={`Trait ${i + 1} name`}
              value={attr.trait_type}
              maxLength={40}
              onChange={(e) => update(i, 'trait_type', e.target.value)}
            />
            <input
              className={inputClass}
              placeholder="Value (e.g. Calm)"
              aria-label={`Trait ${i + 1} value`}
              value={attr.value}
              maxLength={60}
              onChange={(e) => update(i, 'value', e.target.value)}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="grid w-10 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-red-300"
              aria-label={`Remove trait ${i + 1}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {value.length < MAX_ATTRIBUTES && (
        <button
          type="button"
          onClick={add}
          className="mt-2 rounded-lg px-2 py-1 text-sm font-medium text-brand-300 hover:bg-white/5 hover:text-brand-200"
        >
          + Add trait
        </button>
      )}
      {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
    </fieldset>
  )
}
