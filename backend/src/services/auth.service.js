import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { REVOKE_REASONS } from '../models/RefreshSession.js';
import { User, ROLES } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { isEmailVerified, samePasswordError, sendVerificationEmail } from './accountEmail.service.js';
import { clearLoginFailures, loginBlockedError, reserveLoginAttempt } from './loginThrottle.service.js';
import * as sessionService from './session.service.js';

// Pre-computed hash compared against when the email doesn't exist, so a login
// for an unknown email takes about as long as a wrong password (no timing oracle).
const DUMMY_HASH = bcrypt.hashSync('timing-attack-dummy-password', 10);

// Same message for unknown email and wrong password: doesn't reveal which emails are registered.
const INVALID_CREDENTIALS = 'Invalid email or password';
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

async function buildAuthPayload(user, meta) {
  const session = await sessionService.startSession(user, meta);
  return {
    // Response body is unchanged ({ user, token }), so existing clients keep working.
    body: { user: user.toJSON(), token: session.accessToken },
    refreshToken: session.refreshToken,
    refreshExpiresAt: session.refreshExpiresAt,
  };
}

export async function registerUser({ name, email, password }, meta) {
  const existing = await User.exists({ email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

  let user;
  try {
    // Role is always USER on signup. It is never taken from the request body.
    user = await User.create({ name, email, password: passwordHash, role: ROLES.USER, emailVerified: false });
  } catch (err) {
    // Two simultaneous registrations can both pass the exists() check above;
    // the unique index is the real guard.
    if (err?.code === 11000) {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw err;
  }

  await sendVerificationEmail(user);
  if (env.email.requireVerification) {
    // No session yet: the user must click the emailed link, then log in.
    return { body: { user: user.toJSON(), verificationRequired: true } };
  }

  if (meta?.previousRefreshToken) {
    await sessionService.revokeSessionByToken(meta.previousRefreshToken, REVOKE_REASONS.REPLACED);
  }
  return buildAuthPayload(user, meta);
}

/**
 * Login with an IP block: after LOGIN_MAX_FAILED_ATTEMPTS failed logins from one
 * IP (any email, known or not), that IP can't log in for LOGIN_LOCK_MINUTES.
 * The attempt is counted before the password is checked (see loginThrottle.service.js).
 */
export async function loginUser({ email, password }, meta) {
  const attempt = await reserveLoginAttempt(meta?.ip);
  // Blocked: refuse without looking at the email or password.
  if (!attempt.allowed) throw loginBlockedError(attempt.blockedUntil);

  const user = await User.findOne({ email }).select('+password');
  const passwordMatches = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

  if (!user || !passwordMatches) {
    // This failure was the last one allowed: say so instead of "invalid credentials".
    if (attempt.blockedUntil) throw loginBlockedError(attempt.blockedUntil);
    throw ApiError.unauthorized(INVALID_CREDENTIALS);
  }

  // Correct password: this IP's failures are cleared.
  await clearLoginFailures(meta?.ip);

  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated');
  }

  // Only reached with the correct password, so this doesn't reveal anything to strangers.
  if (env.email.requireVerification && !isEmailVerified(user)) {
    throw ApiError.forbidden('Please verify your email address first. Check your inbox for the link.').withCode(
      EMAIL_NOT_VERIFIED
    );
  }

  // A new login in this browser replaces the session in its old cookie, if any.
  if (meta?.previousRefreshToken) {
    await sessionService.revokeSessionByToken(meta.previousRefreshToken, REVOKE_REASONS.REPLACED);
  }

  return buildAuthPayload(user, meta);
}

/**
 * Change password while logged in (any role).
 * - The current password is required, so a stolen session alone can't take over the account.
 * - The new password must differ from the current one.
 * - Every OTHER device is logged out; this one stays logged in.
 */
export async function changePassword(userId, sessionId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw ApiError.unauthorized('Authentication required');

  if (!(await bcrypt.compare(currentPassword, user.password))) {
    const message = 'Current password is incorrect';
    throw ApiError.badRequest(message, [{ field: 'currentPassword', message }]);
  }
  if (await bcrypt.compare(newPassword, user.password)) throw samePasswordError('newPassword');

  const passwordHash = await bcrypt.hash(newPassword, env.bcryptSaltRounds);
  await User.updateOne({ _id: user._id }, { $set: { password: passwordHash } });
  await sessionService.revokeOtherSessions(user._id, sessionId, REVOKE_REASONS.PASSWORD_CHANGE);
}

export async function refreshSession(refreshToken, meta) {
  const { user, accessToken, refreshToken: next, refreshExpiresAt } = await sessionService.rotateSession(
    refreshToken,
    meta
  );
  return { body: { user: user.toJSON(), token: accessToken }, refreshToken: next, refreshExpiresAt };
}

export async function logout(refreshToken) {
  await sessionService.revokeSessionByToken(refreshToken, REVOKE_REASONS.LOGOUT);
}

export async function logoutAll(userId) {
  await sessionService.revokeAllUserSessions(userId, REVOKE_REASONS.LOGOUT_ALL);
}
