import { ALLOWED_ORIGINS } from '../config/cors.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * CSRF protection for endpoints that act on the refresh-token cookie.
 * (Endpoints that use the Authorization header are not exposed to CSRF: a
 * browser never attaches that header on its own.)
 *
 * Two independent checks (OWASP "verify origin" + "custom request header"):
 *  1. If the browser sent an Origin header, it must be one of our frontends.
 *  2. The request must carry a custom header. A cross-site page can only add
 *     custom headers through CORS, and the CORS preflight is only approved for
 *     ALLOWED_ORIGINS. A plain HTML form can't set headers at all.
 * SameSite=Strict on the cookie is a third layer on top of these.
 */
export const CSRF_HEADER = 'x-csrf-protection';

export function rejectForeignOrigin(req, _res, next) {
  const origin = req.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return next(ApiError.forbidden('Request origin is not allowed'));
  }
  next();
}

export function requireCsrfHeader(req, _res, next) {
  if (req.get(CSRF_HEADER) !== '1') {
    return next(ApiError.forbidden('Missing CSRF protection header'));
  }
  next();
}

export const csrfProtection = [rejectForeignOrigin, requireCsrfHeader];
