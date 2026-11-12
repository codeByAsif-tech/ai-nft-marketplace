import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../models/User.js';
import { activityRules, listUsersRules, updateUserRules } from '../validators/admin.validators.js';

const router = Router();

// Every admin route is protected HERE, on the server. Hiding the admin pages in
// the frontend is only for convenience; it is not the security boundary.
router.use(authenticate, requireRole(ROLES.ADMIN));

router.get('/stats', adminController.stats);
router.get('/activity', validate(activityRules), adminController.activity);
router.get('/users', validate(listUsersRules), adminController.listUsers);
router.patch('/users/:id', validate(updateUserRules), adminController.updateUser);

export default router;
