import prisma from '../utils/prisma';
import logger from '../utils/logger';

// ============================================
// Repository Insights Service
//
// Powers the web insights page
// (web/app/[owner]/[name]/insights/page.tsx).
//
// Data is derived from webhook-sourced RepositoryActivity rows and from
// Gitgram Post / PostView records. Where a data source is unavailable we
// return well-formed zero/empty structures so the UI degrades gracefully.
// ============================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---- Response shapes (mirror the web page contract) ------------------------

export interface TimePoint {
  date: string; // ISO date (YYYY-MM-DD)
  value: number;
}

export interface PulseInsights {
  rangeDays: number;
  commits: number;
  prsMerged: number;
  prsOpened: number;
  issuesClosed: number;
  issuesOpened: number;
  activeContributors: number;
}

export interface ContributorSeriesPoint {
  week: string; // ISO date for start of week
  additions: number;
  deletions: number;
  commits: number;
}

export interface ContributorInsight {
  login: string;
  avatarUrl: string | null;
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  series: ContributorSeriesPoint[];
}

export interface ReferrerRow {
  referrer: string;
  count: number;
  uniques: number;
}

export interface ContentPath {
  path: string;
  title: string | null;
  count: number;
  uniques: number;
}

export interface TrafficInsights {
  views: TimePoint[];
  uniques: TimePoint[];
  totalViews: number;
  totalUniques: number;
  referrers: ReferrerRow[];
  paths: ContentPath[];
}

export interface CommitActivityWeek {
  week: string; // ISO date for start of week
  total: number;
  days: number[]; // length 7, Sun..Sat
}

export interface CommitActivityInsights {
  weeks: CommitActivityWeek[];
}

export interface CodeFrequencyPoint {
  week: string; // ISO date for start of week
  additions: number;
  deletions: number; // positive number
}

export interface CodeFrequencyInsights {
  weeks: CodeFrequencyPoint[];
}

export interface LanguageBreakdown {
  name: string;
  bytes: number;
  percentage: number;
  color: string;
}

export interface LanguagesInsights {
  total: number;
  languages: LanguageBreakdown[];
}

// ---- Internal metadata views ----------------------------------------------

interface PushMetadata {
  commitCount?: number;
  commits?: Array<{ sha?: string; message?: string; author?: string }>;
}

interface PullRequestMetadata {
  additions?: number;
  deletions?: number;
  merged?: boolean;
}

// ---- Date helpers ----------------------------------------------------------

/** Format a Date as a UTC YYYY-MM-DD key. */
function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Normalize a date to UTC midnight. */
function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Start of the week (Sunday) at UTC midnight for the given date. */
function weekStart(date: Date): Date {
  const midnight = utcMidnight(date);
  const dayOfWeek = midnight.getUTCDay(); // 0 = Sunday
  return new Date(midnight.getTime() - dayOfWeek * MS_PER_DAY);
}

/** Inclusive list of week-start keys spanning [from, now]. */
function buildWeekKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let cursor = weekStart(from);
  const end = weekStart(to);
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toDateKey(cursor));
    cursor = new Date(cursor.getTime() + 7 * MS_PER_DAY);
  }
  return keys;
}

// ---- Repo resolution -------------------------------------------------------

interface ResolvedRepo {
  id: string;
  language: string | null;
}

/**
 * Resolve an owner + name pair to a repository id. Returns null when no such
 * repository exists in Gitgram.
 */
export async function resolveRepoId(owner: string, name: string): Promise<ResolvedRepo | null> {
  const repo = await prisma.repository.findUnique({
    where: { owner_name: { owner, name } },
    select: { id: true, language: true },
  });
  return repo ? { id: repo.id, language: repo.language } : null;
}

// ---- Metadata extraction ---------------------------------------------------

function readPushMetadata(metadata: unknown): PushMetadata {
  if (metadata && typeof metadata === 'object') {
    return metadata as PushMetadata;
  }
  return {};
}

function readPrMetadata(metadata: unknown): PullRequestMetadata {
  if (metadata && typeof metadata === 'object') {
    return metadata as PullRequestMetadata;
  }
  return {};
}

/** Commits carried by a PUSH activity (defaults to 1 when unspecified). */
function commitCountOf(metadata: unknown): number {
  const meta = readPushMetadata(metadata);
  if (typeof meta.commitCount === 'number' && meta.commitCount >= 0) {
    return meta.commitCount;
  }
  if (Array.isArray(meta.commits) && meta.commits.length > 0) {
    return meta.commits.length;
  }
  return 1;
}

// ============================================
// 1. Pulse
// ============================================

export async function getPulse(repoId: string, days: number): Promise<PulseInsights> {
  const rangeDays = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
  const since = new Date(Date.now() - rangeDays * MS_PER_DAY);

  try {
    const activities = await prisma.repositoryActivity.findMany({
      where: { repositoryId: repoId, occurredAt: { gte: since } },
      select: {
        eventType: true,
        action: true,
        actorLogin: true,
        metadata: true,
      },
    });

    let commits = 0;
    let prsMerged = 0;
    let prsOpened = 0;
    let issuesClosed = 0;
    let issuesOpened = 0;
    const contributors = new Set<string>();

    for (const a of activities) {
      if (a.actorLogin) contributors.add(a.actorLogin);

      switch (a.eventType) {
        case 'PUSH':
          commits += commitCountOf(a.metadata);
          break;
        case 'PULL_REQUEST':
          if (a.action === 'merged') prsMerged += 1;
          else if (a.action === 'opened' || a.action === 'reopened') prsOpened += 1;
          break;
        case 'ISSUES':
          if (a.action === 'closed') issuesClosed += 1;
          else if (a.action === 'opened' || a.action === 'reopened') issuesOpened += 1;
          break;
        default:
          break;
      }
    }

    return {
      rangeDays,
      commits,
      prsMerged,
      prsOpened,
      issuesClosed,
      issuesOpened,
      activeContributors: contributors.size,
    };
  } catch (error) {
    logger.error('repoInsightsService.getPulse failed', { error, repoId });
    return {
      rangeDays,
      commits: 0,
      prsMerged: 0,
      prsOpened: 0,
      issuesClosed: 0,
      issuesOpened: 0,
      activeContributors: 0,
    };
  }
}

// ============================================
// 2. Contributors
// ============================================

export async function getContributors(repoId: string): Promise<ContributorInsight[]> {
  const since = new Date(Date.now() - 52 * 7 * MS_PER_DAY); // ~1 year

  try {
    const activities = await prisma.repositoryActivity.findMany({
      where: {
        repositoryId: repoId,
        eventType: { in: ['PUSH', 'PULL_REQUEST'] },
        occurredAt: { gte: since },
      },
      select: {
        eventType: true,
        action: true,
        actorLogin: true,
        actorAvatar: true,
        occurredAt: true,
        metadata: true,
      },
      orderBy: { occurredAt: 'asc' },
    });

    interface Accumulator {
      login: string;
      avatarUrl: string | null;
      totalCommits: number;
      totalAdditions: number;
      totalDeletions: number;
      weeks: Map<string, ContributorSeriesPoint>;
    }

    const byLogin = new Map<string, Accumulator>();

    const ensure = (login: string, avatar: string | null): Accumulator => {
      const existing = byLogin.get(login);
      if (existing) {
        if (!existing.avatarUrl && avatar) existing.avatarUrl = avatar;
        return existing;
      }
      const created: Accumulator = {
        login,
        avatarUrl: avatar,
        totalCommits: 0,
        totalAdditions: 0,
        totalDeletions: 0,
        weeks: new Map(),
      };
      byLogin.set(login, created);
      return created;
    };

    const weekBucket = (acc: Accumulator, key: string): ContributorSeriesPoint => {
      const existing = acc.weeks.get(key);
      if (existing) return existing;
      const created: ContributorSeriesPoint = { week: key, additions: 0, deletions: 0, commits: 0 };
      acc.weeks.set(key, created);
      return created;
    };

    for (const a of activities) {
      if (!a.actorLogin) continue;
      const acc = ensure(a.actorLogin, a.actorAvatar ?? null);
      const wk = weekBucket(acc, toDateKey(weekStart(a.occurredAt)));

      if (a.eventType === 'PUSH') {
        const n = commitCountOf(a.metadata);
        acc.totalCommits += n;
        wk.commits += n;
      } else if (a.eventType === 'PULL_REQUEST') {
        const meta = readPrMetadata(a.metadata);
        const additions = typeof meta.additions === 'number' ? meta.additions : 0;
        const deletions = typeof meta.deletions === 'number' ? meta.deletions : 0;
        acc.totalAdditions += additions;
        acc.totalDeletions += deletions;
        wk.additions += additions;
        wk.deletions += deletions;
      }
    }

    return Array.from(byLogin.values())
      .map((acc) => ({
        login: acc.login,
        avatarUrl: acc.avatarUrl,
        totalCommits: acc.totalCommits,
        totalAdditions: acc.totalAdditions,
        totalDeletions: acc.totalDeletions,
        series: Array.from(acc.weeks.values()).sort((x, y) => x.week.localeCompare(y.week)),
      }))
      .sort((x, y) => y.totalCommits - x.totalCommits);
  } catch (error) {
    logger.error('repoInsightsService.getContributors failed', { error, repoId });
    return [];
  }
}

// ============================================
// 3. Traffic
// ============================================

const PERIOD_DAYS: Record<string, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };

function parsePeriodDays(period: string): number {
  return PERIOD_DAYS[period] ?? 14;
}

interface RawPostView {
  viewedAt: Date;
  ipHash: string | null;
  viewerId: string | null;
  referrer: string | null;
  postId: string;
}

export async function getTraffic(repoId: string, period: string): Promise<TrafficInsights> {
  const days = parsePeriodDays(period);
  const since = new Date(Date.now() - days * MS_PER_DAY);

  // Pre-seed every day in range so the chart has a continuous x-axis.
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    dayKeys.push(toDateKey(new Date(Date.now() - i * MS_PER_DAY)));
  }
  const viewsByDay = new Map<string, number>(dayKeys.map((d) => [d, 0]));
  const uniquesByDay = new Map<string, Set<string>>(dayKeys.map((d) => [d, new Set<string>()]));

  let totalViews = 0;
  const totalUniqueKeys = new Set<string>();
  const referrerAgg = new Map<string, { count: number; uniques: Set<string> }>();
  const pathAgg = new Map<string, { title: string | null; count: number; uniques: Set<string> }>();

  try {
    const repoPosts = await prisma.post.findMany({
      where: { repositoryId: repoId },
      select: { id: true, content: true },
    });

    if (repoPosts.length === 0) {
      return {
        views: dayKeys.map((date) => ({ date, value: 0 })),
        uniques: dayKeys.map((date) => ({ date, value: 0 })),
        totalViews: 0,
        totalUniques: 0,
        referrers: [],
        paths: [],
      };
    }

    const titleByPost = new Map<string, string | null>(
      repoPosts.map((p) => [p.id, p.content ? p.content.slice(0, 60) : null]),
    );

    const views: RawPostView[] = await prisma.postView.findMany({
      where: { postId: { in: repoPosts.map((p) => p.id) }, viewedAt: { gte: since } },
      select: { viewedAt: true, ipHash: true, viewerId: true, referrer: true, postId: true },
    });

    for (const v of views) {
      const dayKey = toDateKey(v.viewedAt);
      const identity = v.viewerId ?? v.ipHash ?? `anon:${v.postId}:${v.viewedAt.getTime()}`;

      totalViews += 1;
      totalUniqueKeys.add(identity);

      if (viewsByDay.has(dayKey)) {
        viewsByDay.set(dayKey, (viewsByDay.get(dayKey) ?? 0) + 1);
        uniquesByDay.get(dayKey)?.add(identity);
      }

      if (v.referrer) {
        const entry = referrerAgg.get(v.referrer) ?? { count: 0, uniques: new Set<string>() };
        entry.count += 1;
        entry.uniques.add(identity);
        referrerAgg.set(v.referrer, entry);
      }

      const pathKey = `/post/${v.postId}`;
      const pathEntry =
        pathAgg.get(pathKey) ?? { title: titleByPost.get(v.postId) ?? null, count: 0, uniques: new Set<string>() };
      pathEntry.count += 1;
      pathEntry.uniques.add(identity);
      pathAgg.set(pathKey, pathEntry);
    }
  } catch (error) {
    logger.error('repoInsightsService.getTraffic failed', { error, repoId });
  }

  return {
    views: dayKeys.map((date) => ({ date, value: viewsByDay.get(date) ?? 0 })),
    uniques: dayKeys.map((date) => ({ date, value: uniquesByDay.get(date)?.size ?? 0 })),
    totalViews,
    totalUniques: totalUniqueKeys.size,
    referrers: Array.from(referrerAgg.entries())
      .map(([referrer, e]) => ({ referrer, count: e.count, uniques: e.uniques.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    paths: Array.from(pathAgg.entries())
      .map(([path, e]) => ({ path, title: e.title, count: e.count, uniques: e.uniques.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25),
  };
}

// ============================================
// 4. Commit activity
// ============================================

export async function getCommitActivity(repoId: string): Promise<CommitActivityInsights> {
  const since = new Date(Date.now() - 52 * 7 * MS_PER_DAY); // ~1 year of weeks

  try {
    const pushes = await prisma.repositoryActivity.findMany({
      where: { repositoryId: repoId, eventType: 'PUSH', occurredAt: { gte: since } },
      select: { occurredAt: true, metadata: true },
      orderBy: { occurredAt: 'asc' },
    });

    if (pushes.length === 0) {
      return { weeks: [] };
    }

    const weekKeys = buildWeekKeys(since, new Date());
    const weeks = new Map<string, CommitActivityWeek>(
      weekKeys.map((week) => [week, { week, total: 0, days: [0, 0, 0, 0, 0, 0, 0] }]),
    );

    for (const p of pushes) {
      const key = toDateKey(weekStart(p.occurredAt));
      const bucket = weeks.get(key);
      if (!bucket) continue;
      const n = commitCountOf(p.metadata);
      const dow = utcMidnight(p.occurredAt).getUTCDay(); // 0..6
      bucket.total += n;
      bucket.days[dow] += n;
    }

    return { weeks: Array.from(weeks.values()).sort((a, b) => a.week.localeCompare(b.week)) };
  } catch (error) {
    logger.error('repoInsightsService.getCommitActivity failed', { error, repoId });
    return { weeks: [] };
  }
}

// ============================================
// 5. Code frequency
// ============================================

export async function getCodeFrequency(repoId: string): Promise<CodeFrequencyInsights> {
  const since = new Date(Date.now() - 52 * 7 * MS_PER_DAY);

  try {
    const prs = await prisma.repositoryActivity.findMany({
      where: { repositoryId: repoId, eventType: 'PULL_REQUEST', occurredAt: { gte: since } },
      select: { occurredAt: true, metadata: true },
      orderBy: { occurredAt: 'asc' },
    });

    if (prs.length === 0) {
      return { weeks: [] };
    }

    const weekKeys = buildWeekKeys(since, new Date());
    const weeks = new Map<string, CodeFrequencyPoint>(
      weekKeys.map((week) => [week, { week, additions: 0, deletions: 0 }]),
    );

    let hasData = false;
    for (const pr of prs) {
      const meta = readPrMetadata(pr.metadata);
      const additions = typeof meta.additions === 'number' ? meta.additions : 0;
      const deletions = typeof meta.deletions === 'number' ? meta.deletions : 0;
      if (additions === 0 && deletions === 0) continue;
      const bucket = weeks.get(toDateKey(weekStart(pr.occurredAt)));
      if (!bucket) continue;
      bucket.additions += additions;
      bucket.deletions += deletions; // already a positive number from GitHub
      hasData = true;
    }

    if (!hasData) {
      return { weeks: [] };
    }

    return { weeks: Array.from(weeks.values()).sort((a, b) => a.week.localeCompare(b.week)) };
  } catch (error) {
    logger.error('repoInsightsService.getCodeFrequency failed', { error, repoId });
    return { weeks: [] };
  }
}

// ============================================
// 6. Languages
// ============================================

// Stable colors for common languages; falls back to a neutral grey.
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  Vue: '#41b883',
};

function colorFor(language: string): string {
  return LANGUAGE_COLORS[language] ?? '#8b949e';
}

/**
 * Language breakdown. Gitgram stores only a single primary `language` per
 * repository (no per-language byte counts), so we surface that primary
 * language at 100% when present. Returns an empty breakdown otherwise.
 */
export async function getLanguages(repoId: string): Promise<LanguagesInsights> {
  try {
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      select: { language: true },
    });

    if (!repo?.language) {
      return { total: 0, languages: [] };
    }

    return {
      total: 1,
      languages: [
        {
          name: repo.language,
          bytes: 1,
          percentage: 100,
          color: colorFor(repo.language),
        },
      ],
    };
  } catch (error) {
    logger.error('repoInsightsService.getLanguages failed', { error, repoId });
    return { total: 0, languages: [] };
  }
}
