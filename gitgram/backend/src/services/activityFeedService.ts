import prisma from '../utils/prisma';

/**
 * Activity Feed Service
 *
 * Read-only aggregation over existing Prisma models. Backs the web /activity page.
 * Does NOT modify the schema or write any analytics. All queries are read-only.
 *
 * Cursor pagination is deterministic: the cursor is the ISO timestamp of the last
 * returned event. Each source is queried for events strictly older than the cursor,
 * the union is sorted by createdAt DESC, and sliced to `limit`. Ties are broken by
 * a stable composite key (createdAt + type + id) so ordering is reproducible.
 */

export type ActivityType =
  | 'starred_repo'
  | 'created_post'
  | 'opened_pr'
  | 'merged_pr'
  | 'created_snippet'
  | 'followed_user'
  | 'forked_repo'
  | 'new_release';

export type ActivityFilter = 'all' | 'following' | 'mentions' | 'self';

export interface ActivityActor {
  id: string;
  username: string;
  avatar: string | null;
}

export interface ActivityTarget {
  id: string;
  kind: 'repository' | 'post' | 'snippet' | 'user';
  label: string;
  url: string | null;
}

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  actor: ActivityActor;
  target: ActivityTarget | null;
  preview: string | null;
  createdAt: string; // ISO-8601
}

export interface ActivityFeedOptions {
  filter?: ActivityFilter;
  cursor?: string | null;
  limit?: number;
}

export interface ActivityFeedResult {
  events: ActivityEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface NetworkTrendingItem {
  kind: 'repository' | 'post';
  id: string;
  label: string;
  url: string | null;
  score: number;
  actorsInNetwork: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const UNKNOWN_ACTOR: ActivityActor = { id: 'unknown', username: 'unknown', avatar: null };

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

/** Parse an ISO cursor into a Date. Returns null (= newest) when absent/invalid. */
function parseCursor(cursor?: string | null): Date | null {
  if (!cursor) return null;
  const parsed = new Date(cursor);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toActor(
  user: { id: string; username: string | null; avatar: string | null } | null | undefined
): ActivityActor {
  if (!user) return UNKNOWN_ACTOR;
  return { id: user.id, username: user.username ?? 'unknown', avatar: user.avatar };
}

function actorFromLogin(login: string, avatar: string | null): ActivityActor {
  return { id: `gh:${login}`, username: login, avatar };
}

/** Resolve the set of user ids the given user follows (read-only). */
async function getFollowingUserIds(userId: string): Promise<string[]> {
  const follows = await prisma.follow.findMany({
    where: { followerUserId: userId },
    select: { followingUserId: true },
  });
  return follows
    .map((f) => f.followingUserId)
    .filter((id): id is string => Boolean(id));
}

/**
 * Determine which user ids are the "subject" actors for a given filter.
 * - 'self'      => only the requesting user
 * - 'following' => users the requester follows
 * - 'all'       => requester + followed users
 * - 'mentions'  => handled separately (post-content scan), returns []
 */
async function resolveActorScope(
  userId: string,
  filter: ActivityFilter
): Promise<string[]> {
  if (filter === 'self') return [userId];
  if (filter === 'mentions') return [];
  const following = await getFollowingUserIds(userId);
  if (filter === 'following') return following;
  return Array.from(new Set([userId, ...following]));
}

interface SourceQuery {
  actorIds: string[];
  before: Date | null;
  take: number;
}

async function queryStars({ actorIds, before, take }: SourceQuery): Promise<ActivityEvent[]> {
  if (actorIds.length === 0) return [];
  const stars = await prisma.star.findMany({
    where: { userId: { in: actorIds }, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      repository: { select: { id: true, fullName: true, htmlUrl: true } },
    },
  });
  return stars.map((s) => ({
    id: `star:${s.id}`,
    type: 'starred_repo',
    actor: toActor(s.user),
    target: {
      id: s.repository.id,
      kind: 'repository',
      label: s.repository.fullName,
      url: s.repository.htmlUrl,
    },
    preview: `Starred ${s.repository.fullName}`,
    createdAt: s.createdAt.toISOString(),
  }));
}

async function queryPosts({ actorIds, before, take }: SourceQuery): Promise<ActivityEvent[]> {
  if (actorIds.length === 0) return [];
  const posts = await prisma.post.findMany({
    where: {
      userId: { in: actorIds },
      isArchived: false,
      status: 'PUBLISHED',
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });
  return posts.map((p) => ({
    id: `post:${p.id}`,
    type: 'created_post',
    actor: toActor(p.user),
    target: { id: p.id, kind: 'post', label: 'post', url: `/posts/${p.id}` },
    preview: p.content.slice(0, 180),
    createdAt: p.createdAt.toISOString(),
  }));
}

async function querySnippets({ actorIds, before, take }: SourceQuery): Promise<ActivityEvent[]> {
  if (actorIds.length === 0) return [];
  const snippets = await prisma.codeSnippet.findMany({
    where: {
      userId: { in: actorIds },
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });
  return snippets.map((s) => ({
    id: `snippet:${s.id}`,
    type: 'created_snippet',
    actor: toActor(s.user),
    target: { id: s.id, kind: 'snippet', label: s.title, url: `/snippets/${s.id}` },
    preview: s.description ?? `${s.language} snippet`,
    createdAt: s.createdAt.toISOString(),
  }));
}

async function queryFollows({ actorIds, before, take }: SourceQuery): Promise<ActivityEvent[]> {
  if (actorIds.length === 0) return [];
  const follows = await prisma.follow.findMany({
    where: {
      followerUserId: { in: actorIds },
      followingUserId: { not: null },
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      followerUser: { select: { id: true, username: true, avatar: true } },
      followingUser: { select: { id: true, username: true, avatar: true } },
    },
  });
  return follows.map((f) => {
    const followed = toActor(f.followingUser);
    return {
      id: `follow:${f.id}`,
      type: 'followed_user',
      actor: toActor(f.followerUser),
      target: {
        id: followed.id,
        kind: 'user',
        label: followed.username,
        url: `/u/${followed.username}`,
      },
      preview: `Followed ${followed.username}`,
      createdAt: f.createdAt.toISOString(),
    };
  });
}

/** Repo claims are stored on Repository.claimedBy / claimedAt (no separate model). */
async function queryRepoClaims({ actorIds, before, take }: SourceQuery): Promise<ActivityEvent[]> {
  if (actorIds.length === 0) return [];
  const repos = await prisma.repository.findMany({
    where: {
      claimedBy: { in: actorIds },
      claimedAt: { not: null, ...(before ? { lt: before } : {}) },
    },
    orderBy: { claimedAt: 'desc' },
    take,
  });
  const claimerIds = repos
    .map((r) => r.claimedBy)
    .filter((id): id is string => Boolean(id));
  const claimers = claimerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: claimerIds } },
        select: { id: true, username: true, avatar: true },
      })
    : [];
  const byId = new Map(claimers.map((u) => [u.id, u]));
  return repos
    .filter((r) => r.claimedAt)
    .map((r) => ({
      // A claim surfaces as the user authoring a repository event.
      id: `claim:${r.id}`,
      type: 'created_post' as ActivityType,
      actor: toActor(r.claimedBy ? byId.get(r.claimedBy) : null),
      target: { id: r.id, kind: 'repository' as const, label: r.fullName, url: r.htmlUrl },
      preview: `Claimed ${r.fullName}`,
      createdAt: (r.claimedAt as Date).toISOString(),
    }));
}

/** PR / release / fork events come from RepositoryActivity (GitHub webhook backed). */
async function queryRepositoryActivity(
  repoIds: string[],
  before: Date | null,
  take: number
): Promise<ActivityEvent[]> {
  if (repoIds.length === 0) return [];
  const rows = await prisma.repositoryActivity.findMany({
    where: {
      repositoryId: { in: repoIds },
      eventType: { in: ['PULL_REQUEST', 'RELEASE', 'FORK'] },
      ...(before ? { occurredAt: { lt: before } } : {}),
    },
    orderBy: { occurredAt: 'desc' },
    take,
    include: { repository: { select: { id: true, fullName: true, htmlUrl: true } } },
  });
  return rows.map((r) => {
    let type: ActivityType = 'opened_pr';
    if (r.eventType === 'RELEASE') type = 'new_release';
    else if (r.eventType === 'FORK') type = 'forked_repo';
    else if (r.eventType === 'PULL_REQUEST') {
      type = r.action === 'merged' ? 'merged_pr' : 'opened_pr';
    }
    return {
      id: `repoactivity:${r.id}`,
      type,
      actor: actorFromLogin(r.actorLogin, r.actorAvatar),
      target: {
        id: r.repository.id,
        kind: 'repository' as const,
        label: r.repository.fullName,
        url: r.url ?? r.repository.htmlUrl,
      },
      preview: r.title ?? `${r.eventType} on ${r.repository.fullName}`,
      createdAt: r.occurredAt.toISOString(),
    };
  });
}

/** Posts mentioning the requesting user (content-scan). */
async function queryMentions(
  username: string | null,
  before: Date | null,
  take: number
): Promise<ActivityEvent[]> {
  if (!username) return [];
  const posts = await prisma.post.findMany({
    where: {
      content: { contains: `@${username}`, mode: 'insensitive' },
      isArchived: false,
      status: 'PUBLISHED',
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });
  return posts.map((p) => ({
    id: `post:${p.id}`,
    type: 'created_post',
    actor: toActor(p.user),
    target: { id: p.id, kind: 'post', label: 'post', url: `/posts/${p.id}` },
    preview: p.content.slice(0, 180),
    createdAt: p.createdAt.toISOString(),
  }));
}

/** Stable descending comparator: createdAt, then type, then id. */
function compareEvents(a: ActivityEvent, b: ActivityEvent): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  if (a.type !== b.type) return a.type < b.type ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

/** Repositories reachable from a set of users (claimed or starred by them). */
async function getNetworkRepoIds(actorIds: string[]): Promise<string[]> {
  if (actorIds.length === 0) return [];
  const [claimed, starred] = await Promise.all([
    prisma.repository.findMany({ where: { claimedBy: { in: actorIds } }, select: { id: true } }),
    prisma.star.findMany({ where: { userId: { in: actorIds } }, select: { repositoryId: true } }),
  ]);
  const ids = new Set<string>();
  claimed.forEach((r) => ids.add(r.id));
  starred.forEach((s) => ids.add(s.repositoryId));
  return Array.from(ids);
}

/**
 * Cursor-paginated, aggregated activity feed.
 */
export async function getActivityFeed(
  userId: string,
  options: ActivityFeedOptions = {}
): Promise<ActivityFeedResult> {
  const filter: ActivityFilter = options.filter ?? 'all';
  const limit = clampLimit(options.limit);
  const before = parseCursor(options.cursor);
  // Over-fetch per source so the merged window is dense enough to fill `limit`.
  const take = limit + 1;

  let events: ActivityEvent[];

  if (filter === 'mentions') {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    events = await queryMentions(me?.username ?? null, before, take);
  } else {
    const actorIds = await resolveActorScope(userId, filter);
    const repoIds = await getNetworkRepoIds(actorIds);
    const sourceArgs: SourceQuery = { actorIds, before, take };
    const groups = await Promise.all([
      queryStars(sourceArgs),
      queryPosts(sourceArgs),
      querySnippets(sourceArgs),
      queryFollows(sourceArgs),
      queryRepoClaims(sourceArgs),
      queryRepositoryActivity(repoIds, before, take),
    ]);
    events = groups.flat();
  }

  events.sort(compareEvents);
  const hasMore = events.length > limit;
  const page = events.slice(0, limit);
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].createdAt : null;

  return { events: page, nextCursor, hasMore };
}

/**
 * Repos/posts trending among the people the user follows.
 * Score = engagement weighted by how many followed users touched the item.
 */
export async function getNetworkTrending(
  userId: string,
  limit = 10
): Promise<NetworkTrendingItem[]> {
  const cappedLimit = clampLimit(limit);
  const following = await getFollowingUserIds(userId);
  if (following.length === 0) return [];

  const [stars, posts] = await Promise.all([
    prisma.star.findMany({
      where: { userId: { in: following } },
      select: { repositoryId: true },
    }),
    prisma.post.findMany({
      where: { userId: { in: following }, isArchived: false, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, content: true, likesCount: true, commentsCount: true },
    }),
  ]);

  const repoCounts = new Map<string, number>();
  stars.forEach((s) => repoCounts.set(s.repositoryId, (repoCounts.get(s.repositoryId) ?? 0) + 1));
  const repos = repoCounts.size
    ? await prisma.repository.findMany({
        where: { id: { in: Array.from(repoCounts.keys()) } },
        select: { id: true, fullName: true, htmlUrl: true, stars: true },
      })
    : [];

  const repoItems: NetworkTrendingItem[] = repos.map((r) => {
    const inNetwork = repoCounts.get(r.id) ?? 0;
    return {
      kind: 'repository',
      id: r.id,
      label: r.fullName,
      url: r.htmlUrl,
      score: inNetwork * 10 + r.stars,
      actorsInNetwork: inNetwork,
    };
  });

  const postItems: NetworkTrendingItem[] = posts.map((p) => ({
    kind: 'post',
    id: p.id,
    label: p.content.slice(0, 80),
    url: `/posts/${p.id}`,
    score: p.likesCount * 2 + p.commentsCount * 3,
    actorsInNetwork: 1,
  }));

  return [...repoItems, ...postItems]
    .sort((a, b) => (b.score === a.score ? (a.id < b.id ? -1 : 1) : b.score - a.score))
    .slice(0, cappedLimit);
}
