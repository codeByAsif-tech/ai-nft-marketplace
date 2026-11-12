import { ApiError } from '../../../utils/ApiError.js';
import { logger } from '../../../utils/logger.js';
import { SUGGESTION_SCHEMA, buildSuggestionMessages, parseSuggestion } from '../suggestion.js';

/**
 * Text provider backed by Groq (https://console.groq.com), using its
 * OpenAI-compatible Chat Completions API.
 *
 * - Auth: `Authorization: Bearer <GROQ_API_KEY>`. The key stays on the server,
 *   is never logged and never reaches the browser.
 * - JSON: models that support it get `response_format: json_schema`; others get
 *   `json_object` mode (the system prompt already asks for JSON). The output is
 *   validated and cleaned by parseSuggestion() either way.
 * - Free plan: rate limited by Groq. A 429 becomes a clear "limit reached" message.
 *
 * Docs: https://console.groq.com/docs/structured-outputs
 */

// Models that support response_format.type = "json_schema" (per Groq docs, Nov 2026).
const JSON_SCHEMA_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
const STATUS_CACHE_MS = 5 * 60 * 1000;

export function createGroqTextProvider({ apiKey, model, baseUrl, timeoutMs }) {
  let statusCache = null; // { value, at }

  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` });
  const isReasoningModel = model.startsWith('openai/gpt-oss');

  function responseFormat() {
    if (JSON_SCHEMA_MODELS.includes(model)) {
      // strict: false = best effort; our schema doesn't meet strict mode's extra rules,
      // and parseSuggestion() validates the result anyway.
      return { type: 'json_schema', json_schema: { name: 'nft_metadata', strict: false, schema: SUGGESTION_SCHEMA } };
    }
    return { type: 'json_object' };
  }

  /** Maps Groq HTTP errors to messages a user (or the developer) can act on. */
  function toApiError(status) {
    if (status === 429) return new ApiError(429, 'The free Groq limit has been reached. Please try again in a minute.');
    if (status === 401) return new ApiError(503, 'AI is not configured correctly (invalid GROQ_API_KEY).');
    if (status === 403) return new ApiError(503, 'AI is not configured correctly (the Groq API key was rejected).');
    if (status === 404) return new ApiError(503, `AI model "${model}" is not available. Check GROQ_MODEL.`);
    if (status >= 500) return new ApiError(503, 'The Groq service is temporarily unavailable. Please try again.');
    return new ApiError(502, 'The AI request failed. Please try again.');
  }

  async function getStatus() {
    if (!apiKey) {
      return { available: false, provider: 'groq', model, reason: 'GROQ_API_KEY is not set on the server.' };
    }
    if (statusCache && Date.now() - statusCache.at < STATUS_CACHE_MS) return statusCache.value;

    let value;
    try {
      // Listing models costs nothing and confirms both the key and the model.
      const res = await fetch(`${baseUrl}/models`, { headers: headers(), signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        value = { available: false, provider: 'groq', model, reason: toApiError(res.status).message };
      } else {
        const body = await res.json().catch(() => null);
        const ids = (body?.data ?? []).map((m) => m.id);
        value = ids.includes(model)
          ? { available: true, provider: 'groq', model }
          : { available: false, provider: 'groq', model, reason: `AI model "${model}" is not available. Check GROQ_MODEL.` };
      }
    } catch {
      // Network problem: don't cache, so it recovers as soon as the network does.
      return { available: false, provider: 'groq', model, reason: 'Could not reach the Groq API.' };
    }
    statusCache = { value, at: Date.now() };
    return value;
  }

  /** Returns the model's text, or null when Groq says the output wasn't valid JSON (worth a retry). */
  async function complete(messages) {
    let res;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          model,
          messages,
          response_format: responseFormat(),
          temperature: 0.9,
          max_completion_tokens: 2048,
          // gpt-oss models "think" before answering; keep that short for speed.
          ...(isReasoningModel ? { reasoning_effort: 'low' } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err.name === 'TimeoutError') throw new ApiError(504, 'The AI took too long to respond. Please try again.');
      throw new ApiError(503, 'Could not reach the Groq API.');
    }

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const code = body?.error?.code;
      // Groq rejects model output that doesn't match the requested JSON: treat like unusable output.
      if (res.status === 400 && (code === 'json_validate_failed' || /json/i.test(body?.error?.message ?? ''))) {
        return null;
      }
      // Log Groq's message for the developer; never log the key or headers.
      logger.warn(`Groq ${res.status} ${code ?? ''}: ${String(body?.error?.message ?? '').slice(0, 200)}`);
      if ([401, 403, 404].includes(res.status)) statusCache = null;
      throw toApiError(res.status);
    }
    return body?.choices?.[0]?.message?.content ?? '';
  }

  async function suggestMetadata({ prompt, style }) {
    if (!apiKey) throw new ApiError(503, 'AI suggestions are not configured on this server.');
    const messages = buildSuggestionMessages({ prompt, style });
    for (let attempt = 1; attempt <= 2; attempt++) {
      const raw = await complete(messages);
      const suggestion = raw == null ? null : parseSuggestion(raw);
      if (suggestion) return suggestion;
      logger.warn(`Groq returned unusable output (attempt ${attempt}): ${String(raw).slice(0, 200)}`);
    }
    throw new ApiError(502, 'The AI returned an unusable answer. Please try again.');
  }

  return { name: 'groq', getStatus, suggestMetadata };
}
