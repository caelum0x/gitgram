import { Router, Response } from 'express';
import { query } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  getActivityFeed,
  getNetworkTrending,
  ActivityFilter,
} from '../services/activityFeedService';

const router = Router();

// All activity endpoints require an authenticated user.
router.use(authenticate);

const ALLOWED_FILTERS: ReadonlyArray<ActivityFilter> = [
  'all',
  'following',
  'mentions',
  'self',
];

const feedValidator = [
  query('filter')
    .optional()
    .isIn(ALLOWED_FILTERS as string[])
    .withMessage(`filter must be one of: ${ALLOWED_FILTERS.join(', ')}`),
  query('cursor')
    .optional()
    .isISO8601()
    .withMessage('cursor must be an ISO-8601 timestamp'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be between 1 and 50')
    .toInt(),
];

const trendingValidator = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be between 1 and 50')
    .toInt(),
];

/**
 * GET /activity?filter=&cursor=&limit=
 * Cursor-paginated aggregated activity feed for the authenticated user.
 */
router.get('/', validate(feedValidator), async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const filter = (req.query.filter as ActivityFilter | undefined) ?? 'all';
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limit = typeof req.query.limit === 'number' ? req.query.limit : undefined;

    const result = await getActivityFeed(userId, { filter, cursor, limit });

    return res.json({
      success: true,
      data: result.events,
      meta: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load activity feed';
    return res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /activity/network-trending?limit=
 * Repos/posts trending among the people the user follows.
 */
router.get(
  '/network-trending',
  validate(trendingValidator),
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    try {
      const limit = typeof req.query.limit === 'number' ? req.query.limit : undefined;
      const items = await getNetworkTrending(userId, limit);
      return res.json({ success: true, data: items });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to load network trending';
      return res.status(500).json({ success: false, error: message });
    }
  }
);

export default router;
