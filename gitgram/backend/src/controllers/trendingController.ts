import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';
import {
  getTrending,
  getTrendingPosts,
  getTrendingRepos,
  getTrendingCreators,
  getSignalWeightConfig,
  updateSignalWeight,
  TrendingTier,
  TrendingEntityType,
} from '../services/trendingRankingService';
import {
  getTrendingRepositories as getAlgorithmTrendingRepositories,
} from '../services/trendingAlgorithmService';
import prisma from '../utils/prisma';

const VALID_TIERS: TrendingTier[] = ['HOT_NOW', 'TRENDING_TODAY', 'THIS_WEEK', 'RISING_STARS'];
const TIER_ALIASES: Record<string, TrendingTier> = {
  hot: 'HOT_NOW',
  today: 'TRENDING_TODAY',
  week: 'THIS_WEEK',
  rising: 'RISING_STARS',
};

function parseTier(raw?: string): TrendingTier {
  if (!raw) return 'TRENDING_TODAY';
  const alias = TIER_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  const upper = raw.toUpperCase() as TrendingTier;
  if (VALID_TIERS.includes(upper)) return upper;
  return 'TRENDING_TODAY';
}

export const trendingController = {
  /**
   * GET /api/v1/trending
   * General trending endpoint with tier/language/topic filters
   */
  getTrending: asyncHandler(async (req: Request, res: Response) => {
    const tier = parseTier(req.query.tier as string);
    const entityType = req.query.type
      ? (req.query.type as string).toUpperCase() as TrendingEntityType
      : undefined;
    const language = req.query.language as string | undefined;
    const topic = req.query.topic as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    const result = await getTrending({
      tier,
      entityType,
      language,
      topic,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: result,
    });
  }),

  /**
   * GET /api/v1/trending/posts
   * Trending posts with full post data
   */
  getTrendingPosts: asyncHandler(async (req: Request, res: Response) => {
    const tier = parseTier(req.query.tier as string);
    const language = req.query.language as string | undefined;
    const topic = req.query.topic as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    const result = await getTrendingPosts({
      tier,
      language,
      topic,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: result,
    });
  }),

  /**
   * GET /api/v1/trending/repos
   * Trending repositories with full repo data
   */
  getTrendingRepos: asyncHandler(async (req: Request, res: Response) => {
    const tier = parseTier(req.query.tier as string);
    const language = req.query.language as string | undefined;
    const topic = req.query.topic as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    const result = await getTrendingRepos({
      tier,
      language,
      topic,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: result,
    });
  }),

  /**
   * GET /api/v1/trending/creators
   * Trending developers/creators
   */
  getTrendingCreators: asyncHandler(async (req: Request, res: Response) => {
    const tier = parseTier(req.query.tier as string);
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    const result = await getTrendingCreators({
      tier,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: result,
    });
  }),

  /**
   * GET /api/v1/trending/config
   * Admin: Get signal weight configuration
   */
  getSignalConfig: asyncHandler(async (req: AuthRequest, res: Response) => {
    const config = await getSignalWeightConfig();

    res.json({
      success: true,
      data: { signals: config },
    });
  }),

  /**
   * PUT /api/v1/trending/config/:signalName
   * Admin: Update a signal weight
   */
  updateSignalConfig: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { signalName } = req.params;
    const { weight, description } = req.body;

    if (typeof weight !== 'number' || weight < 0 || weight > 100) {
      throw Errors.badRequest('Weight must be a number between 0 and 100');
    }

    await updateSignalWeight(signalName, weight, description);

    res.json({
      success: true,
      message: `Signal weight for "${signalName}" updated to ${weight}`,
    });
  }),

  /**
   * GET /api/v1/trending/repositories
   * Trending repositories with star count + language, merging GitHub trending data.
   * Uses the algorithm service which fuses local Gitgram engagement with live GitHub trending.
   */
  getTrendingRepositories: asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const repositories = await getAlgorithmTrendingRepositories(limit);

    res.json({
      success: true,
      data: {
        repositories,
        total: repositories.length,
      },
    });
  }),

  /**
   * GET /api/v1/trending/users
   * Trending developers ranked by follower growth and post engagement.
   * Delegates to the existing creators ranking pipeline.
   */
  getTrendingUsers: asyncHandler(async (req: Request, res: Response) => {
    const tier = parseTier(req.query.tier as string);
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    const result = await getTrendingCreators({ tier, limit, offset });

    res.json({
      success: true,
      data: {
        users: result.creators,
        total: result.total,
        tier: result.tier,
        hasMore: result.hasMore,
      },
    });
  }),

  /**
   * GET /api/v1/trending/hashtags
   * Top 20 trending hashtags with post counts (fixed window: 72 h).
   * This is a focused alias of /tags that always returns the top 20.
   */
  getTrendingHashtags: asyncHandler(async (req: Request, res: Response) => {
    const limit = 20;
    const windowHours = 72;
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const tags = await prisma.postHashtag.groupBy({
      by: ['hashtagId'],
      where: { createdAt: { gte: windowStart } },
      _count: { hashtagId: true },
      orderBy: { _count: { hashtagId: 'desc' } },
      take: limit,
    });

    const hashtagIds = tags.map((t) => t.hashtagId);
    const hashtags = await prisma.hashtag.findMany({
      where: { id: { in: hashtagIds } },
      select: { id: true, name: true, count: true },
    });

    const hashtagMap = new Map(hashtags.map((h) => [h.id, h]));

    const result = tags
      .map((t) => {
        const hashtag = hashtagMap.get(t.hashtagId);
        if (!hashtag) return null;
        return {
          id: hashtag.id,
          name: hashtag.name,
          totalCount: hashtag.count,
          recentPostCount: t._count.hashtagId,
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      data: {
        hashtags: result,
        total: result.length,
        windowHours,
      },
    });
  }),

  /**
   * GET /api/v1/trending/developers
   * Trending developers by follower growth this week.
   * Delegates to the creators ranking pipeline with a THIS_WEEK tier.
   */
  getTrendingDevelopers: asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    const result = await getTrendingCreators({ tier: 'THIS_WEEK', limit, offset });

    res.json({
      success: true,
      data: {
        developers: result.creators,
        total: result.total,
        tier: result.tier,
        hasMore: result.hasMore,
      },
    });
  }),

  /**
   * GET /api/v1/trending/tags
   * Trending hashtags ordered by post count over the last 72 hours.
   */
  getTrendingTags: asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const windowHours = Number(req.query.windowHours) || 72;
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    // Count how many posts each hashtag was used in within the window
    const tags = await prisma.postHashtag.groupBy({
      by: ['hashtagId'],
      where: {
        createdAt: { gte: windowStart },
      },
      _count: { hashtagId: true },
      orderBy: { _count: { hashtagId: 'desc' } },
      take: limit,
    });

    const hashtagIds = tags.map((t) => t.hashtagId);
    const hashtags = await prisma.hashtag.findMany({
      where: { id: { in: hashtagIds } },
      select: { id: true, name: true, count: true },
    });

    const hashtagMap = new Map(hashtags.map((h) => [h.id, h]));

    const result = tags
      .map((t) => {
        const hashtag = hashtagMap.get(t.hashtagId);
        if (!hashtag) return null;
        return {
          id: hashtag.id,
          name: hashtag.name,
          totalCount: hashtag.count,
          recentPostCount: t._count.hashtagId,
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      data: {
        tags: result,
        total: result.length,
        windowHours,
      },
    });
  }),

  /**
   * GET /api/v1/trending/snippets
   * Trending code snippets ranked by likes + views over the last 72 hours.
   */
  getTrendingSnippets: asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const language = req.query.language as string | undefined;
    const windowHours = 72;
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const snippets = await prisma.codeSnippet.findMany({
      where: {
        createdAt: { gte: windowStart },
        ...(language ? { language } : {}),
      },
      include: {
        user: {
          select: { id: true, username: true, avatar: true, verified: true },
        },
        repository: {
          select: { id: true, fullName: true, owner: true, name: true, language: true },
        },
      },
      orderBy: [{ likesCount: 'desc' }, { viewsCount: 'desc' }],
      take: limit,
    });

    res.json({
      success: true,
      data: {
        snippets,
        total: snippets.length,
      },
    });
  }),
};
