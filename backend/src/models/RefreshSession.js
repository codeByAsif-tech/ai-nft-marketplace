import mongoose from 'mongoose';

export const REVOKE_REASONS = Object.freeze({
  LOGOUT: 'logout', // user logged out on this device
  LOGOUT_ALL: 'logout_all', // user logged out of all devices
  REUSE: 'reuse', // an already-rotated token was presented again (likely stolen)
  REPLACED: 'replaced', // a new login happened in the same browser
  INACTIVE: 'inactive', // account deactivated or deleted
  PASSWORD_RESET: 'password_reset', // password was reset by email link
  PASSWORD_CHANGE: 'password_change', // password changed while logged in (other devices only)
});

/**
 * One refresh token. Each login starts a token *family*; every refresh marks the
 * presented token as rotated and adds a new token to the same family.
 *
 * - Only a SHA-256 hash of the token is stored. Refresh tokens are 256-bit random
 *   values, so a fast hash is enough (no brute force possible) and allows lookup.
 * - Presenting a token whose `rotatedAt` is set means it was used twice: the whole
 *   family is revoked (refresh-token reuse detection).
 * - `expiresAt` slides forward on each refresh but never past `sessionExpiresAt`.
 * - A TTL index deletes documents once `expiresAt` passes (cleanup only; expiry is
 *   also checked in every query because TTL deletion can lag by ~60 seconds).
 */
const refreshSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    family: { type: String, required: true, index: true },
    familyCreatedAt: { type: Date, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    sessionExpiresAt: { type: Date, required: true },
    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: [...Object.values(REVOKE_REASONS), null], default: null },
    // For auditing only; never used for security decisions.
    userAgent: { type: String, maxlength: 256, default: '' },
    ip: { type: String, maxlength: 64, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession = mongoose.model('RefreshSession', refreshSessionSchema);
