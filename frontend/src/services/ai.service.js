import api from './api'

export async function getAiStatus() {
  const { data } = await api.get('/ai/status')
  return data.data // { text: {available, model, reason}, image: {available, reason} }
}

/** Asks the backend (which calls the configured AI provider, Groq) for a title, description, traits and collection name. */
export async function suggestMetadata({ prompt, style }, { signal } = {}) {
  const { data } = await api.post('/ai/suggest', { prompt, style }, { timeout: 60000, signal })
  return data.data.suggestion
}

export async function createGeneration({ file, details }, { onProgress } = {}) {
  const form = new FormData()
  form.append('image', file)
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined || value === null) continue
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const { data } = await api.post('/ai/generations', form, {
    timeout: 120000,
    onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
  })
  return data.data.generation
}

export async function listGenerations({ page = 1, limit = 12 } = {}) {
  const { data } = await api.get('/ai/generations', { params: { page, limit } })
  return data.data // { items, pagination }
}

export async function getGeneration(id) {
  const { data } = await api.get(`/ai/generations/${id}`)
  return data.data.generation
}

export async function updateGeneration(id, details) {
  const { data } = await api.patch(`/ai/generations/${id}`, details)
  return data.data.generation
}

export async function getIpfsStatus() {
  const { data } = await api.get('/ai/ipfs/status')
  return data.data // { configured, provider, gatewayUrl, reason }
}

/**
 * Starts or resumes the IPFS upload. Safe to call again after a failure:
 * the server skips steps that already succeeded, so nothing is uploaded twice.
 */
export async function publishToIpfs(id) {
  const { data } = await api.post(`/ai/generations/${id}/ipfs`, null, { timeout: 180000 })
  return data.data.generation
}

export async function deleteGeneration(id) {
  await api.delete(`/ai/generations/${id}`)
}
