import { parseApiError } from '../services/api'
import { parseWalletError } from './walletErrors'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Throws a readable error unless MetaMask is on `chainId` right now. */
export async function assertChain(signer, chainId, networkName) {
  const live = Number.parseInt(await signer.provider.send('eth_chainId', []), 16)
  if (live !== chainId) throw new Error(`Switch MetaMask to ${networkName} and try again.`)
}

/** Throws unless a contract is deployed at `address` (e.g. after a local chain restart). */
export async function assertContract(signer, address, isLocal) {
  const code = await signer.provider.getCode(address)
  if (!code || code === '0x') {
    throw new Error(
      isLocal
        ? 'The contracts are not deployed on your local chain (it was probably restarted). Run "npm run deploy:local:reset" in the contracts folder.'
        : 'No contract found at the configured address.',
    )
  }
}

/**
 * Runs one user-signed transaction end to end:
 *   signing (MetaMask) -> pending (mined?) -> verifying (backend checks it on-chain) -> done
 * `send()` returns an ethers TransactionResponse; `record(hash)` reports it to the
 * backend and resolves to { state: 'PENDING' | 'CONFIRMED', ... }.
 * The hash is reported as soon as it exists, so it's saved even if the tab closes.
 */
export async function runChainAction({ send, record, onStatus, attempts = 40, intervalMs = 2500 }) {
  onStatus?.({ step: 'signing' })
  const tx = await send()
  onStatus?.({ step: 'pending', hash: tx.hash })
  record(tx.hash).catch(() => {}) // best effort, early

  await tx.wait(1)
  onStatus?.({ step: 'verifying', hash: tx.hash })

  for (let i = 0; i < attempts; i++) {
    const result = await record(tx.hash)
    if (result.state === 'CONFIRMED') {
      onStatus?.({ step: 'done', hash: tx.hash })
      return { ...result, hash: tx.hash }
    }
    await sleep(intervalMs)
  }
  throw new Error('The transaction is mined but not verified yet. Refresh the page in a minute.')
}

/** One readable message for wallet, contract and API errors. */
export function describeActionError(err) {
  if (err?.response || err?.request) return parseApiError(err).message
  return parseWalletError(err)
}
