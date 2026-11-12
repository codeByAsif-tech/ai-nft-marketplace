/** Client-side trait checks matching the backend. Returns an error message or ''. */
export function validateAttributes(attributes) {
  const seen = new Set()
  for (const a of attributes) {
    const type = a.trait_type.trim()
    const val = String(a.value).trim()
    if (!type && !val) continue // blank rows are dropped on save
    if (!type || !val) return 'Each trait needs both a name and a value.'
    const key = type.toLowerCase()
    if (seen.has(key)) return `Trait "${type}" is listed twice.`
    seen.add(key)
  }
  return ''
}

/** Trims values and drops completely empty rows. */
export const cleanAttributes = (attributes) =>
  attributes
    .map((a) => ({ trait_type: a.trait_type.trim(), value: String(a.value).trim() }))
    .filter((a) => a.trait_type && a.value)
