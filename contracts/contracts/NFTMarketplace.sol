// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NFTMarketplace
 * @notice Simple fixed-price marketplace for ERC-721 tokens.
 *
 * Security model:
 *  - ESCROW: listing transfers the NFT into this contract. While listed, the
 *    seller can't transfer or sell it anywhere else, so a listing can never
 *    point at an NFT the seller no longer owns.
 *  - PULL PAYMENTS: a sale never sends ETH to the seller. It credits
 *    `proceeds[seller]`, and the seller withdraws later. A seller contract that
 *    rejects ETH therefore can't block purchases.
 *  - CHECKS-EFFECTS-INTERACTIONS + ReentrancyGuard on every state-changing
 *    function: state is updated before any external call, and re-entering
 *    any guarded function during a call reverts.
 *  - No owner, no admin, no fees: there is no privileged key.
 *  - The contract rejects plain ETH transfers (no receive/fallback) and NFTs
 *    sent to it directly (only its own escrow transfers are accepted).
 */
contract NFTMarketplace is ReentrancyGuard, IERC721Receiver {
    struct Listing {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 price; // in wei
        bool active;
    }

    /// @dev Listing ids start at 1; 0 means "no listing".
    uint256 public nextListingId = 1;

    mapping(uint256 listingId => Listing) private _listings;

    /// @notice ETH (wei) each seller can withdraw.
    mapping(address seller => uint256 amount) public proceeds;

    event ItemListed(
        uint256 indexed listingId,
        address indexed seller,
        address indexed nft,
        uint256 tokenId,
        uint256 price
    );
    event ItemSold(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        address nft,
        uint256 tokenId,
        uint256 price
    );
    event ListingCancelled(uint256 indexed listingId, address indexed seller, address indexed nft, uint256 tokenId);
    event ProceedsWithdrawn(address indexed seller, uint256 amount);

    error PriceMustBeAboveZero();
    error NotTokenOwner();
    error MarketplaceNotApproved();
    error EscrowFailed();
    error ListingNotActive(uint256 listingId);
    error NotSeller();
    error CannotBuyOwnListing();
    error IncorrectPayment(uint256 expected, uint256 sent);
    error NoProceeds();
    error WithdrawFailed();
    error DirectTransfersNotAccepted();

    // ------------------------------------------------------------------ list

    /**
     * @notice Lists an NFT for a fixed price and moves it into escrow.
     * @dev The caller must own the token and have approved this contract
     *      (approve(marketplace, tokenId) or setApprovalForAll(marketplace, true)).
     */
    function listItem(address nft, uint256 tokenId, uint256 price) external nonReentrant returns (uint256 listingId) {
        // Checks
        if (price == 0) revert PriceMustBeAboveZero();
        IERC721 token = IERC721(nft);
        if (token.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (token.getApproved(tokenId) != address(this) && !token.isApprovedForAll(msg.sender, address(this))) {
            revert MarketplaceNotApproved();
        }

        // Effects
        listingId = nextListingId++;
        _listings[listingId] = Listing({seller: msg.sender, nft: nft, tokenId: tokenId, price: price, active: true});
        emit ItemListed(listingId, msg.sender, nft, tokenId, price);

        // Interaction: take custody of the NFT.
        token.safeTransferFrom(msg.sender, address(this), tokenId);
        // Don't trust the NFT contract blindly: confirm custody actually moved.
        if (token.ownerOf(tokenId) != address(this)) revert EscrowFailed();
    }

    // ------------------------------------------------------------------- buy

    /**
     * @notice Buys an active listing. msg.value must equal the price exactly.
     * @dev The seller is paid via `proceeds` (pull payment), not directly.
     */
    function buyItem(uint256 listingId) external payable nonReentrant {
        Listing storage listing = _listings[listingId];

        // Checks
        if (!listing.active) revert ListingNotActive(listingId);
        if (msg.sender == listing.seller) revert CannotBuyOwnListing();
        if (msg.value != listing.price) revert IncorrectPayment(listing.price, msg.value);

        // Effects: close the listing BEFORE any external call, so it can't be bought twice.
        listing.active = false;
        proceeds[listing.seller] += msg.value;
        emit ItemSold(listingId, msg.sender, listing.seller, listing.nft, listing.tokenId, listing.price);

        // Interaction: deliver the NFT. safeTransferFrom makes sure a contract
        // buyer can actually hold NFTs, otherwise the whole purchase reverts.
        IERC721(listing.nft).safeTransferFrom(address(this), msg.sender, listing.tokenId);
    }

    // ---------------------------------------------------------------- cancel

    /// @notice Cancels your own active listing and returns the NFT to you.
    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = _listings[listingId];

        if (!listing.active) revert ListingNotActive(listingId);
        if (msg.sender != listing.seller) revert NotSeller();

        listing.active = false;
        emit ListingCancelled(listingId, listing.seller, listing.nft, listing.tokenId);

        // Plain transferFrom back to the original owner: they held it before,
        // and a seller contract without onERC721Received must not get stuck.
        IERC721(listing.nft).transferFrom(address(this), listing.seller, listing.tokenId);
    }

    // -------------------------------------------------------------- withdraw

    /// @notice Withdraws all ETH you have earned from sales.
    function withdrawProceeds() external nonReentrant {
        uint256 amount = proceeds[msg.sender];
        if (amount == 0) revert NoProceeds();

        // Effects before the interaction: zero the balance first.
        proceeds[msg.sender] = 0;
        emit ProceedsWithdrawn(msg.sender, amount);

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }

    // ------------------------------------------------------------------ view

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _listings[listingId];
    }

    // ------------------------------------------------------------- receiver

    /**
     * @dev Only accepts NFTs this contract pulled in itself during listItem.
     *      NFTs sent here directly would have no listing and be stuck forever.
     */
    function onERC721Received(address operator, address, uint256, bytes calldata) external view returns (bytes4) {
        if (operator != address(this)) revert DirectTransfersNotAccepted();
        return IERC721Receiver.onERC721Received.selector;
    }
}
