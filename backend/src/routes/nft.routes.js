import { Router } from 'express';
import * as marketplaceController from '../controllers/marketplace.controller.js';
import * as nftController from '../controllers/nft.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { activityRules, idParam, recordTxRules } from '../validators/marketplace.validators.js';
import { listNftRules, nftIdRules, recordMintRules } from '../validators/nft.validators.js';

const router = Router();

// Signed-in user's routes (declared before "/:id" so "mine" isn't read as an id)
router.post('/mint', authenticate, validate(recordMintRules), nftController.recordMint);
router.get('/mine', authenticate, validate(listNftRules), nftController.listMine);
router.post('/:id/verify-owner', authenticate, validate(nftIdRules), nftController.verifyOwner);
router.post('/:id/transfer', authenticate, validate(recordTxRules), marketplaceController.transfer);

// Public NFT pages
router.get('/:id', validate(idParam), marketplaceController.nftDetails);
router.get('/:id/activity', validate(activityRules), marketplaceController.nftActivity);

export default router;
