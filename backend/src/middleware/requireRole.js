import { ApiError } from '../utils/ApiError.js';

/**
 * Role-based authorization. Must run after `authenticate`.
 * Usage: router.get('/admin/stats', authenticate, requireRole('ADMIN'), handler)
 */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
