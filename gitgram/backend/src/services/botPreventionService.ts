import crypto from 'crypto';
import prisma from '../utils/prisma';
import { cache, connectRedis } from './redisService';
import logger from '../utils/logger';

interface BotScore {
  isBot: boolean;
  score: number;
  reasons: string[];
}

interface RateLimitEntry {
  count: number;
  firstSeen: number;
}

// Hash IP addresses for privacy
const hashIP = (ip: string): string => {
  return crypto.createHash('sha256').update(ip + process.env.IP_HASH_SALT || 'gitgram').digest('hex').substring(0, 16);
};

// Check request rate for an IP address using Redis
const checkIPRate = async (ipHash: string, windowSeconds: number = 60, maxRequests: number = 100): Promise<{ count: number; exceeded: boolean }> => {
  const key = `rate:ip:${ipHash}`;

  try {
    await connectRedis();
    const current = await cache.get(key);

    if (!current) {
      await cache.set(key, { count: 1, firstSeen: Date.now() }, windowSeconds);
      return { count: 1, exceeded: false };
    }

    const entry = current as RateLimitEntry;
    const newCount = entry.count + 1;

    // Check if window has expired
    const windowMs = windowSeconds * 1000;
    if (Date.now() - entry.firstSeen > windowMs) {
      await cache.set(key, { count: 1, firstSeen: Date.now() }, windowSeconds);
      return { count: 1, exceeded: false };
    }

    await cache.set(key, { count: newCount, firstSeen: entry.firstSeen }, windowSeconds);
    return { count: newCount, exceeded: newCount > maxRequests };
  } catch (error) {
    logger.warn('Redis rate limit check failed, skipping IP check');
    return { count: 0, exceeded: false };
  }
};

// Track suspicious IP activity
const trackSuspiciousIP = async (ipHash: string, reason: string): Promise<void> => {
  const key = `suspicious:ip:${ipHash}`;

  try {
    await connectRedis();
    const current = await cache.get(key);
    const incidents = current?.incidents || [];

    incidents.push({
      reason,
      timestamp: Date.now(),
    });

    // Keep last 100 incidents
    await cache.set(key, { incidents: incidents.slice(-100) }, 86400); // 24 hour TTL
  } catch (error) {
    logger.warn('Failed to track suspicious IP activity');
  }
};

// Get suspicious activity count for an IP
const getSuspiciousActivityCount = async (ipHash: string): Promise<number> => {
  const key = `suspicious:ip:${ipHash}`;

  try {
    await connectRedis();
    const current = await cache.get(key);
    return current?.incidents?.length || 0;
  } catch {
    return 0;
  }
};

export const detectBot = async (userId: string, ipAddress?: string): Promise<BotScore> => {
  const reasons: string[] = [];
  let score = 0;

  // IP-based detection
  if (ipAddress) {
    const ipHash = hashIP(ipAddress);

    // Check rate limiting
    const rateLimit = await checkIPRate(ipHash, 60, 100);
    if (rateLimit.exceeded) {
      score += 0.4;
      reasons.push(`Excessive requests from IP: ${rateLimit.count}/min`);
      await trackSuspiciousIP(ipHash, 'rate_limit_exceeded');
    } else if (rateLimit.count > 50) {
      score += 0.2;
      reasons.push(`High request rate: ${rateLimit.count}/min`);
    }

    // Check for prior suspicious activity
    const suspiciousCount = await getSuspiciousActivityCount(ipHash);
    if (suspiciousCount > 10) {
      score += 0.3;
      reasons.push(`IP has ${suspiciousCount} suspicious incidents`);
    } else if (suspiciousCount > 5) {
      score += 0.15;
      reasons.push(`IP has ${suspiciousCount} prior suspicious incidents`);
    }
  }

  // Check action frequency from database
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

  const recentActions = await Promise.all([
    prisma.post.count({ where: { userId, createdAt: { gte: oneMinuteAgo } } }),
    prisma.comment.count({ where: { userId, createdAt: { gte: oneMinuteAgo } } }),
    prisma.like.count({ where: { userId, createdAt: { gte: oneMinuteAgo } } }),
  ]);

  const totalActions = recentActions.reduce((a, b) => a + b, 0);
  if (totalActions > 20) {
    score += 0.5;
    reasons.push(`${totalActions} actions in 1 minute (very high)`);
    if (ipAddress) {
      await trackSuspiciousIP(hashIP(ipAddress), `high_action_rate:${totalActions}`);
    }
  } else if (totalActions > 10) {
    score += 0.3;
    reasons.push(`${totalActions} actions in 1 minute (high)`);
  }

  // Check action patterns (too regular posting)
  const recentPosts = await prisma.post.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { createdAt: true },
  });

  if (recentPosts.length >= 5) {
    const intervals: number[] = [];
    for (let i = 1; i < recentPosts.length; i++) {
      const interval = recentPosts[i - 1].createdAt.getTime() - recentPosts[i].createdAt.getTime();
      intervals.push(interval);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;

    // Very consistent intervals suggest bot behavior
    if (variance < 1000 && avgInterval < 60000) {
      score += 0.4;
      reasons.push('Suspiciously regular posting pattern');
    }
  }

  // Check for automated content patterns
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      posts: {
        take: 5,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (user?.posts && user.posts.length >= 3) {
    const contents = user.posts.map(p => p.content);
    const similarities: number[] = [];

    for (let i = 0; i < contents.length - 1; i++) {
      const similarity = calculateSimilarity(contents[i], contents[i + 1]);
      similarities.push(similarity);
    }

    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    if (avgSimilarity > 0.9) {
      score += 0.4;
      reasons.push('Nearly identical content');
    } else if (avgSimilarity > 0.8) {
      score += 0.2;
      reasons.push('Highly similar content');
    }
  }

  // Check account age (newer accounts more likely to be bots)
  if (user) {
    const accountAgeHours = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60);
    if (accountAgeHours < 1 && totalActions > 5) {
      score += 0.2;
      reasons.push('New account with high activity');
    }
  }

  return {
    isBot: score >= 0.6,
    score: Math.min(score, 1),
    reasons,
  };
};

function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// Middleware helper to get IP hash for logging
export const getIPHash = (ipAddress: string): string => hashIP(ipAddress);

// Clean up old rate limit data (call periodically)
export const cleanupRateLimitData = async (): Promise<void> => {
  try {
    await connectRedis();
    // Redis handles TTL automatically, but we can clear suspicious data older than 7 days
    logger.debug('Rate limit data cleanup complete');
  } catch (error) {
    logger.warn('Rate limit cleanup failed:', error);
  }
};
