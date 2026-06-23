import prisma from '../utils/prisma';
import { Prisma, TrendingEntry } from '@prisma/client';
import { cache } from './redisService';
import logger from '../utils/logger';
import { getTrendingConfig } from '../config/trending';
import type { DecayConfig, TierConfig as ConfigTierConfig } from '../config/trending';
import {
  calculateWeightedScore,
  computeDecay,
  computeActivityVelocity,
  computeEngagementMomentum,
  detectBurst,
  detectNewAccountPattern,
  detectLowActivityPattern,
  detectCommentSpam,
  detectIpCluster,
  calculateTotalPenalty,
  computeFlaggedDampening,
  computeFinalScore,
  type AntiGamingResult,
  type AntiGamingAnomaly,
  type EngagerProfile,
} from './trendingScoring';

// ============================================
// TYPES & INTERFACES
// ============================================

export type TrendingTier = 'HOT_NOW' | 'TRENDING_TODAY' | 'THIS_WEEK' | 'RISING_STARS';
export type TrendingEntityType = 'POST' | 'REPOSITORY' | 'USER';

type PostCandidateType = 'POST' | 'CHANGE_STORY';

interface ScoredEntity {
  entityType: TrendingEntityType;
  entityId: string;
  rawScore: number;
  gamingPenalty: number;
  finalScore: number;
  language?: string;
  topic?: string;
  signalBreakdown: Record<string, number | string>;
}

function countChangedFilesFromCheckpointRef(ref: Prisma.JsonValue | null | undefined): number {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return 0;

  const files = (ref as { files?: unknown }).files;
  return Array.isArray(files) ? files.length : 0;
}

function countChangedFilesFromChangeStoryBlock(content: string | null | undefined): number {
  if (!content) return 0;

  const match = content.match(/^changedFiles=(.+)$/m);
  if (!match) return 0;

  const rawValue = match[1].trim();
  if (!rawValue) return 0;

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return rawValue.split(',').map((file) => file.trim()).filter(Boolean).length;
  }
}

export function buildPostCandidateWhere(windowStart: Date): Prisma.PostWhereInput {
  return {
    createdAt: { gte: windowStart },
    isArchived: false,
    status: 'PUBLISHED',
    type: { in: ['POST', 'CHANGE_STORY'] satisfies PostCandidateType[] },
  };
}

interface InternalTierConfig {
  tier: TrendingTier;
  windowHours: number;
  decay: DecayConfig;
  maxResults: number;
  minScoreThreshold: number;
}

// ============================================
// SIGNAL WEIGHTS MANAGEMENT
// ============================================

let cachedWeights: Map<string, number> | null = null;
let weightsCacheTime = 0;

function getWeightsCacheTTL(): number {
  return getTrendingConfig().configRefreshIntervalMs;
}

async function getSignalWeights(): Promise<Map<string, number>> {
  const ttl = getWeightsCacheTTL();
  if (cachedWeights && Date.now() - weightsCacheTime < ttl) {
    return cachedWeights;
  }

  const config = getTrendingConfig();

  try {
    const dbWeights = await prisma.trendingSignalWeight.findMany({
      where: { active: true },
    });

    const weights = new Map<string, number>();

    // Start with config-file defaults
    for (const sw of config.signalWeights) {
      weights.set(sw.name, sw.weight);
    }

    // Override with DB weights (highest priority)
    for (const dbw of dbWeights) {
      weights.set(dbw.signalName, dbw.weight);
    }

    cachedWeights = weights;
    weightsCacheTime = Date.now();
    return weights;
  } catch (error) {
    logger.warn('Failed to load signal weights from DB, using config defaults');
    const weights = new Map<string, number>();
    for (const sw of config.signalWeights) {
      weights.set(sw.name, sw.weight);
    }
    cachedWeights = weights;
    weightsCacheTime = Date.now();
    return weights;
  }
}

/**
 * Build an internal tier config from the trending config module.
 */
function getTierConfig(tier: TrendingTier): InternalTierConfig {
  const config = getTrendingConfig();
  const tierConf = config.tiers[tier];

  if (!tierConf) {
    // Fallback to TRENDING_TODAY defaults
    const fallback = config.tiers.TRENDING_TODAY;
    return {
      tier,
      windowHours: fallback.windowHours,
      decay: fallback.decay,
      maxResults: fallback.maxResults,
      minScoreThreshold: fallback.minScoreThreshold,
    };
  }

  return {
    tier,
    windowHours: tierConf.windowHours,
    decay: tierConf.decay,
    maxResults: tierConf.maxResults,
    minScoreThreshold: tierConf.minScoreThreshold,
  };
}

// ============================================
// SIGNAL COLLECTION
// ============================================

async function collectPostSignals(
  postId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<{ signals: Record<string, number>; eventTimestamps: number[] }> {
  const signals: Record<string, number> = {};
  const eventTimestamps: number[] = [];

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      user: {
        select: {
          id: true,
          createdAt: true,
          _count: { select: { followers: true, posts: true } },
        },
      },
      comments: {
        where: { createdAt: { gte: windowStart, lte: windowEnd } },
        select: {
          id: true,
          content: true,
          userId: true,
          parentId: true,
          createdAt: true,
        },
      },
      likes: {
        where: { createdAt: { gte: windowStart, lte: windowEnd } },
        select: { userId: true, createdAt: true },
      },
      _count: {
        select: { likes: true, comments: true },
      },
    },
  });

  if (!post) return { signals, eventTimestamps };

  // Social signals
  const recentLikes = post.likes.length;
  const recentComments = post.comments.length;
  signals.post_likes = recentLikes;
  signals.post_comments = recentComments;
  signals.post_shares = post.sharesCount;
  signals.post_views = post.viewsCount;
  signals.change_story_post = post.type === 'CHANGE_STORY' ? 1 : 0;
  signals.checkpoint_linked =
    post.aitmCheckpointId || post.checkpointRef || post.aitmProjectId ? 1 : 0;
  signals.changed_files_count = Math.min(
    countChangedFilesFromCheckpointRef(post.aitmCheckpointRef) ||
      countChangedFilesFromChangeStoryBlock(post.content),
    25
  );

  // Collect timestamps for velocity/momentum computation
  post.likes.forEach((l) => eventTimestamps.push(l.createdAt.getTime()));
  post.comments.forEach((c) => eventTimestamps.push(c.createdAt.getTime()));

  // Engagement quality
  const commentLengths = post.comments.map((c) => c.content.length);
  signals.avg_comment_length =
    commentLengths.length > 0
      ? commentLengths.reduce((a, b) => a + b, 0) / commentLengths.length / 50
      : 0;

  const replies = post.comments.filter((c) => c.parentId !== null);
  signals.reply_depth = replies.length;

  const engagerSet = new Set<string>();
  post.likes.forEach((l) => {
    if (l.userId) engagerSet.add(l.userId);
  });
  post.comments.forEach((c) => {
    if (c.userId) engagerSet.add(c.userId);
  });
  signals.unique_engagers = engagerSet.size;

  // Creator authority
  if (post.user) {
    signals.creator_follower_count = Math.log10(Math.max(1, post.user._count.followers));
    signals.creator_post_quality = Math.log10(Math.max(1, post.user._count.posts));
    const accountAgeDays =
      (Date.now() - post.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    signals.creator_account_age_days = Math.min(accountAgeDays / 365, 3);
  }

  // Activity velocity & momentum
  const windowHours =
    (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60);
  signals.activity_velocity = computeActivityVelocity(eventTimestamps, windowHours);
  signals.engagement_momentum = computeEngagementMomentum(
    eventTimestamps,
    windowStart.getTime(),
    windowEnd.getTime()
  );

  return { signals, eventTimestamps };
}

async function collectRepoSignals(
  repoId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<{ signals: Record<string, number>; eventTimestamps: number[] }> {
  const signals: Record<string, number> = {};
  const eventTimestamps: number[] = [];

  const repo = await prisma.repository.findUnique({
    where: { id: repoId },
    include: {
      activities: {
        where: {
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        select: {
          eventType: true,
          createdAt: true,
          actorLogin: true,
        },
      },
      posts: {
        where: { createdAt: { gte: windowStart, lte: windowEnd } },
        include: {
          _count: { select: { likes: true, comments: true } },
        },
      },
      followers: {
        where: { createdAt: { gte: windowStart, lte: windowEnd } },
        select: { userId: true, createdAt: true },
      },
      _count: { select: { followers: true, posts: true } },
    },
  });

  if (!repo) return { signals, eventTimestamps };

  // GitHub signals from activities
  const stars = repo.activities.filter((a) => a.eventType === 'STAR').length;
  const forks = repo.activities.filter((a) => a.eventType === 'FORK').length;
  const watchers = repo.activities.filter((a) => a.eventType === 'WATCH').length;
  const prs = repo.activities.filter((a) => a.eventType === 'PULL_REQUEST').length;
  const releases = repo.activities.filter((a) => a.eventType === 'RELEASE').length;
  const pushes = repo.activities.filter((a) => a.eventType === 'PUSH').length;

  signals.github_stars_recent = stars;
  signals.github_forks = forks;
  signals.github_watchers = Math.log10(Math.max(1, watchers + repo._count.followers));
  signals.github_prs_opened = prs;
  signals.github_releases = releases;
  signals.github_commit_velocity = pushes;

  // Collect activity timestamps
  repo.activities.forEach((a) => eventTimestamps.push(a.createdAt.getTime()));
  repo.followers.forEach((f) => eventTimestamps.push(f.createdAt.getTime()));

  // Social signals from Gitgram posts about this repo
  let totalPostLikes = 0;
  let totalPostComments = 0;
  for (const post of repo.posts) {
    totalPostLikes += post._count.likes;
    totalPostComments += post._count.comments;
  }
  signals.post_likes = totalPostLikes;
  signals.post_comments = totalPostComments;

  signals.follows_gained = repo.followers.length;

  const uniqueActors = new Set(repo.activities.map((a) => a.actorLogin));
  signals.unique_engagers = uniqueActors.size;

  // Activity velocity & momentum
  const windowHours =
    (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60);
  signals.activity_velocity = computeActivityVelocity(eventTimestamps, windowHours);
  signals.engagement_momentum = computeEngagementMomentum(
    eventTimestamps,
    windowStart.getTime(),
    windowEnd.getTime()
  );

  return { signals, eventTimestamps };
}

async function collectUserSignals(
  userId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<{ signals: Record<string, number>; eventTimestamps: number[] }> {
  const signals: Record<string, number> = {};
  const eventTimestamps: number[] = [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      posts: {
        where: { createdAt: { gte: windowStart, lte: windowEnd } },
        include: {
          _count: { select: { likes: true, comments: true } },
        },
      },
      followers: {
        where: { createdAt: { gte: windowStart, lte: windowEnd } },
        select: { followerUserId: true, createdAt: true },
      },
      _count: { select: { followers: true, posts: true } },
    },
  });

  if (!user) return { signals, eventTimestamps };

  let totalLikes = 0;
  let totalComments = 0;
  for (const post of user.posts) {
    totalLikes += post._count.likes;
    totalComments += post._count.comments;
  }
  signals.post_likes = totalLikes;
  signals.post_comments = totalComments;
  signals.follows_gained = user.followers.length;

  // Collect follow timestamps for velocity
  user.followers.forEach((f) => eventTimestamps.push(f.createdAt.getTime()));

  // Creator authority
  signals.creator_follower_count = Math.log10(Math.max(1, user._count.followers));
  signals.creator_post_quality = Math.log10(Math.max(1, user._count.posts));
  const accountAgeDays =
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  signals.creator_account_age_days = Math.min(accountAgeDays / 365, 3);

  signals.unique_engagers =
    user.posts.length > 0
      ? Math.min(totalLikes + totalComments, 1000) / 10
      : 0;

  // Activity velocity & momentum
  const windowHours =
    (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60);
  signals.activity_velocity = computeActivityVelocity(eventTimestamps, windowHours);
  signals.engagement_momentum = computeEngagementMomentum(
    eventTimestamps,
    windowStart.getTime(),
    windowEnd.getTime()
  );

  return { signals, eventTimestamps };
}

// ============================================
// ANTI-GAMING: Full Detection Pipeline
// ============================================

async function detectGaming(
  entityType: TrendingEntityType,
  entityId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<AntiGamingResult> {
  const config = getTrendingConfig();
  const agConfig = config.antiGaming;

  if (!agConfig.enabled) {
    return { penalty: 0, anomalies: [] };
  }

  const anomalies: AntiGamingAnomaly[] = [];

  try {
    if (entityType === 'POST') {
      const post = await prisma.post.findUnique({
        where: { id: entityId },
        include: {
          likes: {
            where: { createdAt: { gte: windowStart, lte: windowEnd } },
            include: {
              user: {
                select: {
                  id: true,
                  createdAt: true,
                  _count: { select: { posts: true, followers: true } },
                },
              },
            },
          },
          comments: {
            where: { createdAt: { gte: windowStart, lte: windowEnd } },
            select: { userId: true, createdAt: true, content: true },
          },
        },
      });

      if (!post) return { penalty: 0, anomalies: [] };

      const likes = post.likes;

      if (likes.length > 0) {
        // 1. Burst detection for likes
        const likeTimes = likes.map((l) => l.createdAt.getTime());
        const burstResult = detectBurst(likeTimes, agConfig.velocityCaps.postLikes);
        if (burstResult.burstDetected) {
          anomalies.push({
            type: 'burst_likes',
            severity: burstResult.severity,
            details: `${burstResult.maxBurstCount} likes within ${agConfig.velocityCaps.postLikes.windowMinutes} minutes`,
            actorIds: [],
          });
        }

        // 2. New account engagement detection
        const engagerProfiles: EngagerProfile[] = likes
          .filter((l) => l.user)
          .map((l) => ({
            userId: l.user!.id,
            accountAgeDays:
              (Date.now() - l.user!.createdAt.getTime()) / (1000 * 60 * 60 * 24),
            postCount: l.user!._count.posts,
            followerCount: l.user!._count.followers,
          }));

        const newAccountAnomaly = detectNewAccountPattern(
          engagerProfiles,
          agConfig.suspiciousPatterns
        );
        if (newAccountAnomaly) anomalies.push(newAccountAnomaly);

        // 3. Low-activity engager detection
        const lowActivityAnomaly = detectLowActivityPattern(
          engagerProfiles,
          agConfig.suspiciousPatterns
        );
        if (lowActivityAnomaly) anomalies.push(lowActivityAnomaly);
      }

      // 4. Comment spam detection
      const commentUserIds = post.comments
        .map((c) => c.userId)
        .filter((id): id is string => id !== null);
      const commentSpamAnomaly = detectCommentSpam(
        commentUserIds,
        agConfig.suspiciousPatterns
      );
      if (commentSpamAnomaly) anomalies.push(commentSpamAnomaly);

      // 5. Comment burst detection
      if (post.comments.length > 0) {
        const commentTimes = post.comments.map((c) => c.createdAt.getTime());
        const commentBurst = detectBurst(commentTimes, agConfig.velocityCaps.postComments);
        if (commentBurst.burstDetected) {
          anomalies.push({
            type: 'burst_comments',
            severity: commentBurst.severity,
            details: `${commentBurst.maxBurstCount} comments within ${agConfig.velocityCaps.postComments.windowMinutes} minutes`,
            actorIds: [],
          });
        }
      }

      // 6. Velocity spike: engagement rate vs post age
      const postAgeHours =
        (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
      if (postAgeHours < 1 && likes.length > 50) {
        const severity = Math.min(1, likes.length / 100);
        anomalies.push({
          type: 'velocity_spike',
          severity,
          details: `${likes.length} likes in first hour`,
          actorIds: [],
        });
      }
    }

    if (entityType === 'REPOSITORY') {
      const recentFollows = await prisma.repositoryFollow.findMany({
        where: {
          repositoryId: entityId,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        select: { userId: true, createdAt: true },
      });

      if (recentFollows.length > 0) {
        const followTimes = recentFollows.map((f) => f.createdAt.getTime());
        const burstResult = detectBurst(followTimes, agConfig.velocityCaps.repoFollows);
        if (burstResult.burstDetected) {
          anomalies.push({
            type: 'coordinated_follows',
            severity: burstResult.severity,
            details: `${burstResult.maxBurstCount} follows within ${agConfig.velocityCaps.repoFollows.windowMinutes} minutes`,
            actorIds: [],
          });
        }
      }
    }

    if (entityType === 'USER') {
      const recentFollowers = await prisma.follow.findMany({
        where: {
          followingUserId: entityId,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        include: {
          followerUser: {
            select: {
              id: true,
              createdAt: true,
              _count: { select: { posts: true, followers: true } },
            },
          },
        },
      });

      // Burst follow detection
      if (recentFollowers.length > 0) {
        const followerTimes = recentFollowers.map((f) => f.createdAt.getTime());
        const burstResult = detectBurst(followerTimes, agConfig.velocityCaps.userFollows);
        if (burstResult.burstDetected) {
          anomalies.push({
            type: 'coordinated_follows',
            severity: burstResult.severity,
            details: `${burstResult.maxBurstCount} follows within ${agConfig.velocityCaps.userFollows.windowMinutes} minutes`,
            actorIds: [],
          });
        }
      }

      // New-account follower detection
      const followerProfiles: EngagerProfile[] = recentFollowers
        .filter((f) => f.followerUser)
        .map((f) => ({
          userId: f.followerUser!.id,
          accountAgeDays:
            (Date.now() - f.followerUser!.createdAt.getTime()) / (1000 * 60 * 60 * 24),
          postCount: f.followerUser!._count.posts,
          followerCount: f.followerUser!._count.followers ?? 0,
        }));

      const fakeFollowersAnomaly = detectNewAccountPattern(
        followerProfiles,
        agConfig.suspiciousPatterns
      );
      if (fakeFollowersAnomaly) {
        fakeFollowersAnomaly.type = 'fake_followers';
        anomalies.push(fakeFollowersAnomaly);
      }
    }

    // Check historical anomalies for dampening
    const dampeningConfig = agConfig.flaggedEntityDampening;
    const dampeningWindowStart = new Date(
      Date.now() - dampeningConfig.anomalyWindowHours * 60 * 60 * 1000
    );
    const recentAnomalyCount = await prisma.engagementAnomaly.count({
      where: {
        entityType: entityType.toLowerCase(),
        entityId,
        detectedAt: { gte: dampeningWindowStart },
        resolved: false,
      },
    });

    const penalty = calculateTotalPenalty(anomalies, agConfig);
    const dampening = computeFlaggedDampening(recentAnomalyCount, dampeningConfig);

    // Combine: penalty + dampening effect
    // If dampening applies, it adds to the effective penalty
    const effectivePenalty = Math.min(
      agConfig.maxTotalPenalty,
      penalty + (dampening < 1 ? (1 - dampening) * 0.5 : 0)
    );

    return { penalty: effectivePenalty, anomalies };
  } catch (error) {
    logger.error('Anti-gaming detection error:', error);
    return { penalty: 0, anomalies: [] };
  }
}

// ============================================
// SCORING PIPELINE
// ============================================

async function scoreEntity(
  entityType: TrendingEntityType,
  entityId: string,
  tierConfig: InternalTierConfig,
  weights: Map<string, number>
): Promise<ScoredEntity | null> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - tierConfig.windowHours * 60 * 60 * 1000);

  let signals: Record<string, number>;
  let ageHours = 0;
  let language: string | undefined;
  let topic: string | undefined;

  try {
    switch (entityType) {
      case 'POST': {
        const result = await collectPostSignals(entityId, windowStart, now);
        signals = result.signals;
        const post = await prisma.post.findUnique({
          where: { id: entityId },
          select: { createdAt: true, repositoryId: true },
        });
        if (!post) return null;
        ageHours = (now.getTime() - post.createdAt.getTime()) / (1000 * 60 * 60);
        if (post.repositoryId) {
          const repo = await prisma.repository.findUnique({
            where: { id: post.repositoryId },
            select: { language: true, topics: true },
          });
          language = repo?.language || undefined;
          topic = repo?.topics?.[0] || undefined;
        }
        break;
      }
      case 'REPOSITORY': {
        const result = await collectRepoSignals(entityId, windowStart, now);
        signals = result.signals;
        const repo = await prisma.repository.findUnique({
          where: { id: entityId },
          select: { createdAt: true, language: true, topics: true },
        });
        if (!repo) return null;
        ageHours = (now.getTime() - repo.createdAt.getTime()) / (1000 * 60 * 60);
        language = repo.language || undefined;
        topic = repo.topics?.[0] || undefined;
        break;
      }
      case 'USER': {
        const result = await collectUserSignals(entityId, windowStart, now);
        signals = result.signals;
        const user = await prisma.user.findUnique({
          where: { id: entityId },
          select: { createdAt: true },
        });
        if (!user) return null;
        ageHours = (now.getTime() - user.createdAt.getTime()) / (1000 * 60 * 60);
        break;
      }
      default:
        return null;
    }

    const { rawScore, signalBreakdown, decayMultiplier } = calculateWeightedScore(
      signals,
      weights,
      ageHours,
      tierConfig.decay
    );

    // Skip entities below the minimum score threshold
    if (rawScore < tierConfig.minScoreThreshold) {
      return null;
    }

    // Anti-gaming check
    const antiGaming = await detectGaming(entityType, entityId, windowStart, now);

    // Store anomalies if found
    if (antiGaming.anomalies.length > 0) {
      for (const anomaly of antiGaming.anomalies) {
        try {
          await prisma.engagementAnomaly.create({
            data: {
              entityType: entityType.toLowerCase(),
              entityId,
              anomalyType: anomaly.type,
              severity: anomaly.severity,
              details: {
                description: anomaly.details,
                tier: tierConfig.tier,
              },
              actorIds: anomaly.actorIds,
            },
          });
        } catch (err) {
          logger.debug('Anomaly already recorded or failed to store:', err);
        }
      }
    }

    const finalScore = computeFinalScore(rawScore, antiGaming.penalty, 1);

    return {
      entityType,
      entityId,
      rawScore,
      gamingPenalty: antiGaming.penalty,
      finalScore,
      language,
      topic,
      signalBreakdown: {
        ...signalBreakdown,
        _gamingPenalty: antiGaming.penalty,
        _anomalyCount: antiGaming.anomalies.length,
        _decayFunction: tierConfig.decay.function as string,
      },
    };
  } catch (error) {
    logger.error(`Error scoring ${entityType} ${entityId}:`, error);
    return null;
  }
}

// ============================================
// CANDIDATE SELECTION
// ============================================

async function getCandidatePosts(windowStart: Date, limit: number): Promise<string[]> {
  const posts = await prisma.post.findMany({
    where: buildPostCandidateWhere(windowStart),
    select: { id: true, likesCount: true, commentsCount: true },
    orderBy: [{ likesCount: 'desc' }, { commentsCount: 'desc' }, { sharesCount: 'desc' }],
    take: limit,
  });
  return posts.map((p) => p.id);
}

async function getCandidateRepos(windowStart: Date, limit: number): Promise<string[]> {
  const repos = await prisma.repository.findMany({
    where: {
      OR: [
        { updatedAt: { gte: windowStart } },
        {
          activities: {
            some: { createdAt: { gte: windowStart } },
          },
        },
      ],
    },
    select: { id: true, stars: true, forks: true },
    orderBy: [{ stars: 'desc' }],
    take: limit,
  });
  return repos.map((r) => r.id);
}

async function getCandidateUsers(windowStart: Date, limit: number): Promise<string[]> {
  const recentPosters = await prisma.post.groupBy({
    by: ['userId'],
    where: {
      createdAt: { gte: windowStart },
      userId: { not: null },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  });

  return recentPosters
    .map((p) => p.userId)
    .filter((id): id is string => id !== null);
}

async function getRisingStarRepos(limit: number): Promise<string[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const repos = await prisma.repository.findMany({
    where: {
      createdAt: { gte: thirtyDaysAgo },
      stars: { gte: 5 },
    },
    select: { id: true },
    orderBy: { stars: 'desc' },
    take: limit,
  });
  return repos.map((r) => r.id);
}

// ============================================
// MAIN RANKING COMPUTATION
// ============================================

export async function computeTrendingForTier(tier: TrendingTier): Promise<void> {
  const tierConfig = getTierConfig(tier);
  const trendingConfig = getTrendingConfig();
  const now = new Date();
  const windowStart = new Date(now.getTime() - tierConfig.windowHours * 60 * 60 * 1000);
  const weights = await getSignalWeights();

  logger.info(`Computing trending for tier: ${tier} (window: ${tierConfig.windowHours}h, decay: ${tierConfig.decay.function})`);

  // Get candidates
  const candidateLimit = tierConfig.maxResults * 3;
  const [postIds, repoIds, userIds] = await Promise.all([
    getCandidatePosts(windowStart, candidateLimit),
    getCandidateRepos(windowStart, candidateLimit),
    tier === 'RISING_STARS'
      ? getRisingStarRepos(candidateLimit)
      : getCandidateUsers(windowStart, Math.floor(candidateLimit / 2)),
  ]);

  // Score all candidates
  const scoringPromises: Promise<ScoredEntity | null>[] = [];

  for (const id of postIds) {
    scoringPromises.push(scoreEntity('POST', id, tierConfig, weights));
  }
  for (const id of repoIds) {
    scoringPromises.push(scoreEntity('REPOSITORY', id, tierConfig, weights));
  }
  if (tier !== 'RISING_STARS') {
    for (const id of userIds) {
      scoringPromises.push(scoreEntity('USER', id, tierConfig, weights));
    }
  } else {
    for (const id of userIds) {
      scoringPromises.push(scoreEntity('REPOSITORY', id, tierConfig, weights));
    }
  }

  const results = await Promise.all(scoringPromises);
  const scoredEntities = results.filter((r): r is ScoredEntity => r !== null);

  // Sort by final score
  scoredEntities.sort((a, b) => b.finalScore - a.finalScore);

  // Take top N
  const topEntities = scoredEntities.slice(0, tierConfig.maxResults);

  // Delete old entries for this tier and period
  await prisma.trendingEntry.deleteMany({
    where: {
      tier,
      periodStart: windowStart,
    },
  });

  // Store new entries
  for (let i = 0; i < topEntities.length; i++) {
    const entity = topEntities[i];
    try {
      await prisma.trendingEntry.create({
        data: {
          entityType: entity.entityType,
          entityId: entity.entityId,
          tier,
          score: entity.finalScore,
          rawScore: entity.rawScore,
          gamingPenalty: entity.gamingPenalty,
          language: entity.language,
          topic: entity.topic,
          rank: i + 1,
          metadata: entity.signalBreakdown,
          periodStart: windowStart,
          periodEnd: now,
        },
      });
    } catch (err) {
      try {
        await prisma.trendingEntry.updateMany({
          where: {
            entityType: entity.entityType,
            entityId: entity.entityId,
            tier,
            periodStart: windowStart,
          },
          data: {
            score: entity.finalScore,
            rawScore: entity.rawScore,
            gamingPenalty: entity.gamingPenalty,
            rank: i + 1,
            metadata: entity.signalBreakdown,
            periodEnd: now,
          },
        });
      } catch (updateErr) {
        logger.error('Failed to upsert trending entry:', updateErr);
      }
    }
  }

  // Store history snapshot
  const historyPromises = topEntities.slice(0, 20).map((entity, i) =>
    prisma.trendingHistory.create({
      data: {
        entityType: entity.entityType,
        entityId: entity.entityId,
        tier,
        score: entity.finalScore,
        rank: i + 1,
      },
    })
  );
  await Promise.all(historyPromises).catch((err) =>
    logger.error('Failed to store trending history:', err)
  );

  // Cache the results using config-driven TTL
  const cacheKey = `trending:${tier}`;
  const cacheTTL = trendingConfig.cacheTTL[tier] || 3600;
  await cache.set(
    cacheKey,
    topEntities.map((e, i) => ({
      rank: i + 1,
      entityType: e.entityType,
      entityId: e.entityId,
      score: e.finalScore,
      language: e.language,
      topic: e.topic,
    })),
    cacheTTL
  );

  logger.info(
    `Trending ${tier}: stored ${topEntities.length} entries (${postIds.length} posts, ${repoIds.length} repos scored)`
  );
}

// ============================================
// QUERY METHODS
// ============================================

export interface TrendingQuery {
  tier: TrendingTier;
  entityType?: TrendingEntityType;
  language?: string;
  topic?: string;
  limit?: number;
  offset?: number;
}

export async function getTrending(query: TrendingQuery) {
  const { tier, entityType, language, topic, limit = 20, offset = 0 } = query;

  const cacheKey = `trending:${tier}:${entityType || 'all'}:${language || 'all'}:${topic || 'all'}:${limit}:${offset}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const where: Prisma.TrendingEntryWhereInput = { tier };
  if (entityType) where.entityType = entityType;
  if (language) where.language = language;
  if (topic) where.topic = topic;

  const [entries, total] = await Promise.all([
    prisma.trendingEntry.findMany({
      where,
      orderBy: { rank: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.trendingEntry.count({ where }),
  ]);

  const result = {
    entries,
    total,
    tier,
    hasMore: offset + limit < total,
  };

  const cacheTTL = tier === 'HOT_NOW' ? 300 : 600;
  await cache.set(cacheKey, result, cacheTTL);

  return result;
}

export async function getTrendingPosts(query: Omit<TrendingQuery, 'entityType'>) {
  const trendingResult = await getTrending({ ...query, entityType: 'POST' });

  const postIds = trendingResult.entries.map((e: TrendingEntry) => e.entityId);

  const posts = await prisma.post.findMany({
    where: { id: { in: postIds } },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          avatar: true,
          verified: true,
        },
      },
      repository: {
        select: {
          id: true,
          fullName: true,
          owner: true,
          name: true,
          language: true,
        },
      },
      _count: {
        select: { likes: true, comments: true },
      },
    },
  });

  const postMap = new Map(posts.map((p) => [p.id, p]));
  const rankedPosts = trendingResult.entries
    .map((entry: TrendingEntry) => {
      const post = postMap.get(entry.entityId);
      if (!post) return null;
      return {
        ...post,
        trendingRank: entry.rank,
        trendingScore: entry.score,
      };
    })
    .filter(Boolean);

  return {
    posts: rankedPosts,
    total: trendingResult.total,
    tier: trendingResult.tier,
    hasMore: trendingResult.hasMore,
  };
}

export async function getTrendingRepos(query: Omit<TrendingQuery, 'entityType'>) {
  const trendingResult = await getTrending({ ...query, entityType: 'REPOSITORY' });

  const repoIds = trendingResult.entries.map((e: TrendingEntry) => e.entityId);

  const repos = await prisma.repository.findMany({
    where: { id: { in: repoIds } },
    include: {
      _count: {
        select: { followers: true, posts: true },
      },
    },
  });

  const repoMap = new Map(repos.map((r) => [r.id, r]));
  const rankedRepos = trendingResult.entries
    .map((entry: TrendingEntry) => {
      const repo = repoMap.get(entry.entityId);
      if (!repo) return null;
      return {
        ...repo,
        trendingRank: entry.rank,
        trendingScore: entry.score,
      };
    })
    .filter(Boolean);

  return {
    repos: rankedRepos,
    total: trendingResult.total,
    tier: trendingResult.tier,
    hasMore: trendingResult.hasMore,
  };
}

export async function getTrendingCreators(query: Omit<TrendingQuery, 'entityType'>) {
  const trendingResult = await getTrending({ ...query, entityType: 'USER' });

  const userIds = trendingResult.entries.map((e: TrendingEntry) => e.entityId);

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      username: true,
      avatar: true,
      bio: true,
      verified: true,
      createdAt: true,
      _count: {
        select: { followers: true, posts: true },
      },
    },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));
  const rankedUsers = trendingResult.entries
    .map((entry: TrendingEntry) => {
      const user = userMap.get(entry.entityId);
      if (!user) return null;
      return {
        ...user,
        trendingRank: entry.rank,
        trendingScore: entry.score,
      };
    })
    .filter(Boolean);

  return {
    creators: rankedUsers,
    total: trendingResult.total,
    tier: trendingResult.tier,
    hasMore: trendingResult.hasMore,
  };
}

// ============================================
// NOTIFICATION TRIGGERS
// ============================================

export async function checkAndNotifyTrending(): Promise<void> {
  try {
    const topEntries = await prisma.trendingEntry.findMany({
      where: {
        rank: { lte: 10 },
        tier: 'TRENDING_TODAY',
        entityType: 'REPOSITORY',
      },
      select: { entityId: true, rank: true },
    });

    for (const entry of topEntries) {
      const repo = await prisma.repository.findUnique({
        where: { id: entry.entityId },
        select: { claimedBy: true, fullName: true },
      });

      if (repo?.claimedBy) {
        const alreadyNotified = await cache.get(
          `trending_notified:${repo.claimedBy}:${entry.entityId}`
        );
        if (!alreadyNotified) {
          const { createNotification } = await import('./notificationService');
          await createNotification(
            repo.claimedBy,
            'REPO_UPDATE',
            `Your repo ${repo.fullName} is trending at #${entry.rank}!`,
            undefined,
            undefined
          );
          await cache.set(
            `trending_notified:${repo.claimedBy}:${entry.entityId}`,
            true,
            24 * 60 * 60
          );
        }
      }
    }
  } catch (error) {
    logger.error('Error sending trending notifications:', error);
  }
}

// ============================================
// ADMIN: Signal Weight Management
// ============================================

export async function updateSignalWeight(
  signalName: string,
  weight: number,
  description?: string
): Promise<void> {
  const config = getTrendingConfig();
  const defaultSignal = config.signalWeights.find((s) => s.name === signalName);

  await prisma.trendingSignalWeight.upsert({
    where: { signalName },
    create: {
      signalName,
      weight,
      category: defaultSignal?.category || 'social',
      description,
    },
    update: { weight, description },
  });

  // Invalidate cache
  cachedWeights = null;
}

export async function getSignalWeightConfig(): Promise<Array<{
  name: string;
  weight: number;
  category: string;
  description: string;
  isDefault: boolean;
}>> {
  const config = getTrendingConfig();
  const dbWeights = await prisma.trendingSignalWeight.findMany({
    where: { active: true },
  });
  const dbMap = new Map(dbWeights.map((w) => [w.signalName, w]));

  return config.signalWeights.map((sw) => {
    const dbWeight = dbMap.get(sw.name);
    return {
      name: sw.name,
      weight: dbWeight?.weight ?? sw.weight,
      category: sw.category,
      description: sw.description,
      isDefault: !dbWeight,
    };
  });
}

// ============================================
// ADMIN: Full Config Retrieval
// ============================================

export async function getFullTrendingConfig() {
  const config = getTrendingConfig();
  const signalWeights = await getSignalWeightConfig();

  return {
    signalWeights,
    tiers: config.tiers,
    antiGaming: config.antiGaming,
    cacheTTL: config.cacheTTL,
  };
}

// ============================================
// CLEANUP
// ============================================

export async function cleanupOldTrendingData(retentionDays: number = 30): Promise<void> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const [entriesDeleted, historyDeleted, anomaliesDeleted] = await Promise.all([
    prisma.trendingEntry.deleteMany({
      where: { createdAt: { lt: cutoff } },
    }),
    prisma.trendingHistory.deleteMany({
      where: { snapshotAt: { lt: cutoff } },
    }),
    prisma.engagementAnomaly.deleteMany({
      where: { resolved: true, createdAt: { lt: cutoff } },
    }),
  ]);

  logger.info(
    `Trending cleanup: ${entriesDeleted.count} entries, ${historyDeleted.count} history, ${anomaliesDeleted.count} anomalies deleted`
  );
}
