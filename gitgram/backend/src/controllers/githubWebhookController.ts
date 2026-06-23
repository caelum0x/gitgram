import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { WebhookRequest } from '../middleware/githubWebhookAuth';
import {
  processGitHubEvent,
  registerWebhook,
  deactivateWebhook,
  getRepositoryActivity,
  getWebhookStatus
} from '../services/githubActivityService';
import {
  processGitHubPush,
  processGitHubPullRequest,
  processGitHubRelease,
  processGitHubStar,
  GitHubPushPayload,
  GitHubPRPayload,
  GitHubReleasePayload,
  GitHubStarPayload,
} from '../services/webhookProcessor';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

/**
 * Route a verified webhook event to the appropriate webhookProcessor handler.
 * Unknown event types are silently skipped.
 */
async function dispatchWebhookProcessor(
  event: string,
  // Payload shapes differ per event; we cast after the switch guard.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
): Promise<void> {
  switch (event) {
    case 'push':
      await processGitHubPush(payload as unknown as GitHubPushPayload);
      break;
    case 'pull_request':
      await processGitHubPullRequest(payload as unknown as GitHubPRPayload);
      break;
    case 'release':
      await processGitHubRelease(payload as unknown as GitHubReleasePayload);
      break;
    case 'star':
      await processGitHubStar(payload as unknown as GitHubStarPayload);
      break;
    default:
      // No post-processing defined for this event type
      break;
  }
}

/**
 * Handle incoming GitHub webhook
 * POST /api/v1/github/webhooks/incoming
 */
export const handleWebhook = asyncHandler(async (req: WebhookRequest, res: Response) => {
  const { event, deliveryId, repositoryId, payload } = req.webhookData!;

  // Respond immediately to GitHub (they expect < 10s response)
  res.status(200).json({ received: true });

  // Process event asynchronously — activity log + auto-post pipeline run in parallel
  processGitHubEvent(event, deliveryId, repositoryId, payload).catch(error => {
    logger.error('Async webhook processing error:', error);
  });

  dispatchWebhookProcessor(event, payload).catch(error => {
    logger.error('Webhook post processor error:', error);
  });
});

/**
 * Register webhook for a repository
 * POST /api/v1/github/webhooks/register
 */
export const registerWebhookHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { owner, repo, events } = req.body;
  const userId = req.userId!;

  if (!owner || !repo) {
    throw Errors.badRequest('Owner and repo are required');
  }

  const result = await registerWebhook(userId, owner, repo, events);

  res.status(201).json({
    success: true,
    message: `Webhook registered for ${owner}/${repo}`,
    webhookId: result.webhookId
  });
});

/**
 * Deactivate webhook for a repository
 * DELETE /api/v1/github/webhooks/:owner/:repo
 */
export const deactivateWebhookHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { owner, repo } = req.params;
  const userId = req.userId!;

  await deactivateWebhook(userId, owner, repo);

  res.json({ success: true, message: `Webhook deactivated for ${owner}/${repo}` });
});

/**
 * Get webhook status for a repository
 * GET /api/v1/github/webhooks/:owner/:repo/status
 */
export const getWebhookStatusHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { owner, repo } = req.params;

  const status = await getWebhookStatus(owner, repo);

  res.json(status);
});

/**
 * Get activity timeline for a repository
 * GET /api/v1/repositories/:owner/:name/activity
 */
export const getActivityTimeline = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { owner, name } = req.params;
  const { page = '1', limit = '20', eventType } = req.query;

  // Find repository
  const { prisma } = await import('../utils/prisma');
  const repository = await prisma.repository.findUnique({
    where: { fullName: `${owner}/${name}` }
  });

  if (!repository) {
    throw Errors.notFound('Repository');
  }

  const activities = await getRepositoryActivity(repository.id, {
    page: parseInt(page as string),
    limit: parseInt(limit as string),
    eventType: eventType as any
  });

  res.json({
    activities,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      hasMore: activities.length === parseInt(limit as string)
    }
  });
});
