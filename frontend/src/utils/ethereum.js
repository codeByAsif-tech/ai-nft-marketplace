/**
 * Returns the injected MetaMask provider (EIP-1193), or null.
 * When several wallet extensions are installed, some expose a `providers`
 * array on window.ethereum; prefer the MetaMask one.
 */
export function getInjectedProvider() {
  if (typeof window === 'undefined') return null
  const { ethereum } = window
  if (!ethereum) return null
  if (Array.isArray(ethereum.providers)) {
    return ethereum.providers.find((p) => p.isMetaMask) || ethereum.providers[0]
  }
  return ethereum
}
