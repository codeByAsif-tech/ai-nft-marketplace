/**
 * Minimal leveled logger. Kept behind this interface so it can be swapped
 * for pino/winston later without touching call sites. Silent during tests.
 */
const silent = process.env.NODE_ENV === 'test';
const timestamp = () => new Date().toISOString();

export const logger = {
  info: (...args) => !silent && console.log(`[${timestamp()}] INFO `, ...args),
  warn: (...args) => !silent && console.warn(`[${timestamp()}] WARN `, ...args),
  error: (...args) => !silent && console.error(`[${timestamp()}] ERROR`, ...args),
};
