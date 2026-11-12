/**
 * Wraps an async route handler so rejected promises reach the error middleware.
 * (Express 5 does this natively, but the wrapper keeps intent explicit and
 * protects against accidental downgrades.)
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
