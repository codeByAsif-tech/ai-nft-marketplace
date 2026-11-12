import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Converts any thrown error into the standard error response.
 * Unknown errors become a generic 500 so internals never leak to clients.
 * Express identifies error handlers by their 4 parameters, so `_next` must stay.
 */
export function errorHandler(err, _req, res, _next) {
  let error = err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    error = ApiError.badRequest('Validation failed', details);
  } else if (err instanceof mongoose.Error.CastError) {
    error = ApiError.badRequest(`Invalid value for ${err.path}`);
  } else if (err?.type === 'entity.parse.failed') {
    error = ApiError.badRequest('Malformed JSON body');
  } else if (err?.type === 'entity.too.large') {
    error = new ApiError(413, 'Request body too large');
  } else if (err?.name === 'MulterError') {
    error =
      err.code === 'LIMIT_FILE_SIZE'
        ? new ApiError(413, `Image must be at most ${Math.round(env.uploads.maxBytes / 1024 / 1024)} MB`)
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? ApiError.badRequest('Upload exactly one image in the "image" field')
          : ApiError.badRequest('Invalid upload');
  }

  if (!(error instanceof ApiError)) {
    logger.error(err);
    error = new ApiError(500, 'Internal server error');
  }

  const body = { success: false, message: error.message };
  if (error.details) body.errors = error.details;
  // Machine-readable reason the client can act on (e.g. LOGIN_BLOCKED).
  if (typeof error.code === 'string') body.code = error.code;
  if (Number.isInteger(error.retryAfterSeconds)) res.set('Retry-After', String(error.retryAfterSeconds));
  if (!env.isProduction && error.statusCode === 500 && err?.stack) body.stack = err.stack;

  res.status(error.statusCode).json(body);
}
