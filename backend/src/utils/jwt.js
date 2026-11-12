import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ALGORITHM = 'HS256';

/**
 * Short-lived access token. `sid` is the refresh-session family it belongs to,
 * so logging out (one device or all) also kills access tokens immediately.
 */
export function signAccessToken(user, sessionId) {
  return jwt.sign({ sub: user.id, role: user.role, sid: sessionId }, env.jwt.secret, {
    algorithm: ALGORITHM,
    expiresIn: env.jwt.expiresIn,
  });
}

/** Throws (TokenExpiredError / JsonWebTokenError) if the token is invalid. */
export function verifyAccessToken(token) {
  // Pinning the algorithm prevents "alg: none" and algorithm-confusion attacks.
  return jwt.verify(token, env.jwt.secret, { algorithms: [ALGORITHM] });
}
