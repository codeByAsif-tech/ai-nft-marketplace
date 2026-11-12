import 'dotenv/config';
import path from 'node:path';

/**
 * Centralized, validated environment configuration.
 * The app fails fast at startup if a required variable is missing,
 * instead of failing later with a confusing runtime error.
 */

const isTest = process.env.NODE_ENV === 'test';

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}

const corsOrigins = optional('CORS_ORIGINS', 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const appOrigin = optional('APP_ORIGIN', corsOrigins[0]);
try {
  new URL(appOrigin);
} catch {
  throw new Error(`APP_ORIGIN must be a full URL (got "${appOrigin}")`);
}

function positiveNumber(name, fallback) {
  const value = Number(optional(name, String(fallback)));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function nonNegativeNumber(name, fallback) {
  const value = Number(optional(name, String(fallback)));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be zero or a positive number`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

// Refresh-token cookie. Secure is on by default in production (HTTPS). In local
// development over plain http://<LAN-IP> a Secure cookie would be dropped by the
// browser, so it defaults to off outside production.
const cookieSameSite = optional('REFRESH_COOKIE_SAMESITE', 'strict').toLowerCase();
if (!['strict', 'lax', 'none'].includes(cookieSameSite)) {
  throw new Error('REFRESH_COOKIE_SAMESITE must be strict, lax or none');
}
const cookieSecure = optional('REFRESH_COOKIE_SECURE', isProduction ? 'true' : 'false') === 'true';
if (cookieSameSite === 'none' && !cookieSecure) {
  throw new Error('REFRESH_COOKIE_SAMESITE=none requires REFRESH_COOKIE_SECURE=true');
}

export const env = Object.freeze({
  nodeEnv: optional('NODE_ENV', 'development'),
  isProduction,
  isTest,
  port: Number(optional('PORT', '5000')),
  corsOrigins,
  appOrigin,
  // In tests the in-memory database URI is injected at runtime, so it is not required here.
  mongoUri: isTest ? optional('MONGODB_URI', '') : required('MONGODB_URI'),
  jwt: {
    secret: jwtSecret,
    // Access-token lifetime. Short, because the refresh token renews it silently.
    expiresIn: optional('JWT_EXPIRES_IN', '15m'),
  },
  auth: {
    // Login IP block: after N failed logins from one IP, block that IP for M minutes.
    maxFailedLogins: positiveNumber('LOGIN_MAX_FAILED_ATTEMPTS', 5),
    lockMinutes: positiveNumber('LOGIN_LOCK_MINUTES', 15),
    // Refresh tokens: each one lives this long (sliding, renewed on every refresh)...
    refreshTokenTtlDays: positiveNumber('REFRESH_TOKEN_TTL_DAYS', 7),
    // ...but a login session can never be extended past this (absolute limit).
    refreshSessionMaxDays: positiveNumber('REFRESH_SESSION_MAX_DAYS', 30),
    // If the previous refresh token comes back within this many seconds (lost
    // response, two tabs racing), the same next token is re-sent instead of
    // treating it as theft. 0 disables the grace window.
    refreshReuseGraceSeconds: nonNegativeNumber('REFRESH_REUSE_GRACE_SECONDS', 10),
    cookie: {
      secure: cookieSecure,
      sameSite: cookieSameSite,
      // Only sent to the auth endpoints, never to the rest of the API.
      path: optional('REFRESH_COOKIE_PATH', '/api/auth'),
    },
  },
  // Transactional email over SMTP (nodemailer).
  email: {
    smtp: {
      // Without SMTP_HOST, emails are not sent: in development the links are
      // printed in the server console instead. Required in production.
      // Ignored in automated tests, so `npm test` never sends real emails.
      host: isTest ? '' : optional('SMTP_HOST', ''),
      port: positiveNumber('SMTP_PORT', 587),
      // true = TLS from the start (usually port 465). false = STARTTLS upgrade (usually 587).
      secure: optional('SMTP_SECURE', 'false') === 'true',
      // With secure=false, refuse to send if the server doesn't offer STARTTLS
      // (otherwise the password and emails could travel unencrypted).
      requireTls: optional('SMTP_REQUIRE_TLS', 'true') === 'true',
      user: optional('SMTP_USER', ''),
      pass: optional('SMTP_PASS', ''), // server-side secret, never logged
    },
    // Sender shown to users, e.g. "Mintverse <no-reply@yourdomain.com>".
    from: optional('EMAIL_FROM', 'Mintverse <no-reply@example.com>'),
    appName: optional('APP_NAME', 'Mintverse'),
    timeoutMs: positiveNumber('EMAIL_TIMEOUT_MS', 10000),
    // New accounts must click the emailed link before they can log in.
    // (Off by default only in automated tests, which can't open emails.)
    requireVerification: optional('REQUIRE_EMAIL_VERIFICATION', isTest ? 'false' : 'true') === 'true',
    verifyTtlHours: positiveNumber('EMAIL_VERIFY_TTL_HOURS', 24),
    resetTtlMinutes: positiveNumber('PASSWORD_RESET_TTL_MINUTES', 30),
    // Minimum time between two emails of the same kind to one user.
    resendCooldownSeconds: nonNegativeNumber('EMAIL_RESEND_COOLDOWN_SECONDS', 60),
  },
  // How many reverse proxies sit in front of the API (sets Express "trust proxy").
  // The login IP block and the rate limits use the client IP, which is read from
  // X-Forwarded-For only for that many proxies. Use 0 when clients connect directly,
  // otherwise anyone could fake their IP with that header.
  trustProxy: nonNegativeNumber('TRUST_PROXY', 1),
  bcryptSaltRounds: Number(optional('BCRYPT_SALT_ROUNDS', '12')),
  walletNonceTtlSeconds: Number(optional('WALLET_NONCE_TTL_SECONDS', '300')),

  uploads: {
    // Resolved relative to where the server is started (the backend folder).
    dir: path.resolve(process.cwd(), optional('UPLOAD_DIR', 'uploads')),
    maxBytes: Number(optional('MAX_UPLOAD_MB', '10')) * 1024 * 1024,
  },

  ipfs: {
    // Pinata JWT (API key). Server-side secret: never sent to the browser or logged.
    jwt: optional('PINATA_JWT', ''),
    uploadUrl: optional('PINATA_UPLOAD_URL', 'https://uploads.pinata.cloud/v3').replace(/\/+$/, ''),
    apiUrl: optional('PINATA_API_URL', 'https://api.pinata.cloud/v3').replace(/\/+$/, ''),
    // Used only to DISPLAY ipfs:// content in the browser. Use your free dedicated
    // Pinata gateway (https://<name>.mypinata.cloud/ipfs) for better reliability.
    gatewayUrl: optional('IPFS_GATEWAY_URL', 'https://ipfs.io/ipfs').replace(/\/+$/, ''),
    timeoutMs: Number(optional('IPFS_TIMEOUT_MS', '60000')),
  },

  ai: {
    // Which provider handles each capability. "none" disables it cleanly.
    textProvider: optional('AI_TEXT_PROVIDER', 'groq'),
    imageProvider: optional('AI_IMAGE_PROVIDER', 'none'),
    groq: {
      // Server-side secret. Never sent to the browser, never logged.
      apiKey: optional('GROQ_API_KEY', ''),
      model: optional('GROQ_MODEL', 'openai/gpt-oss-20b'),
      baseUrl: optional('GROQ_BASE_URL', 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
      timeoutMs: Number(optional('GROQ_TIMEOUT_MS', '30000')),
    },
  },
});

// Password reset and email verification can't work without an email provider.
if (env.isProduction && !env.email.smtp.host) {
  throw new Error('SMTP_HOST is required in production (verification and password-reset emails)');
}
