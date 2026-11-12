import mongoose from 'mongoose';

/**
 * Failed-login counter per client IP (the login IP block).
 * - Every login attempt is counted atomically BEFORE the password is checked,
 *   so parallel requests can't get more guesses than allowed.
 * - Failures older than the block window no longer count.
 * - A successful login from the IP resets the counter.
 * - Documents are deleted by a TTL index once they are no longer relevant
 *   (cleanup only; all timing is also checked in the queries).
 */
const loginThrottleSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true, unique: true },
    failedAttempts: { type: Number, default: 0, min: 0 },
    lastAttemptAt: { type: Date, default: null },
    blockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

loginThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LoginThrottle = mongoose.model('LoginThrottle', loginThrottleSchema);
