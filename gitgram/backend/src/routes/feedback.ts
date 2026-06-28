import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import * as feedbackController from '../controllers/feedbackController';

const router = Router();

router.use(authenticate);

const createValidation = validate([
  body('type').optional().isIn(['bug', 'feature', 'other']).withMessage('Type must be bug, feature, or other'),
  body('title').isString().trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must be under 200 characters'),
  body('content').isString().trim().isLength({ min: 1, max: 5000 }).withMessage('Content is required and must be under 5000 characters'),
  body('screenshotUrl').optional().isURL().withMessage('Screenshot URL must be valid'),
]);

const listValidation = validate([
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
]);

const idValidation = validate([
  param('id').isString().notEmpty().withMessage('Invalid feedback id'),
]);

router.post('/', createValidation, feedbackController.createFeedback);
router.get('/', listValidation, feedbackController.getFeedbacks);
router.get('/:id', idValidation, feedbackController.getFeedback);

export default router;
