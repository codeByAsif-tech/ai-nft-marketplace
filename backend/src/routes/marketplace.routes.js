import { Router } from 'express';
import * as controller from '../controllers/marketplace.controller.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { exploreRules, idParam, recordListingRules, recordTxRules } from '../validators/marketplace.validators.js';

const router = Router();

// Public browsing
// Logged-in visitors don't see their own listings on Explore.
router.get('/listings', optionalAuthenticate, validate(exploreRules), controller.explore);
router.get('/listings/:id', validate(idParam), controller.getListing);

// Recording on-chain actions (the user sends the tx from MetaMask, then reports its hash)
router.post('/listings', authenticate, validate(recordListingRules), controller.createListing);
router.post('/listings/:id/buy', authenticate, validate(recordTxRules), controller.buy);
router.post('/listings/:id/cancel', authenticate, validate(recordTxRules), controller.cancel);

export default router;
