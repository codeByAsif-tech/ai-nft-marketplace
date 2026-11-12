import mongoose from 'mongoose';

/**
 * On-chain activity the backend has verified (mints now; listings, sales and
 * cancellations in Phase 8). Used for history and dashboards.
 */
export const TRANSACTION_TYPES = Object.freeze({
  MINT: 'MINT',
  LIST: 'LIST',
  BUY: 'BUY',
  TRANSFER: 'TRANSFER',
  CANCEL: 'CANCEL',
});
export const TRANSACTION_STATUS = Object.freeze({ PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', FAILED: 'FAILED' });

const transactionSchema = new mongoose.Schema(
  {
    nft: { type: mongoose.Schema.Types.ObjectId, ref: 'NFT', default: null },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    fromAddress: { type: String, lowercase: true, default: null },
    toAddress: { type: String, lowercase: true, default: null },
    transactionHash: { type: String, required: true, lowercase: true },
    logIndex: { type: Number, default: 0 },
    transactionType: { type: String, enum: Object.values(TRANSACTION_TYPES), required: true },
    price: { type: String, default: null }, // wei, as a decimal string
    blockchain: { type: String, required: true },
    chainId: { type: Number, required: true },
    blockNumber: { type: Number, default: null },
    status: { type: String, enum: Object.values(TRANSACTION_STATUS), default: TRANSACTION_STATUS.CONFIRMED },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Prevents processing the same on-chain event twice.
transactionSchema.index({ chainId: 1, transactionHash: 1, transactionType: 1, logIndex: 1 }, { unique: true });
transactionSchema.index({ fromAddress: 1, createdAt: -1 });
transactionSchema.index({ toAddress: 1, createdAt: -1 });

transactionSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Transaction = mongoose.model('Transaction', transactionSchema);
