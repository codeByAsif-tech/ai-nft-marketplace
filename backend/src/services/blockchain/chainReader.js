import { Contract, JsonRpcProvider } from 'ethers';
import { getNetworkByChainId } from '../../config/networks.js';
import { ApiError } from '../../utils/ApiError.js';
import { NFT_COLLECTION_ABI, NFT_MARKETPLACE_ABI } from './abis.js';

/**
 * READ-ONLY access to the blockchains. The backend never holds a private key
 * and never sends transactions; users sign everything in MetaMask.
 *
 * Exported as a mutable object so tests can replace individual methods with
 * fakes (no real chain needed in unit tests).
 */
const RPC_TIMEOUT_MS = 10000;
const providers = new Map();

function getProvider(chainId) {
  const network = getNetworkByChainId(chainId);
  if (!network) throw ApiError.badRequest('Unsupported network');
  if (!providers.has(network.chainId)) {
    // staticNetwork: we already know the chain id, so skip auto-detection calls.
    providers.set(
      network.chainId,
      new JsonRpcProvider(network.rpcUrl, network.chainId, { staticNetwork: true })
    );
  }
  return { provider: providers.get(network.chainId), network };
}

async function withTimeout(promise, network) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('RPC timeout')), RPC_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const hint = network.isLocal ? ' Is the local Hardhat node running (npm run node)?' : '';
    throw new ApiError(503, `Could not read from ${network.name}.${hint}`);
  } finally {
    clearTimeout(timer);
  }
}

export const chainReader = {
  /** Mined receipt, or null if the transaction isn't mined (yet). */
  async getReceipt(chainId, txHash) {
    const { provider, network } = getProvider(chainId);
    return withTimeout(provider.getTransactionReceipt(txHash), network);
  },

  async getBlockNumber(chainId) {
    const { provider, network } = getProvider(chainId);
    return withTimeout(provider.getBlockNumber(), network);
  },

  /** True if a contract is deployed at the address (false = empty address). */
  async hasCode(chainId, address) {
    const { provider, network } = getProvider(chainId);
    const code = await withTimeout(provider.getCode(address), network);
    return Boolean(code && code !== '0x');
  },

  /** Current owner straight from the contract: the source of truth for ownership. */
  async getOwnerOf(chainId, contractAddress, tokenId) {
    const { provider, network } = getProvider(chainId);
    const contract = new Contract(contractAddress, NFT_COLLECTION_ABI, provider);
    const owner = await withTimeout(contract.ownerOf(tokenId), network);
    return owner.toLowerCase();
  },

  /** A marketplace listing as stored on-chain. */
  async getListing(chainId, marketplaceAddress, listingId) {
    const { provider, network } = getProvider(chainId);
    const contract = new Contract(marketplaceAddress, NFT_MARKETPLACE_ABI, provider);
    const l = await withTimeout(contract.getListing(listingId), network);
    return {
      seller: l.seller.toLowerCase(),
      nft: l.nft.toLowerCase(),
      tokenId: l.tokenId.toString(),
      price: l.price.toString(),
      active: l.active,
    };
  },
};
