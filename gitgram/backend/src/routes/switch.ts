import { Router } from 'express';
import { switchController } from '../controllers/switchController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { switchAccountValidator } from '../validators/switchValidator';

const router = Router();

router.get('/accounts', authenticate, switchController.getMyAccounts);
router.post('/account', authenticate, validate(switchAccountValidator), switchController.switchAccount);

export default router;
