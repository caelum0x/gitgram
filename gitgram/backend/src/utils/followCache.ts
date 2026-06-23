/**
 * Redis-backed follow cache.
 *
 * Ported from gh-social's in-memory followingsCache (MIT) — replaces the
 * per-process Map with Redis so it works across multiple server instances.
 *
 * TTL: 5 minutes. Invalidated on follow/unfollow mutations.
 */

import { cache } from '../services/redisService';
import prisma from './prisma';

const TTL_SECONDS = 5 * 60;

function key(userId: string) {
  return `follow:list:${userId}`;
}

export async function getFollowingIds(userId: string): Promise<string[]> {
  const cached = await cache.get(key(userId));
  if (cached) return cached as string[];

  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });

  const ids = follows.map((f) => f.followingId);
  await cache.set(key(userId), ids, TTL_SECONDS);
  return ids;
}

export async function invalidateFollowCache(userId: string): Promise<void> {
  await cache.del(key(userId));
}
