// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title NFTCollection
 * @notice ERC-721 NFTs where each token stores its own metadata URI
 *         (e.g. "ipfs://<metadataCID>" produced by the app's IPFS step).
 *
 * Design:
 *  - Built on OpenZeppelin's ERC721URIStorage: ownership, transfers, approvals
 *    and tokenURI() come from audited code; nothing is re-implemented here.
 *  - Open minting: anyone can mint to THEMSELVES. There is no owner/admin role,
 *    so no privileged private key exists that could be lost or abused.
 *  - Token IDs start at 1 and increase by one; they are only unique within this
 *    contract on this chain. The app always identifies an NFT by
 *    (chainId, contract address, tokenId).
 */
contract NFTCollection is ERC721URIStorage {
    /// @dev Next token id to mint. Starts at 1 so 0 can never be a valid id.
    uint256 private _nextTokenId = 1;

    /// @notice Original minter of each token (never changes, even after sales).
    mapping(uint256 tokenId => address creator) public creatorOf;

    /// @notice Emitted once per mint, with everything the backend needs to index it.
    event NFTMinted(uint256 indexed tokenId, address indexed creator, string tokenURI);

    error EmptyTokenURI();

    constructor() ERC721("Mintverse NFT", "MNFT") {}

    /**
     * @notice Mints a new NFT to the caller.
     * @param uri The metadata URI, typically "ipfs://<metadataCID>".
     * @return tokenId The id of the new token.
     */
    function mint(string calldata uri) external returns (uint256 tokenId) {
        if (bytes(uri).length == 0) revert EmptyTokenURI();

        // Effects first...
        tokenId = _nextTokenId++;
        creatorOf[tokenId] = msg.sender;
        _setTokenURI(tokenId, uri);

        // ...then the only external call: _safeMint checks that a contract
        // receiver can handle NFTs (onERC721Received), so tokens aren't lost.
        _safeMint(msg.sender, tokenId);

        emit NFTMinted(tokenId, msg.sender, uri);
    }

    /// @notice Number of tokens minted so far (no burn function exists).
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }
}
