import express from 'express';
import { body, param } from 'express-validator';
import * as advertisementsController from '../controllers/advertisementsController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { interactionLimiter } from '../middleware/rateLimiter';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiter for ad tracking (impression/click) — strict to prevent fraud
const adTrackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many tracking requests',
  standardHeaders: true,
  legacyHeaders: false,
});

const createAdValidation = validate([
  body('title').optional().isString().trim().isLength({ max: 200 }).withMessage('Title must be under 200 characters'),
  body('content').optional().isString().trim().isLength({ max: 2000 }).withMessage('Content must be under 2000 characters'),
  body('targetUrl').optional().isURL({ require_protocol: true }).withMessage('Target URL must be a valid URL with protocol'),
  body('mediaUrl').optional().isURL({ require_protocol: true }).withMessage('Media URL must be a valid URL'),
  body('type').optional().isIn(['banner', 'sponsored', 'native']).withMessage('Type must be banner, sponsored, or native'),
  body('budget').optional().isFloat({ min: 0 }).withMessage('Budget must be a non-negative number'),
  body('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
  body('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date'),
]);

const updateAdValidation = validate([
  param('id').isUUID().withMessage('Invalid ad ID'),
  body('status').isIn(['active', 'paused', 'stopped']).withMessage('Status must be active, paused, or stopped'),
]);

const adIdValidation = validate([
  param('id').isUUID().withMessage('Invalid ad ID'),
]);

router.post('/', authenticate, createAdValidation, advertisementsController.createAd);
router.get('/', authenticate, advertisementsController.getAds);
router.patch('/:id', authenticate, updateAdValidation, advertisementsController.updateAd);
router.get('/active', advertisementsController.getActiveAds);
router.post('/:id/impression', adTrackingLimiter, adIdValidation, advertisementsController.trackImpressionRoute);
router.post('/:id/click', adTrackingLimiter, adIdValidation, advertisementsController.trackClickRoute);

export default router;
