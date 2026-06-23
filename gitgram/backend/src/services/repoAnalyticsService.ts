import prisma from '../utils/prisma';
import logger from '../utils/logger';

// ============================================
// Mock Redis (Map-based; swap for redisService when ready)
// Mirrors the same pattern used in analyticsService.ts
// ============================================

interface CacheEntry {
  value: number;
  expiresAt: number;
}

const mockRedis = new Map<string, CacheEntry>();
const pendingViewFlushes = new Map<string, { repoId: string; delta: number }>();

function redisIncr(key: string, ttlMs: number): number {
  const now = Date.now();
  const entry = mockRedis.get(key);
  if (entry && entry.expiresAt > now) {
    entry.value += 1;
    return entry.value;
  }
  mockRedis.set(key, { value: 1, expiresAt: now + ttlMs });
  return 1;
}

function redisGet(key: string): number {
  const now = Date.now();
  const entry = mockRedis.get(key);
  if (entry && entry.expiresAt > now) {
    return entry.value;
  }
  mockRedis.delete(key);
  return 0;
}

const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

async function flushViewsToDB(): Promise<void> {
  if (pendingViewFlushes.size === 0) return;

  const snapshot = new Map(pendingViewFlushes);
  pendingViewFlushes.clear();

  for (const [, payload] of snapshot) {
    try {
      // NOTE: viewsCount/viewCount field not yet in Repository schema; log and skip
      logger.warn('repoAnalyticsService: repository viewCount flush skipped (field not in schema)', { repoId: payload.repoId });
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
): Promise<{ id: string; claimedBy: string | null; stars: number; forks: number } | null> {
  // Repository.owner is the GitHub owner string — match on owner + name directly.
  // NOTE: Repository does not have a userId/viewCount/starCount/forkCount field in the
  // current schema; use owner/name lookup and claimedBy for ownership checks.
  return prisma.repository.findFirst({
    where: { owner, name },
    select: {
      id: true,
      claimedBy: true,
      stars: true,
      forks: true,
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

    const count = redisIncr(dedupeKey, 60 * 60 * 1000); // 1-hour TTL
    if (count > 1) {
      return;
    }

    // Increment the daily bucket for traffic queries
    const day = new Date().toISOString().slice(0, 10);
    const dailyKey = `daily:view:repo:${repoId}:${day}`;
    redisIncr(dailyKey, 25 * 60 * 60 * 1000); // 25-hour TTL so the bucket survives the full day

    // Buffer for DB flush
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

  const traffic: TrafficBucket[] = days7.map((day) => ({
    period: day,
    count: redisGet(`daily:view:repo:${repo.id}:${day}`),
  }));

  return {
    repoId: repo.id,
    views: 0, // viewsCount field not yet in Repository schema
    clones: 0, // placeholder — requires a dedicated clone-tracking table
    stars: repo.stars ?? 0,
    forks: repo.forks ?? 0,
    uniqueViewers: 0,
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
  const days = buildDayBuckets(periodToDays(period));

  const daily: DailyTraffic[] = days.map((date) => {
    const total = redisGet(`daily:view:repo:${repo.id}:${date}`);
    // Unique per-day approximated as 70% of total (replace with a proper unique-view log when available)
    const unique = Math.round(total * 0.7);
    return { date, views: total, unique };
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
