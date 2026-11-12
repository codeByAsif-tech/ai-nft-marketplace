import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploys the NFT contract and the marketplace. Neither has constructor
// arguments or an owner, so the deployer gets no special powers.
export default buildModule("MarketplaceModule", (m) => {
  const nftCollection = m.contract("NFTCollection");
  const nftMarketplace = m.contract("NFTMarketplace");

  return { nftCollection, nftMarketplace };
});
