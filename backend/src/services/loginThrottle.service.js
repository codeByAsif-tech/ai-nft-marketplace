import { env } from '../config/env.js';
import { LoginThrottle } from '../models/LoginThrottle.js';
import { ApiError } from '../utils/ApiError.js';

export const LOGIN_BLOCKED = 'LOGIN_BLOCKED';

const NEVER = new Date(8.64e15); // max Date: "not blocked" never counts as expired
const EPOCH = new Date(0);
const windowMs = () => env.auth.lockMinutes * 60 * 1000;

/** "::ffff:1.2.3.4" (IPv4 seen through an IPv6 socket) and "1.2.3.4" are the same client. */
function ipKey(ip) {
  return String(ip || 'unknown').replace(/^::ffff:/, '');
}

/**
 * Records one login attempt for this IP BEFORE the password is checked.
 * Returns { allowed, blockedUntil }:
 *  - allowed=false: the IP is blocked; the password must not be checked.
 *  - allowed=true with blockedUntil set: this attempt was the last one allowed;
 *    if its password is wrong, the IP is now blocked.
 *
 * The count and the block happen in ONE atomic update, so even many parallel
 * requests from one IP can never get more than LOGIN_MAX_FAILED_ATTEMPTS guesses.
 * Attempts older than the block window, or from before an expired block, no longer count.
 */
export async function reserveLoginAttempt(ip) {
  const key = ipKey(ip);
  const now = new Date();
  const until = new Date(now.getTime() + windowMs());

  // Make sure the document exists (two first requests at once: one insert wins, the other is a no-op).
  try {
    await LoginThrottle.updateOne(
      { ip: key },
      { $setOnInsert: { failedAttempts: 0, lastAttemptAt: null, blockedUntil: null, expiresAt: until } },
      { upsert: true }
    );
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }

  const blockExpired = { $lte: [{ $ifNull: ['$blockedUntil', NEVER] }, now] };
  const windowOver = { $lte: [{ $ifNull: ['$lastAttemptAt', EPOCH] }, new Date(now.getTime() - windowMs())] };

  const doc = await LoginThrottle.findOneAndUpdate(
    { ip: key, $or: [{ blockedUntil: null }, { blockedUntil: { $lte: now } }] },
    [
      {
        $set: {
          failedAttempts: {
            $add: [{ $cond: [{ $or: [blockExpired, windowOver] }, 0, { $ifNull: ['$failedAttempts', 0] }] }, 1],
          },
        },
      },
      {
        // `$failedAttempts` is the new value here.
        $set: {
          blockedUntil: { $cond: [{ $gte: ['$failedAttempts', env.auth.maxFailedLogins] }, until, null] },
          lastAttemptAt: now,
          expiresAt: until, // TTL cleanup once neither the block nor the window matters
        },
      },
    ],
    { new: true }
  ).lean();

  if (doc) return { allowed: true, blockedUntil: doc.blockedUntil };

  const blocked = await LoginThrottle.findOne({ ip: key }).select('blockedUntil').lean();
  return { allowed: false, blockedUntil: blocked?.blockedUntil ?? until };
}

/** A successful login from this IP clears its failures. */
export async function clearLoginFailures(ip) {
  await LoginThrottle.updateOne({ ip: ipKey(ip) }, { $set: { failedAttempts: 0, blockedUntil: null } });
}

/** 429 with a clear message and a Retry-After header. */
export function loginBlockedError(blockedUntil) {
  const seconds = Math.max(1, Math.ceil((new Date(blockedUntil).getTime() - Date.now()) / 1000));
  const minutes = Math.ceil(seconds / 60);
  const error = new ApiError(
    429,
    `Your account is currently blocked after too many failed login attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
  ).withCode(LOGIN_BLOCKED);
  error.retryAfterSeconds = seconds;
  return error;
}
