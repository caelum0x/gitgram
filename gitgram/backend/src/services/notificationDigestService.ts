/**
 * Notification Digest Service
 *
 * Compiles and sends periodic (daily / weekly) notification digests to users
 * who have opted in. A digest aggregates a user's unread notifications grouped
 * by type, plus contextual sections (new followers, mentions, trending repos in
 * the user's languages), renders them as an HTML email, and enqueues delivery
 * through the email queue.
 *
 * Usage:
 *   import { startDigestScheduler } from './notificationDigestService';
 *   startDigestScheduler(); // call once at server startup
 *
 * Period preference + last-sent tracking are kept in-process. The persistent
 * opt-in gate is `NotificationPreferences.emailDigest` in the database; the
 * cadence (daily vs weekly) and last-sent timestamp are tracked here so the
 * scheduler never double-sends within a window.
 */

import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { enqueue } from './emailQueueService';

// ============================================================================
// TYPES
// ============================================================================

export type DigestPeriod = 'daily' | 'weekly';

export interface DigestUser {
  id: string;
  email: string;
  username: string;
}

export interface DigestItem {
  /** Human-readable line for this item. */
  label: string;
  /** Optional deep link into the app. */
  actionUrl?: string;
  /** When the underlying event occurred. */
  occurredAt: Date;
}

export interface DigestSection {
  title: string;
  items: DigestItem[];
}

export interface DigestData {
  user: DigestUser;
  period: DigestPeriod;
  sections: DigestSection[];
  generatedAt: Date;
}

interface DigestPreference {
  period: DigestPeriod;
  lastSentAt: Date | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const APP_URL = process.env.APP_PUBLIC_URL ?? 'https://gitgram.dev';
const MAX_ITEMS_PER_SECTION = 10;
const MAX_TRENDING_REPOS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Notification types surfaced as "top activity" in a digest. */
const ACTIVITY_TYPES = ['LIKE', 'COMMENT', 'REPO_UPDATE', 'STORY_REPLY', 'MESSAGE'] as const;

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  LIKE: 'Likes',
  COMMENT: 'Comments',
  REPO_UPDATE: 'Repository updates',
  STORY_REPLY: 'Story replies',
  MESSAGE: 'Messages',
  MENTION: 'Mentions',
  FOLLOW: 'New followers',
};

// ============================================================================
// IN-PROCESS PREFERENCE / SCHEDULING STATE
// ============================================================================

/**
 * Cadence + last-sent tracking keyed by userId. The DB only stores a boolean
 * opt-in, so the digest frequency and the last-sent timestamp live here to
 * prevent duplicate sends inside a single window.
 */
const digestPreferences = new Map<string, DigestPreference>();

let dailyTimer: ReturnType<typeof setInterval> | null = null;
let weeklyTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// HELPERS
// ============================================================================

const windowMsFor = (period: DigestPeriod): number =>
  period === 'daily' ? DAY_MS : WEEK_MS;

const windowStart = (period: DigestPeriod): Date =>
  new Date(Date.now() - windowMsFor(period));

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getPreference = (userId: string): DigestPreference => {
  const existing = digestPreferences.get(userId);
  if (existing) return existing;
  const created: DigestPreference = { period: 'daily', lastSentAt: null };
  digestPreferences.set(userId, created);
  return created;
};

/**
 * Set a user's digest cadence (daily | weekly). Resets last-sent so the next
 * scheduler tick can deliver under the new cadence.
 */
export const setDigestPeriod = (userId: string, period: DigestPeriod): void => {
  const pref = getPreference(userId);
  digestPreferences.set(userId, { ...pref, period });
};

const markSent = (userId: string): void => {
  const pref = getPreference(userId);
  digestPreferences.set(userId, { ...pref, lastSentAt: new Date() });
};

/** Clear all in-process digest state (tests / graceful shutdown). */
export const resetDigestState = (): void => {
  digestPreferences.clear();
};

// ============================================================================
// SECTION BUILDERS
// ============================================================================

/**
 * Build the "top activity" section by grouping unread notifications by type
 * and surfacing the most recent items per activity type.
 */
const buildActivitySection = (
  notifications: ReadonlyArray<{ type: string; content: string; postId: string | null; createdAt: Date }>
): DigestSection => {
  const byType = new Map<string, DigestItem[]>();

  for (const note of notifications) {
    if (!ACTIVITY_TYPES.includes(note.type as (typeof ACTIVITY_TYPES)[number])) continue;
    const bucket = byType.get(note.type) ?? [];
    if (bucket.length >= MAX_ITEMS_PER_SECTION) continue;
    bucket.push({
      label: note.content,
      actionUrl: note.postId ? `${APP_URL}/post/${note.postId}` : undefined,
      occurredAt: note.createdAt,
    });
    byType.set(note.type, bucket);
  }

  const items: DigestItem[] = [];
  for (const [type, bucket] of byType.entries()) {
    const typeLabel = ACTIVITY_TYPE_LABELS[type] ?? type;
    items.push({
      label: `${typeLabel}: ${bucket.length} new`,
      occurredAt: bucket[0]?.occurredAt ?? new Date(),
    });
    items.push(...bucket);
  }

  return { title: 'Top activity', items: items.slice(0, MAX_ITEMS_PER_SECTION) };
};

/** Build the "new followers" section from FOLLOW notifications. */
const buildFollowersSection = (
  notifications: ReadonlyArray<{ type: string; content: string; actorId: string | null; createdAt: Date }>
): DigestSection => {
  const items: DigestItem[] = notifications
    .filter((n) => n.type === 'FOLLOW')
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map((n) => ({
      label: n.content,
      actionUrl: n.actorId ? `${APP_URL}/u/${n.actorId}` : undefined,
      occurredAt: n.createdAt,
    }));

  return { title: 'New followers', items };
};

/** Build the "mentions" section from MENTION notifications. */
const buildMentionsSection = (
  notifications: ReadonlyArray<{ type: string; content: string; postId: string | null; createdAt: Date }>
): DigestSection => {
  const items: DigestItem[] = notifications
    .filter((n) => n.type === 'MENTION')
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map((n) => ({
      label: n.content,
      actionUrl: n.postId ? `${APP_URL}/post/${n.postId}` : undefined,
      occurredAt: n.createdAt,
    }));

  return { title: 'Mentions', items };
};

/**
 * Build the "trending in your languages" section from the user's interests
 * (languages / topics). This surfaces trending repositories whose primary
 * language matches one of the user's declared interests.
 */
const buildTrendingSection = async (interests: ReadonlyArray<string>): Promise<DigestSection> => {
  if (interests.length === 0) {
    return { title: 'Trending in your languages', items: [] };
  }

  try {
    const repos = await prisma.repository.findMany({
      where: { language: { in: [...interests] } },
      orderBy: { stars: 'desc' },
      take: MAX_TRENDING_REPOS,
      select: { id: true, name: true, language: true, stars: true },
    });

    const items: DigestItem[] = repos.map((repo) => ({
      label: `${repo.name} (${repo.language ?? 'unknown'}) - ${repo.stars ?? 0} stars`,
      actionUrl: `${APP_URL}/r/${repo.id}`,
      occurredAt: new Date(),
    }));

    return { title: 'Trending in your languages', items };
  } catch (error: unknown) {
    logger.warn('[digest] Failed to load trending repos', error);
    return { title: 'Trending in your languages', items: [] };
  }
};

// ============================================================================
// CORE: DIGEST GENERATION
// ============================================================================

/**
 * Generate a digest for a single user over the given period. Collects unread
 * notifications inside the window, groups them by type, and assembles the
 * contextual sections.
 *
 * Returns `null` if the user does not exist.
 */
export const generateDigest = async (
  userId: string,
  period: DigestPeriod
): Promise<DigestData | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, interests: true },
  });

  if (!user) {
    logger.warn(`[digest] generateDigest: user ${userId} not found`);
    return null;
  }

  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      read: false,
      createdAt: { gte: windowStart(period) },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      type: true,
      content: true,
      actorId: true,
      postId: true,
      createdAt: true,
    },
  });

  const sections: DigestSection[] = [
    buildActivitySection(notifications),
    buildFollowersSection(notifications),
    buildMentionsSection(notifications),
    await buildTrendingSection(user.interests),
  ].filter((section) => section.items.length > 0);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username ?? user.email.split('@')[0] ?? 'there',
    },
    period,
    sections,
    generatedAt: new Date(),
  };
};

// ============================================================================
// ELIGIBILITY
// ============================================================================

/**
 * Determine whether a user should receive a digest right now. Requires:
 *  1. The persistent `emailDigest` opt-in to be enabled.
 *  2. Enough time elapsed since the last send for the user's cadence.
 */
export const shouldReceiveDigest = async (userId: string): Promise<boolean> => {
  try {
    const prefs = await prisma.notificationPreferences.findUnique({
      where: { userId },
      select: { emailDigest: true },
    });

    if (!prefs || !prefs.emailDigest) return false;

    const { period, lastSentAt } = getPreference(userId);
    if (lastSentAt === null) return true;

    const elapsed = Date.now() - lastSentAt.getTime();
    return elapsed >= windowMsFor(period);
  } catch (error: unknown) {
    logger.error('[digest] shouldReceiveDigest failed', error);
    return false;
  }
};

// ============================================================================
// SENDING
// ============================================================================

/**
 * Generate, render, and enqueue a digest for one user. Returns the enqueued
 * job id, or `null` when there was nothing to send (no user, no content, or
 * the user is not currently eligible).
 */
const sendDigestForUser = async (
  userId: string,
  period: DigestPeriod
): Promise<string | null> => {
  if (!(await shouldReceiveDigest(userId))) return null;

  const digest = await generateDigest(userId, period);
  if (!digest || digest.sections.length === 0) {
    logger.debug(`[digest] Nothing to send for user ${userId} (${period})`);
    return null;
  }

  const itemCount = digest.sections.reduce((sum, section) => sum + section.items.length, 0);
  const subject =
    period === 'daily'
      ? `Your Gitgram daily digest - ${itemCount} update${itemCount !== 1 ? 's' : ''}`
      : `Your Gitgram weekly digest - ${itemCount} update${itemCount !== 1 ? 's' : ''}`;

  const jobId = enqueue({
    to: digest.user.email,
    subject,
    html: formatDigestHtml(digest),
    priority: 'low',
    maxAttempts: 2,
  });

  markSent(userId);
  logger.info(`[digest] Enqueued ${period} digest ${jobId} for user ${userId}`);
  return jobId;
};

/**
 * Find every user opted in for digests with the given cadence and enqueue a
 * digest for each eligible one. Returns the number of digests enqueued.
 */
const sendDigestsForPeriod = async (period: DigestPeriod): Promise<number> => {
  let optedIn: Array<{ userId: string | null }>;
  try {
    optedIn = await prisma.notificationPreferences.findMany({
      where: { emailDigest: true, userId: { not: null } },
      select: { userId: true },
    });
  } catch (error: unknown) {
    logger.error('[digest] Failed to load opted-in users', error);
    return 0;
  }

  let sent = 0;
  for (const { userId } of optedIn) {
    if (!userId) continue;
    if (getPreference(userId).period !== period) continue;

    try {
      const jobId = await sendDigestForUser(userId, period);
      if (jobId) sent += 1;
    } catch (error: unknown) {
      logger.error(`[digest] Failed to send ${period} digest for user ${userId}`, error);
    }
  }

  logger.info(`[digest] Enqueued ${sent} ${period} digest(s)`);
  return sent;
};

/** Enqueue daily digests for all eligible users. Returns the count enqueued. */
export const sendDailyDigests = (): Promise<number> => sendDigestsForPeriod('daily');

/** Enqueue weekly digests for all eligible users. Returns the count enqueued. */
export const sendWeeklyDigests = (): Promise<number> => sendDigestsForPeriod('weekly');

// ============================================================================
// HTML RENDERING
// ============================================================================

const renderItem = (item: DigestItem): string => {
  const label = escapeHtml(item.label);
  if (item.actionUrl) {
    const url = escapeHtml(item.actionUrl);
    return `<li style="margin:6px 0;"><a href="${url}" style="color:#2563eb;text-decoration:none;">${label}</a></li>`;
  }
  return `<li style="margin:6px 0;color:#374151;">${label}</li>`;
};

const renderSection = (section: DigestSection): string => {
  const title = escapeHtml(section.title);
  const items = section.items.map(renderItem).join('');
  return `
    <table role="presentation" width="100%" style="margin:0 0 24px 0;">
      <tr>
        <td>
          <h2 style="font-size:18px;color:#111827;margin:0 0 8px 0;">${title}</h2>
          <ul style="padding-left:18px;margin:0;list-style:disc;">${items}</ul>
        </td>
      </tr>
    </table>`;
};

/**
 * Render a digest into a self-contained, inline-styled HTML email body.
 */
export const formatDigestHtml = (digest: DigestData): string => {
  const username = escapeHtml(digest.user.username);
  const periodLabel = digest.period === 'daily' ? 'today' : 'this week';
  const generated = escapeHtml(digest.generatedAt.toUTCString());
  const sectionsHtml = digest.sections.map(renderSection).join('');
  const settingsUrl = escapeHtml(`${APP_URL}/settings/notifications`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Gitgram digest</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;padding:32px;">
          <tr>
            <td>
              <h1 style="font-size:22px;color:#111827;margin:0 0 4px 0;">Hi ${username},</h1>
              <p style="font-size:14px;color:#6b7280;margin:0 0 24px 0;">
                Here's what happened on Gitgram ${periodLabel}.
              </p>
              ${sectionsHtml}
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
              <p style="font-size:12px;color:#9ca3af;margin:0 0 8px 0;">
                Generated ${generated}.
              </p>
              <p style="font-size:12px;color:#9ca3af;margin:0;">
                Don't want these? <a href="${settingsUrl}" style="color:#6b7280;">Manage your email preferences</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ============================================================================
// SCHEDULER
// ============================================================================

/**
 * Whether the given moment is the configured trigger time for a cadence:
 *  - daily   -> every day at 09:00 local time
 *  - weekly  -> Mondays at 09:00 local time
 */
const isTriggerTime = (now: Date, period: DigestPeriod): boolean => {
  const isNineAm = now.getHours() === 9 && now.getMinutes() === 0;
  if (!isNineAm) return false;
  if (period === 'weekly') return now.getDay() === 1; // Monday
  return true;
};

const DEFAULT_TICK_MS = 60 * 1000; // check once per minute

/**
 * Start the digest scheduler. A single per-minute tick checks whether the
 * current time matches each cadence's trigger window (daily 9am, weekly Monday
 * 9am) and fans out the corresponding sends. Safe to call multiple times.
 */
export const startDigestScheduler = (tickMs: number = DEFAULT_TICK_MS): void => {
  if (dailyTimer !== null || weeklyTimer !== null) {
    logger.debug('[digest] Scheduler already running');
    return;
  }

  dailyTimer = setInterval(() => {
    const now = new Date();
    if (!isTriggerTime(now, 'daily')) return;
    sendDailyDigests().catch((error: unknown) => {
      logger.error('[digest] Daily digest run failed', error);
    });
  }, tickMs);

  weeklyTimer = setInterval(() => {
    const now = new Date();
    if (!isTriggerTime(now, 'weekly')) return;
    sendWeeklyDigests().catch((error: unknown) => {
      logger.error('[digest] Weekly digest run failed', error);
    });
  }, tickMs);

  logger.info(`[digest] Scheduler started (tick: ${tickMs}ms)`);
};

/** Stop the digest scheduler (tests / graceful shutdown). */
export const stopDigestScheduler = (): void => {
  if (dailyTimer !== null) {
    clearInterval(dailyTimer);
    dailyTimer = null;
  }
  if (weeklyTimer !== null) {
    clearInterval(weeklyTimer);
    weeklyTimer = null;
  }
  logger.info('[digest] Scheduler stopped');
};
