import { env } from '../config/env.js';
import * as accountEmailService from '../services/accountEmail.service.js';
import * as authService from '../services/auth.service.js';import { sendSuccess } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { readCookie } from '../utils/cookies.js';

export const REFRESH_COOKIE = 'refresh_token';

// HttpOnly: page JavaScript (and so any XSS) can't read the refresh token.
// SameSite + a narrow path: only sent to /api/auth, never cross-site by default.
const baseCookieOptions = () => ({
  httpOnly: true,
  secure: env.auth.cookie.secure,
  sameSite: env.auth.cookie.sameSite,
  path: env.auth.cookie.path,
});

function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE, token, { ...baseCookieOptions(), expires: expiresAt });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions());
}

const requestMeta = (req) => ({
  userAgent: req.get('user-agent'),
  ip: req.ip,
  previousRefreshToken: readCookie(req, REFRESH_COOKIE),
});

/** Session responses must never be cached by the browser or a proxy. */
const noStore = (res) => res.set('Cache-Control', 'no-store');

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const result = await authService.registerUser({ name, email, password }, requestMeta(req));
  noStore(res);
  if (!result.refreshToken) {
    // Email verification required: no session until the link is clicked.
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Account created. Check your email to verify your address, then log in.',
      data: result.body,
    });
  }
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  sendSuccess(res, { statusCode: 201, message: 'Registration successful', data: result.body });
});

// Same answer whether or not the email is registered (no account enumeration).
const EMAIL_SENT_IF_EXISTS = 'If an account exists for this email, we have sent a message to it.';

export const verifyEmail = asyncHandler(async (req, res) => {
  await accountEmailService.verifyEmail(req.body.token);
  sendSuccess(res, { message: 'Your email is verified. You can now log in.' });
});

export const resendVerification = asyncHandler(async (req, res) => {
  await accountEmailService.resendVerification(req.body.email);
  sendSuccess(res, { message: EMAIL_SENT_IF_EXISTS });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await accountEmailService.requestPasswordReset(req.body.email);
  sendSuccess(res, { message: EMAIL_SENT_IF_EXISTS });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await accountEmailService.resetPassword(req.body.token, req.body.password);
  // Every session was ended, including any in this browser.
  clearRefreshCookie(res);
  noStore(res);
  sendSuccess(res, { message: 'Your password has been changed. Please log in with your new password.' });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.loginUser({ email, password }, requestMeta(req));
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  noStore(res);
  sendSuccess(res, { message: 'Login successful', data: result.body });
});

export const refresh = asyncHandler(async (req, res) => {
  noStore(res);
  try {
    const result = await authService.refreshSession(readCookie(req, REFRESH_COOKIE), requestMeta(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, { message: 'Session refreshed', data: result.body });
  } catch (err) {
    // A dead refresh token is useless to the browser; drop it.
    if (err?.statusCode === 401) clearRefreshCookie(res);
    throw err;
  }
});

/** Logs out this device. Works without a valid access token (it may have expired). */
export const logout = asyncHandler(async (req, res) => {
  await authService.logout(readCookie(req, REFRESH_COOKIE));
  clearRefreshCookie(res);
  noStore(res);
  sendSuccess(res, { message: 'Logged out' });
});

/** Logs out every device of the authenticated user, including this one. */
export const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user._id);
  clearRefreshCookie(res);
  noStore(res);
  sendSuccess(res, { message: 'Logged out of all devices' });
});

/** Logged-in password change (users and admins). This device stays logged in. */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user._id, req.sessionId, { currentPassword, newPassword });
  sendSuccess(res, { message: 'Password changed. Your other devices have been logged out.' });
});

export const me = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { user: req.user.toJSON() } });
});
