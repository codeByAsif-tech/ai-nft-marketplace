import { body, param, query } from 'express-validator';
import { SUPPORTED_CHAIN_IDS } from '../config/networks.js';

export const recordMintRules = [
  body('generationId').isMongoId().withMessage('Invalid artwork id'),
  body('chainId')
    .isInt()
    .withMessage('chainId must be a number')
    .bail()
    .toInt()
    .isIn(SUPPORTED_CHAIN_IDS)
    .withMessage('Unsupported network'),
  body('txHash')
    .isString()
    .bail()
    .matches(/^0x[0-9a-fA-F]{64}$/)
    .withMessage('Invalid transaction hash'),
];

export const listNftRules = [
  query('page').optional().isInt({ min: 1, max: 10000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('chainId').optional().isInt().toInt().isIn(SUPPORTED_CHAIN_IDS).withMessage('Unsupported network'),
];

export const nftIdRules = [param('id').isMongoId().withMessage('Invalid id')];
