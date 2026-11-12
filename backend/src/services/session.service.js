import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { env } from '../config/env.js';
import { RefreshSession, REVOKE_REASONS } from '../models/RefreshSession.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// 32 random bytes in base64url = 43 characters. Anything else is rejected before a DB lookup.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const SESSION_EXPIRED_MESSAGE = 'Session expired, please log in again';

/*
 * Each rotated refresh token is DERIVED from the previous one:
 *   next = HMAC(successorKey, previous)
 * It is still unpredictable (256-bit secret input + server-side key), but the
 * server can recompute it. That makes rotation idempotent for a short time:
 * if the previous token is presented again within the grace window (the
 * response carrying the new cookie was lost, or two tabs raced), the server
 * re-sends the SAME next token instead of creating a second one or treating
 * it as theft. Only hashes are stored, as before.
 */
const successorKey = crypto.createHmac('sha256', env.jwt.secret).update('refresh-token-successor-v1').digest();
const successorOf = (token) => crypto.createHmac('sha256', successorKey).update(token).digest('base64url');
const GRACE_MS = env.auth.refreshReuseGraceSeconds * 1000;

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const isWellFormed = (token) => typeof token === 'string' && TOKEN_PATTERN.test(token);

function cleanMeta({ userAgent, ip } = {}) {
  return { userAgent: String(userAgent || '').slice(0, 256), ip: String(ip || '').slice(0, 64) };
}

/** True when "log out of all devices" (or deactivation) happened after this session started. */
function startedBeforeRevocation(familyCreatedAt, user) {
  return Boolean(user.sessionsRevokedAt) && familyCreatedAt <= user.sessionsRevokedAt;
}

/** Creates and stores (hashed) one refresh token in the given family. Returns the raw token once. */
async function issueRefreshToken(
  userId,
  { family, familyCreatedAt, sessionExpiresAt },
  meta,
  refreshToken = crypto.randomBytes(32).toString('base64url')
) {
  const ttlMs = env.auth.refreshTokenTtlDays * DAY_MS;
  const refreshExpiresAt = new Date(Math.min(Date.now() + ttlMs, sessionExpiresAt.getTime()));

  await RefreshSession.create({
    user: userId,
    family,
    familyCreatedAt,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiresAt,
    sessionExpiresAt,
    ...cleanMeta(meta),
  });
  return { refreshToken, refreshExpiresAt };
}

export async function revokeFamily(family, reason) {
  await RefreshSession.updateMany(
    { family, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
}

/** Starts a new login session (new token family). Used by login and register. */
export async function startSession(user, meta) {
  const now = new Date();
  const family = crypto.randomUUID();
  const sessionExpiresAt = new Date(now.getTime() + env.auth.refreshSessionMaxDays * DAY_MS);
  const refresh = await issueRefreshToken(user._id, { family, familyCreatedAt: now, sessionExpiresAt }, meta);
  return { accessToken: signAccessToken(user, family), ...refresh };
}

/**
 * Exchanges a refresh token for a new access token AND a new refresh token.
 * The presented token is consumed atomically, so it is rotated exactly once even
 * if several requests carry it at the same moment. The others get the same next
 * token through the grace window (see replayWithinGrace); outside it, reuse
 * revokes the whole session.
 */
export async function rotateSession(rawToken, meta) {
  if (!isWellFormed(rawToken)) throw ApiError.unauthorized(SESSION_EXPIRED_MESSAGE);

  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const current = await RefreshSession.findOneAndUpdate(
    { tokenHash, rotatedAt: null, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { rotatedAt: now } },
    { new: true }
  );

  if (!current) {
    // Unknown, expired, revoked, or already rotated. Only the last one can be reuse.
    const known = await RefreshSession.findOne({ tokenHash }).lean();
    if (known?.rotatedAt) {
      const replay = await replayWithinGrace(rawToken, known, meta);
      if (replay) return replay;
      await revokeFamily(known.family, REVOKE_REASONS.REUSE);
      logger.warn(`Refresh token reuse detected: revoked session family ${known.family} of user ${known.user}`);
    }
    throw ApiError.unauthorized(SESSION_EXPIRED_MESSAGE);
  }

  const user = await User.findById(current.user);
  if (!user || !user.isActive || startedBeforeRevocation(current.familyCreatedAt, user)) {
    await revokeFamily(current.family, user?.isActive ? REVOKE_REASONS.LOGOUT_ALL : REVOKE_REASONS.INACTIVE);
    throw ApiError.unauthorized(SESSION_EXPIRED_MESSAGE);
  }

  const refresh = await issueRefreshToken(user._id, current, meta, successorOf(rawToken));
  return { user, accessToken: signAccessToken(user, current.family), ...refresh };
}

/** The winner of a concurrent rotation may still be writing the next token; wait briefly for it. */
async function findSuccessor(successorHash) {
  for (let i = 0; i < 10; i += 1) {
    const doc = await RefreshSession.findOne({ tokenHash: successorHash }).lean();
    if (doc) return doc;
    await sleep(50);
  }
  return null;
}

/**
 * A just-rotated token presented again is NOT treated as theft when ALL of:
 *  - it was rotated less than REFRESH_REUSE_GRACE_SECONDS ago,
 *  - the request comes from the same user agent that the token was issued to,
 *  - the session is not revoked and the next token has not been used yet.
 * Then the same next token is returned again. Anything else is reuse.
 */
async function replayWithinGrace(rawToken, known, meta) {
  if (GRACE_MS <= 0 || known.revokedAt) return null;
  if (Date.now() - new Date(known.rotatedAt).getTime() > GRACE_MS) return null;
  if (cleanMeta(meta).userAgent !== known.userAgent) return null;

  const nextToken = successorOf(rawToken);
  const next = await findSuccessor(hashToken(nextToken));
  if (!next || next.rotatedAt || next.revokedAt || new Date(next.expiresAt) <= new Date()) return null;

  const user = await User.findById(known.user);
  if (!user || !user.isActive || startedBeforeRevocation(next.familyCreatedAt, user)) return null;

  return {
    user,
    accessToken: signAccessToken(user, next.family),
    refreshToken: nextToken,
    refreshExpiresAt: new Date(next.expiresAt),
  };
}

/** Revokes the session (whole family) that a refresh token belongs to. Silent if unknown. */
export async function revokeSessionByToken(rawToken, reason) {
  if (!isWellFormed(rawToken)) return;
  const session = await RefreshSession.findOne({ tokenHash: hashToken(rawToken) }).select('family').lean();
  if (session) await revokeFamily(session.family, reason);
}

/** Revokes every session of a user except one (e.g. after a password change, keep this device). */
export async function revokeOtherSessions(userId, keepSessionId, reason) {
  await RefreshSession.updateMany(
    { user: userId, family: { $ne: keepSessionId }, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
}

/** Revokes every session of a user ("log out of all devices", deactivation). */
export async function revokeAllUserSessions(userId, reason) {
  // Timestamp first: even a refresh racing with this call is rejected on its next use.
  await User.updateOne({ _id: userId }, { $set: { sessionsRevokedAt: new Date() } });
  await RefreshSession.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
}

/**
 * Used by the authenticate middleware: an access token is only accepted while
 * its session (family) has not been revoked. This makes logout immediate
 * instead of waiting for the access token to expire.
 */
export async function isAccessSessionActive(sessionId, user) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
  const session = await RefreshSession.findOne({
    family: sessionId,
    user: user._id,
    revokedAt: null,
    sessionExpiresAt: { $gt: new Date() },
  })
    .select('familyCreatedAt')
    .lean();
  return Boolean(session) && !startedBeforeRevocation(session.familyCreatedAt, user);
}
