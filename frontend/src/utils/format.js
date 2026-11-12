import { getAddress } from 'ethers'

/** 0x1234…abcd */
export function shortenAddress(address, chars = 4) {
  if (!address) return ''
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`
}

/** EIP-55 checksum address for display; returns input unchanged if invalid. */
export function toChecksumAddress(address) {
  try {
    return getAddress(address)
  } catch {
    return address
  }
}

export function sameAddress(a, b) {
  return Boolean(a && b) && a.toLowerCase() === b.toLowerCase()
}

/** Formats an ETH amount string (from ethers.formatEther) to at most `decimals` places. */
export function formatEth(value, decimals = 4) {
  if (value == null) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  if (n === 0) return '0'
  if (n < 10 ** -decimals) return `<${10 ** -decimals}`
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals })
}
