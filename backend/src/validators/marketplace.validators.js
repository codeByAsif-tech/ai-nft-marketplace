import { body, param, query } from 'express-validator';
import { SUPPORTED_CHAIN_IDS } from '../config/networks.js';
import { TRANSACTION_TYPES } from '../models/Transaction.js';

const txHash = () =>
  body('txHash')
    .isString()
    .bail()
    .matches(/^0x[0-9a-fA-F]{64}$/)
    .withMessage('Invalid transaction hash');

const paging = () => [
  query('page').optional().isInt({ min: 1, max: 10000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

export const idParam = [param('id').isMongoId().withMessage('Invalid id')];

export const recordListingRules = [body('nftId').isMongoId().withMessage('Invalid NFT id'), txHash()];

export const recordTxRules = [...idParam, txHash()];

export const exploreRules = [
  ...paging(),
  query('chainId').optional().isInt().toInt().isIn(SUPPORTED_CHAIN_IDS).withMessage('Unsupported network'),
  query('search').optional().isString().trim().isLength({ max: 60 }).withMessage('Search is too long'),
  query('sort').optional().isIn(['newest', 'oldest', 'price_asc', 'price_desc']).withMessage('Unknown sort'),
];

export const activityRules = [...idParam, ...paging()];

export const myTransactionsRules = [
  ...paging(),
  query('type').optional().isIn(Object.values(TRANSACTION_TYPES)).withMessage('Unknown transaction type'),
];
