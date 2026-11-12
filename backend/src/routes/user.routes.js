import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateProfileRules } from '../validators/user.validators.js';
import { myTransactions } from '../controllers/marketplace.controller.js';
import { myTransactionsRules } from '../validators/marketplace.validators.js';

const router = Router();

router.use(authenticate);

router.get('/me', userController.getMyProfile);
router.get('/me/dashboard', userController.getMyDashboard);
router.get('/me/transactions', validate(myTransactionsRules), myTransactions);
router.patch('/me', validate(updateProfileRules), userController.updateMyProfile);

export default router;
