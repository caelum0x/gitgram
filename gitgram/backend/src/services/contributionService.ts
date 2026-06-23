import prisma from '../utils/prisma';

// ============================================
// Types
// ============================================

export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export interface DayContribution {
  date: string; // YYYY-MM-DD
  count: number;
  level: ContributionLevel;
}

export interface ContributionGraph {
  weeks: DayContribution[][];
  total: number;
  year: number;
}

export interface ContributionStats {
  currentStreak: number;
  longestStreak: number;
  totalContributions: number;
  busiestDay: { date: string; count: number } | null;
}

interface ContributionUser {
  id: string;
  username: string | null;
  githubUsername: string | null;
  isPrivate: boolean;
}

// ============================================
// Helpers
// ============================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Format a Date as a UTC YYYY-MM-DD key. */
function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Normalize a date to UTC midnight. */
function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Resolve a username to a contribution-eligible user.
 * Returns null when the user does not exist.
 */
async function resolveUser(username: string): Promise<ContributionUser | null> {
  return prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, githubUsername: true, isPrivate: true },
  });
}

/**
 * Derive a GitHub-style activity level from a day's count using fixed
 * quartile-style thresholds relative to the busiest day in the range.
 */
function deriveLevel(count: number, max: number): ContributionLevel {
  if (count <= 0) return 0;
  if (max <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/**
 * Aggregate raw activity for a user across the given UTC date window.
 * Sources: posts created, snippets created, and webhook-sourced repository
 * activity (commits via PUSH, pull requests via PULL_REQUEST) attributed to
 * the user's GitHub login.
 */
async function aggregateCounts(
  user: ContributionUser,
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  const add = (occurredAt: Date, amount: number): void => {
    const key = toDateKey(occurredAt);
    counts.set(key, (counts.get(key) ?? 0) + amount);
  };

  const githubLogins = [user.githubUsername, user.username].filter(
    (login): login is string => Boolean(login),
  );

  const [posts, snippets, repoActivity] = await Promise.all([
    prisma.post.findMany({
      where: { userId: user.id, createdAt: { gte: start, lt: end } },
      select: { createdAt: true },
    }),
    prisma.codeSnippet.findMany({
      where: { userId: user.id, createdAt: { gte: start, lt: end } },
      select: { createdAt: true },
    }),
    githubLogins.length > 0
      ? prisma.repositoryActivity.findMany({
          where: {
            actorLogin: { in: githubLogins, mode: 'insensitive' },
            eventType: { in: ['PUSH', 'PULL_REQUEST'] },
            occurredAt: { gte: start, lt: end },
          },
          select: { occurredAt: true, eventType: true, metadata: true },
        })
      : Promise.resolve([]),
  ]);

  posts.forEach((p) => add(p.createdAt, 1));
  snippets.forEach((s) => add(s.createdAt, 1));

  repoActivity.forEach((event) => {
    // A push event may carry multiple commits in its metadata; count each.
    if (event.eventType === 'PUSH') {
      const commitCount = extractCommitCount(event.metadata);
      add(event.occurredAt, commitCount);
    } else {
      add(event.occurredAt, 1);
    }
  });

  return counts;
}

/** Extract the number of commits from PUSH webhook metadata, defaulting to 1. */
function extractCommitCount(metadata: unknown): number {
  if (metadata && typeof metadata === 'object' && 'commits' in metadata) {
    const commits = (metadata as { commits: unknown }).commits;
    if (Array.isArray(commits) && commits.length > 0) {
      return commits.length;
    }
  }
  return 1;
}

// ============================================
// Public API
// ============================================

/**
 * Build a week-aligned (Sunday-start) contribution grid for a user and year,
 * GitHub-style. Each inner array is one week of 7 DayContribution cells.
 */
export async function getContributions(username: string, year: number): Promise<ContributionGraph> {
  const user = await resolveUser(username);
  if (!user) {
    throw new Error(`User not found: ${username}`);
  }

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const counts = await aggregateCounts(user, yearStart, yearEnd);
  const max = Math.max(0, ...counts.values());

  // Grid starts on the Sunday on or before Jan 1 and ends on the Saturday
  // on or after Dec 31, matching GitHub's calendar layout.
  const gridStart = utcMidnight(yearStart);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

  const lastDay = utcMidnight(new Date(Date.UTC(year, 11, 31)));
  const gridEnd = new Date(lastDay);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));

  const weeks: DayContribution[][] = [];
  let total = 0;
  let cursor = new Date(gridStart);

  while (cursor.getTime() <= gridEnd.getTime()) {
    const week: DayContribution[] = [];
    for (let i = 0; i < 7; i += 1) {
      const key = toDateKey(cursor);
      const inYear = cursor.getUTCFullYear() === year;
      const count = inYear ? counts.get(key) ?? 0 : 0;
      if (inYear) total += count;
      week.push({ date: key, count, level: deriveLevel(count, max) });
      cursor = new Date(cursor.getTime() + MS_PER_DAY);
    }
    weeks.push(week);
  }

  return { weeks, total, year };
}

/**
 * Compute streak and aggregate statistics across a rolling 365-day window
 * ending today. Streaks are counted over consecutive calendar days with
 * at least one contribution.
 */
export async function getContributionStats(username: string): Promise<ContributionStats> {
  const user = await resolveUser(username);
  if (!user) {
    throw new Error(`User not found: ${username}`);
  }

  const today = utcMidnight(new Date());
  const windowStart = new Date(today.getTime() - 364 * MS_PER_DAY);
  const windowEnd = new Date(today.getTime() + MS_PER_DAY); // exclusive upper bound

  const counts = await aggregateCounts(user, windowStart, windowEnd);

  let totalContributions = 0;
  let busiestDay: { date: string; count: number } | null = null;

  for (const [date, count] of counts.entries()) {
    totalContributions += count;
    if (!busiestDay || count > busiestDay.count) {
      busiestDay = { date, count };
    }
  }

  // Walk the window day-by-day to compute longest and current streaks.
  let longestStreak = 0;
  let runningStreak = 0;
  let currentStreak = 0;
  let trailingActive = true;

  for (let offset = 0; offset <= 364; offset += 1) {
    const day = new Date(windowStart.getTime() + offset * MS_PER_DAY);
    const active = (counts.get(toDateKey(day)) ?? 0) > 0;

    if (active) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  // Current streak: count back from today through consecutive active days.
  for (let offset = 0; offset <= 364 && trailingActive; offset += 1) {
    const day = new Date(today.getTime() - offset * MS_PER_DAY);
    if ((counts.get(toDateKey(day)) ?? 0) > 0) {
      currentStreak += 1;
    } else {
      trailingActive = false;
    }
  }

  return { currentStreak, longestStreak, totalContributions, busiestDay };
}
