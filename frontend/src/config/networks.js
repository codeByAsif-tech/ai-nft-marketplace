// Chain parameters for MetaMask (switch/add network) and display.
// Mirrors backend/src/config/networks.js. Contract addresses come from the
// backend (GET /api/networks) so they're configured in one place.
// chainId is used by wallet/contract logic; user-facing UI shows only the name.

export const NETWORKS = {
  sepolia: {
    key: 'sepolia',
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    chainIdHex: '0xaa36a7',
    dotClass: 'bg-sky-400',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'],
    explorerUrl: 'https://sepolia.etherscan.io',
    isLocal: false,
  },
  baseSepolia: {
    key: 'baseSepolia',
    name: 'Base Sepolia',
    chainId: 84532,
    chainIdHex: '0x14a34',
    dotClass: 'bg-blue-500',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'],
    explorerUrl: 'https://sepolia.basescan.org',
    isLocal: false,
  },
}

// Local Hardhat chain for development (`npm run node` in contracts/).
// Shown in dev builds only, unless VITE_ENABLE_LOCAL_CHAIN=false.
const localEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_LOCAL_CHAIN !== 'false'
if (localEnabled) {
  NETWORKS.hardhatLocal = {
    key: 'hardhatLocal',
    name: 'Hardhat Local',
    chainId: 31337,
    chainIdHex: '0x7a69',
    dotClass: 'bg-amber-400',
    nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['http://127.0.0.1:8545'],
    explorerUrl: null,
    isLocal: true,
  }
}

export const NETWORK_LIST = Object.values(NETWORKS)

// Real (public) testnets only: used for marketing text such as the landing page.
export const PUBLIC_NETWORK_LIST = NETWORK_LIST.filter((n) => !n.isLocal)

export const DEFAULT_NETWORK = NETWORKS.sepolia

export function getNetworkByChainId(chainId) {
  return NETWORK_LIST.find((n) => n.chainId === Number(chainId)) || null
}

export function isSupportedChainId(chainId) {
  return Boolean(getNetworkByChainId(chainId))
}

export function txExplorerUrl(chainId, hash) {
  const n = getNetworkByChainId(chainId)
  return n?.explorerUrl && hash ? `${n.explorerUrl}/tx/${hash}` : null
}

export function addressExplorerUrl(chainId, address) {
  const n = getNetworkByChainId(chainId)
  return n?.explorerUrl && address ? `${n.explorerUrl}/address/${address}` : null
}
