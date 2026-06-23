import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  createActivityFeedService,
  publicActivityFeedService,
} from '../services/githubActivityFeedService';
import {
  fetchUserGitHubActivity,
  getGitHubActivityFeed,
  autoPostGitHubActivity,
} from '../services/githubActivityService';

const router = Router();

/**
 * GET /api/v1/github-activity/feed
 * Returns the authenticated user's combined GitHub activity feed (own activity +
 * followed repositories + received events).
 */
router.get('/feed', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const limit = parseInt(String(req.query.limit ?? '20'), 10);
    const cursor = req.query.cursor as string | undefined;

    const feed = await getGitHubActivityFeed(userId, cursor, limit);

    res.json({
      success: true,
      data: feed,
      meta: { page, limit },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch activity feed';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/v1/github-activity/user/:username
 * Returns public GitHub activity for a given GitHub username.
 */
router.get('/user/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const perPage = parseInt(String(req.query.perPage ?? '30'), 10);

    const activity = await publicActivityFeedService.getUserActivity(username, {
      page,
      perPage,
    });

    res.json({
      success: true,
      data: activity,
      meta: { page, perPage },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user activity';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/v1/github-activity/events
 * Returns recent GitHub events received by the authenticated user.
 * Falls back to raw received events from the GitHub Events API.
 */
router.get('/events', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const service = await createActivityFeedService(userId);
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const perPage = parseInt(String(req.query.perPage ?? '30'), 10);

    const events = await service.getReceivedActivity({ page, perPage });

    res.json({
      success: true,
      data: events,
      meta: { page, perPage },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch GitHub events';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/v1/github-activity/sync
 * Triggers a sync of the authenticated user's GitHub activity.
 * Optionally auto-posts new events as gitgram posts.
 * Query params:
 *   - dryRun=true  — preview what would be posted without writing to the DB
 */
router.post('/sync', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const dryRun = req.query.dryRun === 'true';

    // Refresh the raw event cache so subsequent feed calls see fresh data
    const events = await fetchUserGitHubActivity(userId);

    // Optionally auto-post new events as gitgram posts
    const autoPostResult = await autoPostGitHubActivity(userId, { dryRun });

    res.json({
      success: true,
      data: {
        eventCount: events.length,
        autoPost: autoPostResult,
        dryRun,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sync GitHub activity';
    res.status(500).json({ error: message });
  }
});

export default router;
