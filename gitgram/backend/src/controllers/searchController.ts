import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { Prisma } from '@prisma/client';
import { advancedSearch } from '../services/advancedSearchService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';
import {
  suggest as suggestPrefix,
  SuggestType,
} from '../services/searchSuggestService';
import {
  trackQuery,
  getTrendingQueries as getTrendingQueriesFromStore,
} from '../services/searchTrackingService';

const UNIFIED_SUGGEST_TYPES: ReadonlyArray<SuggestType> = [
  'user',
  'repository',
  'hashtag',
  'snippet',
];

type UnifiedType = 'all' | 'users' | 'repos' | 'posts' | 'snippets' | 'hashtags';

/** Decode an opaque base64 cursor into a numeric offset (0 on any error). */
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const offset = Number.parseInt(decoded, 10);
    return Number.isFinite(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

/** Encode a numeric offset into an opaque base64 cursor. */
function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64');
}

function parseSuggestTypes(raw: unknown): SuggestType[] | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
  const requested = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is SuggestType =>
      (UNIFIED_SUGGEST_TYPES as ReadonlyArray<string>).includes(t),
    );
  return requested.length > 0 ? requested : undefined;
}

/**
 * Unified search across users, repositories, posts, snippets and hashtags.
 * GET /api/v1/search?q=...&type=all&limit=20&cursor=...
 *
 * Returns a consistent envelope:
 *   { users, repositories, posts, snippets, hashtags, total, took_ms, nextCursor }
 */
export const unifiedSearch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const startedAt = Date.now();

  const query = String(req.query.q ?? '').trim();
  if (query.length < 2) {
    throw Errors.badRequest('Search query must be at least 2 characters');
  }

  const type = (String(req.query.type ?? 'all') as UnifiedType) || 'all';
  const limitRaw = Number(req.query.limit ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
  const offset = decodeCursor(req.query.cursor as string | undefined);

  const want = (t: UnifiedType): boolean => type === 'all' || type === t;
  const insensitive = Prisma.QueryMode.insensitive;

  const usersQuery = want('users')
    ? prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: insensitive } },
            { displayName: { contains: query, mode: insensitive } },
            { bio: { contains: query, mode: insensitive } },
          ],
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          bio: true,
          verified: true,
          _count: { select: { followers: true } },
        },
        orderBy: { followers: { _count: 'desc' } },
        take: limit,
        skip: offset,
      })
    : Promise.resolve([]);

  const reposQuery = want('repos')
    ? prisma.repository.findMany({
        where: {
          OR: [
            { fullName: { contains: query, mode: insensitive } },
            { description: { contains: query, mode: insensitive } },
            { topics: { has: query.toLowerCase() } },
          ],
        },
        select: {
          id: true,
          fullName: true,
          owner: true,
          name: true,
          description: true,
          stars: true,
          forks: true,
          language: true,
          topics: true,
          htmlUrl: true,
        },
        orderBy: { stars: 'desc' },
        take: limit,
        skip: offset,
      })
    : Promise.resolve([]);

  const postsQuery = want('posts')
    ? prisma.post.findMany({
        where: {
          content: { contains: query, mode: insensitive },
          isArchived: false,
        },
        include: {
          user: { select: { id: true, username: true, avatar: true, verified: true } },
          _count: { select: { likes: true, comments: true } },
        },
        orderBy: [{ likesCount: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      })
    : Promise.resolve([]);

  const snippetsQuery = want('snippets')
    ? prisma.codeSnippet.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: insensitive } },
            { description: { contains: query, mode: insensitive } },
            { code: { contains: query, mode: insensitive } },
          ],
        },
        include: {
          user: { select: { id: true, username: true, avatar: true } },
          repository: { select: { fullName: true } },
        },
        orderBy: [{ likesCount: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      })
    : Promise.resolve([]);

  const hashtagsQuery = want('hashtags')
    ? prisma.hashtag.findMany({
        where: { name: { contains: query, mode: insensitive } },
        select: { id: true, name: true, count: true },
        orderBy: { count: 'desc' },
        take: limit,
        skip: offset,
      })
    : Promise.resolve([]);

  const [users, repositories, posts, snippets, hashtags] = await Promise.all([
    usersQuery,
    reposQuery,
    postsQuery,
    snippetsQuery,
    hashtagsQuery,
  ]);

  const total =
    users.length +
    repositories.length +
    posts.length +
    snippets.length +
    hashtags.length;

  // Provide a next cursor only when at least one bucket returned a full page,
  // implying there may be more results beyond this offset.
  const hasMore =
    users.length === limit ||
    repositories.length === limit ||
    posts.length === limit ||
    snippets.length === limit ||
    hashtags.length === limit;

  // Record the query asynchronously for trending analytics (fire-and-forget).
  void trackQuery(query);

  res.json({
    users,
    repositories,
    posts,
    snippets,
    hashtags,
    total,
    took_ms: Date.now() - startedAt,
    nextCursor: hasMore ? encodeCursor(offset + limit) : null,
  });
});

/**
 * Fast prefix suggestions backed by the in-memory sorted index.
 * GET /api/v1/search/suggest?q=re&types=user,repository&limit=10
 */
export const suggestSearch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const startedAt = Date.now();

  const prefix = String(req.query.q ?? '').trim();
  if (prefix.length < 2) {
    throw Errors.badRequest('Suggestion query must be at least 2 characters');
  }

  const types = parseSuggestTypes(req.query.types);
  const limitRaw = Number(req.query.limit ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 10;

  const suggestions = suggestPrefix(prefix, { types, limit });

  // Allow CDN/browser caching of suggestions for 5 minutes.
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    suggestions,
    took_ms: Date.now() - startedAt,
  });
});

/**
 * Top trending search queries over the recent window.
 * GET /api/v1/search/trending-queries?limit=10
 */
export const getTrendingQueries = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limitRaw = Number(req.query.limit ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

  const queries = await getTrendingQueriesFromStore(limit);

  res.set('Cache-Control', 'public, max-age=60');
  res.json({ queries });
});

/**
 * Record a search query for trending analytics.
 * POST /api/v1/search/track  { query: string }
 */
export const trackSearch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as { query?: unknown };
  const value = typeof body.query === 'string' ? body.query.trim() : '';
  if (value.length < 1) {
    throw Errors.badRequest('query is required');
  }

  await trackQuery(value);
  res.status(202).json({ tracked: true });
});

/**
 * Basic search across all content types
 * GET /api/v1/search?q=query
 */
export const searchAll = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { q, limit = 10 } = req.query;
  const query = q as string;

  if (!query || query.trim().length < 2) {
    throw Errors.badRequest('Search query must be at least 2 characters');
  }

  const [users, posts, hashtags, repositories] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { bio: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: { id: true, username: true, avatar: true, bio: true, verified: true },
      take: Number(limit)
    }),
    prisma.post.findMany({
      where: {
        content: { contains: query, mode: 'insensitive' },
        isArchived: false
      },
      include: {
        user: {
          select: { id: true, username: true, avatar: true, verified: true }
        }
      },
      take: Number(limit)
    }),
    prisma.hashtag.findMany({
      where: {
        name: { contains: query, mode: 'insensitive' }
      },
      take: Number(limit)
    }),
    // Also search repositories
    prisma.repository.findMany({
      where: {
        OR: [
          { fullName: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { topics: { has: query.toLowerCase() } }
        ]
      },
      select: {
        id: true,
        fullName: true,
        description: true,
        stars: true,
        language: true,
        topics: true
      },
      take: Number(limit),
      orderBy: { stars: 'desc' }
    })
  ]);

  res.json({ users, posts, hashtags, repositories });
});

/**
 * Advanced search with filters
 * GET /api/v1/search/advanced
 */
export const advancedSearchHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    q,
    type = 'all',
    dateFrom,
    dateTo,
    hasMedia,
    verified,
    minLikes,
    limit = 20
  } = req.query;

  if (!q || (q as string).trim().length < 2) {
    throw Errors.badRequest('Search query must be at least 2 characters');
  }

  const results = await advancedSearch({
    query: q as string,
    type: type as 'users' | 'posts' | 'hashtags' | 'all',
    dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
    dateTo: dateTo ? new Date(dateTo as string) : undefined,
    hasMedia: hasMedia === 'true',
    verified: verified === 'true',
    minLikes: minLikes ? parseInt(minLikes as string) : undefined
  }, parseInt(limit as string));

  res.json(results);
});

/**
 * Search repositories
 * GET /api/v1/search/repositories
 */
export const searchRepositories = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    q,
    language,
    minStars,
    topic,
    sort = 'stars',
    page = '1',
    limit = '20'
  } = req.query;

  const where: Prisma.RepositoryWhereInput = {};

  if (q) {
    where.OR = [
      { fullName: { contains: q as string, mode: 'insensitive' } },
      { description: { contains: q as string, mode: 'insensitive' } }
    ];
  }

  if (language) {
    where.language = { equals: language as string, mode: 'insensitive' };
  }

  if (minStars) {
    where.stars = { gte: parseInt(minStars as string) };
  }

  if (topic) {
    where.topics = { has: (topic as string).toLowerCase() };
  }

  const orderBy: Prisma.RepositoryOrderByWithRelationInput = {};
  switch (sort) {
    case 'stars': orderBy.stars = 'desc'; break;
    case 'forks': orderBy.forks = 'desc'; break;
    case 'updated': orderBy.updatedAt = 'desc'; break;
    case 'followers': orderBy.followersCount = 'desc'; break;
    default: orderBy.stars = 'desc';
  }

  const repositories = await prisma.repository.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      owner: true,
      name: true,
      description: true,
      stars: true,
      forks: true,
      language: true,
      topics: true,
      followersCount: true,
      htmlUrl: true,
      updatedAt: true
    },
    orderBy,
    take: parseInt(limit as string),
    skip: (parseInt(page as string) - 1) * parseInt(limit as string)
  });

  res.json({
    repositories,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      hasMore: repositories.length === parseInt(limit as string)
    }
  });
});

/**
 * Search code snippets
 * GET /api/v1/search/snippets
 */
export const searchSnippets = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    q,
    language,
    page = '1',
    limit = '20'
  } = req.query;

  const where: Prisma.CodeSnippetWhereInput = {};

  if (q) {
    where.OR = [
      { title: { contains: q as string, mode: 'insensitive' } },
      { description: { contains: q as string, mode: 'insensitive' } },
      { code: { contains: q as string, mode: 'insensitive' } }
    ];
  }

  if (language) {
    where.language = { equals: language as string, mode: 'insensitive' };
  }

  const snippets = await prisma.codeSnippet.findMany({
    where,
    include: {
      user: {
        select: { id: true, username: true, avatar: true }
      },
      repository: {
        select: { fullName: true }
      }
    },
    orderBy: [
      { likesCount: 'desc' },
      { createdAt: 'desc' }
    ],
    take: parseInt(limit as string),
    skip: (parseInt(page as string) - 1) * parseInt(limit as string)
  });

  res.json({
    snippets,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      hasMore: snippets.length === parseInt(limit as string)
    }
  });
});

/**
 * Get recommended posts for user
 * GET /api/v1/search/recommended
 */
export const getRecommendedPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { page = '1', limit = '20' } = req.query;

  // Get user's interests (languages they interact with)
  const userLanguages = await prisma.userLanguagePreference.findMany({
    where: { userId },
    orderBy: { weight: 'desc' },
    take: 5
  });

  const userTopics = await prisma.userTopicInterest.findMany({
    where: { userId },
    orderBy: { weight: 'desc' },
    take: 10
  });

  // Get users the current user follows
  const following = await prisma.follow.findMany({
    where: { followerUserId: userId },
    select: { followingUserId: true }
  });
  const followingIds = following.map(f => f.followingUserId).filter(Boolean) as string[];

  // Get posts from similar users (those who like the same repos/languages)
  const recommendedPosts = await prisma.post.findMany({
    where: {
      userId: { notIn: [...followingIds, userId] },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
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
    orderBy: [
      { likesCount: 'desc' },
      { commentsCount: 'desc' }
    ],
    take: parseInt(limit as string),
    skip: (parseInt(page as string) - 1) * parseInt(limit as string)
  });

  // Add recommendation reason
  const postsWithReason = recommendedPosts.map(post => ({
    ...post,
    recommendedBecause: 'Popular in your network'
  }));

  res.json({
    posts: postsWithReason,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      hasMore: recommendedPosts.length === parseInt(limit as string)
    }
  });
});

/**
 * Get personalized trending content
 * GET /api/v1/search/trending
 */
export const getPersonalizedTrending = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { type = 'all', limit = '10' } = req.query;

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const results: Record<string, unknown> = {};

  // Trending posts
  if (type === 'all' || type === 'posts') {
    results.posts = await prisma.post.findMany({
      where: {
        createdAt: { gte: oneDayAgo },
        isArchived: false
      },
      include: {
        user: {
          select: { id: true, username: true, avatar: true, verified: true }
        }
      },
      orderBy: [
        { likesCount: 'desc' },
        { commentsCount: 'desc' },
        { viewsCount: 'desc' }
      ],
      take: parseInt(limit as string)
    });
  }

  // Trending repositories
  if (type === 'all' || type === 'repositories') {
    results.repositories = await prisma.repository.findMany({
      where: {
        trending: true
      },
      select: {
        id: true,
        fullName: true,
        description: true,
        stars: true,
        forks: true,
        language: true,
        topics: true,
        trendingScore: true
      },
      orderBy: { trendingScore: 'desc' },
      take: parseInt(limit as string)
    });
  }

  // Trending hashtags
  if (type === 'all' || type === 'hashtags') {
    results.hashtags = await prisma.hashtag.findMany({
      orderBy: { count: 'desc' },
      take: parseInt(limit as string),
      select: {
        id: true,
        name: true,
        count: true
      }
    });
  }

  // Trending users (most followed recently)
  if (type === 'all' || type === 'users') {
    const trendingUsers = await prisma.user.findMany({
      where: {
        followers: {
          some: {
            createdAt: { gte: oneWeekAgo }
          }
        }
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        bio: true,
        verified: true,
        _count: {
          select: { followers: true }
        }
      },
      orderBy: {
        followers: { _count: 'desc' }
      },
      take: parseInt(limit as string)
    });

    results.users = trendingUsers;
  }

  // If user is logged in, personalize based on their interests
  if (userId && (type === 'all' || type === 'forYou')) {
    const userLanguages = await prisma.userLanguagePreference.findMany({
      where: { userId },
      select: { language: true },
      take: 3
    });

    const languages = userLanguages.map(l => l.language);

    if (languages.length > 0) {
      results.forYou = await prisma.repository.findMany({
        where: {
          language: { in: languages },
          trending: true
        },
        select: {
          id: true,
          fullName: true,
          description: true,
          stars: true,
          language: true
        },
        orderBy: { trendingScore: 'desc' },
        take: parseInt(limit as string)
      });
    }
  }

  res.json(results);
});

/**
 * Search GitHub activities
 * GET /api/v1/search/activities
 */
export const searchActivities = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    q,
    eventType,
    repositoryId,
    page = '1',
    limit = '20'
  } = req.query;

  const where: Prisma.RepositoryActivityWhereInput = {};

  if (q) {
    where.OR = [
      { title: { contains: q as string, mode: 'insensitive' } },
      { body: { contains: q as string, mode: 'insensitive' } },
      { actorLogin: { contains: q as string, mode: 'insensitive' } }
    ];
  }

  if (eventType) {
    where.eventType = eventType as Prisma.EnumGitHubEventTypeFilter;
  }

  if (repositoryId) {
    where.repositoryId = repositoryId as string;
  }

  const activities = await prisma.repositoryActivity.findMany({
    where,
    include: {
      repository: {
        select: { fullName: true, htmlUrl: true }
      }
    },
    orderBy: { occurredAt: 'desc' },
    take: parseInt(limit as string),
    skip: (parseInt(page as string) - 1) * parseInt(limit as string)
  });

  res.json({
    activities,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      hasMore: activities.length === parseInt(limit as string)
    }
  });
});
