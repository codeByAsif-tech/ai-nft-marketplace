import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { EmailToken, EMAIL_TOKEN_TYPES } from '../models/EmailToken.js';
import { REVOKE_REASONS } from '../models/RefreshSession.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { sendEmailInBackground } from './email/email.service.js';
import { passwordResetEmail, verificationEmail } from './email/templates.js';
import { revokeAllUserSessions } from './session.service.js';

// 32 random bytes in base64url = 43 characters. Anything else is rejected before a DB lookup.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Frontend page that the emailed link opens (APP_ORIGIN is the frontend URL). */
const frontendLink = (path, token) => {
  const url = new URL(path, env.appOrigin);
  url.searchParams.set('token', token);
  return url.toString();
};

/** Creates a new one-time token. Older tokens of the same type stop working. */
async function issueToken(userId, type, ttlMs) {
  await EmailToken.deleteMany({ user: userId, type });
  const token = crypto.randomBytes(32).toString('base64url');
  await EmailToken.create({ user: userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

/** Atomically uses up a token: it works exactly once, even with parallel requests. */
async function consumeToken(rawToken, type) {
  if (typeof rawToken !== 'string' || !TOKEN_PATTERN.test(rawToken)) return null;
  return EmailToken.findOneAndDelete({ tokenHash: hashToken(rawToken), type, expiresAt: { $gt: new Date() } }).lean();
}

/** Finds a valid token without using it up. */
async function findValidToken(rawToken, type) {
  if (typeof rawToken !== 'string' || !TOKEN_PATTERN.test(rawToken)) return null;
  return EmailToken.findOne({ tokenHash: hashToken(rawToken), type, expiresAt: { $gt: new Date() } }).lean();
}

export const SAME_PASSWORD_MESSAGE = 'New password must be different from your current password.';

/** 400 with the message on the given form field, so the page can show it under that input. */
export function samePasswordError(field) {
  return ApiError.badRequest(SAME_PASSWORD_MESSAGE, [{ field, message: SAME_PASSWORD_MESSAGE }]);
}

/** True if an email of this type was sent to the user very recently (anti-spam). */
async function sentRecently(userId, type) {
  const since = new Date(Date.now() - env.email.resendCooldownSeconds * 1000);
  return Boolean(await EmailToken.exists({ user: userId, type, createdAt: { $gt: since } }));
}

/** Accounts created before verification existed have no value and count as verified. */
export const isEmailVerified = (user) => user.emailVerified !== false;

// ---- Email verification ----

/** Creates a verification token and emails the link (in the background). */
export async function sendVerificationEmail(user) {
  const token = await issueToken(user._id, EMAIL_TOKEN_TYPES.VERIFY_EMAIL, env.email.verifyTtlHours * 3600 * 1000);
  const message = verificationEmail({ name: user.name, link: frontendLink('/verify-email', token) });
  sendEmailInBackground({ to: user.email, ...message });
}

export async function verifyEmail(rawToken) {
  const record = await consumeToken(rawToken, EMAIL_TOKEN_TYPES.VERIFY_EMAIL);
  if (!record) throw ApiError.badRequest('This verification link is invalid or has expired. Request a new one.');

  const result = await User.updateOne(
    { _id: record.user },
    { $set: { emailVerified: true, emailVerifiedAt: new Date() } }
  );
  if (result.matchedCount === 0) throw ApiError.badRequest('This verification link is invalid or has expired.');
}

/**
 * Sends a new verification link. The response is always the same, so it can't
 * be used to find out which emails are registered or already verified.
 */
export async function resendVerification(email) {
  const user = await User.findOne({ email });
  // Everything after the lookup runs in the background: equal response time either way.
  (async () => {
    if (!user || !user.isActive || isEmailVerified(user)) return;
    if (await sentRecently(user._id, EMAIL_TOKEN_TYPES.VERIFY_EMAIL)) return;
    await sendVerificationEmail(user);
  })().catch((err) => logger.error(`Resend verification failed: ${err.message}`));
}

// ---- Forgot / reset password ----

/** Always answers the same; emails a one-time reset link only if the account exists. */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email });
  (async () => {
    if (!user || !user.isActive) return;
    if (await sentRecently(user._id, EMAIL_TOKEN_TYPES.RESET_PASSWORD)) return;
    const token = await issueToken(
      user._id,
      EMAIL_TOKEN_TYPES.RESET_PASSWORD,
      env.email.resetTtlMinutes * 60 * 1000
    );
    const message = passwordResetEmail({ name: user.name, link: frontendLink('/reset-password', token) });
    sendEmailInBackground({ to: user.email, ...message });
  })().catch((err) => logger.error(`Password reset request failed: ${err.message}`));
}

/**
 * Sets a new password with a reset link. Also:
 *  - logs the account out of every device (the old password may be known to someone),
 *  - marks the email as verified (opening the link proves the user owns it).
 */
export async function resetPassword(rawToken, newPassword) {
  const invalidLink = () => ApiError.badRequest('This reset link is invalid or has expired. Request a new one.');

  // Look the token up first WITHOUT using it, so a rejected password (same as the
  // current one) doesn't burn the link: the user can simply try another password.
  const record = await findValidToken(rawToken, EMAIL_TOKEN_TYPES.RESET_PASSWORD);
  if (!record) throw invalidLink();

  const user = await User.findById(record.user).select('+password');
  if (!user || !user.isActive) throw invalidLink();

  if (await bcrypt.compare(newPassword, user.password)) throw samePasswordError('password');

  // Now use the token up atomically: if two requests race, only one gets here.
  const consumed = await EmailToken.findOneAndDelete({ _id: record._id, expiresAt: { $gt: new Date() } });
  if (!consumed) throw invalidLink();

  const passwordHash = await bcrypt.hash(newPassword, env.bcryptSaltRounds);
  const verifiedNow = !isEmailVerified(user);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        password: passwordHash,
        emailVerified: true,
        ...(verifiedNow ? { emailVerifiedAt: new Date() } : {}),
      },
    }
  );
  await revokeAllUserSessions(user._id, REVOKE_REASONS.PASSWORD_RESET);
  // Any other outstanding reset or verification link is now pointless.
  await EmailToken.deleteMany({ user: user._id });
}
