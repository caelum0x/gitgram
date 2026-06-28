import prisma from '../utils/prisma';
import logger from '../utils/logger';
import {
  counterIncr,
  counterGet,
  counterSetAdd,
  counterSetSize,
} from '../utils/viewCounter';

// ============================================
// View buffering & periodic DB flush
// ============================================
//
// View counts are buffered in Redis (shared, restart-safe) and periodically
// flushed to Postgres: Repository.viewsCount (lifetime total) and
// RepositoryPathView (per-path daily rollup for the "popular content" panel).

const DAY_MS = 24 * 60 * 60 * 1000;
const DEDUPE_TTL_MS = 60 * 60 * 1000; // 1 hour per-viewer dedupe window
const DAILY_TTL_MS = (25 * DAY_MS) / 24; // bucket survives a full calendar day
const UNIQUE_TTL_MS = 90 * DAY_MS; // unique-viewer sets retained for 90 days
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

const pendingViewFlushes = new Map<string, { repoId: string; delta: number }>();

async function flushViewsToDB(): Promise<void> {
  if (pendingViewFlushes.size === 0) return;

  const snapshot = new Map(pendingViewFlushes);
  pendingViewFlushes.clear();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStr = today.toISOString().slice(0, 10);

  for (const [, payload] of snapshot) {
    try {
      await prisma.$transaction([
        prisma.repository.update({
          where: { id: payload.repoId },
          data: { viewsCount: { increment: payload.delta } },
        }),
        prisma.repositoryPathView.upsert({
          // Aggregate repo-level views under a synthetic "/" path per day.
          where: { id: `${payload.repoId}:/:${dayStr}` },
          create: {
            id: `${payload.repoId}:/:${dayStr}`,
            repositoryId: payload.repoId,
            path: '/',
            views: payload.delta,
            date: today,
          },
          update: { views: { increment: payload.delta } },
        }),
      ]);
    } catch (error) {
      logger.error('repoAnalyticsService: DB flush error', { error, payload });
    }
  }
}

setInterval(() => {
  flushViewsToDB().catch((err) =>
    logger.error('repoAnalyticsService: periodic flush failed', err)
  );
}, FLUSH_INTERVAL_MS);

// ============================================
// Exported interfaces
// ============================================

export interface RepoOverviewAnalytics {
  repoId: string;
  views: number;
  clones: number;
  stars: number;
  forks: number;
  uniqueViewers: number;
  traffic: TrafficBucket[];
}

export interface TrafficBucket {
  period: string;
  count: number;
}

export interface DailyTraffic {
  date: string;
  views: number;
  unique: number;
}

export interface TrafficData {
  daily: DailyTraffic[];
}

export interface Referrer {
  source: string;
  count: number;
  uniqueCount: number;
}

export interface PopularPath {
  path: string;
  views: number;
}

// ============================================
// Helpers
// ============================================

type Period = '7d' | '30d' | '90d';

function parsePeriod(raw: unknown): Period {
  if (raw === '7d' || raw === '30d' || raw === '90d') return raw;
  return '7d';
}

function periodToDays(period: Period): number {
  switch (period) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
  }
}

function buildDayBuckets(days: number): string[] {
  const result: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function resolveRepo(
  owner: string,
  name: string
): Promise<{
  id: string;
  claimedBy: string | null;
  stars: number;
  forks: number;
  viewsCount: number;
} | null> {
  // Repository.owner is the GitHub owner string — match on owner + name directly.
  // claimedBy is used for ownership checks.
  return prisma.repository.findFirst({
    where: { owner, name },
    select: {
      id: true,
      claimedBy: true,
      stars: true,
      forks: true,
      viewsCount: true,
    },
  });
}

// ============================================
// Track repository view
// ============================================

/**
 * Record a view for the given repository.
 * Deduplicates per viewer per repo per hour via the in-memory Redis layer.
 * Counts are buffered and flushed to DB every 5 minutes.
 */
export async function trackRepositoryView(
  repoId: string,
  userId: string | null,
  referrer: string | null
): Promise<void> {
  try {
    const hourKey = new Date().toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
    const viewerKey = userId ?? 'anon';
    const dedupeKey = `view:repo:${repoId}:${viewerKey}:${hourKey}`;

    const count = await counterIncr(dedupeKey, DEDUPE_TTL_MS);
    if (count > 1) {
      return;
    }

    // Increment the daily bucket for traffic queries
    const day = new Date().toISOString().slice(0, 10);
    const dailyKey = `daily:view:repo:${repoId}:${day}`;
    await counterIncr(dailyKey, DAILY_TTL_MS);

    // Track unique viewers per day and over the rolling 90-day window.
    await counterSetAdd(`unique:view:repo:${repoId}:${day}`, viewerKey, DAILY_TTL_MS);
    await counterSetAdd(`unique:view:repo:${repoId}:lifetime`, viewerKey, UNIQUE_TTL_MS);

    // Buffer for DB flush (lifetime viewsCount + per-day path rollup)
    const flushKey = `flush:repo:${repoId}`;
    const existing = pendingViewFlushes.get(flushKey);
    if (existing) {
      existing.delta += 1;
    } else {
      pendingViewFlushes.set(flushKey, { repoId, delta: 1 });
    }

    // Persist referrer if provided (best-effort, fire-and-forget)
    if (referrer) {
      prisma.repositoryReferrer
        .upsert({
          where: { repoId_source: { repositoryId: repoId, source: referrer } },
          create: { repositoryId: repoId, source: referrer, count: 1, uniqueCount: 1 },
          update: { count: { increment: 1 } },
        })
        .catch((err: unknown) =>
          logger.error('repoAnalyticsService: referrer upsert error', { err, repoId, referrer })
        );
    }
  } catch (error) {
    logger.error('repoAnalyticsService: trackRepositoryView error', { error, repoId });
  }
}

/**
 * Record a clone event for the given repository.
 * Deduplicates per cloner per day; persists a daily clone rollup row.
 */
export async function trackRepositoryClone(
  repoId: string,
  clonerId: string | null
): Promise<void> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const clonerKey = clonerId ?? 'anon';

    const dedupeKey = `clone:repo:${repoId}:${clonerKey}:${day}`;
    const count = await counterIncr(dedupeKey, DAY_MS);
    const isUnique = count === 1;

    const date = new Date();
    date.setHours(0, 0, 0, 0);

    await prisma.repositoryClone.upsert({
      where: { repoId_date: { repositoryId: repoId, date } },
      create: {
        repositoryId: repoId,
        date,
        count: 1,
        uniqueCount: isUnique ? 1 : 0,
      },
      update: {
        count: { increment: 1 },
        ...(isUnique ? { uniqueCount: { increment: 1 } } : {}),
      },
    });
  } catch (error) {
    logger.error('repoAnalyticsService: trackRepositoryClone error', { error, repoId });
  }
}

// ============================================
// Query functions
// ============================================

/**
 * Overall analytics for a repository.
 * Only accessible by the repository owner.
 */
export async function getRepositoryAnalyticsOverview(
  owner: string,
  name: string,
  requestorId: string
): Promise<RepoOverviewAnalytics> {
  const repo = await resolveRepo(owner, name);

  if (!repo) {
    throw new Error('Repository not found');
  }

  if (repo.claimedBy !== requestorId) {
    throw new Error('Forbidden: not the repository owner');
  }

  const days7 = buildDayBuckets(7);
  const since = daysAgo(7);

  // Buffered (un-flushed) daily counts + persisted historical path-view totals.
  const [bufferedCounts, persistedRows, cloneAgg, uniqueViewers] = await Promise.all([
    Promise.all(days7.map((day) => counterGet(`daily:view:repo:${repo.id}:${day}`))),
    prisma.repositoryPathView.findMany({
      where: { repositoryId: repo.id, date: { gte: since } },
      select: { views: true, date: true },
    }),
    prisma.repositoryClone.aggregate({
      where: { repositoryId: repo.id },
      _sum: { count: true },
    }),
    counterSetSize(`unique:view:repo:${repo.id}:lifetime`),
  ]);

  const persistedByDay = new Map<string, number>();
  for (const row of persistedRows) {
    const key = row.date.toISOString().slice(0, 10);
    persistedByDay.set(key, (persistedByDay.get(key) ?? 0) + row.views);
  }

  const traffic: TrafficBucket[] = days7.map((day, i) => ({
    period: day,
    count: (persistedByDay.get(day) ?? 0) + bufferedCounts[i],
  }));

  return {
    repoId: repo.id,
    views: repo.viewsCount ?? 0,
    clones: cloneAgg._sum.count ?? 0,
    stars: repo.stars ?? 0,
    forks: repo.forks ?? 0,
    uniqueViewers,
    traffic,
  };
}

/**
 * Daily traffic data for a repository over the given period.
 * Only accessible by the repository owner.
 */
export async function getTrafficData(
  owner: string,
  name: string,
  requestorId: string,
  periodRaw: unknown
): Promise<TrafficData> {
  const repo = await resolveRepo(owner, name);

  if (!repo) {
    throw new Error('Repository not found');
  }

  if (repo.claimedBy !== requestorId) {
    throw new Error('Forbidden: not the repository owner');
  }

  const period = parsePeriod(periodRaw);
  const numDays = periodToDays(period);
  const days = buildDayBuckets(numDays);
  const since = daysAgo(numDays);

  const [bufferedTotals, bufferedUniques, persistedRows] = await Promise.all([
    Promise.all(days.map((date) => counterGet(`daily:view:repo:${repo.id}:${date}`))),
    Promise.all(days.map((date) => counterSetSize(`unique:view:repo:${repo.id}:${date}`))),
    prisma.repositoryPathView.findMany({
      where: { repositoryId: repo.id, date: { gte: since } },
      select: { views: true, date: true },
    }),
  ]);

  const persistedByDay = new Map<string, number>();
  for (const row of persistedRows) {
    const key = row.date.toISOString().slice(0, 10);
    persistedByDay.set(key, (persistedByDay.get(key) ?? 0) + row.views);
  }

  const daily: DailyTraffic[] = days.map((date, i) => {
    const views = (persistedByDay.get(date) ?? 0) + bufferedTotals[i];
    const unique = Math.min(bufferedUniques[i], views);
    return { date, views, unique };
  });

  return { daily };
}

/**
 * Top referrers for a repository.
 * Only accessible by the repository owner.
 */
export async function getReferrers(
  owner: string,
  name: string,
  requestorId: string
): Promise<Referrer[]> {
  const repo = await resolveRepo(owner, name);

  if (!repo) {
    throw new Error('Repository not found');
  }

  if (repo.claimedBy !== requestorId) {
    throw new Error('Forbidden: not the repository owner');
  }

  let rows: Array<{ source: string; count: number; uniqueCount: number }> = [];

  try {
    rows = await prisma.repositoryReferrer.findMany({
      where: { repositoryId: repo.id },
      orderBy: { count: 'desc' },
      take: 20,
      select: { source: true, count: true, uniqueCount: true },
    });
  } catch (error) {
    logger.warn('repoAnalyticsService: getReferrers query failed', { error });
  }

  return rows;
}

/**
 * Most-viewed paths/files for a repository.
 * Only accessible by the repository owner.
 */
export async function getPopularContent(
  owner: string,
  name: string,
  requestorId: string
): Promise<PopularPath[]> {
  const repo = await resolveRepo(owner, name);

  if (!repo) {
    throw new Error('Repository not found');
  }

  if (repo.claimedBy !== requestorId) {
    throw new Error('Forbidden: not the repository owner');
  }

  let rows: Array<{ path: string; views: number }> = [];

  try {
    rows = await prisma.repositoryPathView.findMany({
      where: { repositoryId: repo.id },
      orderBy: { views: 'desc' },
      take: 25,
      select: { path: true, views: true },
    });
  } catch (error) {
    logger.warn('repoAnalyticsService: getPopularContent query failed', { error });
  }

  return rows;
}
