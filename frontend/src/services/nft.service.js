import api from './api'

/** Supported networks with their deployed contract addresses (from the backend config). */
export async function getNetworks() {
  const { data } = await api.get('/networks')
  return data.data
}

/**
 * Reports a mint transaction to the backend, which verifies it on-chain.
 * Resolves to { state: 'PENDING', generation } (202) or
 * { state: 'CONFIRMED', nft, generation } (201). Safe to call repeatedly.
 */
export async function recordMint({ generationId, chainId, txHash }) {
  const { data } = await api.post('/nfts/mint', { generationId, chainId, txHash }, { timeout: 30000 })
  return data.data
}

export async function listMyNfts({ page = 1, limit = 12, chainId } = {}) {
  const { data } = await api.get('/nfts/mine', { params: { page, limit, ...(chainId ? { chainId } : {}) } })
  return data.data // { items, pagination, walletLinked }
}

export async function verifyNftOwner(id) {
  const { data } = await api.post(`/nfts/${id}/verify-owner`)
  return data.data // { nft, changed }
}
