import { Interface } from 'ethers';

/**
 * Human-readable ABI fragments for the parts of the contracts the backend uses.
 * Must match contracts/contracts/NFTCollection.sol and NFTMarketplace.sol.
 */
export const NFT_COLLECTION_ABI = [
  'event NFTMinted(uint256 indexed tokenId, address indexed creator, string tokenURI)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function mint(string uri) returns (uint256)',
];

export const NFT_MARKETPLACE_ABI = [
  'event ItemListed(uint256 indexed listingId, address indexed seller, address indexed nft, uint256 tokenId, uint256 price)',
  'event ItemSold(uint256 indexed listingId, address indexed buyer, address indexed seller, address nft, uint256 tokenId, uint256 price)',
  'event ListingCancelled(uint256 indexed listingId, address indexed seller, address indexed nft, uint256 tokenId)',
  'event ProceedsWithdrawn(address indexed seller, uint256 amount)',
  'function getListing(uint256 listingId) view returns (tuple(address seller, address nft, uint256 tokenId, uint256 price, bool active))',
  'function proceeds(address seller) view returns (uint256)',
];

export const nftCollectionInterface = new Interface(NFT_COLLECTION_ABI);
export const nftMarketplaceInterface = new Interface(NFT_MARKETPLACE_ABI);
