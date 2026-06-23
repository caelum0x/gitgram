/**
 * Unit tests for contributionService
 *
 * All Prisma calls are intercepted by the in-memory mock in tests/setup.ts.
 * We populate __rows on each model directly, then call the service functions
 * and assert the returned shapes, level quartiles, streak logic, etc.
 */

import { mockPrisma } from '../setup';
import { TEST_USER_ID } from '../helpers';
import { getContributions, getContributionStats } from '../../src/services/contributionService';

const USERNAME = 'octocat';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedRow(model: any, row: Record<string, unknown>) {
  model.__rows.push(row);
}

function clearAll() {
  [
    mockPrisma.user,
    mockPrisma.post,
    mockPrisma.codeSnippet,
    mockPrisma.repositoryActivity,
  ].forEach((m) => m.__rows.splice(0));
}

/** Returns a UTC-midnight Date for the given YYYY-MM-DD string. */
function utcDay(isoDate: string): Date {
  const [y, mo, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

/** Returns the YYYY-MM-DD string for a day offset from today (UTC). */
function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * MS_PER_DAY);
  return d.toISOString().slice(0, 10);
}

function seedUser(overrides: Record<string, unknown> = {}) {
  seedRow(mockPrisma.user, {
    id: TEST_USER_ID,
    username: USERNAME,
    githubUsername: 'octocat-gh',
    isPrivate: false,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// getContributions — week grid, levels, year window, totals
// ---------------------------------------------------------------------------

describe('getContributions', () => {
  beforeEach(clearAll);

  it('throws when the username does not exist', async () => {
    await expect(getContributions('nobody', 2024)).rejects.toThrow('User not found: nobody');
  });

  it('returns a ContributionGraph with correct year and zero totals for an inactive year', async () => {
    seedUser();
    const graph = await getContributions(USERNAME, 2024);
    expect(graph.year).toBe(2024);
    expect(graph.total).toBe(0);
    expect(graph.weeks.length).toBeGreaterThan(0);
    // Every week is an array of 7 days
    for (const week of graph.weeks) {
      expect(week).toHaveLength(7);
    }
  });

  it('all cells outside the requested year have count === 0', async () => {
    seedUser();
    const graph = await getContributions(USERNAME, 2024);
    // Cells that belong to a different year (padding weeks) must be 0
    for (const week of graph.weeks) {
      for (const day of week) {
        const dayYear = new Date(day.date).getUTCFullYear();
        if (dayYear !== 2024) {
          expect(day.count).toBe(0);
        }
      }
    }
  });

  it('counts posts authored by the user inside the year', async () => {
    seedUser();
    seedRow(mockPrisma.post, {
      id: 'post-1',
      userId: TEST_USER_ID,
      createdAt: utcDay('2024-06-15'),
    });
    seedRow(mockPrisma.post, {
      id: 'post-2',
      userId: TEST_USER_ID,
      createdAt: utcDay('2024-06-15'),
    });
    const graph = await getContributions(USERNAME, 2024);
    expect(graph.total).toBe(2);

    const week = graph.weeks.find((w) => w.some((d) => d.date === '2024-06-15'));
    const day = week?.find((d) => d.date === '2024-06-15');
    expect(day?.count).toBe(2);
  });

  it('counts snippets authored by the user inside the year', async () => {
    seedUser();
    seedRow(mockPrisma.codeSnippet, {
      id: 'snip-1',
      userId: TEST_USER_ID,
      createdAt: utcDay('2024-03-10'),
    });
    const graph = await getContributions(USERNAME, 2024);
    expect(graph.total).toBe(1);
  });

  it('counts each commit in a PUSH event via metadata.commits array', async () => {
    seedUser();
    seedRow(mockPrisma.repositoryActivity, {
      id: 'evt-1',
      actorLogin: 'octocat-gh',
      eventType: 'PUSH',
      occurredAt: utcDay('2024-08-01'),
      metadata: { commits: [{}, {}, {}] }, // 3 commits
    });
    const graph = await getContributions(USERNAME, 2024);
    const week = graph.weeks.find((w) => w.some((d) => d.date === '2024-08-01'));
    const day = week?.find((d) => d.date === '2024-08-01');
    expect(day?.count).toBe(3);
    expect(graph.total).toBe(3);
  });

  it('defaults to 1 commit for PUSH events with no commits array', async () => {
    seedUser();
    seedRow(mockPrisma.repositoryActivity, {
      id: 'evt-2',
      actorLogin: 'octocat-gh',
      eventType: 'PUSH',
      occurredAt: utcDay('2024-09-05'),
      metadata: {},
    });
    const graph = await getContributions(USERNAME, 2024);
    expect(graph.total).toBe(1);
  });

  it('counts PULL_REQUEST events as 1 contribution each', async () => {
    seedUser();
    seedRow(mockPrisma.repositoryActivity, {
      id: 'evt-3',
      actorLogin: 'octocat-gh',
      eventType: 'PULL_REQUEST',
      occurredAt: utcDay('2024-07-20'),
      metadata: {},
    });
    const graph = await getContributions(USERNAME, 2024);
    expect(graph.total).toBe(1);
  });

  it('ignores activity events for other actors', async () => {
    seedUser();
    seedRow(mockPrisma.repositoryActivity, {
      id: 'evt-4',
      actorLogin: 'someone-else',
      eventType: 'PUSH',
      occurredAt: utcDay('2024-04-01'),
      metadata: { commits: [{}, {}] },
    });
    const graph = await getContributions(USERNAME, 2024);
    expect(graph.total).toBe(0);
  });

  it('assigns level 0 to days with no activity', async () => {
    seedUser();
    const graph = await getContributions(USERNAME, 2024);
    const zeroDays = graph.weeks.flat().filter((d) => new Date(d.date).getUTCFullYear() === 2024);
    zeroDays.forEach((d) => {
      expect(d.level).toBe(0);
      expect(d.count).toBe(0);
    });
  });

  it('level quartiles: busiest day gets level 4, half gets level 2', async () => {
    seedUser();
    // 4 commits on Aug-1 (max), 2 on Aug-2 (50% -> level 2)
    seedRow(mockPrisma.repositoryActivity, {
      id: 'evt-5',
      actorLogin: 'octocat-gh',
      eventType: 'PUSH',
      occurredAt: utcDay('2024-08-01'),
      metadata: { commits: [{}, {}, {}, {}] },
    });
    seedRow(mockPrisma.repositoryActivity, {
      id: 'evt-6',
      actorLogin: 'octocat-gh',
      eventType: 'PUSH',
      occurredAt: utcDay('2024-08-02'),
      metadata: { commits: [{}, {}] },
    });

    const graph = await getContributions(USERNAME, 2024);
    const findDay = (date: string) => graph.weeks.flat().find((d) => d.date === date);

    const busy = findDay('2024-08-01');
    const half = findDay('2024-08-02');

    expect(busy?.level).toBe(4); // ratio = 1.0 > 0.75
    expect(half?.level).toBe(2); // ratio = 0.5 exactly <= 0.5
  });

  it('level 1 for counts at 25% of max', async () => {
    seedUser();
    // max = 4, one day with 1 commit (ratio 0.25)
    seedRow(mockPrisma.repositoryActivity, {
      id: 'evt-7',
      actorLogin: 'octocat-gh',
      eventType: 'PUSH',
      occurredAt: utcDay('2024-09-01'),
      metadata: { commits: [{}, {}, {}, {}] },
    });
    seedRow(mockPrisma.repositoryActivity, {
      id: 'evt-8',
      actorLogin: 'octocat-gh',
      eventType: 'PUSH',
      occurredAt: utcDay('2024-09-02'),
      metadata: { commits: [{}] },
    });
    const graph = await getContributions(USERNAME, 2024);
    const quarter = graph.weeks.flat().find((d) => d.date === '2024-09-02');
    expect(quarter?.level).toBe(1); // ratio = 0.25 <= 0.25
  });

  it('aggregates posts, snippets, and repo activity into a combined total', async () => {
    seedUser();
    seedRow(mockPrisma.post, { id: 'p1', userId: TEST_USER_ID, createdAt: utcDay('2024-05-05') });
    seedRow(mockPrisma.codeSnippet, { id: 's1', userId: TEST_USER_ID, createdAt: utcDay('2024-05-05') });
    seedRow(mockPrisma.repositoryActivity, {
      id: 'ra1',
      actorLogin: 'octocat-gh',
      eventType: 'PUSH',
      occurredAt: utcDay('2024-05-05'),
      metadata: { commits: [{}, {}] },
    });

    const graph = await getContributions(USERNAME, 2024);
    // 1 post + 1 snippet + 2 commits = 4
    const day = graph.weeks.flat().find((d) => d.date === '2024-05-05');
    expect(day?.count).toBe(4);
    expect(graph.total).toBe(4);
  });

  it('grid starts on Sunday on or before Jan 1', async () => {
    seedUser();
    const graph = await getContributions(USERNAME, 2024);
    const firstDay = graph.weeks[0][0];
    const dayOfWeek = new Date(firstDay.date).getUTCDay();
    expect(dayOfWeek).toBe(0); // Sunday
  });
});

// ---------------------------------------------------------------------------
// getContributionStats — streaks, busiest day, totals
// ---------------------------------------------------------------------------

describe('getContributionStats', () => {
  beforeEach(clearAll);

  it('throws when the username does not exist', async () => {
    await expect(getContributionStats('nobody')).rejects.toThrow('User not found: nobody');
  });

  it('returns all zeros and null busiestDay when there is no activity', async () => {
    seedUser();
    const stats = await getContributionStats(USERNAME);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.totalContributions).toBe(0);
    expect(stats.busiestDay).toBeNull();
  });

  it('identifies busiestDay correctly when contributions exist', async () => {
    seedUser();
    // 3 posts today, 1 yesterday
    seedRow(mockPrisma.post, { id: 'p1', userId: TEST_USER_ID, createdAt: new Date(daysAgo(0) + 'T10:00:00Z') });
    seedRow(mockPrisma.post, { id: 'p2', userId: TEST_USER_ID, createdAt: new Date(daysAgo(0) + 'T11:00:00Z') });
    seedRow(mockPrisma.post, { id: 'p3', userId: TEST_USER_ID, createdAt: new Date(daysAgo(0) + 'T12:00:00Z') });
    seedRow(mockPrisma.post, { id: 'p4', userId: TEST_USER_ID, createdAt: new Date(daysAgo(1) + 'T10:00:00Z') });

    const stats = await getContributionStats(USERNAME);
    expect(stats.busiestDay?.date).toBe(daysAgo(0));
    expect(stats.busiestDay?.count).toBe(3);
  });

  it('currentStreak is 1 when only today has activity', async () => {
    seedUser();
    seedRow(mockPrisma.post, { id: 'p1', userId: TEST_USER_ID, createdAt: new Date(daysAgo(0) + 'T08:00:00Z') });
    const stats = await getContributionStats(USERNAME);
    expect(stats.currentStreak).toBe(1);
  });

  it('currentStreak counts consecutive days back from today', async () => {
    seedUser();
    // 3 consecutive days including today
    for (let i = 0; i < 3; i++) {
      seedRow(mockPrisma.post, {
        id: `p${i}`,
        userId: TEST_USER_ID,
        createdAt: new Date(daysAgo(i) + 'T09:00:00Z'),
      });
    }
    const stats = await getContributionStats(USERNAME);
    expect(stats.currentStreak).toBe(3);
  });

  it('currentStreak resets to 0 when today has no activity', async () => {
    seedUser();
    // Activity only 2 and 3 days ago, gap today
    seedRow(mockPrisma.post, { id: 'p1', userId: TEST_USER_ID, createdAt: new Date(daysAgo(2) + 'T09:00:00Z') });
    seedRow(mockPrisma.post, { id: 'p2', userId: TEST_USER_ID, createdAt: new Date(daysAgo(3) + 'T09:00:00Z') });
    const stats = await getContributionStats(USERNAME);
    expect(stats.currentStreak).toBe(0);
  });

  it('longestStreak is correctly computed when current < longest', async () => {
    seedUser();
    // 5-day run 30 days ago, only 1 day active today
    for (let i = 30; i <= 34; i++) {
      seedRow(mockPrisma.post, {
        id: `p${i}`,
        userId: TEST_USER_ID,
        createdAt: new Date(daysAgo(i) + 'T09:00:00Z'),
      });
    }
    // 1 day today for a current streak of 1
    seedRow(mockPrisma.post, { id: 'p-today', userId: TEST_USER_ID, createdAt: new Date(daysAgo(0) + 'T09:00:00Z') });

    const stats = await getContributionStats(USERNAME);
    expect(stats.longestStreak).toBeGreaterThanOrEqual(5);
    expect(stats.currentStreak).toBe(1);
  });

  it('totalContributions sums posts, snippets, and repo activity', async () => {
    seedUser();
    seedRow(mockPrisma.post, { id: 'p1', userId: TEST_USER_ID, createdAt: new Date(daysAgo(5) + 'T10:00:00Z') });
    seedRow(mockPrisma.codeSnippet, { id: 's1', userId: TEST_USER_ID, createdAt: new Date(daysAgo(5) + 'T11:00:00Z') });
    seedRow(mockPrisma.repositoryActivity, {
      id: 'ra1',
      actorLogin: 'octocat-gh',
      eventType: 'PUSH',
      occurredAt: new Date(daysAgo(5) + 'T12:00:00Z'),
      metadata: { commits: [{}, {}] },
    });
    const stats = await getContributionStats(USERNAME);
    expect(stats.totalContributions).toBe(4); // 1 + 1 + 2
  });

  it('activity older than 365 days is excluded from the window', async () => {
    seedUser();
    // 370 days ago should be outside the 364-day rolling window
    seedRow(mockPrisma.post, {
      id: 'old-post',
      userId: TEST_USER_ID,
      createdAt: new Date(Date.now() - 370 * MS_PER_DAY),
    });
    const stats = await getContributionStats(USERNAME);
    expect(stats.totalContributions).toBe(0);
  });

  it('uses githubUsername as actor login for repo activity matching', async () => {
    seedUser({ githubUsername: 'gh-alias' });
    seedRow(mockPrisma.repositoryActivity, {
      id: 'ra-gh',
      actorLogin: 'gh-alias',
      eventType: 'PULL_REQUEST',
      occurredAt: new Date(daysAgo(1) + 'T10:00:00Z'),
      metadata: {},
    });
    const stats = await getContributionStats(USERNAME);
    expect(stats.totalContributions).toBe(1);
  });

  it('longestStreak equals currentStreak when the whole window is active', async () => {
    seedUser();
    for (let i = 0; i <= 6; i++) {
      seedRow(mockPrisma.post, {
        id: `p${i}`,
        userId: TEST_USER_ID,
        createdAt: new Date(daysAgo(i) + 'T10:00:00Z'),
      });
    }
    const stats = await getContributionStats(USERNAME);
    expect(stats.longestStreak).toBe(stats.currentStreak);
    expect(stats.currentStreak).toBe(7);
  });
});
