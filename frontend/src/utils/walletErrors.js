// EIP-1193 / JSON-RPC error codes returned by MetaMask.
export const WALLET_ERROR = {
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  DISCONNECTED: 4900,
  CHAIN_DISCONNECTED: 4901,
  UNRECOGNIZED_CHAIN: 4902,
  REQUEST_PENDING: -32002,
}

/** Finds the underlying RPC code whether the error came from MetaMask directly or was wrapped by ethers. */
export function getWalletErrorCode(error) {
  if (!error) return undefined
  if (error.code === 'ACTION_REJECTED') return WALLET_ERROR.USER_REJECTED
  // MetaMask mobile wraps the real code (e.g. 4902) inside a generic -32603 error.
  const original = error.data?.originalError?.code
  if (typeof original === 'number') return original
  return (
    (typeof error.code === 'number' ? error.code : undefined) ??
    error.info?.error?.code ??
    error.error?.code
  )
}

export function isUserRejection(error) {
  return getWalletErrorCode(error) === WALLET_ERROR.USER_REJECTED
}

/** Converts a wallet error into a short message a user can act on. */
export function parseWalletError(error) {
  // Transaction-specific problems (ethers v6 error codes / node messages).
  const text = `${error?.shortMessage ?? ''} ${error?.message ?? ''}`.toLowerCase()
  if (error?.code === 'INSUFFICIENT_FUNDS' || text.includes('insufficient funds')) {
    return 'Not enough ETH in this wallet to pay the network fee.'
  }
  if (text.includes('nonce too high') || text.includes('nonce has already been used')) {
    return 'MetaMask is out of sync with the chain (common after restarting the local Hardhat node). In MetaMask Settings, search for "Clear activity" (usually under Developer tools or Advanced), clear it for this account, then try again.'
  }
  if (error?.code === 'CALL_EXCEPTION') {
    return error.reason ? `The transaction was rejected by the contract: ${error.reason}` : 'The transaction failed on-chain (reverted).'
  }

  switch (getWalletErrorCode(error)) {
    case WALLET_ERROR.USER_REJECTED:
      return 'Request cancelled in your wallet.'
    case WALLET_ERROR.REQUEST_PENDING:
      return 'A MetaMask request is already open. Open the MetaMask extension to continue.'
    case WALLET_ERROR.UNAUTHORIZED:
      return 'This site is not connected to MetaMask. Connect your wallet first.'
    case WALLET_ERROR.DISCONNECTED:
    case WALLET_ERROR.CHAIN_DISCONNECTED:
      return 'MetaMask is not connected to the network. Check your connection and try again.'
    case WALLET_ERROR.UNSUPPORTED_METHOD:
      return 'Your wallet does not support this action.'
    default:
      return error?.shortMessage || error?.message || 'Wallet request failed.'
  }
}
