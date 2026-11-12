import { ART_STYLES } from '../../constants/artStyles.js';

/**
 * Prompt building and output sanitising for NFT metadata suggestions.
 * Provider-independent: any text model that returns JSON can use it.
 * Small local models sometimes return extra text, wrong types or overly long
 * values, so every field is cleaned and clamped before reaching the client.
 */

export const SUGGESTION_LIMITS = Object.freeze({
  name: 60,
  description: 500,
  collectionName: 60,
  traitType: 30,
  traitValue: 40,
  maxAttributes: 6,
});

/** JSON schema passed to providers that support structured output (e.g. Groq `response_format.json_schema`). */
export const SUGGESTION_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    collectionName: { type: 'string' },
    attributes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { trait_type: { type: 'string' }, value: { type: 'string' } },
        required: ['trait_type', 'value'],
      },
    },
  },
  required: ['name', 'description', 'collectionName', 'attributes'],
});

export function buildSuggestionMessages({ prompt, style }) {
  const styleLabel = style && style !== 'none' ? ART_STYLES[style] : null;
  return [
    {
      role: 'system',
      content: [
        'You write metadata for NFT artworks.',
        'Reply with JSON only, using exactly these keys:',
        '"name": a short, catchy artwork title (max 6 words),',
        '"description": 2-3 vivid sentences describing the artwork,',
        '"collectionName": a short name for a collection this artwork could belong to (max 4 words),',
        '"attributes": 3 to 5 objects like {"trait_type": "Mood", "value": "Mysterious"}.',
        'Do not include anything except the JSON object.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Artwork idea: ${prompt}${styleLabel ? `\nStyle: ${styleLabel}` : ''}`,
    },
  ];
}

/** Collapses whitespace, strips control characters and clamps length. */
export function cleanText(value, max) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const text = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '');
  if (text.length <= max) return text;
  // Cut at a word boundary where possible.
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Extracts the first JSON object from model output, even if wrapped in text or ``` fences. */
export function extractJson(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Turns raw model output into a safe suggestion object, or returns null if
 * nothing usable came back.
 */
export function parseSuggestion(raw) {
  const data = extractJson(raw);
  if (!data || typeof data !== 'object') return null;
  const L = SUGGESTION_LIMITS;

  const seen = new Set();
  const attributes = (Array.isArray(data.attributes) ? data.attributes : [])
    .map((a) => ({
      trait_type: cleanText(a?.trait_type ?? a?.traitType ?? a?.name, L.traitType),
      value: cleanText(a?.value, L.traitValue),
    }))
    .filter((a) => {
      const key = a.trait_type.toLowerCase();
      if (!a.trait_type || !a.value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, L.maxAttributes);

  const suggestion = {
    name: cleanText(data.name ?? data.title, L.name),
    description: cleanText(data.description, L.description),
    collectionName: cleanText(data.collectionName ?? data.collection_name ?? data.collection, L.collectionName),
    attributes,
  };

  // Need at least a name and a description to be useful.
  if (!suggestion.name || !suggestion.description) return null;
  return suggestion;
}
