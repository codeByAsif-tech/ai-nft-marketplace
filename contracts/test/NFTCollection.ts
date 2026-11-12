// Plain JavaScript syntax in a .ts file (Hardhat 3 runs TypeScript test files).
import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { loadFixture } = networkHelpers;

const URI_1 = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const URI_2 = "ipfs://bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";

async function deployCollectionFixture({ ethers }) {
  const [deployer, alice, bob] = await ethers.getSigners();
  const nft = await ethers.deployContract("NFTCollection");
  return { nft, deployer, alice, bob };
}

describe("NFTCollection", function () {
  describe("deployment", function () {
    it("has a name and symbol, and nothing minted", async function () {
      const { nft } = await loadFixture(deployCollectionFixture);
      expect(await nft.name()).to.equal("Mintverse NFT");
      expect(await nft.symbol()).to.equal("MNFT");
      expect(await nft.totalMinted()).to.equal(0n);
    });

    it("supports ERC-721, ERC-721 Metadata and ERC-4906 interfaces", async function () {
      const { nft } = await loadFixture(deployCollectionFixture);
      expect(await nft.supportsInterface("0x80ac58cd")).to.equal(true); // ERC-721
      expect(await nft.supportsInterface("0x5b5e139f")).to.equal(true); // ERC-721 Metadata
      expect(await nft.supportsInterface("0x49064906")).to.equal(true); // ERC-4906 metadata updates
      expect(await nft.supportsInterface("0xffffffff")).to.equal(false);
    });
  });

  describe("mint", function () {
    it("mints token 1 to the caller and stores its IPFS metadata URI", async function () {
      const { nft, alice } = await loadFixture(deployCollectionFixture);

      const tx = nft.connect(alice).mint(URI_1);
      await expect(tx).to.emit(nft, "NFTMinted").withArgs(1n, alice.address, URI_1);
      await expect(tx).to.emit(nft, "Transfer").withArgs(ethers.ZeroAddress, alice.address, 1n);

      expect(await nft.ownerOf(1n)).to.equal(alice.address);
      expect(await nft.tokenURI(1n)).to.equal(URI_1);
      expect(await nft.creatorOf(1n)).to.equal(alice.address);
      expect(await nft.balanceOf(alice.address)).to.equal(1n);
      expect(await nft.totalMinted()).to.equal(1n);
    });

    it("gives each mint a new id and keeps each token's own URI", async function () {
      const { nft, alice, bob } = await loadFixture(deployCollectionFixture);
      await nft.connect(alice).mint(URI_1);
      await nft.connect(bob).mint(URI_2);

      expect(await nft.ownerOf(2n)).to.equal(bob.address);
      expect(await nft.tokenURI(1n)).to.equal(URI_1);
      expect(await nft.tokenURI(2n)).to.equal(URI_2);
      expect(await nft.totalMinted()).to.equal(2n);
    });

    it("returns the new token id from mint()", async function () {
      const { nft, alice } = await loadFixture(deployCollectionFixture);
      expect(await nft.connect(alice).mint.staticCall(URI_1)).to.equal(1n);
    });

    it("rejects an empty token URI", async function () {
      const { nft, alice } = await loadFixture(deployCollectionFixture);
      await expect(nft.connect(alice).mint("")).to.be.revertedWithCustomError(nft, "EmptyTokenURI");
    });

    it("has no admin: the deployer is just another account", async function () {
      const { nft, deployer, alice } = await loadFixture(deployCollectionFixture);
      await nft.connect(alice).mint(URI_1);
      // The deployer can't move someone else's token.
      await expect(nft.connect(deployer).transferFrom(alice.address, deployer.address, 1n))
        .to.be.revertedWithCustomError(nft, "ERC721InsufficientApproval")
        .withArgs(deployer.address, 1n);
    });
  });

  describe("ownership", function () {
    it("lets the owner transfer, and keeps the original creator", async function () {
      const { nft, alice, bob } = await loadFixture(deployCollectionFixture);
      await nft.connect(alice).mint(URI_1);
      await nft.connect(alice).transferFrom(alice.address, bob.address, 1n);

      expect(await nft.ownerOf(1n)).to.equal(bob.address);
      expect(await nft.creatorOf(1n)).to.equal(alice.address);
      expect(await nft.tokenURI(1n)).to.equal(URI_1);
    });

    it("reverts tokenURI for a token that doesn't exist", async function () {
      const { nft } = await loadFixture(deployCollectionFixture);
      await expect(nft.tokenURI(99n)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken").withArgs(99n);
    });
  });
});
