import api from './api'

/** Asks the backend for a one-time message to sign. */
export async function requestWalletNonce({ address, chainId }) {
  const { data } = await api.post('/wallet/nonce', { address, chainId })
  return data.data // { nonce, message, expiresAt }
}

/** Sends the signature; the backend recovers the signer and links the wallet. */
export async function verifyWalletSignature({ nonce, signature }) {
  const { data } = await api.post('/wallet/verify', { nonce, signature })
  return data.data.user
}

export async function unlinkWallet() {
  const { data } = await api.delete('/wallet')
  return data.data.user
}
