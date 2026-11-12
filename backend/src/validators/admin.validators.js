import { body, param, query } from 'express-validator';
import { TRANSACTION_TYPES } from '../models/Transaction.js';
import { ROLES } from '../models/User.js';

const paging = () => [
  query('page').optional().isInt({ min: 1, max: 10000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

export const activityRules = [
  ...paging(),
  query('type').optional().isIn(Object.values(TRANSACTION_TYPES)).withMessage('Unknown transaction type'),
];

export const listUsersRules = [
  ...paging(),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search is too long'),
  query('role').optional().isIn(Object.values(ROLES)).withMessage('Unknown role'),
  query('status').optional().isIn(['active', 'inactive']).withMessage('Unknown status'),
];

// Only the account status can be changed. Any other field (role, email, ...) is ignored.
export const updateUserRules = [
  param('id').isMongoId().withMessage('Invalid id'),
  body('isActive').isBoolean({ strict: true }).withMessage('isActive must be true or false'),
];
