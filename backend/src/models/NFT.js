import mongoose from 'mongoose';
import { env } from '../config/env.js';

/**
 * A minted NFT, recorded only after the backend verified the mint transaction
 * on-chain. The blockchain stays the source of truth for ownership:
 * `ownerAddress` is a cache that is refreshed from ownerOf().
 *
 * Identity: (chainId, contractAddress, tokenId). Token 1 on Sepolia is a
 * different NFT from token 1 on Base Sepolia.
 */
export const MINT_STATUS = Object.freeze({ CONFIRMED: 'CONFIRMED' });

const attributeSchema = new mongoose.Schema(
  { trait_type: { type: String, required: true }, value: { type: String, required: true } },
  { _id: false }
);

const nftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    image: { type: String, required: true }, // ipfs://<imageCID>
    imageCID: { type: String, required: true },
    metadataURI: { type: String, required: true }, // ipfs://<metadataCID> == on-chain tokenURI
    metadataCID: { type: String, required: true },
    attributes: { type: [attributeSchema], default: [] },
    collectionName: { type: String, default: '' },

    tokenId: { type: String, required: true }, // uint256 as a decimal string (can exceed JS numbers)
    contractAddress: { type: String, required: true, lowercase: true },
    ownerAddress: { type: String, required: true, lowercase: true },
    ownerVerifiedAt: { type: Date, default: null },

    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    creatorAddress: { type: String, required: true, lowercase: true },
    generation: { type: mongoose.Schema.Types.ObjectId, ref: 'AIGeneration', default: null },

    blockchain: { type: String, required: true }, // network key, e.g. "sepolia"
    chainId: { type: Number, required: true },
    transactionHash: { type: String, required: true, lowercase: true },
    blockNumber: { type: Number, required: true },
    mintStatus: { type: String, enum: Object.values(MINT_STATUS), default: MINT_STATUS.CONFIRMED },

    // Set while listed for sale (the NFT is then held in escrow by the marketplace,
    // so ownerAddress is the marketplace contract until it sells or is cancelled).
    activeListing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null },
  },
  { timestamps: true }
);

// One record per on-chain token, and one per mint transaction: the DB itself
// refuses duplicates, even if two requests race.
nftSchema.index({ chainId: 1, contractAddress: 1, tokenId: 1 }, { unique: true });
nftSchema.index({ chainId: 1, transactionHash: 1 }, { unique: true });
nftSchema.index({ ownerAddress: 1, createdAt: -1 });
nftSchema.index({ creator: 1, createdAt: -1 });

nftSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    ret.imageGatewayUrl = ret.imageCID ? `${env.ipfs.gatewayUrl}/${ret.imageCID}` : null;
    ret.metadataGatewayUrl = ret.metadataCID ? `${env.ipfs.gatewayUrl}/${ret.metadataCID}` : null;
    return ret;
  },
});

export const NFT = mongoose.model('NFT', nftSchema);
