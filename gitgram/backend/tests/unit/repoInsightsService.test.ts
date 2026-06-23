/**
 * Unit tests for repoInsightsService
 *
 * All Prisma calls are intercepted by the in-memory mock in tests/setup.ts.
 * We populate __rows on each model directly, then call the service functions
 * and assert the returned shapes, aggregation logic, and empty-data fallbacks.
 */

import { mockPrisma } from '../setup';
import {
  resolveRepoId,
  getPulse,
  getContributors,
  getTraffic,
  getCommitActivity,
  getCodeFrequency,
  getLanguages,
} from '../../src/services/repoInsightsService';

const REPO_ID = 'repo-001';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedRow(model: any, row: Record<string, unknown>) {
  model.__rows.push(row);
}

function clearAll() {
  [
    mockPrisma.repository,
    mockPrisma.repositoryActivity,
    mockPrisma.post,
    mockPrisma.postView,
  ].forEach((m) => m.__rows.splice(0));
}

/** Returns a Date that is `n` days before now. */
function daysBack(n: number): Date {
  return new Date(Date.now() - n * MS_PER_DAY);
}

function seedRepo(overrides: Record<string, unknown> = {}) {
  seedRow(mockPrisma.repository, {
    id: REPO_ID,
    owner: 'octocat',
    name: 'hello-world',
    language: 'TypeScript',
    ...overrides,
  });
}

function seedActivity(overrides: Record<string, unknown> = {}) {
  seedRow(mockPrisma.repositoryActivity, {
    id: `ra-${Math.random()}`,
    repositoryId: REPO_ID,
    eventType: 'PUSH',
    action: null,
    actorLogin: 'dev1',
    actorAvatar: 'https://avatars.test/dev1.png',
    occurredAt: daysBack(3),
    metadata: { commits: [{}] },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// resolveRepoId
// ---------------------------------------------------------------------------

describe('resolveRepoId', () => {
  beforeEach(clearAll);

  it('returns null when the repository does not exist', async () => {
    const result = await resolveRepoId('nobody', 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns an object with id and language when the repo exists', async () => {
    seedRepo();
    const result = await resolveRepoId('octocat', 'hello-world');
    expect(result).not.toBeNull();
    expect(result?.id).toBe(REPO_ID);
    expect(result?.language).toBe('TypeScript');
  });

  it('returns language as null when the repo has no language set', async () => {
    seedRepo({ language: null });
    const result = await resolveRepoId('octocat', 'hello-world');
    expect(result?.language).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getPulse
// ---------------------------------------------------------------------------

describe('getPulse', () => {
  beforeEach(clearAll);

  it('returns all-zero counts when there is no activity', async () => {
    const pulse = await getPulse(REPO_ID, 7);
    expect(pulse.commits).toBe(0);
    expect(pulse.prsMerged).toBe(0);
    expect(pulse.prsOpened).toBe(0);
    expect(pulse.issuesClosed).toBe(0);
    expect(pulse.issuesOpened).toBe(0);
    expect(pulse.activeContributors).toBe(0);
  });

  it('counts commits from PUSH events using commitCount in metadata', async () => {
    seedActivity({ eventType: 'PUSH', metadata: { commitCount: 5 }, actorLogin: 'dev1' });
    const pulse = await getPulse(REPO_ID, 30);
    expect(pulse.commits).toBe(5);
  });

  it('defaults to 1 commit per PUSH when metadata has no commit info', async () => {
    seedActivity({ eventType: 'PUSH', metadata: {}, actorLogin: 'dev1' });
    const pulse = await getPulse(REPO_ID, 30);
    expect(pulse.commits).toBe(1);
  });

  it('counts merged PRs', async () => {
    seedActivity({ eventType: 'PULL_REQUEST', action: 'merged', actorLogin: 'dev2' });
    const pulse = await getPulse(REPO_ID, 30);
    expect(pulse.prsMerged).toBe(1);
    expect(pulse.prsOpened).toBe(0);
  });

  it('counts opened PRs (including reopened)', async () => {
    seedActivity({ eventType: 'PULL_REQUEST', action: 'opened', actorLogin: 'dev2' });
    seedActivity({ eventType: 'PULL_REQUEST', action: 'reopened', actorLogin: 'dev3' });
    const pulse = await getPulse(REPO_ID, 30);
    expect(pulse.prsOpened).toBe(2);
  });

  it('counts closed and opened issues', async () => {
    seedActivity({ eventType: 'ISSUES', action: 'closed', actorLogin: 'dev1' });
    seedActivity({ eventType: 'ISSUES', action: 'opened', actorLogin: 'dev2' });
    const pulse = await getPulse(REPO_ID, 30);
    expect(pulse.issuesClosed).toBe(1);
    expect(pulse.issuesOpened).toBe(1);
  });

  it('counts distinct active contributors', async () => {
    seedActivity({ eventType: 'PUSH', actorLogin: 'dev1' });
    seedActivity({ eventType: 'PUSH', actorLogin: 'dev1' }); // duplicate — same person
    seedActivity({ eventType: 'PULL_REQUEST', action: 'merged', actorLogin: 'dev2' });
    const pulse = await getPulse(REPO_ID, 30);
    expect(pulse.activeContributors).toBe(2);
  });

  it('clamps rangeDays between 1 and 365', async () => {
    const tinyPulse = await getPulse(REPO_ID, -5);
    expect(tinyPulse.rangeDays).toBe(1);

    const hugePulse = await getPulse(REPO_ID, 9999);
    expect(hugePulse.rangeDays).toBe(365);
  });

  it('excludes activity older than the requested range', async () => {
    seedActivity({ eventType: 'PUSH', occurredAt: daysBack(60), actorLogin: 'dev1' });
    const pulse = await getPulse(REPO_ID, 7);
    expect(pulse.commits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getContributors
// ---------------------------------------------------------------------------

describe('getContributors', () => {
  beforeEach(clearAll);

  it('returns empty array when there is no activity', async () => {
    const result = await getContributors(REPO_ID);
    expect(result).toEqual([]);
  });

  it('returns one entry per distinct actor', async () => {
    seedActivity({ actorLogin: 'dev1', eventType: 'PUSH', metadata: { commits: [{}] } });
    seedActivity({ actorLogin: 'dev2', eventType: 'PUSH', metadata: { commits: [{}] } });
    const result = await getContributors(REPO_ID);
    expect(result).toHaveLength(2);
  });

  it('aggregates totalCommits for a single contributor', async () => {
    seedActivity({ actorLogin: 'dev1', eventType: 'PUSH', metadata: { commits: [{}, {}, {}] } });
    seedActivity({ actorLogin: 'dev1', eventType: 'PUSH', metadata: { commits: [{}] } });
    const result = await getContributors(REPO_ID);
    expect(result[0].totalCommits).toBe(4);
  });

  it('aggregates additions and deletions from PR events', async () => {
    seedActivity({
      actorLogin: 'dev1',
      eventType: 'PULL_REQUEST',
      action: 'merged',
      metadata: { additions: 100, deletions: 40 },
    });
    seedActivity({
      actorLogin: 'dev1',
      eventType: 'PULL_REQUEST',
      action: 'merged',
      metadata: { additions: 50, deletions: 10 },
    });
    const result = await getContributors(REPO_ID);
    expect(result[0].totalAdditions).toBe(150);
    expect(result[0].totalDeletions).toBe(50);
  });

  it('sorts contributors by totalCommits descending', async () => {
    seedActivity({ actorLogin: 'light', eventType: 'PUSH', metadata: { commits: [{}] } });
    seedActivity({ actorLogin: 'heavy', eventType: 'PUSH', metadata: { commits: [{}, {}, {}, {}, {}] } });
    const result = await getContributors(REPO_ID);
    expect(result[0].login).toBe('heavy');
    expect(result[1].login).toBe('light');
  });

  it('series entries are sorted by week ascending', async () => {
    seedActivity({ actorLogin: 'dev1', eventType: 'PUSH', metadata: { commits: [{}] }, occurredAt: daysBack(20) });
    seedActivity({ actorLogin: 'dev1', eventType: 'PUSH', metadata: { commits: [{}] }, occurredAt: daysBack(5) });
    const result = await getContributors(REPO_ID);
    const series = result[0].series;
    for (let i = 1; i < series.length; i++) {
      expect(series[i].week >= series[i - 1].week).toBe(true);
    }
  });

  it('each ContributorInsight has the required shape fields', async () => {
    seedActivity({ actorLogin: 'dev1', eventType: 'PUSH', metadata: { commits: [{}] } });
    const [contributor] = await getContributors(REPO_ID);
    expect(contributor).toHaveProperty('login');
    expect(contributor).toHaveProperty('avatarUrl');
    expect(contributor).toHaveProperty('totalCommits');
    expect(contributor).toHaveProperty('totalAdditions');
    expect(contributor).toHaveProperty('totalDeletions');
    expect(Array.isArray(contributor.series)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getTraffic
// ---------------------------------------------------------------------------

describe('getTraffic', () => {
  beforeEach(clearAll);

  it('returns all-zero traffic when the repo has no posts', async () => {
    const result = await getTraffic(REPO_ID, '7d');
    expect(result.totalViews).toBe(0);
    expect(result.totalUniques).toBe(0);
    expect(result.referrers).toEqual([]);
    expect(result.paths).toEqual([]);
  });

  it('views array has one entry per day in the period', async () => {
    const result = await getTraffic(REPO_ID, '7d');
    expect(result.views).toHaveLength(7);
    expect(result.uniques).toHaveLength(7);
  });

  it('counts views from postView rows linked to repo posts', async () => {
    seedRow(mockPrisma.post, { id: 'post-a', repositoryId: REPO_ID, content: 'Hello World' });
    seedRow(mockPrisma.postView, {
      id: 'view-1',
      postId: 'post-a',
      viewedAt: daysBack(1),
      ipHash: 'ip-aaa',
      viewerId: null,
      referrer: null,
    });
    seedRow(mockPrisma.postView, {
      id: 'view-2',
      postId: 'post-a',
      viewedAt: daysBack(1),
      ipHash: 'ip-bbb',
      viewerId: null,
      referrer: null,
    });

    const result = await getTraffic(REPO_ID, '14d');
    expect(result.totalViews).toBe(2);
    expect(result.totalUniques).toBe(2);
  });

  it('deduplicates uniques by viewerId or ipHash', async () => {
    seedRow(mockPrisma.post, { id: 'post-b', repositoryId: REPO_ID, content: 'Dup test' });
    const sharedIdentity = 'ip-same';
    seedRow(mockPrisma.postView, { id: 'v1', postId: 'post-b', viewedAt: daysBack(2), ipHash: sharedIdentity, viewerId: null, referrer: null });
    seedRow(mockPrisma.postView, { id: 'v2', postId: 'post-b', viewedAt: daysBack(2), ipHash: sharedIdentity, viewerId: null, referrer: null });

    const result = await getTraffic(REPO_ID, '14d');
    expect(result.totalViews).toBe(2);
    expect(result.totalUniques).toBe(1); // same ip
  });

  it('aggregates referrers with count and uniques', async () => {
    seedRow(mockPrisma.post, { id: 'post-c', repositoryId: REPO_ID, content: 'Ref test' });
    seedRow(mockPrisma.postView, { id: 'v1', postId: 'post-c', viewedAt: daysBack(1), ipHash: 'ip-1', viewerId: null, referrer: 'https://google.com' });
    seedRow(mockPrisma.postView, { id: 'v2', postId: 'post-c', viewedAt: daysBack(1), ipHash: 'ip-2', viewerId: null, referrer: 'https://google.com' });
    seedRow(mockPrisma.postView, { id: 'v3', postId: 'post-c', viewedAt: daysBack(1), ipHash: 'ip-3', viewerId: null, referrer: 'https://twitter.com' });

    const result = await getTraffic(REPO_ID, '14d');
    const google = result.referrers.find((r) => r.referrer === 'https://google.com');
    expect(google?.count).toBe(2);
    expect(google?.uniques).toBe(2);
  });

  it('uses "14d" as default period for unknown period strings', async () => {
    const result = await getTraffic(REPO_ID, 'unknown');
    expect(result.views).toHaveLength(14);
  });
});

// ---------------------------------------------------------------------------
// getCommitActivity
// ---------------------------------------------------------------------------

describe('getCommitActivity', () => {
  beforeEach(clearAll);

  it('returns empty weeks array when there are no PUSH events', async () => {
    const result = await getCommitActivity(REPO_ID);
    expect(result.weeks).toEqual([]);
  });

  it('each CommitActivityWeek has a days array of length 7', async () => {
    seedActivity({ eventType: 'PUSH', occurredAt: daysBack(10), metadata: { commits: [{}] } });
    const result = await getCommitActivity(REPO_ID);
    for (const week of result.weeks) {
      expect(week.days).toHaveLength(7);
    }
  });

  it('totals per week match the sum of days', async () => {
    seedActivity({ eventType: 'PUSH', occurredAt: daysBack(5), metadata: { commits: [{}, {}] } });
    const result = await getCommitActivity(REPO_ID);
    for (const week of result.weeks) {
      const daySum = week.days.reduce((a, b) => a + b, 0);
      expect(week.total).toBe(daySum);
    }
  });

  it('weeks are ordered ascending by week start date', async () => {
    seedActivity({ eventType: 'PUSH', occurredAt: daysBack(30), metadata: { commits: [{}] } });
    seedActivity({ eventType: 'PUSH', occurredAt: daysBack(10), metadata: { commits: [{}] } });
    const result = await getCommitActivity(REPO_ID);
    for (let i = 1; i < result.weeks.length; i++) {
      expect(result.weeks[i].week >= result.weeks[i - 1].week).toBe(true);
    }
  });

  it('places commit count in correct day-of-week bucket', async () => {
    // Find the most recent Monday (day 1) within the last week
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sun
    // Go back to the most recent Monday
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayOffset = daysToMonday + (dayOfWeek === 1 ? 0 : 0);
    const monday = daysBack(daysToMonday);
    seedActivity({ eventType: 'PUSH', occurredAt: monday, metadata: { commits: [{}, {}, {}] } });
    const result = await getCommitActivity(REPO_ID);
    const lastWeek = result.weeks[result.weeks.length - 1];
    // day index 1 = Monday
    expect(lastWeek.days[1]).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getCodeFrequency
// ---------------------------------------------------------------------------

describe('getCodeFrequency', () => {
  beforeEach(clearAll);

  it('returns empty weeks array when there are no PR events', async () => {
    const result = await getCodeFrequency(REPO_ID);
    expect(result.weeks).toEqual([]);
  });

  it('returns empty weeks when PRs have no addition/deletion metadata', async () => {
    seedActivity({ eventType: 'PULL_REQUEST', action: 'merged', metadata: {} });
    const result = await getCodeFrequency(REPO_ID);
    expect(result.weeks).toEqual([]);
  });

  it('aggregates additions and deletions per week', async () => {
    seedActivity({
      eventType: 'PULL_REQUEST',
      action: 'merged',
      occurredAt: daysBack(5),
      metadata: { additions: 200, deletions: 80 },
    });
    seedActivity({
      eventType: 'PULL_REQUEST',
      action: 'merged',
      occurredAt: daysBack(5),
      metadata: { additions: 50, deletions: 20 },
    });

    const result = await getCodeFrequency(REPO_ID);
    // Both events fall in the same week
    const week = result.weeks.find((w) => w.additions > 0);
    expect(week?.additions).toBe(250);
    expect(week?.deletions).toBe(100);
  });

  it('weeks are ordered ascending by week start date', async () => {
    seedActivity({ eventType: 'PULL_REQUEST', occurredAt: daysBack(30), metadata: { additions: 10, deletions: 5 } });
    seedActivity({ eventType: 'PULL_REQUEST', occurredAt: daysBack(10), metadata: { additions: 20, deletions: 8 } });
    const result = await getCodeFrequency(REPO_ID);
    for (let i = 1; i < result.weeks.length; i++) {
      expect(result.weeks[i].week >= result.weeks[i - 1].week).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getLanguages
// ---------------------------------------------------------------------------

describe('getLanguages', () => {
  beforeEach(clearAll);

  it('returns empty breakdown when the repository does not exist', async () => {
    const result = await getLanguages('nonexistent-id');
    expect(result.total).toBe(0);
    expect(result.languages).toEqual([]);
  });

  it('returns empty breakdown when the repo has no language set', async () => {
    seedRepo({ language: null });
    const result = await getLanguages(REPO_ID);
    expect(result.total).toBe(0);
    expect(result.languages).toEqual([]);
  });

  it('returns the primary language at 100% when set', async () => {
    seedRepo({ language: 'TypeScript' });
    const result = await getLanguages(REPO_ID);
    expect(result.total).toBe(1);
    expect(result.languages).toHaveLength(1);
    expect(result.languages[0].name).toBe('TypeScript');
    expect(result.languages[0].percentage).toBe(100);
  });

  it('assigns a known hex color for TypeScript', async () => {
    seedRepo({ language: 'TypeScript' });
    const result = await getLanguages(REPO_ID);
    expect(result.languages[0].color).toBe('#3178c6');
  });

  it('falls back to a neutral grey for an unknown language', async () => {
    seedRepo({ language: 'COBOL' });
    const result = await getLanguages(REPO_ID);
    expect(result.languages[0].color).toBe('#8b949e');
  });

  it('assigns the correct color for Python', async () => {
    seedRepo({ language: 'Python' });
    const result = await getLanguages(REPO_ID);
    expect(result.languages[0].color).toBe('#3572A5');
  });
});
