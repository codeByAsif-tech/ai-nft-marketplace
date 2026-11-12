import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

/** Brute-force protection for login/register: 20 attempts per 15 minutes per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

/**
 * Endpoints that SEND an email (resend verification, forgot password):
 * 5 per 15 minutes per IP, so nobody can use the API to flood an inbox
 * (there is also a per-user cooldown in accountEmail.service.js).
 */
export const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, message: 'Too many email requests, please try again later' },
});

/** Wallet nonce/verify: 30 per 15 minutes per IP. */
export const walletLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, message: 'Too many wallet verification attempts, please try again later' },
});

// The AI and upload limiters run after `authenticate`, so they count per user
// rather than per IP: users behind the same network don't share a quota.
const perUser = (req) => `user:${req.user.id}`;

/**
 * Change password: 5 per 15 minutes per user. It checks the current password,
 * so without this a stolen session could be used to guess it.
 */
export const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, message: 'Too many password change attempts. Please try again later.' },
});

/** AI suggestions are slow and CPU-heavy: 20 per 10 minutes per user. */
export const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, message: 'Too many AI requests. Please wait a few minutes.' },
});

/** Artwork uploads: 30 per hour per user. */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, message: 'Upload limit reached. Please try again later.' },
});

/** IPFS publish/retry: 30 per hour per user (protects the free Pinata quota). */
export const ipfsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, message: 'Too many IPFS uploads. Please try again later.' },
});

/** General API limit: 300 requests per minute per IP. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { success: false, message: 'Too many requests, please slow down' },
});
