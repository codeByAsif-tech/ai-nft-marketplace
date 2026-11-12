import mongoose from 'mongoose';

/**
 * One-time challenge for linking a wallet to a user account.
 * - Bound to one user, one address and one chain.
 * - The exact message to sign is stored server-side, so the client can't alter it.
 * - `usedAt` is set atomically when consumed, so a nonce can never be used twice.
 * - Expired documents are deleted by a TTL index (cleanup only; expiry is also
 *   checked in every query because TTL deletion can lag by ~60 seconds).
 */
const walletNonceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    address: { type: String, required: true, lowercase: true },
    chainId: { type: Number, required: true },
    nonce: { type: String, required: true, unique: true },
    message: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

walletNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WalletNonce = mongoose.model('WalletNonce', walletNonceSchema);
