/**
 * Minimal EIP-1193 provider that behaves like MetaMask for tests.
 * Holds no keys; it only simulates accounts, chain and RPC responses.
 */
export function createMockEthereum({
  accounts = [],
  chainId = '0xaa36a7', // Sepolia
  balanceWei = '0xde0b6b3a7640000', // 1 ETH
  knownChains = ['0xaa36a7'],
} = {}) {
  const listeners = new Map()
  const state = { accounts, chainId, balanceWei, knownChains: new Set(knownChains), nextError: {} }

  const emit = (event, payload) => {
    for (const fn of listeners.get(event) ?? []) fn(payload)
  }

  const rpcError = (code, message) => Object.assign(new Error(message), { code })

  const provider = {
    isMetaMask: true,
    state,
    calls: [],

    /** Makes the next call to `method` fail with the given RPC error code. */
    failNext(method, code, message = 'Mock error') {
      state.nextError[method] = rpcError(code, message)
    },

    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
    },

    removeListener(event, fn) {
      listeners.get(event)?.delete(fn)
    },

    listenerCount(event) {
      return listeners.get(event)?.size ?? 0
    },

    emit,

    async request({ method, params }) {
      provider.calls.push({ method, params })

      if (state.nextError[method]) {
        const err = state.nextError[method]
        delete state.nextError[method]
        throw err
      }

      switch (method) {
        case 'eth_chainId':
          return state.chainId
        case 'net_version':
          return String(Number.parseInt(state.chainId, 16))
        case 'eth_accounts':
          return state.accounts
        case 'eth_requestAccounts':
          if (state.accounts.length === 0) state.accounts = ['0x1111111111111111111111111111111111111111']
          return state.accounts
        case 'eth_getBalance':
          return state.balanceWei
        case 'eth_blockNumber':
          return '0x1'
        case 'wallet_switchEthereumChain': {
          const target = params[0].chainId
          if (!state.knownChains.has(target)) throw rpcError(4902, 'Unrecognized chain ID')
          state.chainId = target
          emit('chainChanged', target)
          return null
        }
        case 'wallet_addEthereumChain': {
          const target = params[0].chainId
          state.knownChains.add(target)
          state.chainId = target
          emit('chainChanged', target)
          return null
        }
        case 'wallet_revokePermissions':
          state.accounts = []
          return null
        default:
          throw rpcError(4200, `Unsupported method in mock: ${method}`)
      }
    },
  }

  return provider
}
