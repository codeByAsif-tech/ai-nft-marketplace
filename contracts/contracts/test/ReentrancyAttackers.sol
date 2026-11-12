// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// TEST-ONLY contracts used by the unit tests to attack NFTMarketplace.
// They are never deployed outside the local Hardhat test network.

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IMarketplace {
    function listItem(address nft, uint256 tokenId, uint256 price) external returns (uint256);
    function buyItem(uint256 listingId) external payable;
    function cancelListing(uint256 listingId) external;
    function withdrawProceeds() external;
}

interface IMintable {
    function mint(string calldata uri) external returns (uint256);
}

/**
 * A malicious SELLER: when the marketplace pays out its proceeds, its receive()
 * immediately tries to call withdrawProceeds() again to drain extra ETH.
 */
contract ReentrantSeller is IERC721Receiver {
    IMarketplace public immutable marketplace;
    bool public reentryAttempted;
    bool public reentryBlocked;
    bytes public reentryError;

    constructor(address marketplace_) {
        marketplace = IMarketplace(marketplace_);
    }

    function mintAndList(address nft, string calldata uri, uint256 price) external returns (uint256 listingId) {
        uint256 tokenId = IMintable(nft).mint(uri);
        IERC721(nft).approve(address(marketplace), tokenId);
        listingId = marketplace.listItem(nft, tokenId, price);
    }

    function withdraw() external {
        marketplace.withdrawProceeds();
    }

    receive() external payable {
        if (reentryAttempted) return;
        reentryAttempted = true;
        // Swallow the inner error so the outer withdrawal can finish and we can
        // prove the attacker received the money exactly once.
        try marketplace.withdrawProceeds() {
            reentryBlocked = false;
        } catch (bytes memory reason) {
            reentryBlocked = true;
            reentryError = reason;
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

/**
 * A malicious BUYER: when the NFT arrives (onERC721Received), it tries to buy
 * the same listing again, and to cancel it, while still inside buyItem().
 */
contract ReentrantBuyer is IERC721Receiver {
    IMarketplace public immutable marketplace;
    uint256 public targetListingId;
    bool public reentryAttempted;
    bool public buyAgainBlocked;
    bytes public buyAgainError;

    constructor(address marketplace_) {
        marketplace = IMarketplace(marketplace_);
    }

    function buy(uint256 listingId) external payable {
        targetListingId = listingId;
        marketplace.buyItem{value: msg.value}(listingId);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (!reentryAttempted) {
            reentryAttempted = true;
            try marketplace.buyItem{value: 0}(targetListingId) {
                buyAgainBlocked = false;
            } catch (bytes memory reason) {
                buyAgainBlocked = true;
                buyAgainError = reason;
            }
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}

/** A contract that can't receive ETH: used to show withdrawals fail safely. */
contract EthRejectingSeller is IERC721Receiver {
    IMarketplace public immutable marketplace;

    constructor(address marketplace_) {
        marketplace = IMarketplace(marketplace_);
    }

    function mintAndList(address nft, string calldata uri, uint256 price) external returns (uint256 listingId) {
        uint256 tokenId = IMintable(nft).mint(uri);
        IERC721(nft).approve(address(marketplace), tokenId);
        listingId = marketplace.listItem(nft, tokenId, price);
    }

    function withdraw() external {
        marketplace.withdrawProceeds();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
    // No receive() / fallback(): any ETH sent here reverts.
}

/** A contract with no onERC721Received: can't hold NFTs via safeTransferFrom. */
contract NonReceiverBuyer {
    IMarketplace public immutable marketplace;

    constructor(address marketplace_) {
        marketplace = IMarketplace(marketplace_);
    }

    function buy(uint256 listingId) external payable {
        marketplace.buyItem{value: msg.value}(listingId);
    }
}
