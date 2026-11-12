/**
 * Every successful response has the same shape:
 *   { success: true, message, data }
 * Errors are shaped by the error handler:
 *   { success: false, message, errors? }
 */
export function sendSuccess(res, { statusCode = 200, message = 'OK', data = null } = {}) {
  return res.status(statusCode).json({ success: true, message, data });
}
