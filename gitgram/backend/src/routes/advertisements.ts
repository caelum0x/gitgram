import express from 'express';
import { body, param } from 'express-validator';
import * as advertisementsController from '../controllers/advertisementsController';
import * as adCampaignsController from '../controllers/adCampaignsController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { requireModeratorOrAdmin } from '../middleware/authorization';
import { validate } from '../middleware/validation';
import { upload } from '../services/storageService';
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

const idParam = validate([param('id').isString().notEmpty().withMessage('Invalid id')]);

const createCampaignValidation = validate([
  body('name').isString().trim().isLength({ min: 1, max: 200 }).withMessage('Campaign name is required'),
  body('type').optional().isIn(['post', 'reel', 'story', 'banner', 'video']),
  body('budget').exists().withMessage('Budget is required'),
  body('billingType').optional().isIn(['cpc', 'cpm', 'cpa']),
]);

// ---------------------------------------------------------------------------
// Campaign routes (declared before /:id ad routes to avoid path collisions)
// ---------------------------------------------------------------------------
router.post('/campaigns', authenticate, createCampaignValidation, adCampaignsController.createCampaign);
router.get('/campaigns', authenticate, adCampaignsController.getCampaigns);
router.get('/campaigns/:id', authenticate, idParam, adCampaignsController.getCampaign);
router.put('/campaigns/:id', authenticate, idParam, adCampaignsController.updateCampaign);
router.delete('/campaigns/:id', authenticate, idParam, adCampaignsController.deleteCampaign);
router.post('/campaigns/:id/pause', authenticate, idParam, adCampaignsController.pauseCampaign);
router.post('/campaigns/:id/resume', authenticate, idParam, adCampaignsController.resumeCampaign);
router.post('/campaigns/:id/fund', authenticate, idParam, adCampaignsController.fundCampaign);
router.get('/campaigns/:id/analytics', authenticate, idParam, adCampaignsController.getCampaignAnalytics);

// ---------------------------------------------------------------------------
// Admin moderation (moderator or admin only)
// ---------------------------------------------------------------------------
router.get('/admin/pending', authenticate, requireModeratorOrAdmin, advertisementsController.getPendingAds);
router.post('/admin/:id/approve', authenticate, requireModeratorOrAdmin, idParam, advertisementsController.approveAd);
router.post('/admin/:id/reject', authenticate, requireModeratorOrAdmin, idParam, advertisementsController.rejectAd);

// ---------------------------------------------------------------------------
// Ad preferences
// ---------------------------------------------------------------------------
router.get('/preferences', authenticate, advertisementsController.getAdPreferences);
router.put('/preferences', authenticate, advertisementsController.updateAdPreferences);

// ---------------------------------------------------------------------------
// Public ad delivery (auth optional)
// ---------------------------------------------------------------------------
router.get('/active', advertisementsController.getActiveAds);
router.get('/feed', advertisementsController.getFeedAds);

// ---------------------------------------------------------------------------
// Personal ad management
// ---------------------------------------------------------------------------
router.get('/my/ads', authenticate, advertisementsController.getMyAds);

router.post('/', authenticate, upload.single('media'), advertisementsController.createAd);
router.get('/', authenticate, advertisementsController.getAds);

router.get('/:id', optionalAuth, idParam, advertisementsController.getAd);
router.put('/:id', authenticate, idParam, advertisementsController.updateAd);
router.patch('/:id', authenticate, idParam, advertisementsController.updateAd);
router.delete('/:id', authenticate, idParam, advertisementsController.deleteAd);

router.post('/:id/pause', authenticate, idParam, advertisementsController.pauseAd);
router.post('/:id/resume', authenticate, idParam, advertisementsController.resumeAd);
router.get('/:id/analytics', authenticate, idParam, advertisementsController.getAdAnalytics);
router.post('/:id/report', authenticate, idParam, advertisementsController.reportAd);

// Tracking (public, rate-limited)
router.post('/:id/impression', adTrackingLimiter, idParam, advertisementsController.trackImpressionRoute);
router.post('/:id/view', adTrackingLimiter, idParam, advertisementsController.trackImpressionRoute);
router.post('/:id/click', adTrackingLimiter, idParam, advertisementsController.trackClickRoute);
router.post('/:id/conversion', adTrackingLimiter, idParam, advertisementsController.trackConversionRoute);

export default router;
