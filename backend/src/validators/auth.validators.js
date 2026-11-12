import { body } from 'express-validator';

const email = () =>
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .bail()
    .isEmail()
    .withMessage('Must be a valid email address')
    .bail()
    .isLength({ max: 254 })
    .normalizeEmail({ gmail_remove_dots: false });

const newPassword = (field = 'password') =>
  body(field)
    .isString()
    .withMessage('Password is required')
    .bail()
    // bcrypt only uses the first 72 bytes, so cap the length.
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be 8–72 characters')
    .bail()
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain a letter')
    .matches(/\d/)
    .withMessage('Password must contain a number');

// Emailed one-time tokens: 43 base64url characters.
const emailToken = () =>
  body('token')
    .isString()
    .withMessage('Token is required')
    .bail()
    .matches(/^[A-Za-z0-9_-]{43}$/)
    .withMessage('This link is invalid. Please use the latest link from your email.');

export const registerRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .bail()
    .isLength({ min: 2, max: 60 })
    .withMessage('Name must be 2–60 characters'),
  email(),
  newPassword(),
];

export const loginRules = [
  email(),
  body('password').isString().notEmpty().withMessage('Password is required'),
];

export const emailOnlyRules = [email()];

export const verifyEmailRules = [emailToken()];

export const resetPasswordRules = [emailToken(), newPassword()];

export const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
  newPassword('newPassword'),
];
