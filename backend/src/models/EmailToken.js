import mongoose from 'mongoose';

export const EMAIL_TOKEN_TYPES = Object.freeze({
  VERIFY_EMAIL: 'verify_email',
  RESET_PASSWORD: 'reset_password',
});

/**
 * One-time token sent by email (verification link, password-reset link).
 * - Only a SHA-256 hash is stored; the raw token exists only in the email.
 * - Single use: it is deleted atomically when consumed.
 * - Only the newest token of each type per user is valid (older ones are deleted).
 * - A TTL index deletes expired tokens (expiry is also checked in every query).
 */
const emailTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(EMAIL_TOKEN_TYPES), required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailToken = mongoose.model('EmailToken', emailTokenSchema);
