/**
 * GitHub contributions harvester (talent-graph evidence backfill).
 *
 * The talent graph derives `github_activity` evidence from `RepositoryActivity`
 * rows. Until now those rows were written ONLY by the GitHub App webhook
 * (githubActivityService.processGitHubEvent), so a brand-new user's
 * contribution-trajectory evidence was empty until an owner configured a
 * webhook and it fired — an operational dependency, not real data at first run.
 *
 * This service backfills genuine contribution evidence at sync time using the
 * GitHub GraphQL `contributionsCollection` (real commits / PRs / reviews /
 * issues the user actually made). It is:
 *   - Real, never fabricated — every row maps to an actual GitHub contribution.
 *   - Scoped to the user's *managed* repositories (RepositoryManager), so it
 *     only produces evidence the talent graph will surface, and never invents
 *     Repository rows.
 *   - Attributed to the user's GitHub identity (actorLogin = githubUsername),
 *     which is exactly what the evidence query filters on.
 *   - Deduped by a deterministic `eventId`, mirroring the delivery-id
 *     idempotency discipline the webhook path uses, so re-syncing is a no-op.
 *
 * The mapping (`mapContributionsToActivities`) is pure and dependency-injected
 * so it can be unit tested without a live Postgres or GitHub.
 */
import { Octokit } from '@octokit/rest';
import { GitHubEventType, Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// GraphQL response shapes (only the fields we consume; external data)
// ---------------------------------------------------------------------------

interface ContribRepoRef {
  nameWithOwner: string;
  url?: string | null;
}

interface CommitContributionsByRepository {
  repository: ContribRepoRef;
  contributions: { nodes: Array<{ occurredAt: string; commitCount: number } | null> };
}

interface PullRequestContributionsByRepository {
  repository: ContribRepoRef;
  contributions: {
    nodes: Array<{
      pullRequest: { id: string; number: number; title: string; url: string; createdAt: string; merged: boolean } | null;
    } | null>;
  };
}

interface PullRequestReviewContributionsByRepository {
  repository: ContribRepoRef;
  contributions: {
    nodes: Array<{
      occurredAt?: string | null;
      pullRequestReview: { id: string; url?: string | null; submittedAt?: string | null } | null;
      pullRequest: { number: number; title: string; url?: string | null } | null;
    } | null>;
  };
}

interface IssueContributionsByRepository {
  repository: ContribRepoRef;
  contributions: {
    nodes: Array<{
      issue: { id: string; number: number; title: string; url: string; createdAt: string } | null;
    } | null>;
  };
}

export interface ContributionsCollection {
  commitContributionsByRepository?: CommitContributionsByRepository[] | null;
  pullRequestContributionsByRepository?: PullRequestContributionsByRepository[] | null;
  pullRequestReviewContributionsByRepository?: PullRequestReviewContributionsByRepository[] | null;
  issueContributionsByRepository?: IssueContributionsByRepository[] | null;
}

export interface ContributionsResponse {
  user: { contributionsCollection: ContributionsCollection | null } | null;
}

export interface MapContributionsContext {
  /** The GitHub login these contributions belong to (evidence attribution). */
  githubUsername: string;
  /** Managed repository ids keyed by lowercased `owner/name`. */
  repoIdByFullName: ReadonlyMap<string, string>;
}

// ---------------------------------------------------------------------------
// GraphQL query
// ---------------------------------------------------------------------------

export const CONTRIBUTIONS_QUERY = `
  query ContributionEvidence($login: String!) {
    user(login: $login) {
      contributionsCollection {
        commitContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner url }
          contributions(first: 100) { nodes { occurredAt commitCount } }
        }
        pullRequestContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner url }
          contributions(first: 50) { nodes { pullRequest { id number title url createdAt merged } } }
        }
        pullRequestReviewContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner url }
          contributions(first: 50) { nodes { occurredAt pullRequestReview { id url submittedAt } pullRequest { number title url } } }
        }
        issueContributionsByRepository(maxRepositories: 100) {
          repository { nameWithOwner url }
          contributions(first: 50) { nodes { issue { id number title url createdAt } } }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Pure mapping: contributionsCollection -> RepositoryActivity create inputs
// ---------------------------------------------------------------------------

function resolveRepoId(
  repository: ContribRepoRef | undefined,
  repoIdByFullName: ReadonlyMap<string, string>,
): string | null {
  const fullName = repository?.nameWithOwner;
  if (!fullName) return null;
  return repoIdByFullName.get(fullName.toLowerCase()) ?? null;
}

/**
 * Maps a GraphQL `contributionsCollection` into RepositoryActivity create
 * inputs, restricted to the user's managed repositories. Pure and deterministic:
 *  - only contributions to a managed repository are emitted;
 *  - `actorLogin` is always the user (attribution the evidence query needs);
 *  - `eventId` is a stable, content-derived key so re-runs dedupe cleanly.
 */
export function mapContributionsToActivities(
  collection: ContributionsCollection | null | undefined,
  ctx: MapContributionsContext,
): Prisma.RepositoryActivityCreateManyInput[] {
  if (!collection) return [];
  const actorLogin = ctx.githubUsername;
  const rows: Prisma.RepositoryActivityCreateManyInput[] = [];
  const seenEventIds = new Set<string>();

  const push = (row: Prisma.RepositoryActivityCreateManyInput): void => {
    if (seenEventIds.has(row.eventId)) return;
    seenEventIds.add(row.eventId);
    rows.push(row);
  };

  // Commits — aggregated per repository into day buckets by the API.
  for (const entry of collection.commitContributionsByRepository ?? []) {
    const repositoryId = resolveRepoId(entry?.repository, ctx.repoIdByFullName);
    if (!repositoryId) continue;
    const url = entry.repository.url ?? null;
    for (const node of entry.contributions?.nodes ?? []) {
      if (!node || !node.occurredAt || !node.commitCount) continue;
      const commitCount = node.commitCount;
      push({
        repositoryId,
        eventType: GitHubEventType.PUSH,
        eventId: `contrib:commit:${repositoryId}:${node.occurredAt}`,
        action: 'contributed',
        actorLogin,
        title: `Contributed ${commitCount} commit${commitCount === 1 ? '' : 's'}`,
        url,
        occurredAt: new Date(node.occurredAt),
        metadata: { source: 'contributionsCollection', kind: 'commit', commitCount },
      });
    }
  }

  // Pull requests authored.
  for (const entry of collection.pullRequestContributionsByRepository ?? []) {
    const repositoryId = resolveRepoId(entry?.repository, ctx.repoIdByFullName);
    if (!repositoryId) continue;
    for (const node of entry.contributions?.nodes ?? []) {
      const pr = node?.pullRequest;
      if (!pr || !pr.id || !pr.createdAt) continue;
      push({
        repositoryId,
        eventType: GitHubEventType.PULL_REQUEST,
        eventId: `contrib:pr:${pr.id}`,
        action: pr.merged ? 'merged' : 'opened',
        actorLogin,
        title: `Opened PR #${pr.number}: ${pr.title}`,
        url: pr.url ?? null,
        occurredAt: new Date(pr.createdAt),
        metadata: { source: 'contributionsCollection', kind: 'pull_request', number: pr.number, merged: pr.merged },
      });
    }
  }

  // Pull request reviews.
  for (const entry of collection.pullRequestReviewContributionsByRepository ?? []) {
    const repositoryId = resolveRepoId(entry?.repository, ctx.repoIdByFullName);
    if (!repositoryId) continue;
    for (const node of entry.contributions?.nodes ?? []) {
      const review = node?.pullRequestReview;
      const occurredAt = node?.occurredAt ?? review?.submittedAt;
      if (!review || !review.id || !occurredAt) continue;
      const number = node?.pullRequest?.number;
      push({
        repositoryId,
        eventType: GitHubEventType.PULL_REQUEST,
        eventId: `contrib:review:${review.id}`,
        action: 'reviewed',
        actorLogin,
        title: number != null ? `Reviewed PR #${number}` : 'Reviewed a pull request',
        url: review.url ?? node?.pullRequest?.url ?? null,
        occurredAt: new Date(occurredAt),
        metadata: { source: 'contributionsCollection', kind: 'pull_request_review', number: number ?? null },
      });
    }
  }

  // Issues opened.
  for (const entry of collection.issueContributionsByRepository ?? []) {
    const repositoryId = resolveRepoId(entry?.repository, ctx.repoIdByFullName);
    if (!repositoryId) continue;
    for (const node of entry.contributions?.nodes ?? []) {
      const issue = node?.issue;
      if (!issue || !issue.id || !issue.createdAt) continue;
      push({
        repositoryId,
        eventType: GitHubEventType.ISSUES,
        eventId: `contrib:issue:${issue.id}`,
        action: 'opened',
        actorLogin,
        title: `Opened issue #${issue.number}: ${issue.title}`,
        url: issue.url ?? null,
        occurredAt: new Date(issue.createdAt),
        metadata: { source: 'contributionsCollection', kind: 'issue', number: issue.number },
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Harvester (GraphQL fetch + deduped insert)
// ---------------------------------------------------------------------------

export type GraphqlClient = (query: string, variables: Record<string, unknown>) => Promise<ContributionsResponse>;

export interface HarvestDb {
  user: { findUnique: (args: unknown) => Promise<{ githubAccessToken: string | null; githubUsername: string | null } | null> };
  repositoryManager: { findMany: (args: unknown) => Promise<Array<{ repository: { id: string; fullName: string } }>> };
  repositoryActivity: { createMany: (args: { data: Prisma.RepositoryActivityCreateManyInput[]; skipDuplicates?: boolean }) => Promise<{ count: number }> };
}

export interface HarvestDeps {
  db?: HarvestDb;
  graphqlClient?: GraphqlClient;
}

export interface HarvestResult {
  scannedRepositories: number;
  mapped: number;
  created: number;
}

/**
 * Backfills contribution evidence for a user's managed repositories. Safe to
 * call on every sync: it is a no-op when the user has no linked GitHub token,
 * no GitHub username, or no managed repositories, and inserts are deduped by
 * the deterministic contribution eventId.
 */
export async function harvestContributionEvidence(
  userId: string,
  deps: HarvestDeps = {},
): Promise<HarvestResult> {
  const db = deps.db ?? (prisma as unknown as HarvestDb);
  const empty: HarvestResult = { scannedRepositories: 0, mapped: 0, created: 0 };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true, githubUsername: true },
  });
  if (!user?.githubAccessToken || !user.githubUsername) return empty;

  const managed = await db.repositoryManager.findMany({
    where: { userId },
    select: { repository: { select: { id: true, fullName: true } } },
  });
  if (managed.length === 0) return empty;

  const repoIdByFullName = new Map<string, string>();
  for (const manager of managed) {
    if (manager.repository?.fullName && manager.repository.id) {
      repoIdByFullName.set(manager.repository.fullName.toLowerCase(), manager.repository.id);
    }
  }
  if (repoIdByFullName.size === 0) return empty;

  const graphqlClient: GraphqlClient =
    deps.graphqlClient ??
    ((query, variables) =>
      new Octokit({ auth: user.githubAccessToken! }).graphql<ContributionsResponse>(query, variables));

  let response: ContributionsResponse;
  try {
    response = await graphqlClient(CONTRIBUTIONS_QUERY, { login: user.githubUsername });
  } catch (error) {
    logger.warn('[contributions] GraphQL harvest failed', { userId, error });
    return { ...empty, scannedRepositories: repoIdByFullName.size };
  }

  const activities = mapContributionsToActivities(response?.user?.contributionsCollection, {
    githubUsername: user.githubUsername,
    repoIdByFullName,
  });

  if (activities.length === 0) {
    return { scannedRepositories: repoIdByFullName.size, mapped: 0, created: 0 };
  }

  const result = await db.repositoryActivity.createMany({ data: activities, skipDuplicates: true });

  logger.info('[contributions] Backfilled contribution evidence', {
    userId,
    scannedRepositories: repoIdByFullName.size,
    mapped: activities.length,
    created: result.count,
  });

  return { scannedRepositories: repoIdByFullName.size, mapped: activities.length, created: result.count };
}
