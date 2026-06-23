import express, { Response } from 'express';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import {
  resolveRepoId,
  getPulse,
  getContributors,
  getTraffic,
  getCommitActivity,
  getCodeFrequency,
  getLanguages,
} from '../services/repoInsightsService';
import logger from '../utils/logger';

// ============================================
// Repository Insights routes
//
// Mounted at: /api/v1/repositories/:owner/:name/insights
//
// Public repositories are viewable without auth, so we use `optionalAuth`
// (auth is attached when present but never required). Each handler resolves
// owner + name -> repoId, delegates to the insights service, and returns the
// standard { success, data } envelope the web client unwraps.
// ============================================

const router = express.Router({ mergeParams: true });

// ---- Helpers ---------------------------------------------------------------

interface OwnerName {
  owner: string;
  name: string;
}

function extractOwnerName(req: AuthRequest): OwnerName | null {
  const { owner, name } = req.params;
  if (!owner || !name) return null;
  return { owner, name };
}

function clampDays(raw: unknown): number {
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(parsed, 1), 365);
}

function parsePeriod(raw: unknown): string {
  const allowed = new Set(['7d', '14d', '30d', '90d']);
  return typeof raw === 'string' && allowed.has(raw) ? raw : '14d';
}

function handleError(error: unknown, res: Response, context: string): void {
  logger.error(`repositoryInsights: ${context}`, { error });
  res.status(500).json({ success: false, error: 'Internal server error' });
}

/**
 * Resolve owner + name from the request to a repository id. Writes the
 * appropriate error response and returns null when resolution fails.
 */
async function resolveOr404(req: AuthRequest, res: Response): Promise<string | null> {
  const params = extractOwnerName(req);
  if (!params) {
    res.status(400).json({ success: false, error: 'owner and name are required' });
    return null;
  }

  const repo = await resolveRepoId(params.owner, params.name);
  if (!repo) {
    res.status(404).json({ success: false, error: 'Repository not found' });
    return null;
  }

  return repo.id;
}

// ---- Routes ----------------------------------------------------------------

// GET /repositories/:owner/:name/insights/pulse?days=30
router.get('/pulse', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const repoId = await resolveOr404(req, res);
    if (!repoId) return;
    const data = await getPulse(repoId, clampDays(req.query.days));
    res.json({ success: true, data });
  } catch (error) {
    handleError(error, res, 'GET /pulse');
  }
});

// GET /repositories/:owner/:name/insights/contributors
router.get('/contributors', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const repoId = await resolveOr404(req, res);
    if (!repoId) return;
    const data = await getContributors(repoId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(error, res, 'GET /contributors');
  }
});

// GET /repositories/:owner/:name/insights/traffic?period=14d
router.get('/traffic', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const repoId = await resolveOr404(req, res);
    if (!repoId) return;
    const data = await getTraffic(repoId, parsePeriod(req.query.period));
    res.json({ success: true, data });
  } catch (error) {
    handleError(error, res, 'GET /traffic');
  }
});

// GET /repositories/:owner/:name/insights/commit-activity
router.get('/commit-activity', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const repoId = await resolveOr404(req, res);
    if (!repoId) return;
    const data = await getCommitActivity(repoId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(error, res, 'GET /commit-activity');
  }
});

// GET /repositories/:owner/:name/insights/code-frequency
router.get('/code-frequency', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const repoId = await resolveOr404(req, res);
    if (!repoId) return;
    const data = await getCodeFrequency(repoId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(error, res, 'GET /code-frequency');
  }
});

// GET /repositories/:owner/:name/insights/languages
router.get('/languages', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const repoId = await resolveOr404(req, res);
    if (!repoId) return;
    const data = await getLanguages(repoId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(error, res, 'GET /languages');
  }
});

export default router;
