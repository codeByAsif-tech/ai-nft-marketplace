// Human-readable ABI for the parts of NFTCollection the frontend calls.
// Must match contracts/contracts/NFTCollection.sol (plus OpenZeppelin ERC-721).
export const NFT_COLLECTION_ABI = [
  'function mint(string uri) returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function approve(address to, uint256 tokenId)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'event NFTMinted(uint256 indexed tokenId, address indexed creator, string tokenURI)',
]
