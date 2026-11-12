import mongoose from 'mongoose';

/**
 * A fixed-price marketplace listing, recorded only after the backend verified
 * the ItemListed event on-chain. The marketplace contract is the source of
 * truth; this document is a searchable index of it.
 */
export const LISTING_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', SOLD: 'SOLD', CANCELLED: 'CANCELLED' });

const listingSchema = new mongoose.Schema(
  {
    nft: { type: mongoose.Schema.Types.ObjectId, ref: 'NFT', required: true },
    nftName: { type: String, default: '' }, // copy for search
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sellerWallet: { type: String, required: true, lowercase: true },

    // On-chain identity of the listing
    listingId: { type: String, required: true }, // uint256 as decimal string
    contractAddress: { type: String, required: true, lowercase: true }, // marketplace
    nftContract: { type: String, required: true, lowercase: true },
    tokenId: { type: String, required: true },
    blockchain: { type: String, required: true },
    chainId: { type: Number, required: true },

    price: { type: String, required: true }, // wei, decimal string (exact)
    priceEth: { type: Number, required: true }, // for sorting/filtering only
    currency: { type: String, default: 'ETH' },

    listingStatus: { type: String, enum: Object.values(LISTING_STATUS), default: LISTING_STATUS.ACTIVE },
    transactionHash: { type: String, required: true, lowercase: true }, // the listing tx

    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    buyerWallet: { type: String, lowercase: true, default: null },
    saleTxHash: { type: String, lowercase: true, default: null },
    soldAt: { type: Date, default: null },
    cancelTxHash: { type: String, lowercase: true, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One record per on-chain listing.
listingSchema.index({ chainId: 1, contractAddress: 1, listingId: 1 }, { unique: true });
// At most one ACTIVE listing per NFT (escrow makes a second one impossible on-chain too).
listingSchema.index(
  { nft: 1 },
  { unique: true, partialFilterExpression: { listingStatus: LISTING_STATUS.ACTIVE } }
);
listingSchema.index({ listingStatus: 1, createdAt: -1 });
listingSchema.index({ listingStatus: 1, chainId: 1, priceEth: 1 });
listingSchema.index({ sellerWallet: 1, listingStatus: 1 });

listingSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Listing = mongoose.model('Listing', listingSchema);
