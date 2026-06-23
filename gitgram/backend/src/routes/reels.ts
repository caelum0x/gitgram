import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
import {
    createReel,
    getReelsFeed,
    getReelById,
    likeReel,
    unlikeReel,
    addReelComment,
    getReelComments,
    getReelLikes,
    deleteReel,
    updateReel,
    applyMusicToReel,
    removeMusicFromReel,
    shareReel,
    reportReel,
    getUserReels,
    listReels,
    getFeaturedReel,
} from '../controllers/reelsController';
import {
    archiveReel,
    unarchiveReel,
    getArchivedReels,
} from '../controllers/archiveController';
import { upload } from '../services/storageService';
import { validateReelUpload } from '../middleware/mediaValidation';
import { interactionLimiter, uploadLimiter } from '../middleware/rateLimiter';
import { userReportLimit } from '../middleware/tieredRateLimiter';
import { spamCheckReport } from '../middleware/antiSpamMiddleware';

const router = Router();

// Create a new reel
router.post('/', authenticate, uploadLimiter, upload.single('video'), validateReelUpload, createReel);

// Get reels feed
router.get('/feed', optionalAuth, getReelsFeed);

// Get featured reel (must be before /:id to avoid conflict)
router.get('/featured', optionalAuth, getFeaturedReel);

// List reels, optionally filtered by language (related reels)
// Registered last among the static GETs but before /:id
router.get('/', optionalAuth, listReels);

// Get user's archived reels (must be before /:id to avoid conflict)
router.get('/archived', authenticate, getArchivedReels);

// Get user's reels (must be before /:id to avoid conflict)
router.get('/user/:userId', optionalAuth, getUserReels);

// Get reel by ID
router.get('/:id', optionalAuth, getReelById);

// Update reel
router.put('/:id', authenticate, updateReel);

// Delete reel
router.delete('/:id', authenticate, deleteReel);

// Like a reel
router.post('/:id/like', authenticate, likeReel);

// Unlike a reel
router.delete('/:id/like', authenticate, unlikeReel);

// Add comment to reel
router.post('/:id/comments', authenticate, addReelComment);

// Get reel comments
router.get('/:id/comments', optionalAuth, getReelComments);

// Get reel likes
router.get('/:id/likes', optionalAuth, getReelLikes);

// Apply or remove music from reel
router.post('/:id/music', authenticate, applyMusicToReel);
router.delete('/:id/music', authenticate, removeMusicFromReel);

// Share reel
router.post('/:id/share', optionalAuth, shareReel);

// Report reel
router.post('/:id/report', authenticate, interactionLimiter, userReportLimit, spamCheckReport, reportReel);

// Archive a reel
router.post('/:id/archive', authenticate, archiveReel);

// Unarchive a reel
router.post('/:id/unarchive', authenticate, unarchiveReel);

export default router;
