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
  /**
   * Identifier of the conversation/thread this item belongs to.
   *
   * Ported from Bluesky's `FeedViewPostsSlice.rootUri` concept: multiple items
   * that share the same thread root collapse to a single entry (the most recent)
   * so a busy thread surfaces once instead of flooding the feed.
   *
   * In Gitgram a "thread" is the set of posts about the same subject. Callers
   * derive this from a stable subject key — typically the repository id or the
   * AITM project/checkpoint id. When absent, the item is treated as its own
   * thread root and is never collapsed.
   */
  rootPostId?: string | null;
  /**
   * Explicit thread identifier. When both `threadId` and `rootPostId` are set,
   * `threadId` wins. Provided as a convenience alias so callers that already
   * model threads can pass through without reshaping the field name.
   */
  threadId?: string | null;
  /**
   * When true, this item belongs to a thread the viewer has muted and should be
   * dropped by `removeMutedThreads`. The backend has no thread-mute store yet,
   * so callers that lack mute data simply leave this undefined.
   */
  isThreadMuted?: boolean;
  /**
   * When true, this item matched one of the viewer's muted words/tags and should
   * be dropped by `removeMutedWords`. Callers compute this via
   * services/mutedWordsService.ts (`hasMutedWord`) before tuning, since the
   * tuner itself is content-agnostic. Items without text/tag data leave this
   * undefined.
   */
  isMutedWord?: boolean;
  /**
   * When true, this item is a reply whose parent/root context could not be
   * resolved (an "orphan"). `removeOrphans` drops these so the feed never shows
   * a dangling reply with no visible context.
   */
  isOrphan?: boolean;
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

  /**
   * When true, collapse items that share the same thread root so each
   * conversation appears at most once (its highest-ranked entry survives).
   * Ported from Bluesky's `FeedTuner.dedupThreads`.
   * @default true
   */
  dedupeThreads?: boolean;

  /**
   * When true, drop items flagged `isThreadMuted`.
   * Ported from Bluesky's `FeedTuner.removeMutedThreads`.
   * @default true
   */
  removeMutedThreads?: boolean;

  /**
   * When true, drop items flagged `isMutedWord` (the item matched one of the
   * viewer's muted words/tags). Mirrors Bluesky's `hasMutedWord` filtering that
   * runs alongside thread muting. Callers compute the flag via
   * services/mutedWordsService.ts before tuning.
   * @default true
   */
  removeMutedWords?: boolean;

  /**
   * When true, drop items flagged `isOrphan` (replies whose context could not
   * be resolved). Ported from Bluesky's `FeedTuner.removeOrphans`.
   * @default true
   */
  removeOrphans?: boolean;
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
const DEFAULT_DEDUPE_THREADS = true;
const DEFAULT_REMOVE_MUTED_THREADS = true;
const DEFAULT_REMOVE_MUTED_WORDS = true;
const DEFAULT_REMOVE_ORPHANS = true;

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

/**
 * Resolve the thread-root key for an item.
 *
 * `threadId` takes precedence over `rootPostId`. When neither is present the
 * item is its own thread root (it can never collapse another item) and we
 * return `null` to signal "no shared thread".
 */
function threadRootKey(item: TunableFeedItem): string | null {
  if (typeof item.threadId === 'string' && item.threadId.length > 0) {
    return item.threadId;
  }
  if (typeof item.rootPostId === 'string' && item.rootPostId.length > 0) {
    return item.rootPostId;
  }
  return null;
}

/**
 * Collapse items that share the same thread root so each conversation surfaces
 * once. The FIRST item encountered for a given root wins; later items sharing
 * that root are dropped.
 *
 * Callers are expected to pass items already ordered so the "winning" entry per
 * thread (e.g. the most recent / highest-ranked) appears first. The tuner runs
 * this AFTER `sortByScore`, so the highest-scoring entry of each thread is kept,
 * mirroring Bluesky's "you only see the most recent reply" behaviour for the
 * following feed.
 *
 * Items without a thread root (see `threadRootKey`) are always preserved.
 * Returns a new array — input is not modified.
 */
function deduplicateByThreadRoot(items: ReadonlyArray<TunableFeedItem>): TunableFeedItem[] {
  const seenRoots = new Set<string>();
  return items.filter(item => {
    const root = threadRootKey(item);
    if (root === null) return true; // standalone item, never collapsed
    if (seenRoots.has(root)) return false;
    seenRoots.add(root);
    return true;
  });
}

/**
 * Drop items flagged `isThreadMuted`. Ported from Bluesky's
 * `FeedTuner.removeMutedThreads`. Returns a new array.
 */
function dropMutedThreads(items: ReadonlyArray<TunableFeedItem>): TunableFeedItem[] {
  return items.filter(item => item.isThreadMuted !== true);
}

/**
 * Drop items flagged `isOrphan`. Ported from Bluesky's
 * `FeedTuner.removeOrphans`. Returns a new array.
 */
function dropOrphans(items: ReadonlyArray<TunableFeedItem>): TunableFeedItem[] {
  return items.filter(item => item.isOrphan !== true);
}

/**
 * Drop items flagged `isMutedWord` (matched one of the viewer's muted
 * words/tags). Mirrors Bluesky's `hasMutedWord` feed filtering. Returns a new
 * array.
 */
function dropMutedWords(items: ReadonlyArray<TunableFeedItem>): TunableFeedItem[] {
  return items.filter(item => item.isMutedWord !== true);
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
      dedupeThreads: options.dedupeThreads ?? DEFAULT_DEDUPE_THREADS,
      removeMutedThreads: options.removeMutedThreads ?? DEFAULT_REMOVE_MUTED_THREADS,
      removeMutedWords: options.removeMutedWords ?? DEFAULT_REMOVE_MUTED_WORDS,
      removeOrphans: options.removeOrphans ?? DEFAULT_REMOVE_ORPHANS,
    };
  }

  /**
   * Process a raw feed array and return a tuned feed.
   *
   * Pipeline:
   *  1. Deduplicate by id
   *  2. Drop orphaned replies (removeOrphans)
   *  3. Drop muted threads (removeMutedThreads)
   *  4. Drop muted words/tags (removeMutedWords)
   *  5. Apply score adjustments (trending boost + diversity penalty)
   *  6. Re-sort by adjusted score
   *  7. Collapse threads by root (dedupThreads) — keeps the highest-scoring
   *     entry per thread, so it runs after the sort
   *  8. Enforce author run limit
   *  9. Interleave content types
   * 10. Inject sponsored items
   *
   * @param posts - Raw feed items (not mutated).
   * @returns New array of tuned feed items.
   */
  tune(posts: ReadonlyArray<TunableFeedItem>): TunableFeedItem[] {
    if (posts.length === 0) return [];

    const deduped = deduplicateById(posts);
    const withoutOrphans = this.options.removeOrphans ? dropOrphans(deduped) : deduped;
    const withoutMutedThreads = this.options.removeMutedThreads
      ? dropMutedThreads(withoutOrphans)
      : withoutOrphans;
    const withoutMuted = this.options.removeMutedWords
      ? dropMutedWords(withoutMutedThreads)
      : withoutMutedThreads;
    const adjusted = applyScoreAdjustments(withoutMuted, this.options);
    const sorted = sortByScore(adjusted);
    const threadDeduped = this.options.dedupeThreads
      ? deduplicateByThreadRoot(sorted)
      : sorted;
    const runLimited = enforceAuthorRun(threadDeduped, this.options.maxAuthorRun);
    const interleaved = interleaveContentTypes(runLimited);
    const withSponsored = injectSponsored(
      interleaved,
      this.options.sponsoredItems,
      this.options.sponsoredInterval
    );

    return withSponsored;
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
