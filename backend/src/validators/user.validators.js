import { body } from 'express-validator';

export const updateProfileRules = [
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 60 })
    .withMessage('Name must be 2–60 characters'),
  body('bio')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio must be at most 500 characters'),
];
