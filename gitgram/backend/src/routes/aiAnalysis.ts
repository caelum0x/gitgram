import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import logger from '../utils/logger';
import { isAiAnalysisEnabled, featureUnavailablePayload } from '../config/featureAvailability';

const router = Router();

/**
 * Guard that returns 503 when the GitNexus-backed AI analysis feature is not
 * provisioned in this deployment, instead of attempting (and timing out) on a
 * default localhost connection.
 */
function requireAiAnalysisEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!isAiAnalysisEnabled()) {
    res.status(503).json(featureUnavailablePayload('AI code analysis (GitNexus)'));
    return;
  }
  next();
}

const GITNEXUS_URL = process.env.GITNEXUS_URL || 'http://localhost:3001';

// Fail fast when GitNexus is unreachable instead of hanging the request.
const GITNEXUS_TIMEOUT_MS = parseInt(process.env.GITNEXUS_TIMEOUT_MS || '30000', 10);

const GITHUB_URL_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\/.*)?$/;

/**
 * fetch wrapper that aborts after the configured timeout so a down/slow
 * GitNexus service does not block the Express request indefinitely.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, string>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

async function sendJsonRpc(
  method: string,
  params: Record<string, string>,
  id: number
): Promise<JsonRpcResponse> {
  const payload: JsonRpcRequest = {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };

  const response = await fetchWithTimeout(
    `${GITNEXUS_URL}/message`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    GITNEXUS_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`GitNexus responded with status ${response.status} for method ${method}`);
  }

  return response.json() as Promise<JsonRpcResponse>;
}

/**
 * @swagger
 * /api/v1/tools/ai-analysis/analyze:
 *   post:
 *     summary: Run GitNexus-powered code analysis on a GitHub repository
 *     tags: [AI Tools]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - repoUrl
 *             properties:
 *               repoUrl:
 *                 type: string
 *                 description: GitHub repository URL (e.g. https://github.com/owner/repo)
 *     responses:
 *       200:
 *         description: Analysis results from GitNexus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 structure:
 *                   type: object
 *                 impact:
 *                   type: object
 *                 routeMap:
 *                   type: object
 *                 apiSurface:
 *                   type: object
 *       400:
 *         description: Invalid or non-GitHub URL
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: GitNexus analysis failed
 */
router.post('/analyze', authenticate, requireAiAnalysisEnabled, async (req: Request, res: Response): Promise<void> => {
  const { repoUrl } = req.body as { repoUrl?: string };

  if (!repoUrl || typeof repoUrl !== 'string') {
    res.status(400).json({ error: 'repoUrl is required' });
    return;
  }

  if (!GITHUB_URL_REGEX.test(repoUrl)) {
    res.status(400).json({ error: 'repoUrl must be a valid GitHub repository URL (https://github.com/owner/repo)' });
    return;
  }

  try {
    const [contextRes, impactRes, routeMapRes, apiImpactRes] = await Promise.all([
      sendJsonRpc('gn_context', { repoUrl }, 1),
      sendJsonRpc('gn_impact', { repoUrl }, 2),
      sendJsonRpc('gn_route_map', { repoUrl }, 3),
      sendJsonRpc('gn_api_impact', { repoUrl }, 4),
    ]);

    res.json({
      structure: contextRes.result ?? null,
      impact: impactRes.result ?? null,
      routeMap: routeMapRes.result ?? null,
      apiSurface: apiImpactRes.result ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('GitNexus analysis failed', { repoUrl, error: message });
    res.status(500).json({ error: 'GitNexus analysis failed', details: message });
  }
});

/**
 * @swagger
 * /api/v1/tools/ai-analysis/status:
 *   get:
 *     summary: Check if the GitNexus MCP server is reachable
 *     tags: [AI Tools]
 *     responses:
 *       200:
 *         description: GitNexus is reachable
 *       502:
 *         description: GitNexus is unreachable
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  const enabled = isAiAnalysisEnabled();

  if (!enabled) {
    res.json({ enabled: false, reachable: false, url: GITNEXUS_URL });
    return;
  }

  try {
    const response = await fetchWithTimeout(GITNEXUS_URL, { method: 'GET' }, 5000);
    res.json({ enabled: true, reachable: true, status: response.status, url: GITNEXUS_URL });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('GitNexus health check failed', { url: GITNEXUS_URL, error: message });
    res.status(502).json({ enabled: true, reachable: false, url: GITNEXUS_URL, error: message });
  }
});

export default router;
