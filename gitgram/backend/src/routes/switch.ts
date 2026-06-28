import { Router } from 'express';
import { switchController } from '../controllers/switchController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { switchAccountValidator, switchGrantValidator } from '../validators/switchValidator';

const router = Router();

router.get('/accounts', authenticate, switchController.getMyAccounts);
router.post('/account', authenticate, validate(switchAccountValidator), switchController.switchAccount);

// Multi-account switching (true cross-user, authorized via AccountSwitchGrant)
router.get('/switchable', authenticate, switchController.getSwitchableAccounts);
router.post(
  '/switch-user',
  authenticate,
  validate(switchGrantValidator),
  switchController.switchToUser
);
router.post('/grant', authenticate, validate(switchGrantValidator), switchController.grantSwitch);
router.delete('/grant', authenticate, validate(switchGrantValidator), switchController.revokeSwitch);

export default router;
