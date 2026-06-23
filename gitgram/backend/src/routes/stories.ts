import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
import {
    createStory,
    getActiveStories,
    getStoryById,
    deleteStory,
    cleanupExpiredStories,
    updateStory,
    archiveStory,
    getArchivedStories,
    deleteArchivedStory,
    getStoryViewers,
    getMyStories,
    getStoryHighlightById,
    getStoryHighlights,
    getStorySettings,
    getStoryAnalytics,
    trackStoryView,
    createStoryHighlight,
    updateStorySettings,
    updateStoryViewDuration,
} from '../controllers/storiesController';
import * as storyReactions from '../controllers/storyReactionsController';
import { upload } from '../services/storageService';
import { validateStoryUpload } from '../middleware/mediaValidation';
import { uploadLimiter } from '../middleware/rateLimiter';

const router = Router();

// Story CRUD
router.post('/', authenticate, uploadLimiter, upload.single('media'), validateStoryUpload, createStory);
router.get('/', optionalAuth, getActiveStories);

// Must be before /:id routes to avoid conflict
router.get('/my', authenticate, getMyStories);
router.get('/archives', authenticate, getArchivedStories);
router.delete('/archives/:archiveId', authenticate, deleteArchivedStory);
router.delete('/cleanup/expired', cleanupExpiredStories);
router.get('/settings', authenticate, getStorySettings);
router.put('/settings', authenticate, updateStorySettings);
router.get('/highlights', authenticate, getStoryHighlights);
router.post('/highlights', authenticate, upload.single('coverImage'), createStoryHighlight);
router.get('/highlights/:highlightId', authenticate, getStoryHighlightById);

// Single story operations
router.get('/:id', optionalAuth, getStoryById);
router.put('/:id', authenticate, updateStory);
router.delete('/:id', authenticate, deleteStory);

// Story archive (highlights)
router.post('/:id/archive', authenticate, archiveStory);

// Story viewers
router.get('/:id/viewers', authenticate, getStoryViewers);

// Story analytics (comprehensive analytics for story owners)
router.get('/:id/analytics', authenticate, getStoryAnalytics);

// Story view tracking (track view with duration/completion data)
router.post('/:id/view', authenticate, trackStoryView);
router.patch('/:id/view', authenticate, updateStoryViewDuration);

// Reactions
router.post('/:id/react', authenticate, storyReactions.reactToStory);
router.delete('/:id/react', authenticate, storyReactions.removeReaction);
router.get('/:id/reactions', authenticate, storyReactions.getStoryReactions);

// Replies
router.post('/:id/reply', authenticate, storyReactions.replyToStory);
router.get('/:id/replies', authenticate, storyReactions.getStoryReplies);

export default router;
