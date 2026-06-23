import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Payload interfaces
// ---------------------------------------------------------------------------

export interface GitHubRepository {
  full_name: string;
  html_url: string;
  owner: { login: string };
  name: string;
  stargazers_count: number;
}

export interface GitHubSender {
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubCommit {
  id: string;
  message: string;
  url: string;
  author: {
    name: string;
    username?: string;
  };
}

export interface GitHubPushPayload {
  ref: string;
  after: string;
  before: string;
  compare: string;
  commits: GitHubCommit[];
  forced: boolean;
  repository: GitHubRepository;
  sender: GitHubSender;
  pusher: {
    name: string;
    email?: string;
  };
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  merged: boolean;
  state: string;
}

export interface GitHubPRPayload {
  action: string;
  number: number;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubSender;
}

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  body: string | null;
  prerelease: boolean;
  draft: boolean;
}

export interface GitHubReleasePayload {
  action: string;
  release: GitHubRelease;
  repository: GitHubRepository;
  sender: GitHubSender;
}

export interface GitHubStarPayload {
  action: string;
  starred_at: string | null;
  repository: GitHubRepository;
  sender: GitHubSender;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ResolvedUser {
  userId: string;
  accountId: string;
}

interface ResolvedRepo {
  repositoryId: string;
  repoFullName: string;
}

/**
 * Look up the Gitgram user whose githubUsername matches the given login.
 * Returns null if no connected user is found or if they have no Account record.
 */
async function resolveUserByGitHubLogin(
  githubLogin: string
): Promise<ResolvedUser | null> {
  const user = await prisma.user.findFirst({
    where: { githubUsername: githubLogin },
    select: {
      id: true,
      account: { select: { id: true } },
    },
  });

  if (!user || !user.account?.id) {
    return null;
  }

  return { userId: user.id, accountId: user.account.id };
}

/**
 * Look up a claimed Gitgram repository by its GitHub full name.
 * Returns null if the repo is not found or has not been claimed.
 */
async function resolveClaimedRepo(
  repoFullName: string
): Promise<ResolvedRepo | null> {
  const repo = await prisma.repository.findUnique({
    where: { fullName: repoFullName },
    select: { id: true, fullName: true, claimedBy: true },
  });

  if (!repo || !repo.claimedBy) {
    return null;
  }

  return { repositoryId: repo.id, repoFullName: repo.fullName };
}

/**
 * Create a Gitgram post associated with a user and optionally a repository.
 */
async function createWebhookPost(
  accountId: string,
  userId: string,
  content: string,
  repositoryId: string | undefined,
  repoUrl: string
): Promise<void> {
  await prisma.post.create({
    data: {
      accountId,
      userId,
      content,
      mediaUrls: [],
      repoUrl,
      repositoryId: repositoryId ?? null,
      type: 'POST',
      status: 'PUBLISHED',
    },
  });
}

// ---------------------------------------------------------------------------
// Public processors
// ---------------------------------------------------------------------------

/**
 * Process a GitHub `push` event.
 * Creates a post: "Pushed X commits to owner/name (branch)"
 *
 * Guards:
 * - Sender must have a connected Gitgram account (githubUsername match)
 * - The repository must be claimed on Gitgram
 */
export async function processGitHubPush(
  payload: GitHubPushPayload
): Promise<void> {
  const { repository, sender, commits, ref } = payload;

  const resolvedUser = await resolveUserByGitHubLogin(sender.login);
  if (!resolvedUser) {
    logger.debug(
      `webhookProcessor: push ignored — no Gitgram user for GitHub login "${sender.login}"`
    );
    return;
  }

  const resolvedRepo = await resolveClaimedRepo(repository.full_name);
  if (!resolvedRepo) {
    logger.debug(
      `webhookProcessor: push ignored — repo not claimed: ${repository.full_name}`
    );
    return;
  }

  const branch = ref.replace('refs/heads/', '');
  const commitCount = commits.length;
  const noun = commitCount === 1 ? 'commit' : 'commits';
  const content = `Pushed ${commitCount} ${noun} to ${repository.full_name} (${branch})`;

  await createWebhookPost(
    resolvedUser.accountId,
    resolvedUser.userId,
    content,
    resolvedRepo.repositoryId,
    repository.html_url
  );

  logger.info(
    `webhookProcessor: created push post for ${sender.login} → ${repository.full_name}`
  );
}

/**
 * Process a GitHub `pull_request` event.
 * Creates a post for `opened` and `merged` actions only.
 *
 * Post text:
 * - opened:  "Opened PR #123: <title> in owner/name"
 * - merged:  "Merged PR #123: <title> in owner/name"
 */
export async function processGitHubPullRequest(
  payload: GitHubPRPayload
): Promise<void> {
  const { action, pull_request: pr, repository, sender } = payload;

  // Normalise: a PR is "merged" when action=closed and pr.merged=true
  const effectiveAction =
    action === 'closed' && pr.merged ? 'merged' : action;

  if (effectiveAction !== 'opened' && effectiveAction !== 'merged') {
    logger.debug(
      `webhookProcessor: pull_request action "${action}" skipped (not opened/merged)`
    );
    return;
  }

  const resolvedUser = await resolveUserByGitHubLogin(sender.login);
  if (!resolvedUser) {
    logger.debug(
      `webhookProcessor: pull_request ignored — no Gitgram user for "${sender.login}"`
    );
    return;
  }

  const resolvedRepo = await resolveClaimedRepo(repository.full_name);
  if (!resolvedRepo) {
    logger.debug(
      `webhookProcessor: pull_request ignored — repo not claimed: ${repository.full_name}`
    );
    return;
  }

  const verb = effectiveAction === 'opened' ? 'Opened' : 'Merged';
  const content = `${verb} PR #${pr.number}: ${pr.title} in ${repository.full_name}`;

  await createWebhookPost(
    resolvedUser.accountId,
    resolvedUser.userId,
    content,
    resolvedRepo.repositoryId,
    pr.html_url
  );

  logger.info(
    `webhookProcessor: created PR post (${effectiveAction}) for ${sender.login} → ${repository.full_name}`
  );
}

/**
 * Process a GitHub `release` event.
 * Creates a post only for the `published` action.
 *
 * Post text: "Released v1.2.3: <release title> in owner/name"
 */
export async function processGitHubRelease(
  payload: GitHubReleasePayload
): Promise<void> {
  const { action, release, repository, sender } = payload;

  if (action !== 'published') {
    logger.debug(
      `webhookProcessor: release action "${action}" skipped (not published)`
    );
    return;
  }

  const resolvedUser = await resolveUserByGitHubLogin(sender.login);
  if (!resolvedUser) {
    logger.debug(
      `webhookProcessor: release ignored — no Gitgram user for "${sender.login}"`
    );
    return;
  }

  const resolvedRepo = await resolveClaimedRepo(repository.full_name);
  if (!resolvedRepo) {
    logger.debug(
      `webhookProcessor: release ignored — repo not claimed: ${repository.full_name}`
    );
    return;
  }

  const releaseTitle = release.name ?? release.tag_name;
  const content = `Released ${release.tag_name}: ${releaseTitle} in ${repository.full_name}`;

  await createWebhookPost(
    resolvedUser.accountId,
    resolvedUser.userId,
    content,
    resolvedRepo.repositoryId,
    release.html_url
  );

  logger.info(
    `webhookProcessor: created release post for ${sender.login} → ${repository.full_name} ${release.tag_name}`
  );
}

// Star milestones that trigger a celebration post
const STAR_MILESTONES = [100, 1000, 10_000] as const;

/**
 * Process a GitHub `star` event.
 *
 * - Increments the star count on the claimed repository record.
 * - If a milestone (100 / 1,000 / 10,000) is reached, creates a celebration post
 *   on behalf of the repo's claiming user.
 */
export async function processGitHubStar(
  payload: GitHubStarPayload
): Promise<void> {
  const { action, repository } = payload;

  if (action !== 'created') {
    // 'deleted' means un-star — we don't decrement to avoid thrash
    logger.debug(
      `webhookProcessor: star action "${action}" skipped (not created)`
    );
    return;
  }

  const resolvedRepo = await resolveClaimedRepo(repository.full_name);
  if (!resolvedRepo) {
    logger.debug(
      `webhookProcessor: star ignored — repo not claimed: ${repository.full_name}`
    );
    return;
  }

  // Update star count from the live GitHub value (source of truth)
  const newStarCount = repository.stargazers_count;

  await prisma.repository.update({
    where: { id: resolvedRepo.repositoryId },
    data: { stars: newStarCount },
  });

  logger.info(
    `webhookProcessor: updated star count for ${repository.full_name} → ${newStarCount}`
  );

  // Check if we just crossed a milestone
  const crossedMilestone = STAR_MILESTONES.find(
    (milestone) => newStarCount >= milestone && newStarCount - 1 < milestone
  );

  if (!crossedMilestone) {
    return;
  }

  // Find the claiming user to author the celebration post
  const claimingRepo = await prisma.repository.findUnique({
    where: { id: resolvedRepo.repositoryId },
    select: {
      claimedBy: true,
      htmlUrl: true,
    },
  });

  if (!claimingRepo?.claimedBy) {
    return;
  }

  const claimingUser = await prisma.user.findUnique({
    where: { id: claimingRepo.claimedBy },
    select: { id: true, account: { select: { id: true } } },
  });

  if (!claimingUser?.account?.id) {
    logger.debug(
      `webhookProcessor: milestone post skipped — claiming user has no account`
    );
    return;
  }

  const content = `${repository.full_name} just reached ${crossedMilestone.toLocaleString()} stars on GitHub!`;

  await createWebhookPost(
    claimingUser.account.id,
    claimingUser.id,
    content,
    resolvedRepo.repositoryId,
    claimingRepo.htmlUrl
  );

  logger.info(
    `webhookProcessor: created milestone celebration post — ${repository.full_name} hit ${crossedMilestone} stars`
  );
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify a GitHub webhook HMAC-SHA256 signature using a timing-safe comparison.
 *
 * @param rawBody  The raw request body string
 * @param signature  The value from the `X-Hub-Signature-256` header (includes "sha256=" prefix)
 * @param secret  The webhook secret configured in GitHub
 * @returns true if the signature matches, false otherwise
 */
export function verifyGitHubSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Pad to equal length before comparison to prevent length-based timing leaks
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expBuf);
}
