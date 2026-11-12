import { User } from '../models/User.js';
import { isAccessSessionActive, SESSION_EXPIRED_MESSAGE } from '../services/session.service.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Requires a valid "Authorization: Bearer <token>" header.
 * Re-loads the user from the database on every request so that
 * deactivated or deleted accounts lose access immediately and
 * the role always comes from the database, not from the token.
 * The token's session must also still be active, so logout (this device
 * or all devices) takes effect at once instead of when the token expires.
 */
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Authentication required');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? SESSION_EXPIRED_MESSAGE : 'Invalid token');
    }

    const user = await User.findById(payload.sub);
    if (!user) throw ApiError.unauthorized('Invalid token');
    if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');
    // Tokens issued before sessions existed have no `sid` and are rejected too.
    if (!(await isAccessSessionActive(payload.sid, user))) throw ApiError.unauthorized(SESSION_EXPIRED_MESSAGE);

    req.user = user;
    req.sessionId = payload.sid; // this device's session (e.g. kept when changing the password)
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * For public pages that can be personalised: sets req.user when a valid token
 * is sent, otherwise continues as an anonymous visitor (never fails the request).
 */
export async function optionalAuthenticate(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user?.isActive && (await isAccessSessionActive(payload.sid, user))) req.user = user;
  } catch {
    /* invalid or expired token: treat as anonymous */
  }
  next();
}
