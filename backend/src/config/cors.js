import { env } from './env.js';

/**
 * Browser origins allowed to call the API with credentials (cookies).
 * Used by CORS and by the CSRF origin check, so both always agree.
 * The two fixed entries were previously hard-coded in app.js and are kept.
 */
export const ALLOWED_ORIGINS = Object.freeze([
  ...new Set([...env.corsOrigins, 'http://localhost:5173', 'http://192.168.0.141:5173']),
]);
