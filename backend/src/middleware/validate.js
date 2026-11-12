import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';

/**
 * Runs an array of express-validator chains, then rejects the request
 * with a 400 listing every invalid field.
 */
export const validate = (chains) => async (req, _res, next) => {
  for (const chain of chains) {
    await chain.run(req);
  }

  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
  next(ApiError.badRequest('Validation failed', errors));
};
