import { isAddress } from 'ethers'
import { sameAddress } from './format'

const ZERO = '0x0000000000000000000000000000000000000000'

/**
 * Validates an NFT transfer recipient. Returns an error message or ''.
 * `from` = the sender's address; `blocked` = contract addresses that must not
 * receive NFTs directly (e.g. the marketplace and the NFT contract itself).
 */
export function validateRecipient(value, { from, blocked = [] }) {
  const v = value.trim()
  if (!v) return 'Enter the recipient wallet address.'
  if (!isAddress(v)) return 'That is not a valid Ethereum address (0x followed by 40 hex characters).'
  if (sameAddress(v, ZERO)) return 'Sending to the zero address would destroy the NFT.'
  if (sameAddress(v, from)) return 'That is your own wallet.'
  if (blocked.some((b) => sameAddress(v, b))) return 'Send NFTs to a person’s wallet, not to a contract.'
  return ''
}
