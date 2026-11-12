import 'dotenv/config';

/**
 * Single source of truth for supported blockchain networks.
 * NFTs are independent per network: always key on (chainId, contractAddress, tokenId).
 *
 * `confirmations`: blocks a mint must be buried under before the backend
 * records it (protects against short chain reorganisations on testnets).
 */
const env = (name) => process.env[name]?.trim() || null;
const lower = (address) => (address ? address.toLowerCase() : null);

const networks = {
  sepolia: {
    key: 'sepolia',
    name: 'Ethereum Sepolia',
    chainId: 11155111,
    rpcUrl: env('SEPOLIA_RPC_URL') || 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    nftContract: lower(env('SEPOLIA_NFT_CONTRACT')),
    marketplaceContract: lower(env('SEPOLIA_MARKETPLACE_CONTRACT')),
    confirmations: 2,
    isLocal: false,
  },
  baseSepolia: {
    key: 'baseSepolia',
    name: 'Base Sepolia',
    chainId: 84532,
    rpcUrl: env('BASE_SEPOLIA_RPC_URL') || 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    nftContract: lower(env('BASE_SEPOLIA_NFT_CONTRACT')),
    marketplaceContract: lower(env('BASE_SEPOLIA_MARKETPLACE_CONTRACT')),
    confirmations: 2,
    isLocal: false,
  },
};

// Local Hardhat chain (`npm run node` in contracts/). Development only: it uses
// Hardhat's public test accounts, so it's never enabled in production.
const localEnabled = process.env.NODE_ENV !== 'production' && process.env.ENABLE_LOCAL_CHAIN !== 'false';
if (localEnabled) {
  networks.hardhatLocal = {
    key: 'hardhatLocal',
    name: 'Hardhat Local',
    chainId: 31337,
    rpcUrl: env('HARDHAT_RPC_URL') || 'http://127.0.0.1:8545',
    explorerUrl: null,
    nftContract: lower(env('HARDHAT_NFT_CONTRACT')),
    marketplaceContract: lower(env('HARDHAT_MARKETPLACE_CONTRACT')),
    confirmations: 1,
    isLocal: true,
  };
}

export const NETWORKS = Object.freeze(
  Object.fromEntries(Object.entries(networks).map(([k, v]) => [k, Object.freeze(v)]))
);

export const SUPPORTED_CHAIN_IDS = Object.freeze(Object.values(NETWORKS).map((n) => n.chainId));

export function getNetworkByChainId(chainId) {
  return Object.values(NETWORKS).find((n) => n.chainId === Number(chainId)) || null;
}

export function isSupportedChainId(chainId) {
  return SUPPORTED_CHAIN_IDS.includes(Number(chainId));
}

/** Public view of a network (no RPC URLs, which may contain API keys). */
export function publicNetwork(n) {
  return {
    key: n.key,
    name: n.name,
    chainId: n.chainId,
    explorerUrl: n.explorerUrl,
    nftContract: n.nftContract,
    marketplaceContract: n.marketplaceContract,
    confirmations: n.confirmations,
    isLocal: n.isLocal,
  };
}
