import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import logger from '../utils/logger';

/**
 * Feed-feedback signals, ported from Bluesky's feed-feedback interactions.
 * These are best-effort personalisation hints used to improve discover-feed
 * ranking over time.
 */
const VALID_SIGNALS = ['requestLess', 'requestMore', 'seen'] as const;
type FeedSignal = (typeof VALID_SIGNALS)[number];

interface FeedSignalEvent {
  postId: string;
  signal: FeedSignal;
  feedContext?: string;
}

const MAX_EVENTS = 50;

function isValidEvent(value: unknown): value is FeedSignalEvent {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.postId === 'string' &&
    e.postId.length > 0 &&
    e.postId.length <= 50 &&
    typeof e.signal === 'string' &&
    (VALID_SIGNALS as readonly string[]).includes(e.signal) &&
    (e.feedContext === undefined || typeof e.feedContext === 'string')
  );
}

/**
 * Record a batch of feed-feedback signals for the authenticated user.
 * POST /api/v1/posts/feedback  { events: FeedSignalEvent[] }
 */
export const recordFeedFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw Errors.unauthorized('Authentication required');
  }

  const { events } = req.body as { events?: unknown };

  if (!Array.isArray(events)) {
    throw Errors.badRequest('events must be an array');
  }

  if (events.length === 0) {
    res.json({ success: true, recorded: 0 });
    return;
  }

  if (events.length > MAX_EVENTS) {
    throw Errors.badRequest(`Maximum ${MAX_EVENTS} events per request`);
  }

  const valid = events.filter(isValidEvent);

  // Best-effort: surface these as structured ranking signals. Downstream
  // personalisation / analytics can consume the log stream without requiring a
  // schema migration in this change.
  for (const event of valid) {
    logger.info('feed-feedback signal', {
      userId,
      postId: event.postId,
      signal: event.signal,
      feedContext: event.feedContext,
    });
  }

  res.json({ success: true, recorded: valid.length });
});

export default { recordFeedFeedback };
