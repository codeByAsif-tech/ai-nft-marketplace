// Plain JavaScript syntax in a .ts file (Hardhat 3 runs TypeScript test files).
// Everything runs on Hardhat's in-memory chain with its built-in test accounts:
// no real ETH, no real private keys.
import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { loadFixture } = networkHelpers;

const PRICE = ethers.parseEther("0.05");
const URI = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const REENTRANCY_ERROR = ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10);

async function deployFixture({ ethers }) {
  const [deployer, seller, buyer, other] = await ethers.getSigners();
  const nft = await ethers.deployContract("NFTCollection");
  const market = await ethers.deployContract("NFTMarketplace");
  const nftAddress = await nft.getAddress();
  const marketAddress = await market.getAddress();
  return { nft, market, nftAddress, marketAddress, deployer, seller, buyer, other };
}

/** Seller has minted token 1, approved the marketplace and listed it as listing 1. */
async function listedFixture(connection) {
  const ctx = await deployFixture(connection);
  const { nft, market, nftAddress, marketAddress, seller } = ctx;
  await nft.connect(seller).mint(URI);
  await nft.connect(seller).approve(marketAddress, 1n);
  await market.connect(seller).listItem(nftAddress, 1n, PRICE);
  return { ...ctx, tokenId: 1n, listingId: 1n };
}

/** Listing 1 has been bought by `buyer`, so `seller` has PRICE in proceeds. */
async function soldFixture(connection) {
  const ctx = await listedFixture(connection);
  await ctx.market.connect(ctx.buyer).buyItem(ctx.listingId, { value: PRICE });
  return ctx;
}

const balanceOf = (address) => ethers.provider.getBalance(address);

describe("NFTMarketplace", function () {
  // ------------------------------------------------------------------ listing
  describe("listItem", function () {
    it("lists the NFT and moves it into escrow", async function () {
      const { nft, market, nftAddress, marketAddress, seller } = await loadFixture(deployFixture);
      await nft.connect(seller).mint(URI);
      await nft.connect(seller).approve(marketAddress, 1n);

      await expect(market.connect(seller).listItem(nftAddress, 1n, PRICE))
        .to.emit(market, "ItemListed")
        .withArgs(1n, seller.address, nftAddress, 1n, PRICE);

      expect(await nft.ownerOf(1n)).to.equal(marketAddress); // escrow
      const listing = await market.getListing(1n);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.nft).to.equal(nftAddress);
      expect(listing.tokenId).to.equal(1n);
      expect(listing.price).to.equal(PRICE);
      expect(listing.active).to.equal(true);
      expect(await market.nextListingId()).to.equal(2n);
    });

    it("works with setApprovalForAll as well", async function () {
      const { nft, market, nftAddress, marketAddress, seller } = await loadFixture(deployFixture);
      await nft.connect(seller).mint(URI);
      await nft.connect(seller).setApprovalForAll(marketAddress, true);
      await expect(market.connect(seller).listItem(nftAddress, 1n, PRICE)).to.emit(market, "ItemListed");
    });

    it("rejects listing an NFT you don't own (unauthorized listing)", async function () {
      const { nft, market, nftAddress, marketAddress, seller, other } = await loadFixture(deployFixture);
      await nft.connect(seller).mint(URI);
      await nft.connect(seller).approve(marketAddress, 1n);

      await expect(market.connect(other).listItem(nftAddress, 1n, PRICE)).to.be.revertedWithCustomError(
        market,
        "NotTokenOwner",
      );
    });

    it("rejects listing without approving the marketplace", async function () {
      const { nft, market, nftAddress, seller } = await loadFixture(deployFixture);
      await nft.connect(seller).mint(URI);
      await expect(market.connect(seller).listItem(nftAddress, 1n, PRICE)).to.be.revertedWithCustomError(
        market,
        "MarketplaceNotApproved",
      );
    });

    it("rejects a zero price", async function () {
      const { nft, market, nftAddress, marketAddress, seller } = await loadFixture(deployFixture);
      await nft.connect(seller).mint(URI);
      await nft.connect(seller).approve(marketAddress, 1n);
      await expect(market.connect(seller).listItem(nftAddress, 1n, 0n)).to.be.revertedWithCustomError(
        market,
        "PriceMustBeAboveZero",
      );
    });

    it("rejects a token that doesn't exist", async function () {
      const { nft, market, nftAddress, seller } = await loadFixture(deployFixture);
      await expect(market.connect(seller).listItem(nftAddress, 42n, PRICE)).to.be.revertedWithCustomError(
        nft,
        "ERC721NonexistentToken",
      );
    });

    it("prevents listing the same NFT twice (it's already in escrow)", async function () {
      const { market, nftAddress, seller, tokenId } = await loadFixture(listedFixture);
      await expect(market.connect(seller).listItem(nftAddress, tokenId, PRICE)).to.be.revertedWithCustomError(
        market,
        "NotTokenOwner",
      );
    });

    it("stops the seller from moving a listed NFT elsewhere (escrow)", async function () {
      const { nft, seller, other, tokenId } = await loadFixture(listedFixture);
      await expect(nft.connect(seller).transferFrom(seller.address, other.address, tokenId))
        .to.be.revertedWithCustomError(nft, "ERC721InsufficientApproval")
        .withArgs(seller.address, tokenId);
    });

    it("rejects NFTs sent to the marketplace directly (they would be stuck)", async function () {
      const { nft, market, marketAddress, seller } = await loadFixture(deployFixture);
      await nft.connect(seller).mint(URI);
      await expect(
        nft.connect(seller)["safeTransferFrom(address,address,uint256)"](seller.address, marketAddress, 1n),
      ).to.be.revertedWithCustomError(market, "DirectTransfersNotAccepted");
    });
  });

  // ------------------------------------------------------------------- buying
  describe("buyItem", function () {
    it("transfers the NFT to the buyer and credits the seller's proceeds", async function () {
      const { nft, market, nftAddress, marketAddress, seller, buyer, listingId, tokenId } =
        await loadFixture(listedFixture);
      const marketBefore = await balanceOf(marketAddress);

      await expect(market.connect(buyer).buyItem(listingId, { value: PRICE }))
        .to.emit(market, "ItemSold")
        .withArgs(listingId, buyer.address, seller.address, nftAddress, tokenId, PRICE);

      expect(await nft.ownerOf(tokenId)).to.equal(buyer.address);
      expect((await market.getListing(listingId)).active).to.equal(false);
      expect(await market.proceeds(seller.address)).to.equal(PRICE);
      expect(await balanceOf(marketAddress)).to.equal(marketBefore + PRICE); // held until withdrawn
    });

    it("charges the buyer exactly the price (gas excluded)", async function () {
      const { market, buyer, listingId } = await loadFixture(listedFixture);
      await expect(market.connect(buyer).buyItem(listingId, { value: PRICE })).to.changeEtherBalance(
        ethers,
        buyer,
        -PRICE,
      );
    });

    it("does not send ETH to the seller during the sale (pull payments)", async function () {
      const { market, seller, buyer, listingId } = await loadFixture(listedFixture);
      await expect(market.connect(buyer).buyItem(listingId, { value: PRICE })).to.changeEtherBalance(
        ethers,
        seller,
        0n,
      );
    });

    it("rejects paying too little", async function () {
      const { market, buyer, listingId } = await loadFixture(listedFixture);
      const tooLittle = PRICE - 1n;
      await expect(market.connect(buyer).buyItem(listingId, { value: tooLittle }))
        .to.be.revertedWithCustomError(market, "IncorrectPayment")
        .withArgs(PRICE, tooLittle);
    });

    it("rejects paying too much (no silent overpayment)", async function () {
      const { market, buyer, listingId } = await loadFixture(listedFixture);
      const tooMuch = PRICE + 1n;
      await expect(market.connect(buyer).buyItem(listingId, { value: tooMuch }))
        .to.be.revertedWithCustomError(market, "IncorrectPayment")
        .withArgs(PRICE, tooMuch);
    });

    it("rejects a double purchase", async function () {
      const { market, other, listingId } = await loadFixture(soldFixture);
      await expect(market.connect(other).buyItem(listingId, { value: PRICE }))
        .to.be.revertedWithCustomError(market, "ListingNotActive")
        .withArgs(listingId);
    });

    it("rejects buying your own listing", async function () {
      const { market, seller, listingId } = await loadFixture(listedFixture);
      await expect(market.connect(seller).buyItem(listingId, { value: PRICE })).to.be.revertedWithCustomError(
        market,
        "CannotBuyOwnListing",
      );
    });

    it("rejects a listing that doesn't exist", async function () {
      const { market, buyer } = await loadFixture(listedFixture);
      await expect(market.connect(buyer).buyItem(999n, { value: PRICE }))
        .to.be.revertedWithCustomError(market, "ListingNotActive")
        .withArgs(999n);
    });

    it("reverts the whole purchase if a contract buyer can't hold NFTs", async function () {
      const { nft, market, buyer, listingId, marketAddress } = await loadFixture(listedFixture);
      const nonReceiver = await ethers.deployContract("NonReceiverBuyer", [marketAddress]);

      await expect(nonReceiver.connect(buyer).buy(listingId, { value: PRICE })).to.be.revertedWithCustomError(
        nft,
        "ERC721InvalidReceiver",
      );
      expect((await market.getListing(listingId)).active).to.equal(true); // nothing changed
    });

    it("rejects plain ETH sent to the marketplace", async function () {
      const { buyer, marketAddress } = await loadFixture(deployFixture);
      await expect(buyer.sendTransaction({ to: marketAddress, value: 1n })).to.be.revertedWithoutReason(ethers);
    });
  });

  // --------------------------------------------------------------- cancelling
  describe("cancelListing", function () {
    it("returns the NFT to the seller and closes the listing", async function () {
      const { nft, market, nftAddress, seller, listingId, tokenId } = await loadFixture(listedFixture);

      await expect(market.connect(seller).cancelListing(listingId))
        .to.emit(market, "ListingCancelled")
        .withArgs(listingId, seller.address, nftAddress, tokenId);

      expect(await nft.ownerOf(tokenId)).to.equal(seller.address);
      expect((await market.getListing(listingId)).active).to.equal(false);
    });

    it("only lets the seller cancel", async function () {
      const { market, other, listingId } = await loadFixture(listedFixture);
      await expect(market.connect(other).cancelListing(listingId)).to.be.revertedWithCustomError(market, "NotSeller");
    });

    it("rejects buying a cancelled listing", async function () {
      const { market, seller, buyer, listingId } = await loadFixture(listedFixture);
      await market.connect(seller).cancelListing(listingId);
      await expect(market.connect(buyer).buyItem(listingId, { value: PRICE }))
        .to.be.revertedWithCustomError(market, "ListingNotActive")
        .withArgs(listingId);
    });

    it("rejects cancelling twice, or cancelling a sold listing", async function () {
      const listed = await loadFixture(listedFixture);
      await listed.market.connect(listed.seller).cancelListing(listed.listingId);
      await expect(listed.market.connect(listed.seller).cancelListing(listed.listingId)).to.be.revertedWithCustomError(
        listed.market,
        "ListingNotActive",
      );

      const sold = await loadFixture(soldFixture);
      await expect(sold.market.connect(sold.seller).cancelListing(sold.listingId)).to.be.revertedWithCustomError(
        sold.market,
        "ListingNotActive",
      );
    });

    it("allows listing again after cancelling (new listing id)", async function () {
      const { nft, market, nftAddress, marketAddress, seller, listingId, tokenId } = await loadFixture(listedFixture);
      await market.connect(seller).cancelListing(listingId);
      await nft.connect(seller).approve(marketAddress, tokenId);

      await expect(market.connect(seller).listItem(nftAddress, tokenId, PRICE * 2n))
        .to.emit(market, "ItemListed")
        .withArgs(2n, seller.address, nftAddress, tokenId, PRICE * 2n);
    });
  });

  // ------------------------------------------------------------ withdrawals
  describe("withdrawProceeds", function () {
    it("pays the seller their proceeds and resets them to zero", async function () {
      const { market, seller } = await loadFixture(soldFixture);

      await expect(market.connect(seller).withdrawProceeds())
        .to.emit(market, "ProceedsWithdrawn")
        .withArgs(seller.address, PRICE);
      expect(await market.proceeds(seller.address)).to.equal(0n);
    });

    it("increases the seller's balance by exactly the proceeds (gas excluded)", async function () {
      const { market, seller } = await loadFixture(soldFixture);
      await expect(market.connect(seller).withdrawProceeds()).to.changeEtherBalance(ethers, seller, PRICE);
    });

    it("rejects withdrawing with no proceeds, and withdrawing twice", async function () {
      const { market, seller, other } = await loadFixture(soldFixture);
      await expect(market.connect(other).withdrawProceeds()).to.be.revertedWithCustomError(market, "NoProceeds");

      await market.connect(seller).withdrawProceeds();
      await expect(market.connect(seller).withdrawProceeds()).to.be.revertedWithCustomError(market, "NoProceeds");
    });

    it("adds up proceeds from several sales", async function () {
      const { nft, market, nftAddress, marketAddress, seller, buyer } = await loadFixture(soldFixture);
      await nft.connect(seller).mint(URI); // token 2
      await nft.connect(seller).approve(marketAddress, 2n);
      await market.connect(seller).listItem(nftAddress, 2n, PRICE * 3n); // listing 2
      await market.connect(buyer).buyItem(2n, { value: PRICE * 3n });

      expect(await market.proceeds(seller.address)).to.equal(PRICE * 4n);
    });

    it("keeps the proceeds if the payout fails (seller can't receive ETH)", async function () {
      const { nft, market, nftAddress, marketAddress, buyer } = await loadFixture(deployFixture);
      const rejecting = await ethers.deployContract("EthRejectingSeller", [marketAddress]);
      const rejectingAddress = await rejecting.getAddress();
      await rejecting.mintAndList(nftAddress, URI, PRICE); // token 1, listing 1

      // The sale still works: the seller isn't paid during the purchase.
      await market.connect(buyer).buyItem(1n, { value: PRICE });
      expect(await nft.ownerOf(1n)).to.equal(buyer.address);

      await expect(rejecting.withdraw()).to.be.revertedWithCustomError(market, "WithdrawFailed");
      expect(await market.proceeds(rejectingAddress)).to.equal(PRICE); // not lost
    });
  });

  // ---------------------------------------------------------------- reentrancy
  describe("reentrancy protection", function () {
    it("a malicious seller can't withdraw twice by re-entering withdrawProceeds()", async function () {
      const { market, nftAddress, marketAddress, buyer } = await loadFixture(deployFixture);
      const attacker = await ethers.deployContract("ReentrantSeller", [marketAddress]);
      const attackerAddress = await attacker.getAddress();
      await attacker.mintAndList(nftAddress, URI, PRICE); // listing 1

      // Another sale so the marketplace holds extra ETH the attacker would love to steal.
      const [, , , , victimSeller] = await ethers.getSigners();
      const nft = await ethers.getContractAt("NFTCollection", nftAddress);
      await nft.connect(victimSeller).mint(URI); // token 2
      await nft.connect(victimSeller).approve(marketAddress, 2n);
      await market.connect(victimSeller).listItem(nftAddress, 2n, PRICE); // listing 2
      await market.connect(buyer).buyItem(1n, { value: PRICE });
      await market.connect(buyer).buyItem(2n, { value: PRICE });
      expect(await balanceOf(marketAddress)).to.equal(PRICE * 2n);

      // The attacker receives its proceeds exactly once.
      await expect(attacker.withdraw()).to.changeEtherBalance(ethers, attackerAddress, PRICE);

      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.reentryBlocked()).to.equal(true);
      expect((await attacker.reentryError()).slice(0, 10)).to.equal(REENTRANCY_ERROR);
      expect(await market.proceeds(attackerAddress)).to.equal(0n);
      // The other seller's money is untouched.
      expect(await balanceOf(marketAddress)).to.equal(PRICE);
      expect(await market.proceeds(victimSeller.address)).to.equal(PRICE);
    });

    it("a malicious buyer can't buy the same listing again from inside onERC721Received", async function () {
      const { nft, market, marketAddress, seller, buyer, listingId, tokenId } = await loadFixture(listedFixture);
      const attacker = await ethers.deployContract("ReentrantBuyer", [marketAddress]);
      const attackerAddress = await attacker.getAddress();

      await attacker.connect(buyer).buy(listingId, { value: PRICE });

      expect(await nft.ownerOf(tokenId)).to.equal(attackerAddress);
      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.buyAgainBlocked()).to.equal(true);
      expect((await attacker.buyAgainError()).slice(0, 10)).to.equal(REENTRANCY_ERROR);
      // Seller credited exactly once.
      expect(await market.proceeds(seller.address)).to.equal(PRICE);
      expect(await balanceOf(marketAddress)).to.equal(PRICE);
    });
  });
});
