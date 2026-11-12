import { Router } from 'express';
import * as walletController from '../controllers/wallet.controller.js';
import { authenticate } from '../middleware/auth.js';
import { walletLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import { nonceRules, verifyRules } from '../validators/wallet.validators.js';

const router = Router();

router.use(authenticate);

router.post('/nonce', walletLimiter, validate(nonceRules), walletController.requestNonce);
router.post('/verify', walletLimiter, validate(verifyRules), walletController.verifyWallet);
router.delete('/', walletController.unlinkWallet);

export default router;
