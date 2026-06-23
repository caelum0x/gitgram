/**
 * feedTuner.ts
 *
 * Post-processes a raw scored feed to enforce diversity, quality, and monetisation
 * constraints before the slice is returned to the client.
 *
 * Responsibilities:
 *  1. MAX_AUTHOR_RUN  — no more than N consecutive posts from the same author
 *  2. Content-type interleaving — alternate between post/snippet and repo/reel
 *  3. Sponsored content injection — insert an ad slot every SPONSORED_INTERVAL items
 *  4. Trending boost — re-rank items whose trendingScore exceeds a threshold
 *  5. Diversity penalty — authors already seen 3+ times sink toward the bottom
 *
 * All operations are IMMUTABLE — every function returns a new array; inputs are
 * never modified.
 */

import { computeTrendingScore, type PostEngagementContext } from './trendingAlgorithmService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Content type recognised by the feed tuner. */
export type FeedItemType = 'post' | 'repo' | 'snippet' | 'reel';

/**
 * Minimal shape expected by the tuner.  Callers may attach extra fields —
 * they are preserved transparently via the generic spread.
 */
export interface TunableFeedItem {
  id: string;
  type: FeedItemType;
  /** Author/owner identifier — null for system or anonymous items. */
  authorId: string | null;
  /** Pre-computed feed ranking score (higher = better). */
  score: number;
  /** Optional trending score override; computed on-the-fly when absent. */
  trendingScore?: number;
  /** Engagement signals used for on-demand trending-score computation. */
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  savesCount?: number;
  createdAt?: Date | string;
  /** Marks a slot that was injected as sponsored content — not a real post. */
  isSponsored?: boolean;
  /** Arbitrary extra fields passed through without modification. */
  [key: string]: unknown;
}

/** Sponsored / featured content item injected by the tuner. */
export interface SponsoredItem extends TunableFeedItem {
  type: 'post';
  isSponsored: true;
  adId: string;
  title: string;
  content: string;
  targetUrl: string;
  mediaUrl?: string | null;
}

/** Options accepted by both the class constructor and the `tuneFeed` function. */
export interface FeedTunerOptions {
  /**
   * Maximum number of consecutive posts from the same author before the tuner
   * defers the next post from that author.
   * @default 2
   */
  maxAuthorRun?: number;

  /**
   * Insert a sponsored item every this many feed items (0 = disabled).
   * @default 10
   */
  sponsoredInterval?: number;

  /**
   * When true, items with a high trending score are re-ranked to appear earlier.
   * @default true
   */
  boostTrending?: boolean;

  /**
   * Trending-score threshold above which an item qualifies for a boost.
   * Items meeting the threshold have their score multiplied by `trendingBoostMultiplier`.
   * @default 50
   */
  trendingBoostThreshold?: number;

  /**
   * Score multiplier applied to items that meet the trending threshold.
   * @default 1.5
   */
  trendingBoostMultiplier?: number;

  /**
   * Number of times an author can appear in the feed before a diversity penalty
   * is applied to their remaining items.
   * @default 3
   */
  diversityPenaltyAfter?: number;

  /**
   * Score multiplier applied as the diversity penalty (should be < 1).
   * @default 0.5
   */
  diversityPenaltyMultiplier?: number;

  /**
   * Pre-fetched sponsored items to inject.  When empty the tuner skips
   * sponsored injection silently (avoids a hard dependency on the DB layer).
   * @default []
   */
  sponsoredItems?: ReadonlyArray<SponsoredItem>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_AUTHOR_RUN = 2;
const DEFAULT_SPONSORED_INTERVAL = 10;
const DEFAULT_BOOST_TRENDING = true;
const DEFAULT_TRENDING_BOOST_THRESHOLD = 50;
const DEFAULT_TRENDING_BOOST_MULTIPLIER = 1.5;
const DEFAULT_DIVERSITY_PENALTY_AFTER = 3;
const DEFAULT_DIVERSITY_PENALTY_MULTIPLIER = 0.5;

// ---------------------------------------------------------------------------
// Internal helpers  (pure functions — no side-effects)
// ---------------------------------------------------------------------------

/**
 * Derive a trending score for an item.
 * Uses the item's `.trendingScore` field when present, otherwise calls
 * `computeTrendingScore` from trendingAlgorithmService using the item's
 * engagement fields.
 */
function deriveTrendingScore(item: TunableFeedItem): number {
  if (item.trendingScore !== undefined) return item.trendingScore;

  if (item.createdAt !== undefined) {
    const ctx: PostEngagementContext = {
      likesCount: item.likesCount ?? 0,
      commentsCount: item.commentsCount ?? 0,
      sharesCount: item.sharesCount ?? 0,
      savesCount: item.savesCount ?? 0,
      isFromFollowing: false,
      createdAt: item.createdAt,
    };
    return computeTrendingScore(ctx);
  }

  return 0;
}

/**
 * Apply trending boost and diversity penalty to each item's score.
 * Returns a new array — originals are not modified.
 *
 * Diversity penalty semantics:
 *   `diversityPenaltyAfter = N` means the penalty applies starting from the
 *   (N+1)-th appearance of the same author.  For example, N=3 → the 4th and
 *   subsequent appearances are penalised.
 */
function applyScoreAdjustments(
  items: ReadonlyArray<TunableFeedItem>,
  options: Required<FeedTunerOptions>
): TunableFeedItem[] {
  // Per-author appearance counter; incremented as we process each item
  const authorSeenCount = new Map<string, number>();

  return items.map((item): TunableFeedItem => {
    let adjustedScore = item.score;

    // Trending boost
    if (options.boostTrending) {
      const ts = deriveTrendingScore(item);
      if (ts >= options.trendingBoostThreshold) {
        adjustedScore = adjustedScore * options.trendingBoostMultiplier;
      }
    }

    // Diversity penalty — applied when the author has already appeared
    // `diversityPenaltyAfter` times (i.e. this is the (N+1)-th occurrence).
    if (item.authorId !== null) {
      const seenBefore = authorSeenCount.get(item.authorId) ?? 0;
      // Record this appearance
      authorSeenCount.set(item.authorId, seenBefore + 1);

      if (seenBefore >= options.diversityPenaltyAfter) {
        adjustedScore = adjustedScore * options.diversityPenaltyMultiplier;
      }
    }

    return adjustedScore === item.score ? item : { ...item, score: adjustedScore };
  });
}

/**
 * Re-sort items by adjusted score (descending).
 * Returns a new array.
 */
function sortByScore(items: ReadonlyArray<TunableFeedItem>): TunableFeedItem[] {
  return [...items].sort((a, b) => b.score - a.score);
}

/**
 * Count how many consecutive items at the tail of `result` share the same
 * authorId as the most-recent item.  Returns 0 if the result is empty.
 */
function tailRunLength(result: ReadonlyArray<TunableFeedItem>): number {
  if (result.length === 0) return 0;
  const tailAuthor = result[result.length - 1].authorId;
  if (tailAuthor === null) return 0; // null author never contributes to a run

  let run = 0;
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].authorId === tailAuthor) run++;
    else break;
  }
  return run;
}

/**
 * Enforce MAX_AUTHOR_RUN: no more than `maxAuthorRun` consecutive items from
 * the same author.  Items that would violate the run limit are deferred and
 * re-inserted at the earliest valid position later in the sequence.
 *
 * Algorithm:
 *  - Walk sorted items; track the current tail run length in `result`.
 *  - When inserting an item would exceed the run limit, defer it.
 *  - After every successful insertion, try to flush deferred items that are
 *    now safe to insert given the updated tail.
 *  - Remaining deferred items (impossible to break a run because no other
 *    author is available) are appended at the end in score order.
 *
 * Returns a new array — input is not modified.
 */
function enforceAuthorRun(
  items: ReadonlyArray<TunableFeedItem>,
  maxAuthorRun: number
): TunableFeedItem[] {
  const result: TunableFeedItem[] = [];
  const deferred: TunableFeedItem[] = [];

  /**
   * Try to insert one deferred item that is safe given the current tail.
   * Returns true if an item was inserted (caller should loop until false).
   */
  const tryInsertOneDeferred = (): boolean => {
    const tailAuthor = result.length > 0 ? result[result.length - 1].authorId : null;
    const currentRun = tailRunLength(result);

    for (let i = 0; i < deferred.length; i++) {
      const candidate = deferred[i];
      const wouldExtendRun =
        candidate.authorId !== null && candidate.authorId === tailAuthor;
      const newRun = wouldExtendRun ? currentRun + 1 : 1;

      if (newRun <= maxAuthorRun) {
        deferred.splice(i, 1);
        result.push(candidate);
        return true;
      }
    }
    return false;
  };

  const tryFlushDeferred = (): void => {
    // Keep flushing as long as we can safely insert a deferred item
    while (deferred.length > 0 && tryInsertOneDeferred()) {
      // continue
    }
  };

  for (const item of items) {
    const tailAuthor = result.length > 0 ? result[result.length - 1].authorId : null;
    const currentRun = tailRunLength(result);
    const wouldExtendRun = item.authorId !== null && item.authorId === tailAuthor;
    const newRun = wouldExtendRun ? currentRun + 1 : 1;

    if (newRun > maxAuthorRun) {
      deferred.push(item);
    } else {
      result.push(item);
      tryFlushDeferred();
    }
  }

  // Append any remaining deferred items sorted by score
  const remainingDeferred = [...deferred].sort((a, b) => b.score - a.score);
  for (const item of remainingDeferred) {
    result.push(item);
  }

  return result;
}

/**
 * Interleave content types so that the feed alternates between
 * "textual" items (post, snippet) and "media/discovery" items (repo, reel).
 *
 * Strategy:
 *  - Build two pools: textual and non-textual.
 *  - Walk the result list; every INTERLEAVE_EVERY textual items, insert one
 *    non-textual item from the pool if available.
 *  - Remaining pool items are appended at the end.
 *
 * Returns a new array.
 */
function interleaveContentTypes(items: ReadonlyArray<TunableFeedItem>): TunableFeedItem[] {
  const INTERLEAVE_EVERY = 3; // insert a repo/reel every N textual items

  const textual = items.filter(i => i.type === 'post' || i.type === 'snippet');
  const discovery = items.filter(i => i.type === 'repo' || i.type === 'reel');
  const discoveryQueue = [...discovery];

  const result: TunableFeedItem[] = [];
  let textualSinceLastDiscovery = 0;

  for (const item of textual) {
    result.push(item);
    textualSinceLastDiscovery++;

    if (textualSinceLastDiscovery >= INTERLEAVE_EVERY && discoveryQueue.length > 0) {
      result.push(discoveryQueue.shift()!);
      textualSinceLastDiscovery = 0;
    }
  }

  // Append any remaining discovery items
  for (const item of discoveryQueue) {
    result.push(item);
  }

  return result;
}

/**
 * Inject sponsored items into the feed every `sponsoredInterval` positions.
 *
 * Sponsored items are inserted *after* position N, 2N, 3N, etc.
 * If there are fewer sponsored items than insertion slots, slots cycle through
 * the sponsored array (round-robin).
 *
 * Returns a new array.
 */
function injectSponsored(
  items: ReadonlyArray<TunableFeedItem>,
  sponsoredItems: ReadonlyArray<SponsoredItem>,
  sponsoredInterval: number
): TunableFeedItem[] {
  if (sponsoredItems.length === 0 || sponsoredInterval <= 0) return [...items];

  const result: TunableFeedItem[] = [];
  let sponsoredIndex = 0;

  for (let i = 0; i < items.length; i++) {
    result.push(items[i]);

    const isInsertPoint = (i + 1) % sponsoredInterval === 0;
    if (isInsertPoint) {
      result.push(sponsoredItems[sponsoredIndex % sponsoredItems.length]);
      sponsoredIndex++;
    }
  }

  return result;
}

/**
 * Deduplicate items by id.  First occurrence wins.
 * Returns a new array.
 */
function deduplicateById(items: ReadonlyArray<TunableFeedItem>): TunableFeedItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// FeedTuner class
// ---------------------------------------------------------------------------

/**
 * Stateful tuner that holds resolved options and exposes a `tune()` method.
 *
 * @example
 * ```ts
 * const tuner = new FeedTuner({ maxAuthorRun: 2, boostTrending: true });
 * const tuned = tuner.tune(rawFeedItems);
 * ```
 */
export class FeedTuner {
  private readonly options: Required<FeedTunerOptions>;

  constructor(options: FeedTunerOptions = {}) {
    this.options = {
      maxAuthorRun: options.maxAuthorRun ?? DEFAULT_MAX_AUTHOR_RUN,
      sponsoredInterval: options.sponsoredInterval ?? DEFAULT_SPONSORED_INTERVAL,
      boostTrending: options.boostTrending ?? DEFAULT_BOOST_TRENDING,
      trendingBoostThreshold: options.trendingBoostThreshold ?? DEFAULT_TRENDING_BOOST_THRESHOLD,
      trendingBoostMultiplier: options.trendingBoostMultiplier ?? DEFAULT_TRENDING_BOOST_MULTIPLIER,
      diversityPenaltyAfter: options.diversityPenaltyAfter ?? DEFAULT_DIVERSITY_PENALTY_AFTER,
      diversityPenaltyMultiplier: options.diversityPenaltyMultiplier ?? DEFAULT_DIVERSITY_PENALTY_MULTIPLIER,
      sponsoredItems: options.sponsoredItems ?? [],
    };
  }

  /**
   * Process a raw feed array and return a tuned feed.
   *
   * Pipeline:
   *  1. Deduplicate
   *  2. Apply score adjustments (trending boost + diversity penalty)
   *  3. Re-sort by adjusted score
   *  4. Enforce author run limit
   *  5. Interleave content types
   *  6. Inject sponsored items
   *
   * @param posts - Raw feed items (not mutated).
   * @returns New array of tuned feed items.
   */
  tune(posts: ReadonlyArray<TunableFeedItem>): TunableFeedItem[] {
    if (posts.length === 0) return [];

    const step1 = deduplicateById(posts);
    const step2 = applyScoreAdjustments(step1, this.options);
    const step3 = sortByScore(step2);
    const step4 = enforceAuthorRun(step3, this.options.maxAuthorRun);
    const step5 = interleaveContentTypes(step4);
    const step6 = injectSponsored(step5, this.options.sponsoredItems, this.options.sponsoredInterval);

    return step6;
  }
}

// ---------------------------------------------------------------------------
// Functional API  (convenience wrapper around the class)
// ---------------------------------------------------------------------------

/**
 * Tune a raw feed in a single function call.
 *
 * Equivalent to `new FeedTuner(options).tune(rawPosts)`.
 *
 * @param rawPosts - Raw, untuned feed items.
 * @param options  - Optional tuner configuration.
 * @returns New array of tuned feed items.
 *
 * @example
 * ```ts
 * const feed = tuneFeed(scoredItems, { maxAuthorRun: 2, boostTrending: true });
 * ```
 */
export function tuneFeed(
  rawPosts: ReadonlyArray<TunableFeedItem>,
  options?: FeedTunerOptions
): TunableFeedItem[] {
  return new FeedTuner(options).tune(rawPosts);
}
