import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  getPostAnalytics,
  trackPostView,
  PostAnalytics,
} from '../services/analyticsService';
import logger from '../utils/logger';

const router = express.Router();

// ----------------------------------------
// GET /:postId
// Returns full analytics for a post.
// Only accessible by the post owner.
// ----------------------------------------
router.get(
  '/:postId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { postId } = req.params;
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!postId) {
      res.status(400).json({ success: false, error: 'postId is required' });
      return;
    }

    try {
      const analytics: PostAnalytics = await getPostAnalytics(postId, userId);
      res.json({ success: true, data: analytics });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.startsWith('Forbidden')) {
        res.status(403).json({ success: false, error: message });
        return;
      }

      if (message === 'Post not found') {
        res.status(404).json({ success: false, error: message });
        return;
      }

      logger.error('postAnalytics GET /:postId error', { error, postId, userId });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ----------------------------------------
// POST /:postId/view
// Records a view event for a post.
// viewerId is the authenticated user id when logged in, null otherwise.
// ----------------------------------------
router.post(
  '/:postId/view',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { postId } = req.params;

    if (!postId) {
      res.status(400).json({ success: false, error: 'postId is required' });
      return;
    }

    // Viewer may be unauthenticated — extract userId if token is present without
    // hard-failing the request when no token exists.
    const viewerId: string | null = req.userId ?? null;

    try {
      await trackPostView(postId, viewerId);
      res.status(204).send();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('postAnalytics POST /:postId/view error', { error, postId });
      res.status(500).json({ success: false, error: message });
    }
  }
);

export default router;
