import { Octokit } from '@octokit/rest';
import prisma from '../utils/prisma';
import { cache } from './redisService';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuggestedUser {
  id: string;
  username: string | null;
  avatar: string | null;
  bio: string | null;
  followersCount: number;
  isVerified: boolean;
  mutualFollows: number;
}

export interface MutualFollowersResult {
  users: Array<{
    id: string;
    username: string | null;
    avatar: string | null;
    displayName: string | null;
  }>;
  count: number;
}

export interface GitHubFollowSuggestion {
  id: string;
  username: string | null;
  avatar: string | null;
  githubUsername: string | null;
  displayName: string | null;
}

export type ActivityEventType = 'new_post' | 'new_follow' | 'repository_star';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  actorId: string;
  actorUsername: string | null;
  actorAvatar: string | null;
  targetId: string;
  targetType: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ActivityFeedResult {
  events: ActivityEvent[];
  nextCursor: string | undefined;
  hasMore?: boolean;
}

// ---------------------------------------------------------------------------
// Cache TTL constants (seconds)
// ---------------------------------------------------------------------------

const CACHE_TTL = {
  SUGGESTED_USERS: 5 * 60,      // 5 minutes
  MUTUAL_FOLLOWERS: 2 * 60,     // 2 minutes
  FOLLOW_SUGGESTIONS: 10 * 60,  // 10 minutes
  ACTIVITY_FEED: 60,            // 1 minute
} as const;

// ---------------------------------------------------------------------------
// getSuggestedUsers
// ---------------------------------------------------------------------------

/**
 * Returns users followed by people I follow (friends-of-friends) who I have
 * not yet followed, ranked by mutual connection count and capped at `limit`.
 *
 * Criteria:
 *  a) Followed by at least one of the accounts I follow
 *  b) NOT already followed by me
 *  c) NOT me
 *
 * The result includes a `mutualFollows` count: how many of my followings also
 * follow that candidate.
 */
export async function getSuggestedUsers(
  userId: string,
  limit = 10
): Promise<SuggestedUser[]> {
  const cacheKey = `social:suggested:${userId}:${limit}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached as SuggestedUser[];
  }

  try {
    // Resolve the Account id for this User so we can traverse Account-level follows.
    const userAccount = await prisma.account.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!userAccount) {
      return [];
    }

    const myAccountId = userAccount.id;

    // Step 1: accounts that I follow
    const myFollowings = await prisma.follow.findMany({
      where: { followerId: myAccountId },
      select: { followingId: true },
    });

    const followingAccountIds = myFollowings.map((f) => f.followingId);

    if (followingAccountIds.length === 0) {
      return [];
    }

    // Step 2: accounts followed by those I follow, excluding me and already-followed
    const excludedAccountIds = new Set([myAccountId, ...followingAccountIds]);

    const candidates = await prisma.account.findMany({
      where: {
        type: 'USER',
        id: { notIn: Array.from(excludedAccountIds) },
        followers: {
          some: {
            followerId: { in: followingAccountIds },
          },
        },
      },
      select: {
        id: true,
        userId: true,
        username: true,
        avatar: true,
        bio: true,
        verified: true,
        _count: {
          select: { followers: true },
        },
      },
      take: limit * 3, // over-fetch so we have room to sort
    });

    // Step 3: count mutual follows for each candidate
    const scored = await Promise.all(
      candidates.map(async (account) => {
        const mutualCount = await prisma.follow.count({
          where: {
            followingId: account.id,
            followerId: { in: followingAccountIds },
          },
        });

        return {
          id: account.userId ?? account.id,
          username: account.username,
          avatar: account.avatar,
          bio: account.bio,
          followersCount: account._count.followers,
          isVerified: account.verified,
          mutualFollows: mutualCount,
          _score: mutualCount * 10 + account._count.followers,
        };
      })
    );

    const results: SuggestedUser[] = scored
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map(({ _score: _ignored, ...rest }) => rest);

    await cache.set(cacheKey, results, CACHE_TTL.SUGGESTED_USERS);

    return results;
  } catch (error: unknown) {
    logger.error('socialGraphService.getSuggestedUsers failed', { userId, error });
    throw new Error('Failed to get suggested users');
  }
}

// ---------------------------------------------------------------------------
// getMutualFollowers
// ---------------------------------------------------------------------------

/**
 * Returns up to 10 users who follow both `userId` AND `targetUserId`.
 *
 * Mutual followers are resolved at the Account level; `userId` and
 * `targetUserId` are Prisma `User.id` values.
 */
export async function getMutualFollowers(
  userId: string,
  targetUserId: string
): Promise<MutualFollowersResult> {
  const cacheKey = `social:mutual:${userId}:${targetUserId}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached as MutualFollowersResult;
  }

  try {
    const [userAccount, targetAccount] = await Promise.all([
      prisma.account.findUnique({ where: { userId }, select: { id: true } }),
      prisma.account.findUnique({ where: { userId: targetUserId }, select: { id: true } }),
    ]);

    if (!userAccount || !targetAccount) {
      return { users: [], count: 0 };
    }

    // Accounts that follow userId
    const followersOfUser = await prisma.follow.findMany({
      where: { followingId: userAccount.id },
      select: { followerId: true },
    });

    const followerAccountIds = followersOfUser.map((f) => f.followerId);

    if (followerAccountIds.length === 0) {
      return { users: [], count: 0 };
    }

    // Among those, find who also follows targetUserId
    const mutual = await prisma.follow.findMany({
      where: {
        followerId: { in: followerAccountIds },
        followingId: targetAccount.id,
      },
      select: {
        follower: {
          select: {
            id: true,
            userId: true,
            username: true,
            avatar: true,
            displayName: true,
          },
        },
      },
      take: 10,
    });

    const users = mutual.map((m) => ({
      id: m.follower.userId ?? m.follower.id,
      username: m.follower.username,
      avatar: m.follower.avatar,
      displayName: m.follower.displayName,
    }));

    const result: MutualFollowersResult = { users, count: users.length };

    await cache.set(cacheKey, result, CACHE_TTL.MUTUAL_FOLLOWERS);

    return result;
  } catch (error: unknown) {
    logger.error('socialGraphService.getMutualFollowers failed', {
      userId,
      targetUserId,
      error,
    });
    throw new Error('Failed to get mutual followers');
  }
}

// ---------------------------------------------------------------------------
// getFollowSuggestions
// ---------------------------------------------------------------------------

/**
 * GitHub-based follow suggestions.
 *
 * Fetches the authenticated user's GitHub followers via the Octokit REST API,
 * then looks up which of those GitHub users have a gitgram account by matching
 * on `User.githubUsername`.
 *
 * Users the caller already follows are excluded.
 */
export async function getFollowSuggestions(
  userId: string
): Promise<GitHubFollowSuggestion[]> {
  const cacheKey = `social:ghsuggestions:${userId}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached as GitHubFollowSuggestion[];
  }

  try {
    // Fetch caller's GitHub access token
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true, githubUsername: true },
    });

    if (!user?.githubAccessToken) {
      return [];
    }

    const octokit = new Octokit({ auth: user.githubAccessToken });

    // Fetch up to 100 GitHub followers of the authenticated user
    const { data: ghFollowers } = await octokit.users.listFollowersForAuthenticatedUser({
      per_page: 100,
    });

    const ghUsernames = ghFollowers.map((f) => f.login);

    if (ghUsernames.length === 0) {
      return [];
    }

    // Resolve the caller's account to know who they already follow
    const callerAccount = await prisma.account.findUnique({
      where: { userId },
      select: { id: true },
    });

    const alreadyFollowingUserIds: string[] = [];

    if (callerAccount) {
      const followings = await prisma.follow.findMany({
        where: { followerId: callerAccount.id },
        select: {
          following: { select: { userId: true } },
        },
      });

      for (const f of followings) {
        if (f.following.userId) {
          alreadyFollowingUserIds.push(f.following.userId);
        }
      }
    }

    // Match GitHub followers to gitgram users
    const gitgramUsers = await prisma.user.findMany({
      where: {
        githubUsername: { in: ghUsernames },
        id: {
          notIn: [userId, ...alreadyFollowingUserIds],
        },
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        githubUsername: true,
        displayName: true,
      },
    });

    const suggestions: GitHubFollowSuggestion[] = gitgramUsers.map((u) => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      githubUsername: u.githubUsername,
      displayName: u.displayName,
    }));

    await cache.set(cacheKey, suggestions, CACHE_TTL.FOLLOW_SUGGESTIONS);

    return suggestions;
  } catch (error: unknown) {
    logger.error('socialGraphService.getFollowSuggestions failed', { userId, error });
    throw new Error('Failed to get GitHub follow suggestions');
  }
}

// ---------------------------------------------------------------------------
// getActivityFeed
// ---------------------------------------------------------------------------

/**
 * Returns a cursor-paginated activity feed of events produced by accounts the
 * caller follows:
 *  - new_post: a followed user published a post
 *  - new_follow: a followed user followed someone else
 *  - repository_star: a followed user starred (followed) a repository
 *
 * `cursor` is the `createdAt` timestamp (ISO string) of the last event
 * received. Events strictly older than the cursor are returned.
 */
export async function getActivityFeed(
  userId: string,
  cursor?: string,
  limit = 20
): Promise<ActivityFeedResult> {
  try {
    const userAccount = await prisma.account.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!userAccount) {
      return { events: [], nextCursor: undefined };
    }

    const myAccountId = userAccount.id;

    // Accounts I follow
    const myFollowings = await prisma.follow.findMany({
      where: { followerId: myAccountId },
      select: { followingId: true },
    });

    const followingAccountIds = myFollowings.map((f) => f.followingId);

    if (followingAccountIds.length === 0) {
      return { events: [], nextCursor: undefined };
    }

    const cursorDate = cursor ? new Date(cursor) : undefined;

    // Fetch the three event types in parallel
    const [posts, follows, repoStars] = await Promise.all([
      // new_post: posts published by followed accounts
      prisma.post.findMany({
        where: {
          accountId: { in: followingAccountIds },
          status: 'PUBLISHED',
          isArchived: false,
          ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        },
        select: {
          id: true,
          accountId: true,
          content: true,
          createdAt: true,
          account: {
            select: {
              userId: true,
              username: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),

      // new_follow: follows initiated by followed accounts
      prisma.follow.findMany({
        where: {
          followerId: { in: followingAccountIds },
          ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        },
        select: {
          id: true,
          followerId: true,
          followingId: true,
          createdAt: true,
          follower: {
            select: {
              userId: true,
              username: true,
              avatar: true,
            },
          },
          following: {
            select: {
              id: true,
              type: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),

      // repository_star: repository follows (stars) by followed accounts
      prisma.repositoryFollow.findMany({
        where: {
          accountId: { in: followingAccountIds },
          ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        },
        select: {
          id: true,
          accountId: true,
          repositoryId: true,
          createdAt: true,
          repository: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    // Look up actor info for repoStars (RepositoryFollow has accountId, not a nav prop to Account)
    const repoStarAccountIds = [
      ...new Set(repoStars.map((r) => r.accountId).filter((id): id is string => id !== null)),
    ];

    const repoStarActors =
      repoStarAccountIds.length > 0
        ? await prisma.account.findMany({
            where: { id: { in: repoStarAccountIds } },
            select: { id: true, userId: true, username: true, avatar: true },
          })
        : [];

    const actorMap = new Map(repoStarActors.map((a) => [a.id, a]));

    // Normalise all events into ActivityEvent
    const events: ActivityEvent[] = [
      ...posts.map(
        (post): ActivityEvent => ({
          id: post.id,
          type: 'new_post',
          actorId: post.account.userId ?? post.accountId,
          actorUsername: post.account.username,
          actorAvatar: post.account.avatar,
          targetId: post.id,
          targetType: 'post',
          metadata: { content: post.content.slice(0, 140) },
          createdAt: post.createdAt,
        })
      ),

      ...follows.map(
        (follow): ActivityEvent => ({
          id: follow.id,
          type: 'new_follow',
          actorId: follow.follower.userId ?? follow.followerId,
          actorUsername: follow.follower.username,
          actorAvatar: follow.follower.avatar,
          targetId: follow.following.id,
          targetType: follow.following.type.toLowerCase(),
          metadata: { targetUsername: follow.following.username },
          createdAt: follow.createdAt,
        })
      ),

      ...repoStars.map((star): ActivityEvent => {
        const actor = actorMap.get(star.accountId ?? '');
        return {
          id: star.id,
          type: 'repository_star',
          actorId: actor?.userId ?? star.accountId ?? '',
          actorUsername: actor?.username ?? null,
          actorAvatar: actor?.avatar ?? null,
          targetId: star.repositoryId,
          targetType: 'repository',
          metadata: { repositoryFullName: star.repository.fullName },
          createdAt: star.createdAt,
        };
      }),
    ];

    // Sort all events newest-first and page them
    events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const page = events.slice(0, limit);

    const nextCursor =
      page.length === limit
        ? page[page.length - 1].createdAt.toISOString()
        : undefined;

    return { events: page, nextCursor };
  } catch (error: unknown) {
    logger.error('socialGraphService.getActivityFeed failed', { userId, cursor, error });
    throw new Error('Failed to get activity feed');
  }
}

// ---------------------------------------------------------------------------
// Service object — consumed by socialController via named import.
// Wraps the standalone functions and returns the envelope shapes the
// controller destructures.
// ---------------------------------------------------------------------------

export const socialGraphService = {
  async getSuggestedUsers(
    userId: string,
    limit?: number,
  ): Promise<{ users: SuggestedUser[]; total: number }> {
    const users = await getSuggestedUsers(userId, limit);
    return { users, total: users.length };
  },

  getMutualFollowers: (
    userId: string,
    targetUserId: string,
  ): Promise<MutualFollowersResult> =>
    getMutualFollowers(userId, targetUserId),

  async getFollowSuggestions(
    userId: string,
  ): Promise<{ suggestions: GitHubFollowSuggestion[]; source: string }> {
    const suggestions = await getFollowSuggestions(userId);
    return { suggestions, source: 'github' };
  },

  async getActivityFeed(
    userId: string,
    cursor?: string,
    limit?: number,
  ): Promise<ActivityFeedResult & { hasMore: boolean }> {
    const result = await getActivityFeed(userId, cursor, limit);
    const hasMore = result.nextCursor !== undefined;
    return { ...result, hasMore };
  },
};
