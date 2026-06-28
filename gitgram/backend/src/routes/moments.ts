import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { upload } from '../services/storageService';
import * as momentsController from '../controllers/momentsController';

const router = Router();

const momentIdValidation = validate([
  param('id').isString().notEmpty().withMessage('Invalid moment id'),
]);

const listValidation = validate([
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
]);

const createValidation = validate([
  body('caption').optional().isString().trim().isLength({ max: 2000 }).withMessage('Caption must be under 2000 characters'),
  body('location').optional().isString().trim().isLength({ max: 200 }),
]);

router.get('/', optionalAuth, listValidation, momentsController.getMoments);
router.get('/:id', optionalAuth, momentIdValidation, momentsController.getMoment);
router.get('/:id/reactions', momentIdValidation, momentsController.getReactions);

router.post(
  '/',
  authenticate,
  upload.fields([
    { name: 'screenshot', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]),
  createValidation,
  momentsController.createMoment,
);

router.post('/:id/like', authenticate, momentIdValidation, momentsController.likeMoment);
router.delete('/:id', authenticate, momentIdValidation, momentsController.deleteMoment);

export default router;
