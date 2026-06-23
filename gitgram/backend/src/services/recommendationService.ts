import prisma from '../utils/prisma';

/**
 * Recommendation service.
 *
 * Read-only Prisma queries that produce scored, ranked recommendations with a
 * human-readable `reason` string. All scoring is deterministic: given the same
 * database state and inputs, the same ordering is always produced (ties broken
 * by stable secondary keys such as id / fullName). This service does not touch
 * analyticsService or schema.prisma.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoredItem {
  score: number;
  reason: string;
}

export interface RecommendedUser extends ScoredItem {
  id: string;
  username: string | null;
  displayName: string | null;
  avatar: string | null;
  verified: boolean;
  followersCount: number;
  mutualConnections: number;
}

export interface RecommendedRepo extends ScoredItem {
  id: string;
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  trendingScore: number;
}

export interface RecommendedSnippet extends ScoredItem {
  id: string;
  title: string;
  language: string;
  likesCount: number;
  viewsCount: number;
  authorId: string | null;
}

export interface RecommendedTopic extends ScoredItem {
  topic: string;
  repoCount: number;
}

export type FeedItemType = 'repo' | 'snippet' | 'user';

export interface ForYouItem extends ScoredItem {
  type: FeedItemType;
  id: string;
}

export interface ForYouFeed {
  items: ForYouItem[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_FANOUT = 4;

/** Stable sort: primary by score desc, secondary by tie-break key asc. */
function rankByScore<T extends ScoredItem>(items: T[], tieKey: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return tieKey(a).localeCompare(tieKey(b));
  });
}

/** Account graph context for a user: who they follow and who they block. */
async function loadGraphContext(userId: string): Promise<{
  followingIds: string[];
  blockedIds: string[];
  excludeIds: string[];
}> {
  const [following, blocks] = await Promise.all([
    prisma.follow.findMany({
      where: { followerUserId: userId },
      select: { followingUserId: true },
    }),
    prisma.userBlock.findMany({
      where: { blockerId: userId },
      select: { blockedId: true },
    }),
  ]);

  const followingIds = following
    .map((f) => f.followingUserId)
    .filter((id): id is string => Boolean(id));
  const blockedIds = blocks.map((b) => b.blockedId);
  const excludeIds = Array.from(new Set([userId, ...followingIds, ...blockedIds]));

  return { followingIds, blockedIds, excludeIds };
}

/** Distinct languages of repositories the user has starred, with star counts. */
async function loadStarredLanguageWeights(userId: string): Promise<Map<string, number>> {
  const stars = await prisma.star.findMany({
    where: { userId },
    select: { repository: { select: { language: true } } },
    take: 200,
  });

  const weights = new Map<string, number>();
  for (const star of stars) {
    const language = star.repository?.language;
    if (!language) continue;
    weights.set(language, (weights.get(language) ?? 0) + 1);
  }
  return weights;
}

/** Topic interests for a user, merged from explicit interests + topic table. */
async function loadInterestWeights(userId: string): Promise<Map<string, number>> {
  const [user, topicInterests] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { interests: true } }),
    prisma.userTopicInterest.findMany({
      where: { userId },
      select: { topic: true, weight: true, score: true },
    }),
  ]);

  const weights = new Map<string, number>();
  for (const interest of user?.interests ?? []) {
    weights.set(interest.toLowerCase(), (weights.get(interest.toLowerCase()) ?? 0) + 1);
  }
  for (const ti of topicInterests) {
    const key = ti.topic.toLowerCase();
    weights.set(key, (weights.get(key) ?? 0) + ti.weight + ti.score);
  }
  return weights;
}

/** Preferred languages from explicit preference table, falling back to stars. */
async function loadLanguageWeights(userId: string): Promise<Map<string, number>> {
  const prefs = await prisma.userLanguagePreference.findMany({
    where: { userId },
    select: { language: true, weight: true, score: true },
  });

  const weights = new Map<string, number>();
  for (const pref of prefs) {
    weights.set(pref.language, (weights.get(pref.language) ?? 0) + pref.weight + pref.score);
  }
  if (weights.size === 0) {
    return loadStarredLanguageWeights(userId);
  }
  return weights;
}

// ---------------------------------------------------------------------------
// 1. Recommended users — 2nd-degree network + shared languages/interests
// ---------------------------------------------------------------------------

export async function getRecommendedUsers(
  userId: string,
  limit = 10
): Promise<RecommendedUser[]> {
  const { followingIds, excludeIds } = await loadGraphContext(userId);
  const interestWeights = await loadInterestWeights(userId);
  const interests = Array.from(interestWeights.keys());

  // 2nd-degree: users followed by people the current user follows.
  const candidates = await prisma.user.findMany({
    where: {
      id: { notIn: excludeIds },
      isBanned: false,
      isSuspended: false,
      followers: { some: { followerUserId: { in: followingIds } } },
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      verified: true,
      interests: true,
      _count: { select: { followers: true } },
    },
    take: limit * DEFAULT_FANOUT,
  });

  const scored: RecommendedUser[] = await Promise.all(
    candidates.map(async (user) => {
      const mutualConnections = await prisma.follow.count({
        where: { followingUserId: user.id, followerUserId: { in: followingIds } },
      });

      const sharedInterests = user.interests.filter((i) =>
        interests.includes(i.toLowerCase())
      );

      const score =
        mutualConnections * 10 +
        sharedInterests.length * 6 +
        Math.min(user._count.followers, 1000) * 0.01;

      const reasonParts: string[] = [];
      if (mutualConnections > 0) {
        reasonParts.push(`${mutualConnections} mutual connection${mutualConnections === 1 ? '' : 's'}`);
      }
      if (sharedInterests.length > 0) {
        reasonParts.push(`shares interest in ${sharedInterests.slice(0, 2).join(', ')}`);
      }
      const reason = reasonParts.length > 0 ? reasonParts.join(' and ') : 'Popular in your network';

      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        verified: user.verified,
        followersCount: user._count.followers,
        mutualConnections,
        score,
        reason,
      };
    })
  );

  return rankByScore(scored, (u) => u.id).slice(0, limit);
}

// ---------------------------------------------------------------------------
// 2. Recommended repos — starred languages, popular-in-network, trending topics
// ---------------------------------------------------------------------------

export async function getRecommendedRepos(
  userId: string,
  limit = 10
): Promise<RecommendedRepo[]> {
  const { followingIds } = await loadGraphContext(userId);
  const languageWeights = await loadStarredLanguageWeights(userId);
  const interestWeights = await loadInterestWeights(userId);
  const languages = Array.from(languageWeights.keys());
  const interests = Array.from(interestWeights.keys());

  const starredRepoIds = (
    await prisma.star.findMany({ where: { userId }, select: { repositoryId: true } })
  ).map((s) => s.repositoryId);

  // Repos starred by people in the user's network (popular-in-network).
  const networkStars = await prisma.star.findMany({
    where: { userId: { in: followingIds }, repositoryId: { notIn: starredRepoIds } },
    select: { repositoryId: true },
    take: 500,
  });
  const networkStarCounts = new Map<string, number>();
  for (const star of networkStars) {
    networkStarCounts.set(star.repositoryId, (networkStarCounts.get(star.repositoryId) ?? 0) + 1);
  }

  const candidates = await prisma.repository.findMany({
    where: {
      status: 'active',
      id: { notIn: starredRepoIds },
      OR: [
        { language: { in: languages.length > 0 ? languages : undefined } },
        { topics: { hasSome: interests.length > 0 ? interests : [] } },
        { id: { in: Array.from(networkStarCounts.keys()) } },
        { trending: true },
      ],
    },
    select: {
      id: true,
      fullName: true,
      description: true,
      language: true,
      topics: true,
      stars: true,
      trendingScore: true,
    },
    take: limit * DEFAULT_FANOUT,
  });

  const scored: RecommendedRepo[] = candidates.map((repo) => {
    const languageMatch = repo.language ? languageWeights.get(repo.language) ?? 0 : 0;
    const topicMatches = repo.topics.filter((t) => interests.includes(t.toLowerCase()));
    const networkCount = networkStarCounts.get(repo.id) ?? 0;

    const score =
      networkCount * 12 +
      languageMatch * 8 +
      topicMatches.length * 5 +
      repo.trendingScore * 0.5 +
      Math.min(repo.stars, 50000) * 0.001;

    const reasonParts: string[] = [];
    if (networkCount > 0) {
      reasonParts.push(`Starred by ${networkCount} ${networkCount === 1 ? 'person' : 'people'} you follow`);
    }
    if (languageMatch > 0 && repo.language) {
      reasonParts.push(`written in ${repo.language}, which you star often`);
    }
    if (topicMatches.length > 0) {
      reasonParts.push(`matches your interest in ${topicMatches.slice(0, 2).join(', ')}`);
    }
    if (reasonParts.length === 0) {
      reasonParts.push('Trending right now');
    }
    const reason = reasonParts.join('; ');

    return {
      id: repo.id,
      fullName: repo.fullName,
      description: repo.description,
      language: repo.language,
      topics: repo.topics,
      stars: repo.stars,
      trendingScore: repo.trendingScore,
      score,
      reason,
    };
  });

  return rankByScore(scored, (r) => r.fullName).slice(0, limit);
}

// ---------------------------------------------------------------------------
// 3. Recommended snippets — preferred languages, by people you follow
// ---------------------------------------------------------------------------

export async function getRecommendedSnippets(
  userId: string,
  limit = 10
): Promise<RecommendedSnippet[]> {
  const { followingIds } = await loadGraphContext(userId);
  const languageWeights = await loadLanguageWeights(userId);
  const languages = Array.from(languageWeights.keys());

  const candidates = await prisma.codeSnippet.findMany({
    where: {
      userId: { not: userId },
      OR: [
        { language: { in: languages.length > 0 ? languages : undefined } },
        { userId: { in: followingIds } },
      ],
    },
    select: {
      id: true,
      title: true,
      language: true,
      likesCount: true,
      viewsCount: true,
      userId: true,
    },
    take: limit * DEFAULT_FANOUT,
  });

  const followingSet = new Set(followingIds);

  const scored: RecommendedSnippet[] = candidates.map((snippet) => {
    const languageMatch = languageWeights.get(snippet.language) ?? 0;
    const fromFollowed = snippet.userId ? followingSet.has(snippet.userId) : false;

    const score =
      (fromFollowed ? 15 : 0) +
      languageMatch * 8 +
      Math.min(snippet.likesCount, 5000) * 0.05 +
      Math.min(snippet.viewsCount, 50000) * 0.001;

    const reasonParts: string[] = [];
    if (fromFollowed) {
      reasonParts.push('From someone you follow');
    }
    if (languageMatch > 0) {
      reasonParts.push(`in ${snippet.language}, one of your preferred languages`);
    }
    if (snippet.likesCount > 0 && reasonParts.length === 0) {
      reasonParts.push(`Liked ${snippet.likesCount} times`);
    }
    const reason = reasonParts.length > 0 ? reasonParts.join('; ') : 'Popular snippet';

    return {
      id: snippet.id,
      title: snippet.title,
      language: snippet.language,
      likesCount: snippet.likesCount,
      viewsCount: snippet.viewsCount,
      authorId: snippet.userId,
      score,
      reason,
    };
  });

  return rankByScore(scored, (s) => s.id).slice(0, limit);
}

// ---------------------------------------------------------------------------
// 4. Recommended topics — derived from starred-repo topics and network
// ---------------------------------------------------------------------------

export async function getRecommendedTopics(
  userId: string,
  limit = 10
): Promise<RecommendedTopic[]> {
  const interestWeights = await loadInterestWeights(userId);
  const knownInterests = new Set(Array.from(interestWeights.keys()));

  // Topics from repos starred by the user and their network.
  const { followingIds } = await loadGraphContext(userId);
  const relevantStars = await prisma.star.findMany({
    where: { userId: { in: [userId, ...followingIds] } },
    select: { repository: { select: { topics: true } } },
    take: 1000,
  });

  const topicCounts = new Map<string, number>();
  for (const star of relevantStars) {
    for (const topic of star.repository?.topics ?? []) {
      const key = topic.toLowerCase();
      topicCounts.set(key, (topicCounts.get(key) ?? 0) + 1);
    }
  }

  const scored: RecommendedTopic[] = Array.from(topicCounts.entries())
    // Surface topics the user has not already declared as an interest.
    .filter(([topic]) => !knownInterests.has(topic))
    .map(([topic, repoCount]) => ({
      topic,
      repoCount,
      score: repoCount * 4 + (interestWeights.get(topic) ?? 0) * 3,
      reason: `Appears in ${repoCount} repo${repoCount === 1 ? '' : 's'} across your network`,
    }));

  return rankByScore(scored, (t) => t.topic).slice(0, limit);
}

// ---------------------------------------------------------------------------
// 5. For-you feed — mixed personalized feed with cursor pagination
// ---------------------------------------------------------------------------

export async function getForYouFeed(
  userId: string,
  cursor: string | null = null,
  limit = 20
): Promise<ForYouFeed> {
  // Over-fetch each source so the merged, ranked feed has enough material.
  const sourceLimit = Math.max(limit, 10);
  const [repos, snippets, users] = await Promise.all([
    getRecommendedRepos(userId, sourceLimit),
    getRecommendedSnippets(userId, sourceLimit),
    getRecommendedUsers(userId, Math.ceil(sourceLimit / 2)),
  ]);

  const merged: ForYouItem[] = [
    ...repos.map<ForYouItem>((r) => ({ type: 'repo', id: r.id, score: r.score, reason: r.reason })),
    ...snippets.map<ForYouItem>((s) => ({ type: 'snippet', id: s.id, score: s.score, reason: s.reason })),
    ...users.map<ForYouItem>((u) => ({ type: 'user', id: u.id, score: u.score, reason: u.reason })),
  ];

  // Deterministic ordering: score desc, then stable type+id tie-break.
  const ranked = rankByScore(merged, (item) => `${item.type}:${item.id}`);

  // Cursor is the encoded `type:id` of the last item from a previous page.
  let startIndex = 0;
  if (cursor) {
    const idx = ranked.findIndex((item) => `${item.type}:${item.id}` === cursor);
    startIndex = idx >= 0 ? idx + 1 : 0;
  }

  const page = ranked.slice(startIndex, startIndex + limit);
  const last = page[page.length - 1];
  const hasMore = startIndex + limit < ranked.length;
  const nextCursor = hasMore && last ? `${last.type}:${last.id}` : null;

  return { items: page, nextCursor };
}

// ---------------------------------------------------------------------------
// Legacy exports (kept for backwards compatibility with existing callers)
// ---------------------------------------------------------------------------

export const getSuggestedUsers = async (userId: string, limit = 10) => {
  const following = await prisma.follow.findMany({
    where: { followerUserId: userId },
    select: { followingUserId: true },
  });

  const followingIds = following
    .map((f) => f.followingUserId)
    .filter((id): id is string => Boolean(id));

  const suggested = await prisma.user.findMany({
    where: {
      id: { notIn: [userId, ...followingIds] },
      followers: { some: { followerUserId: { in: followingIds } } },
    },
    include: { _count: { select: { followers: true, posts: true } } },
    take: limit * 2,
  });

  const scored = await Promise.all(
    suggested.map(async (user) => {
      const mutualCount = await prisma.follow.count({
        where: { followingUserId: user.id, followerUserId: { in: followingIds } },
      });

      return {
        ...user,
        mutualConnections: mutualCount,
        score: mutualCount * 10 + user._count.followers,
      };
    })
  );

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
};

export const getRecommendedPosts = async (userId: string, limit = 20) => {
  const likedPosts = await prisma.like.findMany({
    where: { userId },
    include: { post: { include: { hashtags: true } } },
    take: 50,
    orderBy: { createdAt: 'desc' },
  });

  const hashtags = likedPosts.flatMap((like) => like.post.hashtags).map((h) => h.id);

  return prisma.post.findMany({
    where: {
      userId: { not: userId },
      hashtags: { some: { id: { in: hashtags } } },
      likes: { none: { userId } },
    },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      _count: { select: { likes: true, comments: true } },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
};
