import { prisma } from '../utils/prisma';
import { getFollowingIds } from '../utils/followCache';

interface FeedItem {
  id: string;
  type: 'post' | 'repo' | 'reel' | 'snippet';
  createdAt: Date;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  authorId: string | null;
  data: any;
}

interface UserContext {
  userId: string;
  following: string[];
  interests: string[];
  recentLikes: string[];
}

// Calculate engagement score for feed ranking
export function calculateFeedScore(item: FeedItem, context: UserContext): number {
  let score = 0;

  // 1. Engagement score (40%)
  const engagement =
    item.likesCount * 1 +
    item.commentsCount * 2 +
    item.sharesCount * 3 +
    item.viewsCount * 0.1;
  score += engagement * 0.4;

  // 2. Recency score (30%) - exponential decay
  const hoursOld = (Date.now() - item.createdAt.getTime()) / 3600000;
  const recency = Math.exp(-hoursOld / 24); // Half-life of 24 hours
  score += recency * 100 * 0.3;

  // 3. Relationship score (20%)
  const isFromFollowing = item.authorId !== null && context.following.includes(item.authorId);
  score += isFromFollowing ? 50 * 0.2 : 0;

  // 4. Diversity bonus (10%) - boost less common content types
  const typeBonus = item.type === 'snippet' ? 20 : item.type === 'repo' ? 15 : 0;
  score += typeBonus * 0.1;

  return score;
}

// Get user context for personalization
async function getUserContext(userId: string): Promise<UserContext> {
  const [following, recentLikes] = await Promise.all([
    getFollowingIds(userId),  // Redis-cached — gh-social followCache pattern
    prisma.interaction.findMany({
      where: { userId, type: 'like' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { contentId: true }
    })
  ]);

  return {
    userId,
    following,
    interests: [],
    recentLikes: recentLikes.map(l => l.contentId)
  };
}

// Fetch recent posts
async function fetchRecentPosts(context: UserContext, limit: number): Promise<FeedItem[]> {
  const posts = await prisma.post.findMany({
    where: {
      OR: [
        { userId: { in: context.following } },
        { likesCount: { gte: 5 } } // Popular posts
      ]
    },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      repository: { select: { fullName: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  return posts.map(p => ({
    id: p.id,
    type: 'post' as const,
    createdAt: p.createdAt,
    likesCount: p.likesCount,
    commentsCount: p.commentsCount,
    sharesCount: p.sharesCount,
    viewsCount: p.viewsCount,
    authorId: p.userId,
    data: p
  }));
}

// Fetch active repos user follows
async function fetchActiveRepos(context: UserContext, limit: number): Promise<FeedItem[]> {
  const repos = await prisma.repository.findMany({
    where: {
      OR: [
        { followers: { some: { userId: context.userId } } },
        { stars: { gte: 1000 } } // Popular repos
      ]
    },
    orderBy: { updatedAt: 'desc' },
    take: limit
  });

  return repos.map(r => ({
    id: r.id,
    type: 'repo' as const,
    createdAt: r.createdAt,
    likesCount: r.reactionsCount,
    commentsCount: r.commentsCount,
    sharesCount: 0,
    viewsCount: 0,
    authorId: r.owner,
    data: { ...r, fullName: r.fullName, owner: r.owner, name: r.name }
  }));
}

// Fetch recent reels
async function fetchRecentReels(context: UserContext, limit: number): Promise<FeedItem[]> {
  const reels = await prisma.reel.findMany({
    where: {
      OR: [
        { userId: { in: context.following } },
        { likesCount: { gte: 10 } }
      ]
    },
    include: {
      user: { select: { id: true, username: true, avatar: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  return reels.map(r => ({
    id: r.id,
    type: 'reel' as const,
    createdAt: r.createdAt,
    likesCount: r.likesCount,
    commentsCount: r.commentsCount,
    sharesCount: 0,
    viewsCount: r.viewsCount,
    authorId: r.userId,
    data: r
  }));
}

// Fetch recent code snippets
async function fetchRecentSnippets(context: UserContext, limit: number): Promise<FeedItem[]> {
  const snippets = await prisma.codeSnippet.findMany({
    where: {
      OR: [
        { userId: { in: context.following } },
        { likesCount: { gte: 3 } }
      ]
    },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      repository: { select: { fullName: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  return snippets.map(s => ({
    id: s.id,
    type: 'snippet' as const,
    createdAt: s.createdAt,
    likesCount: s.likesCount,
    commentsCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    authorId: s.userId,
    data: s
  }));
}

// Main function: Get personalized feed
export async function getPersonalizedFeed(userId: string, page: number, limit: number) {
  const context = await getUserContext(userId);

  // Fetch candidates from all content types
  const [posts, repos, reels, snippets] = await Promise.all([
    fetchRecentPosts(context, limit * 2),
    fetchActiveRepos(context, Math.ceil(limit / 2)),
    fetchRecentReels(context, limit),
    fetchRecentSnippets(context, Math.ceil(limit / 3))
  ]);

  // Score, rank, then tune for diversity
  const scored = [...posts, ...repos, ...reels, ...snippets]
    .map(item => ({ ...item, score: calculateFeedScore(item, context) }))
    .sort((a, b) => b.score - a.score);

  const tuned = tuneFeed(scored);
  const items = tuned.slice((page - 1) * limit, page * limit);

  return {
    items,
    page,
    hasMore: tuned.length > page * limit
  };
}

// ── FeedTuner ─────────────────────────────────────────────────────────────────
// Ensures feed diversity: no author appears more than MAX_AUTHOR_RUN times in a
// row, content types are interleaved, and duplicate IDs are removed.
//
// Algorithm ported from Bluesky social-app (MIT) FeedTuner — adapted for
// Gitgram's multi-type feed (posts, repos, reels, snippets).

const MAX_AUTHOR_RUN = 2;
const REPO_INTERVAL = 4;  // insert a repo/reel every N posts

type ScoredFeedItem = FeedItem & { score: number };

export function tuneFeed(items: ScoredFeedItem[]): ScoredFeedItem[] {
  const seen = new Set<string>();
  const result: ScoredFeedItem[] = [];
  let consecutiveSameAuthor = 0;
  let lastAuthorId: string | null = null;
  let postsSinceNonPost = 0;

  // Separate pools
  const posts = items.filter(i => i.type === 'post' || i.type === 'snippet');
  const nonPosts = items.filter(i => i.type === 'repo' || i.type === 'reel');
  const nonPostQueue = [...nonPosts];

  for (const item of posts) {
    // Dedup
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    // Author run limit: skip if same author appears more than MAX_AUTHOR_RUN times
    if (item.authorId && item.authorId === lastAuthorId) {
      consecutiveSameAuthor++;
      if (consecutiveSameAuthor >= MAX_AUTHOR_RUN) {
        // Push to end of posts pool instead of dropping
        posts.push(item);
        continue;
      }
    } else {
      consecutiveSameAuthor = 0;
      lastAuthorId = item.authorId;
    }

    result.push(item);
    postsSinceNonPost++;

    // Interleave a repo/reel every REPO_INTERVAL posts
    if (postsSinceNonPost >= REPO_INTERVAL && nonPostQueue.length > 0) {
      const nonPost = nonPostQueue.shift()!;
      if (!seen.has(nonPost.id)) {
        seen.add(nonPost.id);
        result.push(nonPost);
        postsSinceNonPost = 0;
      }
    }
  }

  // Append any remaining repos/reels that didn't get interleaved
  for (const item of nonPostQueue) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }

  return result;
}

// Bluesky HomeFeedAPI fallback pattern:
// When the following feed is empty (user follows nobody or nobody has posted),
// transparently fall back to the explore/trending feed so the screen is never blank.
export async function getPersonalizedFeedWithFallback(
  userId: string,
  page: number,
  limit: number
) {
  const result = await getPersonalizedFeed(userId, page, limit);

  if (result.items.length === 0 && page === 1) {
    const discover = await getExploreFeed(1, limit);
    return { ...discover, isDiscover: true };
  }

  return { ...result, isDiscover: false };
}

// Get explore feed (for non-logged-in users or discovery)
export async function getExploreFeed(page: number, limit: number) {
  const [posts, repos, reels] = await Promise.all([
    prisma.post.findMany({
      where: { likesCount: { gte: 5 } },
      include: { user: { select: { id: true, username: true, avatar: true } } },
      orderBy: [{ likesCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: (page - 1) * limit
    }),
    prisma.repository.findMany({
      where: { stars: { gte: 100 } },
      orderBy: { stars: 'desc' },
      take: Math.ceil(limit / 3)
    }),
    prisma.reel.findMany({
      where: { likesCount: { gte: 10 } },
      include: { user: { select: { id: true, username: true, avatar: true } } },
      orderBy: { viewsCount: 'desc' },
      take: Math.ceil(limit / 2)
    })
  ]);

  const items = [
    ...posts.map(p => ({ type: 'post' as const, data: p })),
    ...repos.map(r => ({ type: 'repo' as const, data: r })),
    ...reels.map(r => ({ type: 'reel' as const, data: r }))
  ];

  return { items, page, hasMore: items.length > 0 };
}
