import { body } from 'express-validator';
import { SUPPORTED_CHAIN_IDS } from '../config/networks.js';

export const nonceRules = [
  body('address')
    .isString()
    .withMessage('Wallet address is required')
    .bail()
    .trim()
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Invalid wallet address'),
  body('chainId')
    .isInt()
    .withMessage('chainId must be a number')
    .bail()
    .toInt()
    .isIn(SUPPORTED_CHAIN_IDS)
    .withMessage('Unsupported network'),
];

export const verifyRules = [
  body('nonce')
    .isString()
    .withMessage('Nonce is required')
    .bail()
    .matches(/^[a-f0-9]{32}$/)
    .withMessage('Invalid nonce'),
  body('signature')
    .isString()
    .withMessage('Signature is required')
    .bail()
    // 65-byte ECDSA signature: 0x + 130 hex chars
    .matches(/^0x[a-fA-F0-9]{130}$/)
    .withMessage('Invalid signature format'),
];
