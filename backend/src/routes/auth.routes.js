import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { csrfProtection, rejectForeignOrigin } from '../middleware/csrf.js';
import { authLimiter, emailLimiter, passwordChangeLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordRules,
  emailOnlyRules,
  loginRules,
  registerRules,
  resetPasswordRules,
  verifyEmailRules,
} from '../validators/auth.validators.js';

const router = Router();

// Login/register set the refresh cookie, so a foreign site must not trigger them
// (they also only accept JSON, which a cross-site form can't send).
router.post('/register', rejectForeignOrigin, authLimiter, validate(registerRules), authController.register);
router.post('/login', rejectForeignOrigin, authLimiter, validate(loginRules), authController.login);

// Email verification and password reset (links sent by email over SMTP).
router.post('/verify-email', rejectForeignOrigin, authLimiter, validate(verifyEmailRules), authController.verifyEmail);
router.post(
  '/resend-verification',
  rejectForeignOrigin,
  emailLimiter,
  validate(emailOnlyRules),
  authController.resendVerification
);
router.post('/forgot-password', rejectForeignOrigin, emailLimiter, validate(emailOnlyRules), authController.forgotPassword);
router.post(
  '/reset-password',
  rejectForeignOrigin,
  authLimiter,
  validate(resetPasswordRules),
  authController.resetPassword
);

// Cookie-based endpoints: CSRF-protected.
router.post('/refresh', csrfProtection, authController.refresh);
router.post('/logout', csrfProtection, authController.logout);

// Bearer-based: not exposed to CSRF.
router.post('/logout-all', authenticate, authController.logoutAll);
router.post(
  '/change-password',
  authenticate,
  passwordChangeLimiter,
  validate(changePasswordRules),
  authController.changePassword
);
router.get('/me', authenticate, authController.me);

export default router;
