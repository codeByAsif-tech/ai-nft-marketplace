import { ApiError } from '../../utils/ApiError.js';
import { logger } from '../../utils/logger.js';

/**
 * Minimal Pinata v3 client (https://docs.pinata.cloud).
 *   Upload: POST {uploadUrl}/files             multipart: file, network=public, name, keyvalues (JSON)
 *   List:   GET  {apiUrl}/files/public?metadata[key]=value&limit=N
 * Auth: `Authorization: Bearer <PINATA_JWT>`. The JWT never leaves the server.
 *
 * keyvalues are labels stored with each file. We use them to find an earlier
 * upload of the exact same content, so retries never create duplicates.
 */
export function createPinataClient({ jwt, uploadUrl, apiUrl, timeoutMs }) {
  const authHeader = () => ({ Authorization: `Bearer ${jwt}` });

  function toApiError(status, action) {
    if (status === 401 || status === 403) {
      return new ApiError(503, 'IPFS is not configured correctly (Pinata rejected PINATA_JWT or it lacks permission).');
    }
    if (status === 429) return new ApiError(429, 'Pinata rate limit reached. Please retry in a minute.');
    if (status === 413) return new ApiError(413, 'The file is too large for Pinata.');
    if (status >= 500) return new ApiError(503, `Pinata is temporarily unavailable (${action}). Please retry.`);
    return new ApiError(502, `Pinata ${action} failed (HTTP ${status}). Please retry.`);
  }

  async function request(url, init, action) {
    if (!jwt) throw new ApiError(503, 'IPFS uploads are not configured on this server (PINATA_JWT is missing).');
    let res;
    try {
      res = await fetch(url, { ...init, headers: { ...authHeader(), ...init.headers }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (err.name === 'TimeoutError') throw new ApiError(504, `Pinata ${action} timed out. Please retry.`);
      throw new ApiError(503, `Could not reach Pinata (${action}). Please retry.`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      // Log Pinata's message for the developer; never the JWT.
      logger.warn(`Pinata ${action} ${res.status}: ${JSON.stringify(body?.error ?? body ?? '').slice(0, 200)}`);
      const error = toApiError(res.status, action);
      error.upstreamStatus = res.status; // lets callers react to specific Pinata codes
      throw error;
    }
    return body;
  }

  /** Uploads one file to the public IPFS network. Returns { id, cid }. */
  async function uploadFile({ data, fileName, mimeType, keyvalues }) {
    const form = new FormData();
    form.append('file', new Blob([data], { type: mimeType }), fileName);
    form.append('network', 'public');
    form.append('name', fileName);
    form.append('keyvalues', JSON.stringify(keyvalues));

    const body = await request(`${uploadUrl}/files`, { method: 'POST', body: form }, 'upload');
    const file = body?.data;
    if (!file?.cid) throw new ApiError(502, 'Pinata did not return a CID. Please retry.');
    return { id: file.id ?? null, cid: file.cid };
  }

  /**
   * Finds an existing public file whose labels match ALL the given keyvalues.
   * The match is re-checked here, so even if Pinata ignored the filter we
   * would never reuse the wrong file. Returns { id, cid } or null.
   */
  async function findFile(keyvalues) {
    const params = new URLSearchParams({ limit: '10' });
    for (const [k, v] of Object.entries(keyvalues)) params.append(`metadata[${k}]`, v);

    const body = await request(`${apiUrl}/files/public?${params}`, { method: 'GET', headers: {} }, 'lookup');
    const files = body?.data?.files ?? [];
    const match = files.find(
      (f) => f.cid && Object.entries(keyvalues).every(([k, v]) => f.keyvalues?.[k] === v)
    );
    return match ? { id: match.id ?? null, cid: match.cid } : null;
  }

  /**
   * Find-or-upload: the core of duplicate-free retries.
   * If the key may upload but not list files (a "Files: Write" key without read
   * access), the lookup is skipped with a warning instead of blocking uploads.
   * Retries still skip steps whose CID is already saved; only the rare
   * "stored on Pinata but the response was lost" case could then duplicate.
   */
  let lookupDenied = false;
  async function ensureUploaded({ data, fileName, mimeType, keyvalues }) {
    let existing = null;
    if (!lookupDenied) {
      try {
        existing = await findFile(keyvalues);
      } catch (err) {
        if (err.upstreamStatus !== 403) throw err;
        lookupDenied = true;
        logger.warn('Pinata key cannot list files (needs read access). Skipping duplicate lookup; consider an Admin key.');
      }
    }
    if (existing) return { ...existing, reused: true };
    const uploaded = await uploadFile({ data, fileName, mimeType, keyvalues });
    return { ...uploaded, reused: false };
  }

  return { isConfigured: Boolean(jwt), uploadFile, findFile, ensureUploaded };
}
