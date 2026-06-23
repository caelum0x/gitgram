/**
 * Spam Guard Service
 *
 * Enhanced spam detection with:
 * - Content similarity / near-duplicate detection within a time window
 * - Bulk action detection (rapid-fire follows/unfollows, mass reactions)
 * - New account behavior scoring (stricter limits for accounts < 24h old)
 *
 * Uses Redis-backed stores with in-memory fallback (via RedisHashStore).
 */

import { SPAM_CONFIG } from '../config/rateLimitConfig';
import { recordViolation, ViolationType } from './abuseDetectionService';
import { RedisHashStore } from '../utils/redisStores';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpamCheckResult {
  blocked: boolean;
  reason?: string;
  score: number;
  violations: string[];
}

interface ContentEntry {
  content: string;
  hash: string;
  timestamp: number;
}

interface ActionEntry {
  action: string;
  targetId?: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Redis-backed Stores (with in-memory fallback)
// ---------------------------------------------------------------------------

/** Recent content per user: userId -> ContentEntry[] */
const contentStore = new RedisHashStore<ContentEntry[]>('spam:content', SPAM_CONFIG.DUPLICATE_WINDOW_MS * 2);

/** Recent actions per user: userId -> ActionEntry[] */
const actionStore = new RedisHashStore<ActionEntry[]>('spam:action', 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Similarity Helpers
// ---------------------------------------------------------------------------

/**
 * Simple hash for quick exact-match comparison.
 */
function simpleHash(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const chr = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Jaccard similarity between two strings (word-based).
 * Returns 0-1 where 1 means identical.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Trigram similarity for catching character-level similarity.
 * Good for detecting minor edits (e.g., adding punctuation).
 */
export function trigramSimilarity(a: string, b: string): number {
  const trigramsA = getTrigrams(a.toLowerCase());
  const trigramsB = getTrigrams(b.toLowerCase());

  if (trigramsA.size === 0 && trigramsB.size === 0) return 1;
  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

  let intersection = 0;
  for (const trigram of trigramsA) {
    if (trigramsB.has(trigram)) intersection++;
  }

  const union = new Set([...trigramsA, ...trigramsB]).size;
  return union > 0 ? intersection / union : 0;
}

function getTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>();
  const normalized = text.replace(/\s+/g, ' ').trim();
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.substring(i, i + 3));
  }
  return trigrams;
}

/**
 * Combined similarity score using both Jaccard and Trigram.
 */
export function combinedSimilarity(a: string, b: string): number {
  const jaccard = jaccardSimilarity(a, b);
  const trigram = trigramSimilarity(a, b);
  // Weight trigram slightly more for catching minor edits
  return jaccard * 0.4 + trigram * 0.6;
}

// ---------------------------------------------------------------------------
// Content Similarity Detection
// ---------------------------------------------------------------------------

/**
 * Check if content is a near-duplicate of recent posts by the same user.
 */
export async function checkContentSimilarity(
  userId: string,
  content: string
): Promise<{ isDuplicate: boolean; similarityScore: number; matchCount: number }> {
  const now = Date.now();
  const windowStart = now - SPAM_CONFIG.DUPLICATE_WINDOW_MS;
  const hash = simpleHash(content);

  const allEntries = (await contentStore.get(userId)) || [];
  const recentEntries = allEntries.filter(e => e.timestamp > windowStart);

  // Quick exact-match check via hash
  const exactMatches = recentEntries.filter(e => e.hash === hash);
  if (exactMatches.length >= SPAM_CONFIG.MAX_SIMILAR_POSTS) {
    return { isDuplicate: true, similarityScore: 1.0, matchCount: exactMatches.length };
  }

  // Similarity check
  let highestSimilarity = 0;
  let matchCount = 0;

  for (const entry of recentEntries) {
    const similarity = combinedSimilarity(content, entry.content);
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
    }
    if (similarity >= SPAM_CONFIG.SIMILARITY_THRESHOLD) {
      matchCount++;
    }
  }

  const isDuplicate = matchCount >= SPAM_CONFIG.MAX_SIMILAR_POSTS;

  return { isDuplicate, similarityScore: highestSimilarity, matchCount };
}

/**
 * Record content for future similarity comparisons.
 */
export async function recordContent(userId: string, content: string): Promise<void> {
  const now = Date.now();
  const hash = simpleHash(content);

  const entries = (await contentStore.get(userId)) || [];
  entries.push({ content, hash, timestamp: now });

  // Keep only entries within double the window
  const cutoff = now - SPAM_CONFIG.DUPLICATE_WINDOW_MS * 2;
  await contentStore.set(
    userId,
    entries.filter(e => e.timestamp > cutoff)
  );
}

// ---------------------------------------------------------------------------
// Bulk Action Detection
// ---------------------------------------------------------------------------

/**
 * Record a user action and check for rapid-fire / bulk behavior.
 */
export async function checkBulkAction(
  userId: string,
  action: string,
  targetId?: string
): Promise<{ isAbusive: boolean; reason?: string; count: number }> {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const fiveMinutesAgo = now - 5 * 60 * 1000;

  const entries = (await actionStore.get(userId)) || [];

  // Record the action
  entries.push({ action, targetId, timestamp: now });

  // Trim old entries (keep last hour) and persist
  const hourAgo = now - 60 * 60 * 1000;
  const trimmed = entries.filter(e => e.timestamp > hourAgo);
  await actionStore.set(userId, trimmed);

  // Check rapid-fire: too many actions of the same type in 1 minute
  const recentSameAction = trimmed.filter(
    e => e.action === action && e.timestamp > oneMinuteAgo
  );
  if (recentSameAction.length > SPAM_CONFIG.RAPID_FIRE_THRESHOLD) {
    return {
      isAbusive: true,
      reason: `Rapid-fire ${action} detected: ${recentSameAction.length} in the last minute`,
      count: recentSameAction.length,
    };
  }

  // Check follow/unfollow flip-flop: repeated follow+unfollow on the same target
  if ((action === 'follow' || action === 'unfollow') && targetId) {
    const recentTargetActions = trimmed.filter(
      e =>
        (e.action === 'follow' || e.action === 'unfollow') &&
        e.targetId === targetId &&
        e.timestamp > fiveMinutesAgo
    );
    if (recentTargetActions.length >= 4) {
      return {
        isAbusive: true,
        reason: `Follow/unfollow flip-flop detected on target ${targetId}: ${recentTargetActions.length} actions in 5 min`,
        count: recentTargetActions.length,
      };
    }
  }

  // Check mass reactions: too many reaction targets in 1 minute
  if (action === 'like' || action === 'reaction') {
    const recentReactions = trimmed.filter(
      e => (e.action === 'like' || e.action === 'reaction') && e.timestamp > oneMinuteAgo
    );
    const uniqueTargets = new Set(recentReactions.map(e => e.targetId).filter(Boolean));
    if (uniqueTargets.size > SPAM_CONFIG.RAPID_FIRE_THRESHOLD) {
      return {
        isAbusive: true,
        reason: `Mass reactions detected: ${uniqueTargets.size} different targets in 1 minute`,
        count: uniqueTargets.size,
      };
    }
  }

  return { isAbusive: false, count: recentSameAction.length };
}

// ---------------------------------------------------------------------------
// New Account Scoring
// ---------------------------------------------------------------------------

/**
 * Calculate how much stricter the limits should be for a new account.
 * Returns a multiplier (0.5 = half the normal limit for very new accounts, 1.0 = normal).
 */
export function getNewAccountMultiplier(accountCreatedAt: Date): number {
  const ageHours = (Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60);

  if (ageHours >= SPAM_CONFIG.NEW_ACCOUNT_AGE_HOURS) {
    return 1.0; // Normal limits
  }

  // Linear interpolation from NEW_ACCOUNT_LIMIT_MULTIPLIER to 1.0
  const ratio = ageHours / SPAM_CONFIG.NEW_ACCOUNT_AGE_HOURS;
  return SPAM_CONFIG.NEW_ACCOUNT_LIMIT_MULTIPLIER + ratio * (1.0 - SPAM_CONFIG.NEW_ACCOUNT_LIMIT_MULTIPLIER);
}

// ---------------------------------------------------------------------------
// Unified Spam Check (used by middleware)
// ---------------------------------------------------------------------------

/**
 * Run all spam checks for a content creation action.
 * Records violations to the abuse scoring system if spam is detected.
 */
export async function checkSpam(
  userId: string,
  content: string,
  action: string,
  targetId?: string
): Promise<SpamCheckResult> {
  const violations: string[] = [];
  let score = 0;

  // 1. Content similarity check (only for content-bearing actions)
  if (content && content.trim().length > 0) {
    const sim = await checkContentSimilarity(userId, content);
    if (sim.isDuplicate) {
      violations.push(`Near-duplicate content detected (similarity: ${sim.similarityScore.toFixed(2)}, matches: ${sim.matchCount})`);
      score += 0.5;
      void recordViolation(userId, 'DUPLICATE_CONTENT', `similarity=${sim.similarityScore.toFixed(2)}`);
    }
  }

  // 2. Bulk action check
  const bulk = await checkBulkAction(userId, action, targetId);
  if (bulk.isAbusive) {
    violations.push(bulk.reason!);
    score += 0.5;
    void recordViolation(userId, 'RAPID_FIRE_ACTION', bulk.reason);
  }

  const blocked = score >= 0.5;

  // If content passes, record it for future comparisons
  if (!blocked && content && content.trim().length > 0) {
    void recordContent(userId, content);
  }

  return {
    blocked,
    reason: violations.length > 0 ? violations.join('; ') : undefined,
    score,
    violations,
  };
}

// ---------------------------------------------------------------------------
// Testing helpers
// ---------------------------------------------------------------------------

export function _clearAll(): void {
  contentStore.clear();  // clears in-memory fallback
  actionStore.clear();   // clears in-memory fallback
}
