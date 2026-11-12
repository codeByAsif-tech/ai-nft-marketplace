// Human-readable ABI for NFTMarketplace. Must match contracts/contracts/NFTMarketplace.sol.
export const NFT_MARKETPLACE_ABI = [
  'function listItem(address nft, uint256 tokenId, uint256 price) returns (uint256)',
  'function buyItem(uint256 listingId) payable',
  'function cancelListing(uint256 listingId)',
  'function withdrawProceeds()',
  'function proceeds(address seller) view returns (uint256)',
  'function getListing(uint256 listingId) view returns (tuple(address seller, address nft, uint256 tokenId, uint256 price, bool active))',
]
