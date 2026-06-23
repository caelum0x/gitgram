import { Router } from 'express';
import { body } from 'express-validator';
import { claimController } from '../controllers/claimController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

router.get('/my-repos', authenticate, claimController.getMyRepos);
router.post(
  '/repository',
  authenticate,
  validate([
    body('owner').isString().trim().notEmpty().withMessage('Repository owner is required'),
    body('name').isString().trim().notEmpty().withMessage('Repository name is required'),
    body('username').optional().isString().trim().isLength({ min: 3, max: 39 })
      .withMessage('Username must be 3-39 characters'),
  ]),
  claimController.claimRepository
);

export default router;
