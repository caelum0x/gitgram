import express, { Response } from 'express';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import {
  trackRepositoryView,
  trackRepositoryClone,
  getRepositoryAnalyticsOverview,
  getTrafficData,
  getReferrers,
  getPopularContent,
  RepoOverviewAnalytics,
  TrafficData,
  Referrer,
  PopularPath,
} from '../services/repoAnalyticsService';
import logger from '../utils/logger';

const router = express.Router({ mergeParams: true });

// ----------------------------------------
// Helpers
// ----------------------------------------

function extractOwnerName(req: AuthRequest): { owner: string; name: string } | null {
  const { owner, name } = req.params;
  if (!owner || !name) return null;
  return { owner, name };
}

function handleServiceError(
  error: unknown,
  res: Response,
  context: string
): void {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message.startsWith('Forbidden')) {
    res.status(403).json({ success: false, error: message });
    return;
  }

  if (message === 'Repository not found') {
    res.status(404).json({ success: false, error: message });
    return;
  }

  logger.error(`repositoryAnalytics: ${context}`, { error });
  res.status(500).json({ success: false, error: 'Internal server error' });
}

// ----------------------------------------
// GET /repositories/:owner/:name/analytics
// Overall analytics for a repository.
// Requires: authenticated, repo owner.
// ----------------------------------------
router.get(
  '/',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const params = extractOwnerName(req);
    if (!params) {
      res.status(400).json({ success: false, error: 'owner and name are required' });
      return;
    }

    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    try {
      const analytics: RepoOverviewAnalytics = await getRepositoryAnalyticsOverview(
        params.owner,
        params.name,
        userId
      );
      res.json({ success: true, data: analytics });
    } catch (error) {
      handleServiceError(error, res, 'GET / error');
    }
  }
);

// ----------------------------------------
// GET /repositories/:owner/:name/analytics/traffic
// Daily traffic over the specified period.
// Query: ?period=7d|30d|90d  (default: 7d)
// Requires: authenticated, repo owner.
// ----------------------------------------
router.get(
  '/traffic',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const params = extractOwnerName(req);
    if (!params) {
      res.status(400).json({ success: false, error: 'owner and name are required' });
      return;
    }

    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { period } = req.query;

    try {
      const data: TrafficData = await getTrafficData(
        params.owner,
        params.name,
        userId,
        period
      );
      res.json({ success: true, data });
    } catch (error) {
      handleServiceError(error, res, 'GET /traffic error');
    }
  }
);

// ----------------------------------------
// GET /repositories/:owner/:name/analytics/referrers
// Top referrers for a repository.
// Requires: authenticated, repo owner.
// ----------------------------------------
router.get(
  '/referrers',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const params = extractOwnerName(req);
    if (!params) {
      res.status(400).json({ success: false, error: 'owner and name are required' });
      return;
    }

    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    try {
      const referrers: Referrer[] = await getReferrers(
        params.owner,
        params.name,
        userId
      );
      res.json({ success: true, data: { referrers } });
    } catch (error) {
      handleServiceError(error, res, 'GET /referrers error');
    }
  }
);

// ----------------------------------------
// GET /repositories/:owner/:name/analytics/popular-content
// Most-viewed paths/files in a repository.
// Requires: authenticated, repo owner.
// ----------------------------------------
router.get(
  '/popular-content',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const params = extractOwnerName(req);
    if (!params) {
      res.status(400).json({ success: false, error: 'owner and name are required' });
      return;
    }

    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    try {
      const paths: PopularPath[] = await getPopularContent(
        params.owner,
        params.name,
        userId
      );
      res.json({ success: true, data: { paths } });
    } catch (error) {
      handleServiceError(error, res, 'GET /popular-content error');
    }
  }
);

// ----------------------------------------
// POST /repositories/:owner/:name/analytics/view
// Record a repository view event.
// Public endpoint — viewerId and referrer are optional.
// ----------------------------------------
router.post(
  '/view',
  optionalAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const params = extractOwnerName(req);
    if (!params) {
      res.status(400).json({ success: false, error: 'owner and name are required' });
      return;
    }

    // Resolve repoId from owner+name so the service layer only deals with IDs
    let repoId: string;
    try {
      const { default: prisma } = await import('../utils/prisma');
      // Repository.owner stores the GitHub owner string — look up directly by owner+name
      const repo = await prisma.repository.findFirst({
        where: { owner: params.owner, name: params.name },
        select: { id: true },
      });
      if (!repo) {
        res.status(404).json({ success: false, error: 'Repository not found' });
        return;
      }
      repoId = repo.id;
    } catch (error) {
      logger.error('repositoryAnalytics: POST /view lookup error', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
      return;
    }

    const viewerId: string | null = req.userId ?? null;
    const referrer: string | null =
      typeof req.body?.referrer === 'string' ? req.body.referrer.slice(0, 500) : null;

    try {
      await trackRepositoryView(repoId, viewerId, referrer);
      res.status(204).send();
    } catch (error) {
      logger.error('repositoryAnalytics: POST /view track error', { error, repoId });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ----------------------------------------
// POST /repositories/:owner/:name/analytics/clone
// Record a repository clone event.
// Public endpoint — clonerId is optional (resolved from auth when present).
// ----------------------------------------
router.post(
  '/clone',
  optionalAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const params = extractOwnerName(req);
    if (!params) {
      res.status(400).json({ success: false, error: 'owner and name are required' });
      return;
    }

    let repoId: string;
    try {
      const { default: prisma } = await import('../utils/prisma');
      const repo = await prisma.repository.findFirst({
        where: { owner: params.owner, name: params.name },
        select: { id: true },
      });
      if (!repo) {
        res.status(404).json({ success: false, error: 'Repository not found' });
        return;
      }
      repoId = repo.id;
    } catch (error) {
      logger.error('repositoryAnalytics: POST /clone lookup error', { error });
      res.status(500).json({ success: false, error: 'Internal server error' });
      return;
    }

    const clonerId: string | null = req.userId ?? null;

    try {
      await trackRepositoryClone(repoId, clonerId);
      res.status(204).send();
    } catch (error) {
      logger.error('repositoryAnalytics: POST /clone track error', { error, repoId });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

export default router;
