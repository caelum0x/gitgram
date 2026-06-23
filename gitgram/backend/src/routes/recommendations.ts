import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as recommendationService from '../services/recommendationService';

const router = Router();

// All recommendation endpoints require an authenticated user.
router.use(authenticate);

/** Clamp the `limit` query param to a sane, bounded integer. */
function parseLimit(raw: unknown, fallback: number, max = 50): number {
  const value = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(value) || value < 1) return fallback;
  return Math.min(value, max);
}

/**
 * GET /api/v1/recommendations/users
 * 2nd-degree network suggestions with shared languages/interests.
 */
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const limit = parseLimit(req.query.limit, 10);
    const data = await recommendationService.getRecommendedUsers(userId, limit);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to load user recommendations' });
  }
});

/**
 * GET /api/v1/recommendations/repos
 * Repos by starred languages, popular-in-network, and trending interests.
 */
router.get('/repos', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const limit = parseLimit(req.query.limit, 10);
    const data = await recommendationService.getRecommendedRepos(userId, limit);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to load repo recommendations' });
  }
});

/**
 * GET /api/v1/recommendations/snippets
 * Snippets in preferred languages and from people you follow.
 */
router.get('/snippets', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const limit = parseLimit(req.query.limit, 10);
    const data = await recommendationService.getRecommendedSnippets(userId, limit);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to load snippet recommendations' });
  }
});

/**
 * GET /api/v1/recommendations/topics
 * Topics derived from your starred repos and network activity.
 */
router.get('/topics', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const limit = parseLimit(req.query.limit, 10);
    const data = await recommendationService.getRecommendedTopics(userId, limit);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to load topic recommendations' });
  }
});

/**
 * GET /api/v1/recommendations/for-you
 * Mixed personalized feed with cursor pagination (`?cursor=&limit=`).
 */
router.get('/for-you', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const limit = parseLimit(req.query.limit, 20);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    const feed = await recommendationService.getForYouFeed(userId, cursor, limit);
    return res.json({ success: true, data: feed.items, meta: { nextCursor: feed.nextCursor } });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to load for-you feed' });
  }
});

export default router;
