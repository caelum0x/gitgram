import { PrismaClient } from '@prisma/client';
import { blockService } from './blockService';
import { getFollowingIds } from '../utils/followCache';

const prisma = new PrismaClient();

export class FeedService {
  async getPersonalizedFeed(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // Get blocked user IDs (users blocked by or blocking the current user)
    const blockedIds = await blockService.getAllBlockedIds(userId);

    // Get user's following list (Redis-cached)
    const followingIds = await getFollowingIds(userId);
    followingIds.push(userId); // Include own posts

    // Filter out blocked users from following
    const filteredFollowingIds = followingIds.filter(id => !blockedIds.includes(id));

    // Get posts from following with engagement score (excluding blocked users and archived posts)
    const posts = await prisma.post.findMany({
      where: {
        userId: { in: filteredFollowingIds },
        type: 'POST',
        isArchived: false
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true
          }
        },
        _count: {
          select: {
            likes: true,
            comments: true
          }
        }
      },
      orderBy: [
        { createdAt: 'desc' }
      ],
      skip,
      take: limit
    });

    return posts.map(post => ({
      ...post,
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      _count: undefined
    }));
  }

  /**
   * Cursor-based personalized feed — avoids duplicate/missing posts when new content
   * is added between page loads (adapted from munia's Prisma cursor pattern and
   * gh-social's following-feed approach).
   *
   * @param cursor - The `id` of the last post the client received (omit for first page)
   * @param limit  - Number of posts to return
   */
  async getPersonalizedFeedCursor(
    userId: string,
    cursor: string | undefined,
    limit: number = 20
  ) {
    const blockedIds = await blockService.getAllBlockedIds(userId);

    const followingIds = [...(await getFollowingIds(userId)), userId];
    const filteredFollowingIds = followingIds.filter(id => !blockedIds.includes(id));

    const posts = await prisma.post.findMany({
      where: {
        userId: { in: filteredFollowingIds },
        type: 'POST',
        isArchived: false
      },
      include: {
        user: {
          select: { id: true, username: true, avatar: true, verified: true }
        },
        _count: {
          select: { likes: true, comments: true }
        }
      },
      orderBy: [{ createdAt: 'desc' }],
      // Prisma cursor pagination: skip the cursor record itself, take limit + 1 to detect hasMore
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1 }
        : {}),
      take: limit + 1,
    });

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? resultPosts[resultPosts.length - 1].id : null;

    return {
      posts: resultPosts.map(post => this.formatPost(post)),
      nextCursor,
    };
  }

  /** Shared post formatting helper */
  private formatPost(post: {
    _count: { likes: number; comments: number };
    [key: string]: unknown;
  }) {
    const { _count, ...rest } = post;
    return {
      ...rest,
      likesCount: _count.likes,
      commentsCount: _count.comments,
    };
  }

  async getExploreFeed(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // Get blocked user IDs
    const blockedIds = await blockService.getAllBlockedIds(userId);

    // Get trending posts from users not followed (Redis-cached)
    const followingIds = await getFollowingIds(userId);

    // Exclude both following and blocked users
    const excludeIds = [...followingIds, userId, ...blockedIds];

    const posts = await prisma.post.findMany({
      where: {
        userId: { notIn: excludeIds },
        type: 'POST',
        isArchived: false,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true
          }
        },
        _count: {
          select: {
            likes: true,
            comments: true
          }
        }
      },
      orderBy: [
        { likesCount: 'desc' },
        { commentsCount: 'desc' },
        { createdAt: 'desc' }
      ],
      skip,
      take: limit
    });

    return posts;
  }

  async getTrendingPosts(limit: number = 10) {
    const posts = await prisma.post.findMany({
      where: {
        type: 'POST',
        isArchived: false,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true
          }
        },
        _count: {
          select: {
            likes: true,
            comments: true
          }
        }
      },
      orderBy: [
        { likesCount: 'desc' },
        { viewsCount: 'desc' }
      ],
      take: limit
    });

    return posts;
  }

  async getUnifiedFeed(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get blocked user IDs
    const blockedIds = await blockService.getAllBlockedIds(userId);

    const followingIds = [...(await getFollowingIds(userId)), userId];

    // Filter out blocked users from following
    const filteredFollowingIds = followingIds.filter(id => !blockedIds.includes(id));

    // Get followed repository IDs
    const followedRepos = await prisma.repositoryFollow.findMany({
      where: { userId },
      select: { repositoryId: true }
    });
    const followedRepoIds = followedRepos.map(r => r.repositoryId);

    // Fetch posts, reels, repos, and activities in parallel (excluding blocked users and archived content)
    const [posts, reels, repos, activities] = await Promise.all([
      prisma.post.findMany({
        where: { userId: { in: filteredFollowingIds }, isArchived: false },
        include: { user: { select: { id: true, username: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit * 2
      }),
      prisma.reel.findMany({
        where: { userId: { in: filteredFollowingIds }, isArchived: false },
        include: { user: { select: { id: true, username: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit
      }),
      prisma.repository.findMany({
        where: {
          followers: { some: { userId } },
          updatedAt: { gte: sevenDaysAgo }
        },
        take: limit
      }),
      // Fetch GitHub activities from followed repos
      prisma.repositoryActivity.findMany({
        where: {
          repositoryId: { in: followedRepoIds },
          createdAt: { gte: sevenDaysAgo }
        },
        include: {
          repository: { select: { fullName: true, htmlUrl: true } }
        },
        orderBy: { occurredAt: 'desc' },
        take: limit
      })
    ]);

    // Normalize and score items
    const items = [
      ...posts.map(p => ({ ...p, itemType: 'post' as const, score: this.calculateScore(p) })),
      ...reels.map(r => ({ ...r, itemType: 'reel' as const, score: this.calculateScore(r) })),
      ...repos.map(r => ({ ...r, itemType: 'repository' as const, score: this.calculateRepoScore(r) })),
      ...activities.map(a => ({ ...a, itemType: 'activity' as const, score: this.calculateActivityScore(a) }))
    ];

    return items
      .sort((a, b) => b.score - a.score)
      .slice(skip, skip + limit);
  }

  private calculateActivityScore(activity: { likesCount: number; commentsCount: number; eventType: string; occurredAt: Date }) {
    const hoursOld = (Date.now() - activity.occurredAt.getTime()) / 3600000;

    // Weight by event type (releases and PRs are more significant)
    const eventWeights: Record<string, number> = {
      'RELEASE': 3.0,
      'PULL_REQUEST': 2.0,
      'PUSH': 1.5,
      'ISSUES': 1.5,
      'STAR': 1.0,
      'FORK': 1.2,
      'CREATE': 1.0,
      'DELETE': 0.5
    };

    const weight = eventWeights[activity.eventType] || 1.0;
    const engagement = activity.likesCount + activity.commentsCount * 2;

    return (engagement + weight * 10) * Math.pow(0.95, hoursOld);
  }

  private calculateScore(item: { likesCount: number; commentsCount: number; createdAt: Date }) {
    const hoursOld = (Date.now() - item.createdAt.getTime()) / 3600000;
    const engagement = item.likesCount + item.commentsCount * 2;
    return engagement * Math.pow(0.95, hoursOld);
  }

  private calculateRepoScore(repo: { stars: number; forks: number; updatedAt: Date }) {
    const hoursOld = (Date.now() - repo.updatedAt.getTime()) / 3600000;
    const engagement = repo.stars + repo.forks * 2;
    return engagement * Math.pow(0.95, hoursOld);
  }
}

export default new FeedService();
