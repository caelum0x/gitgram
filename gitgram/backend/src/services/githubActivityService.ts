import { Octokit } from '@octokit/rest';
import { prisma } from '../utils/prisma';
import { GitHubEventType, Prisma } from '@prisma/client';
import logger from '../utils/logger';
import { createNotification } from './notificationService';
import { generateWebhookSecret } from '../middleware/githubWebhookAuth';
import { cache } from './redisService';

interface GitHubWebhookPayload {
  action?: string;
  sender: {
    login: string;
    avatar_url?: string;
    html_url?: string;
  };
  repository: {
    full_name: string;
    html_url: string;
    stargazers_count?: number;
    forks_count?: number;
  };
  // GitHub webhook payloads are dynamic - specific fields accessed per event type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface ActivityData {
  repositoryId: string;
  eventType: GitHubEventType;
  eventId: string;
  action?: string;
  actorLogin: string;
  actorAvatar?: string;
  actorUrl?: string;
  title?: string;
  body?: string;
  url?: string;
  ref?: string;
  sha?: string;
  metadata?: Prisma.InputJsonValue;
  occurredAt: Date;
}

/**
 * Process incoming GitHub webhook event
 */
export async function processGitHubEvent(
  event: string,
  deliveryId: string,
  repositoryId: string,
  payload: GitHubWebhookPayload
): Promise<void> {
  try {
    // Check for duplicate delivery (idempotency)
    const existing = await prisma.repositoryActivity.findUnique({
      where: { eventId: deliveryId }
    });

    if (existing) {
      logger.debug(`Duplicate webhook delivery ignored: ${deliveryId}`);
      return;
    }

    // Route to appropriate handler
    const eventType = mapEventToType(event);
    if (!eventType) {
      logger.debug(`Unhandled GitHub event type: ${event}`);
      return;
    }

    const activityData = await extractActivityData(
      eventType,
      deliveryId,
      repositoryId,
      payload
    );

    if (!activityData) {
      logger.debug(`No activity data extracted for event: ${event}`);
      return;
    }

    // Create activity record
    const activity = await prisma.repositoryActivity.create({
      data: activityData
    });

    // Notify repository followers
    await notifyFollowers(repositoryId, activity, payload);

    logger.info(`Activity created: ${eventType} for repo ${repositoryId}`);
  } catch (error) {
    logger.error('Process GitHub event error:', error);
    throw error;
  }
}

/**
 * Map GitHub event name to our enum
 */
function mapEventToType(event: string): GitHubEventType | null {
  const mapping: Record<string, GitHubEventType> = {
    'push': 'PUSH',
    'pull_request': 'PULL_REQUEST',
    'issues': 'ISSUES',
    'release': 'RELEASE',
    'star': 'STAR',
    'watch': 'WATCH',
    'fork': 'FORK',
    'create': 'CREATE',
    'delete': 'DELETE'
  };
  return mapping[event] || null;
}

/**
 * Extract activity data from webhook payload based on event type
 */
async function extractActivityData(
  eventType: GitHubEventType,
  deliveryId: string,
  repositoryId: string,
  payload: GitHubWebhookPayload
): Promise<ActivityData | null> {
  const baseData: Partial<ActivityData> = {
    repositoryId,
    eventType,
    eventId: deliveryId,
    action: payload.action,
    actorLogin: payload.sender.login,
    actorAvatar: payload.sender.avatar_url,
    actorUrl: payload.sender.html_url,
    occurredAt: new Date()
  };

  switch (eventType) {
    case 'PUSH':
      return handlePushEvent(baseData, payload);
    case 'PULL_REQUEST':
      return handlePullRequestEvent(baseData, payload);
    case 'ISSUES':
      return handleIssuesEvent(baseData, payload);
    case 'RELEASE':
      return handleReleaseEvent(baseData, payload);
    case 'STAR':
      return handleStarEvent(baseData, payload);
    case 'FORK':
      return handleForkEvent(baseData, payload);
    case 'CREATE':
    case 'DELETE':
      return handleRefEvent(baseData, payload);
    default:
      return null;
  }
}

function handlePushEvent(baseData: Partial<ActivityData>, payload: GitHubWebhookPayload): ActivityData {
  const commits = payload.commits || [];
  const commitCount = commits.length;
  const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';

  return {
    ...baseData,
    title: `Pushed ${commitCount} commit${commitCount !== 1 ? 's' : ''} to ${branch}`,
    body: commits.slice(0, 3).map((c: GitHubWebhookPayload) => `- ${c.message?.split('\n')[0]}`).join('\n'),
    url: payload.compare,
    ref: branch,
    sha: payload.after,
    metadata: {
      commitCount,
      commits: commits.slice(0, 5).map((c: GitHubWebhookPayload) => ({
        sha: c.id?.slice(0, 7),
        message: c.message?.split('\n')[0],
        author: c.author?.username || c.author?.name
      })),
      forced: payload.forced
    }
  } as ActivityData;
}

function handlePullRequestEvent(baseData: Partial<ActivityData>, payload: GitHubWebhookPayload): ActivityData | null {
  const pr = payload.pull_request;
  const action = payload.action;

  // Only track significant PR actions
  const significantActions = ['opened', 'closed', 'merged', 'reopened'];
  if (!action || !significantActions.includes(action)) {
    return null;
  }

  const actionVerb = action === 'closed' && pr.merged ? 'merged' : action;

  return {
    ...baseData,
    action: actionVerb,
    title: `${actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1)} PR #${pr.number}: ${pr.title}`,
    body: pr.body?.slice(0, 500),
    url: pr.html_url,
    metadata: {
      prNumber: pr.number,
      prState: pr.state,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      merged: pr.merged,
      baseBranch: pr.base?.ref,
      headBranch: pr.head?.ref
    }
  } as ActivityData;
}

function handleIssuesEvent(baseData: Partial<ActivityData>, payload: GitHubWebhookPayload): ActivityData | null {
  const issue = payload.issue;
  const action = payload.action;

  // Only track significant issue actions
  const significantActions = ['opened', 'closed', 'reopened'];
  if (!action || !significantActions.includes(action)) {
    return null;
  }

  return {
    ...baseData,
    title: `${action.charAt(0).toUpperCase() + action.slice(1)} issue #${issue.number}: ${issue.title}`,
    body: issue.body?.slice(0, 500),
    url: issue.html_url,
    metadata: {
      issueNumber: issue.number,
      issueState: issue.state,
      labels: issue.labels?.map((l: GitHubWebhookPayload) => l.name)
    }
  } as ActivityData;
}

function handleReleaseEvent(baseData: Partial<ActivityData>, payload: GitHubWebhookPayload): ActivityData | null {
  const release = payload.release;

  if (payload.action !== 'published') {
    return null;
  }

  return {
    ...baseData,
    title: `Released ${release.tag_name}: ${release.name || 'New Release'}`,
    body: release.body?.slice(0, 1000),
    url: release.html_url,
    ref: release.tag_name,
    metadata: {
      tagName: release.tag_name,
      prerelease: release.prerelease,
      draft: release.draft,
      assets: release.assets?.length || 0
    }
  } as ActivityData;
}

function handleStarEvent(baseData: Partial<ActivityData>, payload: GitHubWebhookPayload): ActivityData | null {
  if (payload.action !== 'created') {
    return null;
  }

  return {
    ...baseData,
    title: `${payload.sender.login} starred the repository`,
    url: payload.repository.html_url,
    metadata: {
      totalStars: payload.repository.stargazers_count
    }
  } as ActivityData;
}

function handleForkEvent(baseData: Partial<ActivityData>, payload: GitHubWebhookPayload): ActivityData {
  const forkee = payload.forkee;

  return {
    ...baseData,
    title: `${payload.sender.login} forked the repository`,
    url: forkee.html_url,
    metadata: {
      forkFullName: forkee.full_name,
      totalForks: payload.repository.forks_count
    }
  } as ActivityData;
}

function handleRefEvent(baseData: Partial<ActivityData>, payload: GitHubWebhookPayload): ActivityData {
  const refType = payload.ref_type; // branch, tag
  const refName = payload.ref;
  const action = baseData.eventType === 'CREATE' ? 'created' : 'deleted';

  return {
    ...baseData,
    title: `${action.charAt(0).toUpperCase() + action.slice(1)} ${refType} ${refName}`,
    ref: refName,
    metadata: {
      refType,
      masterBranch: payload.master_branch
    }
  } as ActivityData;
}

/**
 * Notify repository followers about new activity
 */
async function notifyFollowers(
  repositoryId: string,
  activity: { eventType: GitHubEventType; title?: string | null },
  payload: GitHubWebhookPayload
): Promise<void> {
  try {
    // Get repository info
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      select: { fullName: true, followers: { select: { userId: true } } }
    });

    if (!repository?.followers.length) return;

    // Don't notify for minor events
    const notifiableEvents: GitHubEventType[] = ['RELEASE', 'PULL_REQUEST', 'PUSH'];
    if (!notifiableEvents.includes(activity.eventType)) return;

    // Create notifications for followers (limit to avoid spam)
    const followerIds = repository.followers
      .slice(0, 100) // Limit to 100 followers per event
      .map(f => f.userId)
      .filter((id): id is string => id !== null);

    for (const userId of followerIds) {
      await createNotification(
        userId,
        'REPO_UPDATE',
        `${repository.fullName}: ${activity.title}`,
        undefined,
        undefined
      );
    }
  } catch (error) {
    logger.error('Notify followers error:', error);
    // Don't throw - notification failures shouldn't break webhook processing
  }
}

/**
 * Register a webhook with GitHub for a repository
 */
export async function registerWebhook(
  userId: string,
  owner: string,
  repo: string,
  events: string[] = ['push', 'pull_request', 'issues', 'release', 'star']
): Promise<{ webhookId: number; secret: string }> {
  // Find or create repository
  let repository = await prisma.repository.findUnique({
    where: { fullName: `${owner}/${repo}` }
  });

  if (!repository) {
    throw new Error('Repository not found. Please add it to Gitgram first.');
  }

  // Check if webhook already exists
  const existingWebhook = await prisma.gitHubWebhook.findUnique({
    where: { repositoryId: repository.id }
  });

  if (existingWebhook?.active) {
    throw new Error('Webhook already configured for this repository');
  }

  // Get user's GitHub token
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true }
  });

  if (!user?.githubAccessToken) {
    throw new Error('GitHub authentication required');
  }

  const secret = generateWebhookSecret();
  const webhookUrl = `${process.env.API_URL || 'https://api.gitgram.com'}/api/v1/github/webhooks/incoming`;

  // Create webhook on GitHub
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${user.githubAccessToken}`,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      name: 'web',
      active: true,
      events: events,
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret: secret,
        insecure_ssl: '0'
      }
    })
  });

  if (!response.ok) {
    const error = await response.json() as { message?: string };
    throw new Error(`GitHub API error: ${error.message || 'Failed to create webhook'}`);
  }

  const webhookData = await response.json() as { id: number };

  // Map events to our enum
  const eventTypes: GitHubEventType[] = events
    .map(e => mapEventToType(e))
    .filter((e): e is GitHubEventType => e !== null);

  // Save webhook config
  await prisma.gitHubWebhook.upsert({
    where: { repositoryId: repository.id },
    create: {
      repositoryId: repository.id,
      webhookId: webhookData.id,
      secret,
      events: eventTypes,
      active: true
    },
    update: {
      webhookId: webhookData.id,
      secret,
      events: eventTypes,
      active: true
    }
  });

  logger.info(`Webhook registered for ${owner}/${repo}`);

  return { webhookId: webhookData.id, secret };
}

/**
 * Deactivate webhook for a repository
 */
export async function deactivateWebhook(
  userId: string,
  owner: string,
  repo: string
): Promise<void> {
  const repository = await prisma.repository.findUnique({
    where: { fullName: `${owner}/${repo}` },
    include: { webhook: true }
  });

  if (!repository?.webhook) {
    throw new Error('No webhook configured for this repository');
  }

  // Get user's GitHub token
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true }
  });

  if (user?.githubAccessToken && repository.webhook.webhookId) {
    // Delete webhook from GitHub
    try {
      await fetch(
        `https://api.github.com/repos/${owner}/${repo}/hooks/${repository.webhook.webhookId}`,
        {
          method: 'DELETE',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${user.githubAccessToken}`,
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );
    } catch (error) {
      logger.error('Failed to delete webhook from GitHub:', error);
    }
  }

  // Mark webhook as inactive
  await prisma.gitHubWebhook.update({
    where: { repositoryId: repository.id },
    data: { active: false }
  });

  logger.info(`Webhook deactivated for ${owner}/${repo}`);
}

/**
 * Get activity timeline for a repository
 */
export async function getRepositoryActivity(
  repositoryId: string,
  options: { page?: number; limit?: number; eventType?: GitHubEventType } = {}
) {
  const { page = 1, limit = 20, eventType } = options;

  const activities = await prisma.repositoryActivity.findMany({
    where: {
      repositoryId,
      ...(eventType ? { eventType } : {})
    },
    orderBy: { occurredAt: 'desc' },
    take: limit,
    skip: (page - 1) * limit,
    include: {
      repository: {
        select: { fullName: true, htmlUrl: true }
      }
    }
  });

  return activities.map(activity => ({
    ...activity,
    itemType: 'activity' as const
  }));
}

/**
 * Get webhook status for a repository
 */
export async function getWebhookStatus(owner: string, repo: string) {
  const repository = await prisma.repository.findUnique({
    where: { fullName: `${owner}/${repo}` },
    include: {
      webhook: {
        select: {
          active: true,
          events: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });

  if (!repository) {
    return { configured: false };
  }

  return {
    configured: !!repository.webhook,
    active: repository.webhook?.active || false,
    events: repository.webhook?.events || [],
    createdAt: repository.webhook?.createdAt,
    updatedAt: repository.webhook?.updatedAt
  };
}

// ============================================
// USER GITHUB ACTIVITY SYNC
// Syncs and processes GitHub activity events for gitgram users.
// ============================================

const USER_ACTIVITY_TTL = 5 * 60; // 5 minutes

// GitHub Events API payload shape — external data, permissive record is intentional
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawGitHubEvent = Record<string, any>;

export interface GitHubEvent {
  id: string;
  type: string;
  actor: {
    login: string;
    avatarUrl: string;
  };
  repo: {
    name: string; // "owner/repo"
  };
  payload: RawGitHubEvent;
  createdAt: string;
  public: boolean;
}

export interface PostDraft {
  content: string;
  tags: string[];
  repoReference: string;
  sourceEventId: string;
}

export interface AutoPostResult {
  posted: number;
  skipped: number;
  events: PostDraft[];
}

export interface ActivityFeedItem {
  itemType: 'post' | 'github_event';
  id: string;
  createdAt: Date | string;
  post?: Record<string, unknown>;
  githubEvent?: GitHubEvent;
}

/**
 * Fetch the 30 most recent received GitHub events for a user.
 * Results are cached in Redis for 5 minutes.
 */
export async function fetchUserGitHubActivity(userId: string): Promise<GitHubEvent[]> {
  const cacheKey = `github:user_activity:${userId}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached as GitHubEvent[];
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true, githubUsername: true },
  });

  if (!user?.githubAccessToken) {
    throw new Error('GitHub authentication required for this user');
  }

  if (!user.githubUsername) {
    throw new Error('GitHub username not available for this user');
  }

  const octokit = new Octokit({ auth: user.githubAccessToken });

  const { data } = await octokit.activity.listReceivedEventsForUser({
    username: user.githubUsername,
    per_page: 30,
  });

  const events: GitHubEvent[] = data.map((event: RawGitHubEvent) => ({
    id: String(event.id),
    type: event.type ?? 'UnknownEvent',
    actor: {
      login: event.actor?.login ?? 'unknown',
      avatarUrl: event.actor?.avatar_url ?? '',
    },
    repo: {
      name: event.repo?.name ?? '',
    },
    payload: event.payload ?? {},
    createdAt: event.created_at ?? new Date().toISOString(),
    public: event.public !== false,
  }));

  await cache.set(cacheKey, events, USER_ACTIVITY_TTL);

  return events;
}

/**
 * Convert a single GitHub event into a gitgram post draft.
 */
export function convertGitHubEventToPost(
  event: GitHubEvent,
  userId: string
): PostDraft {
  const repoName = event.repo.name; // "owner/repo"
  const payload = event.payload;

  let content = '';
  const tags: string[] = [];

  switch (event.type) {
    case 'PushEvent': {
      const commits: RawGitHubEvent[] = payload.commits ?? [];
      const count = payload.size ?? commits.length;
      const branch = (payload.ref as string | undefined)?.replace('refs/heads/', '') ?? 'unknown';
      const messages = commits
        .slice(0, 3)
        .map((c: RawGitHubEvent) => String(c.message ?? '').split('\n')[0])
        .filter(Boolean)
        .join(', ');
      content = `Pushed ${count} commit${count !== 1 ? 's' : ''} to ${repoName} on ${branch}${messages ? `: ${messages}` : ''}`;
      tags.push('push', 'commit');
      break;
    }

    case 'CreateEvent': {
      const refType = String(payload.ref_type ?? 'ref');
      const ref = String(payload.ref ?? '');
      content = `Created ${refType}${ref ? ` ${ref}` : ''} in ${repoName}`;
      tags.push('create', refType);
      break;
    }

    case 'PullRequestEvent': {
      const pr = payload.pull_request ?? {};
      const action = String(payload.action ?? '');
      const number = pr.number as number | undefined;
      const title = String(pr.title ?? '');
      const verb = action === 'closed' && pr.merged ? 'merged' : action;
      content = `${capitalize(verb)} PR${number != null ? ` #${number}` : ''}${title ? `: ${title}` : ''} in ${repoName}`;
      tags.push('pull_request', verb);
      break;
    }

    case 'IssuesEvent': {
      const issue = payload.issue ?? {};
      const action = String(payload.action ?? '');
      const number = issue.number as number | undefined;
      const title = String(issue.title ?? '');
      content = `${capitalize(action)} issue${number != null ? ` #${number}` : ''}${title ? `: ${title}` : ''} in ${repoName}`;
      tags.push('issue', action);
      break;
    }

    case 'WatchEvent': {
      content = `Starred ${repoName}`;
      tags.push('star');
      break;
    }

    case 'ForkEvent': {
      content = `Forked ${repoName}`;
      tags.push('fork');
      break;
    }

    default: {
      content = `Activity on ${repoName}`;
      tags.push('github');
      break;
    }
  }

  // Extract repo language / topic tags from the name itself
  const [owner, repo] = repoName.split('/');
  if (owner) tags.push(owner.toLowerCase());
  if (repo) tags.push(repo.toLowerCase());

  return {
    content,
    tags: Array.from(new Set(tags)),
    repoReference: repoName,
    sourceEventId: event.id,
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void userId; // userId reserved for future per-user customisation
}

/**
 * Fetch GitHub activity and auto-create gitgram posts for unseen events.
 * Uses Redis to track already-posted event IDs (dedup key: github:posted_event:<userId>:<eventId>).
 */
export async function autoPostGitHubActivity(
  userId: string,
  options: { dryRun?: boolean } = {}
): Promise<AutoPostResult> {
  const { dryRun = false } = options;

  // Resolve the user's Account id (needed for Post.accountId)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { account: { select: { id: true } } },
  });

  if (!user?.account?.id) {
    throw new Error('User account not found. Ensure the user has an Account record.');
  }

  const accountId = user.account.id;

  const events = await fetchUserGitHubActivity(userId);

  let posted = 0;
  let skipped = 0;
  const drafts: PostDraft[] = [];

  for (const event of events) {
    const dedupKey = `github:posted_event:${userId}:${event.id}`;
    const alreadyPosted = await cache.get(dedupKey);

    if (alreadyPosted) {
      skipped++;
      continue;
    }

    const draft = convertGitHubEventToPost(event, userId);
    drafts.push(draft);

    if (!dryRun) {
      try {
        await prisma.post.create({
          data: {
            accountId,
            userId,
            content: draft.content,
            mediaUrls: [],
            repoUrl: `https://github.com/${draft.repoReference}`,
            type: 'POST',
            status: 'PUBLISHED',
          },
        });

        // Mark event as posted; keep the key for 30 days
        await cache.set(dedupKey, '1', 30 * 24 * 60 * 60);
        posted++;
      } catch (error) {
        logger.error(`autoPostGitHubActivity: failed to create post for event ${event.id}`, error);
      }
    } else {
      posted++;
    }
  }

  return { posted, skipped, events: drafts };
}

/**
 * Build a combined activity feed for a user:
 * - Gitgram posts authored by accounts the user follows
 * - Raw GitHub events for those same users (shown as activity cards when no post exists)
 *
 * Supports cursor-based pagination via `cursor` (a Post.createdAt ISO string).
 */
export async function getGitHubActivityFeed(
  userId: string,
  cursor?: string,
  limit: number = 20
): Promise<ActivityFeedItem[]> {
  // 1. Resolve the accounts that userId follows
  const follows = await prisma.follow.findMany({
    where: { followerUserId: userId },
    select: { followingId: true },
    take: 100,
  });

  const followedAccountIds = follows.map((f) => f.followingId);

  // 2. Fetch gitgram posts from followed accounts
  const posts = await prisma.post.findMany({
    where: {
      accountId: { in: followedAccountIds },
      isArchived: false,
      status: 'PUBLISHED',
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      account: { select: { username: true, avatar: true, type: true } },
      user: { select: { githubUsername: true } },
    },
  });

  const postItems: ActivityFeedItem[] = posts.map((post) => ({
    itemType: 'post' as const,
    id: post.id,
    createdAt: post.createdAt,
    post: post as unknown as Record<string, unknown>,
  }));

  // 3. Supplement with raw GitHub events when the feed is sparse
  const remaining = limit - postItems.length;
  const githubEventItems: ActivityFeedItem[] = [];

  if (remaining > 0 && followedAccountIds.length > 0) {
    try {
      // Fetch events for the requesting user's own activity as supplemental content
      const rawEvents = await fetchUserGitHubActivity(userId).catch(() => []);
      const sliced = rawEvents.slice(0, remaining);

      for (const event of sliced) {
        githubEventItems.push({
          itemType: 'github_event' as const,
          id: `gh_event:${event.id}`,
          createdAt: event.createdAt,
          githubEvent: event,
        });
      }
    } catch (error) {
      logger.warn('getGitHubActivityFeed: failed to fetch supplemental GitHub events', error);
    }
  }

  // 4. Merge and sort by date descending
  const merged = [...postItems, ...githubEventItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return merged.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
