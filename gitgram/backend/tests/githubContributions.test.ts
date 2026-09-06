import { GitHubEventType } from '@prisma/client';
import {
  mapContributionsToActivities,
  harvestContributionEvidence,
  type ContributionsCollection,
  type ContributionsResponse,
  type HarvestDb,
} from '../src/services/githubContributionsService';

/**
 * Unit tests for the talent-graph contribution-evidence backfill. These lock in
 * the properties the evidence layer depends on:
 *  - only contributions to *managed* repositories become evidence;
 *  - every row is attributed to the user's GitHub identity (actorLogin);
 *  - re-runs dedupe via a deterministic eventId;
 *  - the harvest is a safe no-op without a token / username / managed repos.
 */

const repoIdByFullName = new Map<string, string>([
  ['octocat/hello-world', 'repo-1'],
  ['octocat/spoon-knife', 'repo-2'],
]);

const ctx = { githubUsername: 'octocat', repoIdByFullName } as const;

function sampleCollection(): ContributionsCollection {
  return {
    commitContributionsByRepository: [
      {
        repository: { nameWithOwner: 'octocat/Hello-World', url: 'https://github.com/octocat/Hello-World' },
        contributions: { nodes: [{ occurredAt: '2026-09-01T00:00:00Z', commitCount: 3 }] },
      },
      // Not a managed repository — must be skipped.
      {
        repository: { nameWithOwner: 'stranger/repo', url: 'https://github.com/stranger/repo' },
        contributions: { nodes: [{ occurredAt: '2026-09-02T00:00:00Z', commitCount: 9 }] },
      },
    ],
    pullRequestContributionsByRepository: [
      {
        repository: { nameWithOwner: 'octocat/spoon-knife', url: 'https://github.com/octocat/spoon-knife' },
        contributions: {
          nodes: [
            { pullRequest: { id: 'PR_1', number: 42, title: 'Add feature', url: 'https://github.com/octocat/spoon-knife/pull/42', createdAt: '2026-08-20T00:00:00Z', merged: true } },
            { pullRequest: null },
          ],
        },
      },
    ],
    pullRequestReviewContributionsByRepository: [
      {
        repository: { nameWithOwner: 'octocat/hello-world', url: 'https://github.com/octocat/hello-world' },
        contributions: {
          nodes: [
            { occurredAt: '2026-08-21T00:00:00Z', pullRequestReview: { id: 'PRR_1', url: 'https://github.com/octocat/hello-world/pull/7#review', submittedAt: '2026-08-21T00:00:00Z' }, pullRequest: { number: 7, title: 'Fix bug', url: 'https://github.com/octocat/hello-world/pull/7' } },
          ],
        },
      },
    ],
    issueContributionsByRepository: [
      {
        repository: { nameWithOwner: 'octocat/hello-world', url: 'https://github.com/octocat/hello-world' },
        contributions: {
          nodes: [
            { issue: { id: 'I_1', number: 5, title: 'Crash on load', url: 'https://github.com/octocat/hello-world/issues/5', createdAt: '2026-08-15T00:00:00Z' } },
          ],
        },
      },
    ],
  };
}

describe('mapContributionsToActivities', () => {
  it('maps commit, PR, review, and issue contributions for managed repositories', () => {
    const rows = mapContributionsToActivities(sampleCollection(), ctx);

    const byType = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.eventType] = (acc[row.eventType] ?? 0) + 1;
      return acc;
    }, {});
    // 1 commit-day (managed) + 1 PR + 1 review (both PULL_REQUEST) + 1 issue.
    expect(byType[GitHubEventType.PUSH]).toBe(1);
    expect(byType[GitHubEventType.PULL_REQUEST]).toBe(2);
    expect(byType[GitHubEventType.ISSUES]).toBe(1);
  });

  it('skips contributions to repositories the user does not manage', () => {
    const rows = mapContributionsToActivities(sampleCollection(), ctx);
    // The "stranger/repo" commit contribution (9 commits) must not appear.
    expect(rows.some((row) => row.repositoryId !== 'repo-1' && row.repositoryId !== 'repo-2')).toBe(false);
    expect(rows.find((row) => row.eventType === GitHubEventType.PUSH)?.repositoryId).toBe('repo-1');
  });

  it('attributes every row to the user GitHub identity (evidence query filter)', () => {
    const rows = mapContributionsToActivities(sampleCollection(), ctx);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.actorLogin === 'octocat')).toBe(true);
  });

  it('produces deterministic eventIds and dedupes repeated contribution nodes', () => {
    const collection = sampleCollection();
    // Duplicate the same PR node — the API can surface the same contribution twice.
    collection.pullRequestContributionsByRepository![0].contributions.nodes.push({
      pullRequest: { id: 'PR_1', number: 42, title: 'Add feature', url: 'https://x', createdAt: '2026-08-20T00:00:00Z', merged: true },
    });

    const rows = mapContributionsToActivities(collection, ctx);
    const prRows = rows.filter((row) => row.eventId === 'contrib:pr:PR_1');
    expect(prRows).toHaveLength(1);
    expect(prRows[0].action).toBe('merged');

    const ids = rows.map((row) => row.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns an empty list for a null / empty collection', () => {
    expect(mapContributionsToActivities(null, ctx)).toEqual([]);
    expect(mapContributionsToActivities(undefined, ctx)).toEqual([]);
    expect(mapContributionsToActivities({}, ctx)).toEqual([]);
  });

  it('skips malformed nodes (missing ids or timestamps)', () => {
    const collection: ContributionsCollection = {
      commitContributionsByRepository: [
        {
          repository: { nameWithOwner: 'octocat/hello-world', url: null },
          contributions: { nodes: [null, { occurredAt: '', commitCount: 0 }] },
        },
      ],
      issueContributionsByRepository: [
        {
          repository: { nameWithOwner: 'octocat/hello-world', url: null },
          contributions: { nodes: [{ issue: null }] },
        },
      ],
    };
    expect(mapContributionsToActivities(collection, ctx)).toEqual([]);
  });
});

describe('harvestContributionEvidence', () => {
  function makeDb(overrides: Partial<HarvestDb> = {}): { db: HarvestDb; createMany: jest.Mock } {
    const createMany = jest.fn().mockResolvedValue({ count: 4 });
    const db: HarvestDb = {
      user: { findUnique: jest.fn().mockResolvedValue({ githubAccessToken: 'gho_x', githubUsername: 'octocat' }) },
      repositoryManager: {
        findMany: jest.fn().mockResolvedValue([
          { repository: { id: 'repo-1', fullName: 'octocat/Hello-World' } },
          { repository: { id: 'repo-2', fullName: 'octocat/spoon-knife' } },
        ]),
      },
      repositoryActivity: { createMany },
      ...overrides,
    };
    return { db, createMany };
  }

  it('is a no-op when the user has no GitHub token', async () => {
    const { db, createMany } = makeDb({
      user: { findUnique: jest.fn().mockResolvedValue({ githubAccessToken: null, githubUsername: 'octocat' }) },
    });
    const graphqlClient = jest.fn();

    const result = await harvestContributionEvidence('user-1', { db, graphqlClient });

    expect(result).toEqual({ scannedRepositories: 0, mapped: 0, created: 0 });
    expect(graphqlClient).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('is a no-op when the user manages no repositories', async () => {
    const { db, createMany } = makeDb({
      repositoryManager: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const graphqlClient = jest.fn();

    const result = await harvestContributionEvidence('user-1', { db, graphqlClient });

    expect(result).toEqual({ scannedRepositories: 0, mapped: 0, created: 0 });
    expect(graphqlClient).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('harvests, maps to managed repos, and deduped-inserts real contribution evidence', async () => {
    const { db, createMany } = makeDb();
    const response: ContributionsResponse = { user: { contributionsCollection: sampleCollection() } };
    const graphqlClient = jest.fn().mockResolvedValue(response);

    const result = await harvestContributionEvidence('user-1', { db, graphqlClient });

    expect(graphqlClient).toHaveBeenCalledWith(expect.stringContaining('contributionsCollection'), { login: 'octocat' });
    expect(createMany).toHaveBeenCalledTimes(1);
    const insertArg = createMany.mock.calls[0][0];
    expect(insertArg.skipDuplicates).toBe(true);
    // Only managed-repo rows are inserted (the stranger/repo commit is dropped).
    expect(insertArg.data.every((row: { repositoryId: string }) => ['repo-1', 'repo-2'].includes(row.repositoryId))).toBe(true);
    expect(result.scannedRepositories).toBe(2);
    expect(result.created).toBe(4);
  });

  it('never throws when the GraphQL call fails', async () => {
    const { db, createMany } = makeDb();
    const graphqlClient = jest.fn().mockRejectedValue(new Error('rate limited'));

    const result = await harvestContributionEvidence('user-1', { db, graphqlClient });

    expect(result).toEqual({ scannedRepositories: 2, mapped: 0, created: 0 });
    expect(createMany).not.toHaveBeenCalled();
  });
});
