import api from './api'

// ---- public browsing
export async function exploreListings({ page = 1, limit = 12, chainId, search, sort } = {}) {
  const params = { page, limit }
  if (chainId) params.chainId = chainId
  if (search) params.search = search
  if (sort) params.sort = sort
  const { data } = await api.get('/marketplace/listings', { params })
  return data.data // { items, pagination }
}

export async function getNftDetails(id) {
  const { data } = await api.get(`/nfts/${id}`)
  return data.data.nft
}

export async function getNftActivity(id, { page = 1, limit = 20 } = {}) {
  const { data } = await api.get(`/nfts/${id}/activity`, { params: { page, limit } })
  return data.data
}

// ---- recording verified on-chain actions (each returns { state: 'PENDING' | 'CONFIRMED', ... })
export async function recordListing({ nftId, txHash }) {
  const { data } = await api.post('/marketplace/listings', { nftId, txHash }, { timeout: 30000 })
  return data.data
}

export async function recordPurchase({ listingId, txHash }) {
  const { data } = await api.post(`/marketplace/listings/${listingId}/buy`, { txHash }, { timeout: 30000 })
  return data.data
}

export async function recordCancel({ listingId, txHash }) {
  const { data } = await api.post(`/marketplace/listings/${listingId}/cancel`, { txHash }, { timeout: 30000 })
  return data.data
}

export async function recordTransfer({ nftId, txHash }) {
  const { data } = await api.post(`/nfts/${nftId}/transfer`, { txHash }, { timeout: 30000 })
  return data.data
}

// ---- history
export async function getMyTransactions({ page = 1, limit = 20, type } = {}) {
  const params = { page, limit }
  if (type) params.type = type
  const { data } = await api.get('/users/me/transactions', { params })
  return data.data
}
