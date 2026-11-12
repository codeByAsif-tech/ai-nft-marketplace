import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import { authenticate } from '../middleware/auth.js';
import { aiLimiter, ipfsLimiter, uploadLimiter } from '../middleware/rateLimiters.js';
import { uploadSingleImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  createGenerationRules,
  idParamRules,
  listRules,
  suggestRules,
  updateGenerationRules,
} from '../validators/ai.validators.js';

const router = Router();

router.use(authenticate);

router.get('/status', aiController.status);
router.post('/suggest', aiLimiter, validate(suggestRules), aiController.suggest);

// Artwork drafts (uploaded or AI-generated images + metadata).
router.get('/generations', validate(listRules), aiController.list);
router.post('/generations', uploadLimiter, uploadSingleImage, validate(createGenerationRules), aiController.create);
router.get('/generations/:id', validate(idParamRules), aiController.getOne);
router.patch('/generations/:id', validate([...idParamRules, ...updateGenerationRules]), aiController.update);
router.delete('/generations/:id', validate(idParamRules), aiController.remove);

// IPFS publishing (Pinata). POST is idempotent and resumable: call it again to retry.
router.get('/ipfs/status', aiController.ipfsStatus);
router.post('/generations/:id/ipfs', ipfsLimiter, validate(idParamRules), aiController.publishIpfs);

export default router;
