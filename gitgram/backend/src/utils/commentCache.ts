/**
 * Redis comment cache — avoids repeated DB queries for the same post's comments.
 * Ported from gh-social's caching pattern (MIT). TTL: 2 minutes.
 * Invalidated when a comment is added or deleted on the post.
 */
import { cache } from '../services/redisService';

const TTL_SECONDS = 2 * 60;

function key(postId: string) {
  return `comments:${postId}`;
}

export async function getCachedComments(postId: string) {
  return cache.get(key(postId));
}

export async function setCachedComments(postId: string, comments: unknown) {
  await cache.set(key(postId), comments, TTL_SECONDS);
}

export async function invalidateCommentCache(postId: string) {
  await cache.del(key(postId));
}
